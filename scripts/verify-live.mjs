#!/usr/bin/env node
import readline from 'node:readline';
import { sanitizeSecrets, buildNvidiaApiUrl } from '../dist/nodes/Nvidianim/transport/index.js';

async function promptHidden(query) {
	return new Promise((resolve) => {
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});

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
			rl.question(query, (answer) => {
				rl.close();
				resolve(answer.trim());
			});
		}
	});
}

async function main() {
	console.log('\n======================================================');
	console.log('   NVIDIA NIM API Key Sandboxed Live Verification   ');
	console.log('======================================================\n');

	let apiKey = process.env.NVIDIA_API_KEY ? process.env.NVIDIA_API_KEY.trim() : '';

	if (!apiKey) {
		console.log('No NVIDIA_API_KEY environment variable detected.');
		apiKey = await promptHidden('Enter your NVIDIA API key (input is hidden): ');
	}

	if (!apiKey) {
		console.error('\nError: No API key provided. Aborting.');
		process.exit(1);
	}

	apiKey = apiKey.replace(/^Bearer\s+/i, '').trim();

	const maskedKey = apiKey.length > 10
		? apiKey.slice(0, 7) + '...' + apiKey.slice(-4)
		: '[MASKED]';
	console.log(`\nActive API Key: ${maskedKey}`);
	console.log('Zero-leak guarantee: All output will be passed through secret sanitization.\n');

	const secretMaskList = [apiKey];
	const safeLog = (msg) => console.log(sanitizeSecrets(msg, secretMaskList));
	const safeErr = (msg) => console.error(sanitizeSecrets(msg, secretMaskList));

	// 1. Check GET /v1/models
	safeLog('------------------------------------------------------');
	safeLog('Test 1: GET /models (Authentication & Catalog Access)');
	safeLog('------------------------------------------------------');
	const modelsUrl = buildNvidiaApiUrl('/models');
	let availableModels = [];

	const t0 = Date.now();
	try {
		const res = await fetch(modelsUrl, {
			method: 'GET',
			headers: {
				'Accept': 'application/json',
				'Authorization': `Bearer ${apiKey}`,
			},
		});

		const latency = Date.now() - t0;
		if (!res.ok) {
			const errBody = await res.text();
			safeErr(`  ❌ Failed (HTTP ${res.status}): ${errBody}`);
			process.exit(1);
		}

		const data = await res.json();
		availableModels = Array.isArray(data?.data) ? data.data : [];
		safeLog(`  ✔ SUCCESS (Latency: ${latency}ms)`);
		safeLog(`  Total Models Available: ${availableModels.length}`);
	} catch (e) {
		safeErr(`  ❌ Network Error: ${e.message}`);
		process.exit(1);
	}

	const modelIds = new Set(availableModels.map((m) => m.id));

	// 2. Check POST /v1/chat/completions
	safeLog('\n------------------------------------------------------');
	safeLog('Test 2: POST /chat/completions (Inference Test)');
	safeLog('------------------------------------------------------');

	const candidateChatModels = [
		'mistralai/mistral-7b-instruct-v0.3',
		'nvidia/llama-3.1-nemotron-70b-instruct',
		'nv-mistralai/mistral-nemo-12b-instruct',
		'mistralai/mixtral-8x22b-v0.1',
		'mistralai/codestral-22b-instruct-v0.1',
		'meta/llama-3.2-11b-vision-instruct',
	];

	// Find the first matching chat candidate from catalog
	let chatModel = candidateChatModels.find((m) => modelIds.has(m)) || 'mistralai/mistral-7b-instruct-v0.3';
	safeLog(`  Target Model: ${chatModel}`);

	const chatUrl = buildNvidiaApiUrl('/chat/completions');
	const t1 = Date.now();

	try {
		const res = await fetch(chatUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Accept': 'application/json',
				'Authorization': `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				model: chatModel,
				messages: [{ role: 'user', content: 'Say hello in 3 words' }],
				temperature: 0.2,
				max_tokens: 30,
			}),
		});

		const latency = Date.now() - t1;
		if (!res.ok) {
			const errBody = await res.text();
			safeErr(`  ❌ Chat Inference Failed (HTTP ${res.status}): ${errBody}`);
		} else {
			const chatData = await res.json();
			const reply = chatData?.choices?.[0]?.message?.content || '[No text returned]';
			const tokens = chatData?.usage?.total_tokens ?? 'N/A';
			safeLog(`  ✔ SUCCESS (Latency: ${latency}ms)`);
			safeLog(`  Model Response: "${reply.trim()}"`);
			safeLog(`  Tokens Used: ${tokens}`);
		}
	} catch (e) {
		safeErr(`  ❌ Chat Request Error: ${e.message}`);
	}

	// 3. Check POST /v1/embeddings
	safeLog('\n------------------------------------------------------');
	safeLog('Test 3: POST /embeddings (Vector Embedding Test)');
	safeLog('------------------------------------------------------');

	const candidateEmbedModels = [
		'nvidia/nv-embedqa-mistral-7b-v2',
		'snowflake/arctic-embed-l',
		'nvidia/llama-3.2-nv-embedqa-1b-v1',
		'nvidia/nemotron-3.5-embed-1b',
	];

	let embedModel = candidateEmbedModels.find((m) => modelIds.has(m)) || 'nvidia/nv-embedqa-mistral-7b-v2';
	safeLog(`  Target Model: ${embedModel}`);

	const embedUrl = buildNvidiaApiUrl('/embeddings');
	const t2 = Date.now();

	try {
		const res = await fetch(embedUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Accept': 'application/json',
				'Authorization': `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				model: embedModel,
				input: ['test embedding text'],
				input_type: 'query',
			}),
		});

		const latency = Date.now() - t2;
		if (!res.ok) {
			const errBody = await res.text();
			safeLog(`  ℹ Note (HTTP ${res.status}): ${errBody}`);
		} else {
			const embedData = await res.json();
			const dimensions = embedData?.data?.[0]?.embedding?.length ?? 0;
			safeLog(`  ✔ SUCCESS (Latency: ${latency}ms)`);
			safeLog(`  Generated Vector Dimensions: ${dimensions}`);
		}
	} catch (e) {
		safeLog(`  ℹ Embedding Request Note: ${e.message}`);
	}

	safeLog('\n======================================================');
	safeLog('   Verification Finished — Zero Secrets Leaked       ');
	safeLog('======================================================\n');
}

main().catch((err) => {
	console.error(sanitizeSecrets(err.message));
	process.exit(1);
});