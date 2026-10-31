import test from 'node:test';
import assert from 'node:assert/strict';
import { executeVisionAnalysis } from '../dist/nodes/Nvidianim/resources/vision/analyze.handler.js';
import { Nvidianim } from '../dist/nodes/Nvidianim/Nvidianim.node.js';

test('Analyze an Image: input validation', async () => {
	const mockNode = { name: 'nvidianim' };

	// Empty model
	await assert.rejects(
		async () => {
			const ctx = {
				getNode: () => mockNode,
				getNodeParameter: (paramName) => (paramName === 'model' ? '' : ''),
				helpers: { httpRequestWithAuthentication: async () => ({}) },
			};
			await executeVisionAnalysis.call(ctx, 0);
		},
		(err) => err.message.includes('Model parameter cannot be empty'),
	);

	// Empty prompt
	await assert.rejects(
		async () => {
			const ctx = {
				getNode: () => mockNode,
				getNodeParameter: (paramName) => {
					if (paramName === 'model') return 'meta/llama-3.2-11b-vision-instruct';
					if (paramName === 'prompt') return '   ';
					return '';
				},
				helpers: { httpRequestWithAuthentication: async () => ({}) },
			};
			await executeVisionAnalysis.call(ctx, 0);
		},
		(err) => err.message.includes('Prompt parameter cannot be empty'),
	);

	// Invalid URL scheme
	await assert.rejects(
		async () => {
			const ctx = {
				getNode: () => mockNode,
				getNodeParameter: (paramName) => {
					if (paramName === 'model') return 'meta/llama-3.2-11b-vision-instruct';
					if (paramName === 'prompt') return 'What is this?';
					if (paramName === 'imageSource') return 'url';
					if (paramName === 'imageUrl') return 'ftp://invalid-scheme.com/img.png';
					return '';
				},
				helpers: { httpRequestWithAuthentication: async () => ({}) },
			};
			await executeVisionAnalysis.call(ctx, 0);
		},
		(err) => err.message.includes('Image URL must be a valid HTTP/HTTPS URL or base64 data URI'),
	);

	// Binary mode with non-image mimeType
	await assert.rejects(
		async () => {
			const ctx = {
				getNode: () => mockNode,
				getNodeParameter: (paramName) => {
					if (paramName === 'model') return 'meta/llama-3.2-11b-vision-instruct';
					if (paramName === 'prompt') return 'What is this?';
					if (paramName === 'imageSource') return 'binary';
					if (paramName === 'binaryPropertyName') return 'data';
					return '';
				},
				helpers: {
					assertBinaryData: () => ({ mimeType: 'application/pdf' }),
					httpRequestWithAuthentication: async () => ({}),
				},
			};
			await executeVisionAnalysis.call(ctx, 0);
		},
		(err) => err.message.includes('must be an image, but found "application/pdf"'),
	);
});

