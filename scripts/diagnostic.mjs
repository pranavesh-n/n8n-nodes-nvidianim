#!/usr/bin/env node
import readline from 'node:readline';
import { buildNvidiaApiUrl, sanitizeSecrets } from '../dist/nodes/Nvidianim/transport/index.js';

// Advanced redaction to ensure no secrets, account IDs, or internal function UUIDs leak
function deepSanitize(text, apiKey) {
	if (typeof text !== 'string') text = JSON.stringify(text);
	let clean = sanitizeSecrets(text, apiKey ? [apiKey] : []);
	// Redact account IDs
	clean = clean.replace(/account\s+['"][A-Za-z0-9_-]+['"]/gi, "account '[REDACTED_ACCOUNT]'");
	// Redact function UUIDs
	clean = clean.replace(/Function\s+['"][0-9a-f-]{36}['"]/gi, "Function '[REDACTED_FUNCTION_UUID]'");
	return clean;
}

async function promptHidden(query) {
	return new Promise((resolve) => {
		const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
		if (process.stdin.isTTY) {
			process.stdout.write(query);
			process.stdin.setRawMode(true);
			let input = '';
			const onData = (char) => {
				char = char.toString();
				if (char === '\n' || char === '\r' || char === '\u0004') {
					process.stdin.setRawMode(false);
					process.stdin.removeListener('data', onData);
					process.stdout.write('\n');
					rl.close();
					resolve(input.trim());
				} else if (char === '\u0003') {
					process.exit(1);
				} else if (char === '\b' || char === '\x7f') {
					if (input.length > 0) input = input.slice(0, -1);
				} else {
					input += char;
				}
			};
			process.stdin.on('data', onData);
		} else {
			rl.question(query, (ans) => { rl.close(); resolve(ans.trim()); });
		}
	});
}

async function main() {
	console.log('\n=============================================================');
	console.log('   NVIDIA NIM Live Inference Diagnostic — Safe Diagnostic   ');
	console.log('=============================================================\n');

	let apiKey = process.env.NVIDIA_API_KEY ? process.env.NVIDIA_API_KEY.trim() : '';
	if (!apiKey) {
		apiKey = await promptHidden('Enter NVIDIA API key to test (hidden input): ');
	}
	if (!apiKey) {
		console.error('Error: No API key provided.');
		process.exit(1);
	}
	apiKey = apiKey.replace(/^Bearer\s+/i, '').trim();

	const logSafe = (msg) => console.log(deepSanitize(msg, apiKey));

	// 1. Fetch catalog
	logSafe('Step 1: Checking Catalog Availability (GET /models)...');
	const t0 = Date.now();
	let catalog = [];
	try {
		const res = await fetch(buildNvidiaApiUrl('/models'), {
			headers: { Accept: 'application/json', Authorization: `Bearer ${apiKey}` },
		});
		const lat = Date.now() - t0;
		if (!res.ok) {
			logSafe(`  ❌ Catalog Request Failed: HTTP ${res.status}`);
			process.exit(1);
		}
		const data = await res.json();
		catalog = Array.isArray(data?.data) ? data.data.map(m => m.id) : [];
		logSafe(`  ✔ Catalog accessible: ${catalog.length} models found (Latency: ${lat}ms)\n`);
	} catch (e) {
		logSafe(`  ❌ Network error: ${e.message}`);
		process.exit(1);
	}

	const catalogSet = new Set(catalog);

	// 2. Models to diagnose
	const chatCandidates = [
		'nvidia/llama-3.1-nemotron-70b-instruct',
		'mistralai/mistral-large-2-instruct',
		'meta/llama-3.2-11b-vision-instruct',
		'google/gemma-3-12b-it',
		'nvidia/nemotron-4-340b-instruct',
	];

	const embedCandidates = [
		'snowflake/arctic-embed-l',
		'nvidia/nv-embedqa-mistral-7b-v2',
		'nvidia/llama-3.2-nv-embedqa-1b-v1',
	];

	logSafe('Step 2: Probing Candidate Chat Models (POST /chat/completions)...');
	for (const model of chatCandidates) {
		if (!catalogSet.has(model)) {
			logSafe(`  [SKIP] ${model} not listed in /models catalog.`);
			continue;
		}

		const tStart = Date.now();
		try {
			const res = await fetch(buildNvidiaApiUrl('/chat/completions'), {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json',
					Authorization: `Bearer ${apiKey}`,
				},
				body: JSON.stringify({
					model,
					messages: [{ role: 'user', content: 'Say hello in 3 words' }],
					max_tokens: 15,
				}),
			});
			const latency = Date.now() - tStart;
			const bodyText = await res.text();
			const sanitizedBody = deepSanitize(bodyText, apiKey);

			if (res.ok) {
				logSafe(`  ✔ [HTTP 200] ${model} (Latency: ${latency}ms)`);
				logSafe(`    Response: ${sanitizedBody.slice(0, 150)}...`);
				break; // Found working chat model
			} else {
				let failureClass = 'Unknown Failure';
				if (res.status === 404 && sanitizedBody.includes('Not found for account')) {
					failureClass = 'Account Access / Entitlement Failure (Function not provisioned for account)';
				} else if (res.status === 400 || res.status === 422) {
					failureClass = 'Invalid Payload Failure';
				} else if (res.status >= 500) {
					failureClass = 'Backend Deployment / Capacity Failure';
				}
				logSafe(`  ❌ [HTTP ${res.status}] ${model} (Latency: ${latency}ms)`);
				logSafe(`    Classification: ${failureClass}`);
				logSafe(`    Details: ${sanitizedBody}`);
			}
		} catch (err) {
			logSafe(`  ❌ Error querying ${model}: ${err.message}`);
		}
	}

	logSafe('\nStep 3: Probing Candidate Embedding Models (POST /embeddings)...');
	for (const model of embedCandidates) {
		if (!catalogSet.has(model)) {
			logSafe(`  [SKIP] ${model} not listed in /models catalog.`);
			continue;
		}

		const tStart = Date.now();
		try {
			const res = await fetch(buildNvidiaApiUrl('/embeddings'), {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json',
					Authorization: `Bearer ${apiKey}`,
				},
				body: JSON.stringify({
					model,
					input: ['diagnostic probe test'],
					input_type: 'query',
				}),
			});
			const latency = Date.now() - tStart;
			const bodyText = await res.text();
			const sanitizedBody = deepSanitize(bodyText, apiKey);

			if (res.ok) {
				logSafe(`  ✔ [HTTP 200] ${model} (Latency: ${latency}ms)`);
				logSafe(`    Response: ${sanitizedBody.slice(0, 150)}...`);
				break; // Found working embed model
			} else {
				let failureClass = 'Unknown Failure';
				if (res.status === 404 && sanitizedBody.includes('Not found for account')) {
					failureClass = 'Account Access / Entitlement Failure (Function not provisioned for account)';
				} else if (res.status === 400 || res.status === 422) {
					failureClass = 'Invalid Payload Failure';
				} else if (res.status >= 500) {
					failureClass = 'Backend Deployment / Capacity Failure';
				}
				logSafe(`  ❌ [HTTP ${res.status}] ${model} (Latency: ${latency}ms)`);
				logSafe(`    Classification: ${failureClass}`);
				logSafe(`    Details: ${sanitizedBody}`);
			}
		} catch (err) {
			logSafe(`  ❌ Error querying ${model}: ${err.message}`);
		}
	}

	logSafe('\n=============================================================');
	logSafe('   Diagnostic Completed — All Secrets Fully Redacted         ');
	logSafe('=============================================================\n');
}

main().catch((e) => {
	console.error(deepSanitize(e.message));
	process.exit(1);
});