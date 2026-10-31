import test from 'node:test';
import assert from 'node:assert/strict';
import { executeTextCompletion } from '../dist/nodes/Nvidianim/resources/text/completion.handler.js';
import { Nvidianim } from '../dist/nodes/Nvidianim/Nvidianim.node.js';

test('Generate Text: input validation', async () => {
	const mockNode = { name: 'nvidianim' };

	// Empty model
	await assert.rejects(
		async () => {
			const ctx = {
				getNode: () => mockNode,
				getNodeParameter: (paramName) => {
					if (paramName === 'model') return '';
					return '';
				},
				helpers: { httpRequestWithAuthentication: async () => ({}) },
			};
			await executeTextCompletion.call(ctx, 0);
		},
		(err) => err.message.includes('Model parameter cannot be empty'),
	);

	// Empty prompt
	await assert.rejects(
		async () => {
			const ctx = {
				getNode: () => mockNode,
				getNodeParameter: (paramName) => {
					if (paramName === 'model') return 'meta/llama-3.1-8b-instruct';
					if (paramName === 'prompt') return '   ';
					return '';
				},
				helpers: { httpRequestWithAuthentication: async () => ({}) },
			};
			await executeTextCompletion.call(ctx, 0);
		},
		(err) => err.message.includes('Prompt parameter cannot be empty'),
	);
});

test('Generate Text: request construction and simplified output parsing', async () => {
	let capturedRequest = null;
	const mockNode = { name: 'nvidianim' };

	const mockResponse = {
		id: 'cmpl-test-789',
		object: 'text_completion',
		created: 1730000000,
		model: 'meta/llama-3.1-8b-instruct',
		choices: [
			{
				text: 'Once upon a time in a distributed system...',
				index: 0,
				finish_reason: 'stop',
			},
		],
		usage: {
			prompt_tokens: 10,
			completion_tokens: 25,
			total_tokens: 35,
		},
	};

	const mockContext = {
		getNode: () => mockNode,
		getNodeParameter: (paramName, index, fallback) => {
			const params = {
				model: { mode: 'id', value: 'meta/llama-3.1-8b-instruct' },
				prompt: 'Write a story opening',
				simplifyOutput: true,
				additionalFields: {
					temperature: 0.6,
					maxTokens: 256,
					topP: 0.85,
				},
			};
			return params[paramName] !== undefined ? params[paramName] : fallback;
		},
		helpers: {
			httpRequestWithAuthentication: async (credType, reqOpts) => {
				capturedRequest = { credType, reqOpts };
				return mockResponse;
			},
		},
	};

	const result = await executeTextCompletion.call(mockContext, 0);

	assert.equal(capturedRequest.credType, 'nvidianimApi');
	assert.equal(capturedRequest.reqOpts.method, 'POST');
	assert.equal(capturedRequest.reqOpts.url, 'https://integrate.api.nvidia.com/v1/completions');

	const body = capturedRequest.reqOpts.body;
	assert.equal(body.model, 'meta/llama-3.1-8b-instruct');
	assert.equal(body.prompt, 'Write a story opening');
	assert.equal(body.temperature, 0.6);
	assert.equal(body.max_tokens, 256);
	assert.equal(body.top_p, 0.85);
	assert.equal(body.stream, false);

	assert.equal(result.text, 'Once upon a time in a distributed system...');
	assert.equal(result.finish_reason, 'stop');
	assert.equal(result.model, 'meta/llama-3.1-8b-instruct');
	assert.equal(result.usage.total_tokens, 35);
});

test('Generate Text: full Node execute loop with raw output mode', async () => {
	const node = new Nvidianim();
	const rawApiResponse = {
		id: 'cmpl-raw-999',
		object: 'text_completion',
		model: 'custom-model',
		choices: [{ text: 'Raw text result', index: 0, finish_reason: 'length' }],
	};

	const mockExecContext = {
		getNode: () => ({ name: 'nvidianim' }),
		getInputData: () => [{ json: { doc: 1 } }],
		getNodeParameter: (paramName) => {
			if (paramName === 'resource') return 'text';
			if (paramName === 'operation') return 'completion';
			if (paramName === 'model') return 'custom-model';
			if (paramName === 'prompt') return 'Generate code';
			if (paramName === 'simplifyOutput') return false;
			if (paramName === 'additionalFields') return {};
			return '';
		},
		continueOnFail: () => false,
		helpers: {
			httpRequestWithAuthentication: async () => rawApiResponse,
		},
	};

	const result = await node.execute.call(mockExecContext);
	assert.equal(result.length, 1);
	assert.equal(result[0].length, 1);
	assert.deepEqual(result[0][0].json, rawApiResponse);
	assert.equal(result[0][0].pairedItem.item, 0);
});