test('Analyze an Image: request construction with remote Image URL', async () => {
	let capturedRequest = null;
	const mockNode = { name: 'nvidianim' };

	const mockResponse = {
		id: 'chatcmpl-vision-101',
		object: 'chat.completion',
		model: 'meta/llama-3.2-11b-vision-instruct',
		choices: [
			{
				index: 0,
				message: {
					role: 'assistant',
					content: 'The image depicts a golden retriever sitting on grass.',
				},
				finish_reason: 'stop',
			},
		],
		usage: { prompt_tokens: 150, completion_tokens: 12, total_tokens: 162 },
	};

	const mockContext = {
		getNode: () => mockNode,
		getNodeParameter: (paramName, index, fallback) => {
			const params = {
				model: 'meta/llama-3.2-11b-vision-instruct',
				prompt: 'What kind of animal is in the photo?',
				imageSource: 'url',
				imageUrl: 'https://images.example.com/retriever.jpg',
				systemPrompt: 'You are an animal identification specialist.',
				simplifyOutput: true,
				additionalFields: {
					maxTokens: 512,
					temperature: 0.1,
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

	const result = await executeVisionAnalysis.call(mockContext, 0);

	assert.equal(capturedRequest.credType, 'nvidianimApi');
	assert.equal(capturedRequest.reqOpts.method, 'POST');
	assert.equal(capturedRequest.reqOpts.url, 'https://integrate.api.nvidia.com/v1/chat/completions');

	const body = capturedRequest.reqOpts.body;
	assert.equal(body.model, 'meta/llama-3.2-11b-vision-instruct');
	assert.equal(body.max_tokens, 512);
	assert.equal(body.temperature, 0.1);

	// Messages format verification
	assert.equal(body.messages.length, 2);
	assert.equal(body.messages[0].role, 'system');
	assert.equal(body.messages[1].role, 'user');

	const content = body.messages[1].content;
	assert.equal(content.length, 2);
	assert.deepEqual(content[0], { type: 'text', text: 'What kind of animal is in the photo?' });
	assert.deepEqual(content[1], {
		type: 'image_url',
		image_url: { url: 'https://images.example.com/retriever.jpg' },
	});

	// Output parsing
	assert.equal(result.text, 'The image depicts a golden retriever sitting on grass.');
	assert.equal(result.finish_reason, 'stop');
	assert.equal(result.model, 'meta/llama-3.2-11b-vision-instruct');
	assert.equal(result.usage.total_tokens, 162);
});

test('Analyze an Image: binary data source converts to base64 data URI', async () => {
	let capturedRequest = null;
	const mockNode = { name: 'nvidianim' };
	const fakeImageBuffer = Buffer.from('FAKE_PNG_BINARY_BYTES');

	const mockContext = {
		getNode: () => mockNode,
		getNodeParameter: (paramName, index, fallback) => {
			const params = {
				model: 'nvidia/neva-22b',
				prompt: 'Inspect this diagram',
				imageSource: 'binary',
				binaryPropertyName: 'data',
				systemPrompt: '',
				simplifyOutput: true,
				additionalFields: {},
			};
			return params[paramName] !== undefined ? params[paramName] : fallback;
		},
		helpers: {
			assertBinaryData: () => ({ mimeType: 'image/png' }),
			getBinaryDataBuffer: async () => fakeImageBuffer,
			httpRequestWithAuthentication: async (credType, reqOpts) => {
				capturedRequest = { credType, reqOpts };
				return {
					id: 'chatcmpl-neva',
					choices: [{ message: { content: 'Diagram analysis complete.' }, finish_reason: 'stop' }],
				};
			},
		},
	};

	const result = await executeVisionAnalysis.call(mockContext, 0);

	const content = capturedRequest.reqOpts.body.messages[0].content;
	const imageUrl = content[1].image_url.url;

	assert.ok(imageUrl.startsWith('data:image/png;base64,'));
	assert.ok(imageUrl.includes(fakeImageBuffer.toString('base64')));
	assert.equal(result.text, 'Diagram analysis complete.');
});

test('Analyze an Image: full Node execute loop integration', async () => {
	const node = new Nvidianim();
	const mockExecContext = {
		getNode: () => ({ name: 'nvidianim' }),
		getInputData: () => [{ json: { item: 1 } }],
		getNodeParameter: (paramName) => {
			if (paramName === 'resource') return 'vision';
			if (paramName === 'operation') return 'analyze';
			if (paramName === 'model') return 'meta/llama-3.2-11b-vision-instruct';
			if (paramName === 'prompt') return 'Describe image';
			if (paramName === 'imageSource') return 'url';
			if (paramName === 'imageUrl') return 'https://example.com/test.jpg';
			if (paramName === 'systemPrompt') return '';
			if (paramName === 'simplifyOutput') return true;
			if (paramName === 'additionalFields') return {};
			return '';
		},
		continueOnFail: () => false,
		helpers: {
			httpRequestWithAuthentication: async () => ({
				id: 'chatcmpl-vision',
				choices: [{ message: { content: 'Test image description' }, finish_reason: 'stop' }],
			}),
		},
	};

	const res = await node.execute.call(mockExecContext);
	assert.equal(res.length, 1);
	assert.equal(res[0].length, 1);
	assert.equal(res[0][0].json.text, 'Test image description');
	assert.equal(res[0][0].pairedItem.item, 0);
});