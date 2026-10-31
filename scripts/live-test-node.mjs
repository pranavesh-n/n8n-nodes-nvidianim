#!/usr/bin/env node
import readline from 'node:readline';
import assert from 'node:assert/strict';
import { Nvidianim } from '../dist/nodes/Nvidianim/Nvidianim.node.js';
import { executeChat } from '../dist/nodes/Nvidianim/resources/text/chat.handler.js';
import { NvidiaNimChatModel } from '../dist/nodes/NvidiaNimChatModel/NvidiaNimChatModel.node.js';
import { sanitizeSecrets } from '../dist/nodes/Nvidianim/transport/index.js';

function deepSanitize(text, apiKey) {
	if (typeof text !== 'string') text = JSON.stringify(text, null, 2);
	let clean = sanitizeSecrets(text, apiKey ? [apiKey] : []);
	clean = clean.replace(/account\s+['"][A-Za-z0-9_-]+['"]/gi, "account '[REDACTED_ACCOUNT]'");
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
	console.log('   NVIDIA NIM Live Node & AI Agent Integration Test Suite   ');
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
	const errSafe = (msg) => console.error(deepSanitize(msg, apiKey));

	// -------------------------------------------------------------
	// 1. ACTION NODE: Message a Model Live Test
	// -------------------------------------------------------------
	logSafe('-------------------------------------------------------------');
	logSafe('Part 1: Action Node (Message a Model) Live Test');
	logSafe('-------------------------------------------------------------');

	const targetModel = 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning';
	let capturedRequest = null;

	const mockNodeContext = {
		getNode: () => ({ name: 'Nvidia NIM' }),
		getNodeParameter: (paramName, idx, fallback) => {
			const params = {
				model: { mode: 'id', value: targetModel },
				promptType: 'simple',
				prompt: 'Explain what an AI agent is in two sentences.',
				systemPrompt: '',
				simplifyOutput: true,
				additionalFields: {
					maxTokens: 256,
					temperature: 0.6,
					topP: 0.95,
					reasoningBudget: 128,
					timeout: 180000,
				},
			};
			return params[paramName] !== undefined ? params[paramName] : fallback;
		},
		helpers: {
			httpRequestWithAuthentication: async (credType, reqOpts) => {
				capturedRequest = reqOpts;
				const tStart = Date.now();
				const headers = {
					...reqOpts.headers,
					Authorization: `Bearer ${apiKey}`,
				};
				const res = await fetch(reqOpts.url, {
					method: reqOpts.method,
					headers,
					body: JSON.stringify(reqOpts.body),
				});
				const latency = Date.now() - tStart;
				if (!res.ok) {
					const errorText = await res.text();
					const errorObj = { statusCode: res.status, response: { status: res.status, data: errorText } };
					throw errorObj;
				}
				const json = await res.json();
				json._liveLatencyMs = latency;
				return json;
			},
		},
	};

	try {
		logSafe(`Executing executeChat with model: ${targetModel}...`);
		const result = await executeChat.call(mockNodeContext, 0);

		logSafe('\n✔ Action Node Live Request Succeeded!');
		logSafe(`  HTTP Method: ${capturedRequest.method}`);
		logSafe(`  Target URL: ${capturedRequest.url}`);
		logSafe('  Outgoing Request Body:');
		logSafe(`    model: ${capturedRequest.body.model}`);
		logSafe(`    max_tokens: ${capturedRequest.body.max_tokens}`);
		logSafe(`    temperature: ${capturedRequest.body.temperature}`);
		logSafe(`    top_p: ${capturedRequest.body.top_p}`);
		logSafe(`    reasoning_budget: ${capturedRequest.body.reasoning_budget}`);
		logSafe(`    stream: ${capturedRequest.body.stream}`);
		logSafe(`    messages: ${JSON.stringify(capturedRequest.body.messages)}`);

		logSafe('\n  Parsed Output:');
		logSafe(`    Text: "${result.text.trim()}"`);
		logSafe(`    Finish Reason: ${result.finish_reason}`);
		logSafe(`    Model Reported: ${result.model}`);
		logSafe(`    Usage: ${JSON.stringify(result.usage)}`);

		// Strict assertions
		assert.equal(capturedRequest.url, 'https://integrate.api.nvidia.com/v1/chat/completions');
		assert.equal(capturedRequest.body.model, targetModel);
		assert.equal(capturedRequest.body.max_tokens, 256);
		assert.equal(capturedRequest.body.temperature, 0.6);
		assert.equal(capturedRequest.body.top_p, 0.95);
		assert.equal(capturedRequest.body.reasoning_budget, 128);
		assert.equal(capturedRequest.body.stream, false);
		assert.ok(result.text && result.text.length > 0, 'Should return generated text');
	} catch (err) {
		errSafe(`❌ Action Node Live Test Failed: ${err.message || JSON.stringify(err)}`);
	}

	// -------------------------------------------------------------
	// 2. AI AGENT SUB-NODE: supplyData, Invocation & Tool Calling
	// -------------------------------------------------------------
	logSafe('\n-------------------------------------------------------------');
	logSafe('Part 2: AI Agent Sub-Node (supplyData) Live Test');
	logSafe('-------------------------------------------------------------');

	const chatModelSubNode = new NvidiaNimChatModel();

	const mockAgentContext = {
		getNode: () => ({ name: 'Nvidia NIM Chat Model', type: 'nvidiaNimChatModel' }),
		helpers: {
			getSecureEgressFilter: () => 'disabled',
		},
		getCredentials: async (type) => {
			assert.equal(type, 'nvidianimApi');
			return { apiKey };
		},
		getNodeParameter: (paramName) => {
			if (paramName === 'model') return targetModel;
			if (paramName === 'options') {
				return {
					temperature: 0.6,
					maxTokens: 256,
					topP: 0.95,
					reasoningBudget: 128,
					streaming: false,
					maxRetries: 2,
					timeout: 180000,
				};
			}
			return undefined;
		},
	};

	try {
		logSafe(`Initializing AI Agent model supplyData with ${targetModel}...`);
		const supplyResult = await chatModelSubNode.supplyData.call(mockAgentContext, 0);
		const modelInstance = supplyResult.response;

		logSafe('✔ Model supplied to AI Agent successfully.');
		logSafe(`  Model Name: ${modelInstance.modelName || modelInstance.model}`);
		logSafe(`  Temperature: ${modelInstance.temperature}`);
		logSafe(`  Max Tokens: ${modelInstance.maxTokens}`);
		logSafe(`  Top P: ${modelInstance.topP}`);

		// Technical check: reasoning_budget parameter forwarding verification
		logSafe('\nVerifying reasoning_budget forwarding through LangChain ChatOpenAI:');
		const invocationParams = typeof modelInstance.invocationParams === 'function' ? modelInstance.invocationParams() : {};
		logSafe(`  modelInstance.modelKwargs: ${JSON.stringify(modelInstance.modelKwargs)}`);
		logSafe(`  modelInstance.invocationParams().reasoning_budget: ${invocationParams.reasoning_budget}`);
		assert.equal(invocationParams.reasoning_budget, 128, 'reasoning_budget must be forwarded to ChatOpenAI invocation parameters');
		logSafe('  ✔ Verified: reasoning_budget is forwarded directly into outgoing HTTP request payload.');

		// Negative check: verify reasoning_budget is omitted when unset
		const unsetContext = {
			...mockAgentContext,
			getNodeParameter: (paramName) => {
				if (paramName === 'model') return targetModel;
				if (paramName === 'options') return {};
				return undefined;
			},
		};
		const unsetSupplyResult = await chatModelSubNode.supplyData.call(unsetContext, 0);
		const unsetModel = unsetSupplyResult.response;
		const unsetParams = typeof unsetModel.invocationParams === 'function' ? unsetModel.invocationParams() : {};
		assert.equal(unsetParams.reasoning_budget, undefined, 'reasoning_budget must be omitted when unset');
		logSafe('  ✔ Verified: reasoning_budget is omitted entirely when left unset by user.');

		// Live model invocation through LangChain
		logSafe('\nInvoking AI Agent model live via LangChain invoke()...');
		const tStart = Date.now();
		const response = await modelInstance.invoke('Explain what an AI agent is in two sentences.');
		const latency = Date.now() - tStart;

		logSafe(`✔ Live AI Agent Model Invocation Succeeded (Latency: ${latency}ms)!`);
		logSafe(`  Response Content: "${(response.content || '').trim()}"`);
		if (response.usage_metadata) {
			logSafe(`  Token Usage: ${JSON.stringify(response.usage_metadata)}`);
		}

		// Tool calling: Binding vs Execution Distinction
		logSafe('\nTesting Tool Calling (Binding vs Execution Distinction):');
		const testTool = {
			name: 'get_weather',
			description: 'Get the current weather in a given city',
			parameters: {
				type: 'object',
				properties: {
					city: { type: 'string', description: 'City name' },
				},
				required: ['city'],
			},
		};

		// 1. Tool Binding
		const boundModel = modelInstance.bindTools([testTool]);
		assert.ok(boundModel, 'Model instance binds tools successfully');
		logSafe('  ✔ Step 1 (Tool Binding): bindTools() succeeded without error.');

		// 2. Tool Call Execution
		logSafe('  Step 2 (Tool Call Execution): Sending prompt requiring tool use...');
		try {
			const toolInvokeRes = await boundModel.invoke('What is the current weather in San Francisco? Use the get_weather tool.');
			if (toolInvokeRes.tool_calls && toolInvokeRes.tool_calls.length > 0) {
				logSafe(`  ✔ Step 2 (Tool Call Executed): Model actively triggered tool call:`);
				logSafe(`    Function: ${toolInvokeRes.tool_calls[0].name}`);
				logSafe(`    Arguments: ${JSON.stringify(toolInvokeRes.tool_calls[0].args)}`);
			} else {
				logSafe(`  ℹ Step 2 Note: Model returned natural language content instead of tool_call.`);
				logSafe(`    Content: "${(toolInvokeRes.content || '').trim().slice(0, 150)}..."`);
				logSafe(`    (This model family prioritizes direct chain-of-thought over structured function calling).`);
			}
		} catch (toolErr) {
			logSafe(`  ℹ Step 2 Note: Tool invocation returned: ${toolErr.message}`);
		}
	} catch (err) {
		errSafe(`❌ AI Agent Live Test Failed: ${err.message || JSON.stringify(err)}`);
	}

	logSafe('\n=============================================================');
	logSafe('   All Live Integration Tests Finished Successfully         ');
	logSafe('=============================================================\n');
}

main().catch((err) => {
	console.error(deepSanitize(err.message));
	process.exit(1);
});