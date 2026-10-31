import test from 'node:test';
import assert from 'node:assert/strict';
import { executeEmbeddings } from '../dist/nodes/Nvidianim/resources/embeddings/embeddings.handler.js';
import { Nvidianim } from '../dist/nodes/Nvidianim/Nvidianim.node.js';

test('Generate Embeddings: input validation', async () => {
	const mockNode = { name: 'nvidianim' };

	// Empty model
	await assert.rejects(
		async () => {
			const ctx = {
				getNode: () => mockNode,
				getNodeParameter: (paramName) => (paramName === 'model' ? '' : ''),
				helpers: { httpRequestWithAuthentication: async () => ({}) },
			};
			await executeEmbeddings.call(ctx, 0);
		},
		(err) => err.message.includes('Model parameter cannot be empty'),
	);

	// Empty single text
	await assert.rejects(
		async () => {
			const ctx = {
				getNode: () => mockNode,
				getNodeParameter: (paramName) => {
					if (paramName === 'model') return 'nvidia/nemotron-3.5-embed-1b';
					if (paramName === 'inputMode') return 'single';
					if (paramName === 'text') return '   ';
					return '';
				},
				helpers: { httpRequestWithAuthentication: async () => ({}) },
			};
			await executeEmbeddings.call(ctx, 0);
		},
		(err) => err.message.includes('Text parameter cannot be empty'),
	);

	// Empty batch list
	await assert.rejects(
		async () => {
			const ctx = {
				getNode: () => mockNode,
				getNodeParameter: (paramName) => {
					if (paramName === 'model') return 'nvidia/nemotron-3.5-embed-1b';
					if (paramName === 'inputMode') return 'batch';
					if (paramName === 'batchTexts') return { textValues: [] };
					return '';
				},
				helpers: { httpRequestWithAuthentication: async () => ({}) },
			};
			await executeEmbeddings.call(ctx, 0);
		},
		(err) => err.message.includes('At least one text item is required'),
	);
});

test('Generate Embeddings: single text request construction and dimension reporting', async () => {
	let capturedRequest = null;
	const mockNode = { name: 'nvidianim' };

	const mockResponse = {
		object: 'list',
		model: 'nvidia/nemotron-3.5-embed-1b',
		data: [
			{
				object: 'embedding',
				embedding: [0.12, -0.34, 0.56, 0.78],
				index: 0,
			},
		],
		usage: { prompt_tokens: 6, total_tokens: 6 },
	};

	const mockContext = {
		getNode: () => mockNode,
		getNodeParameter: (paramName, index, fallback) => {
			const params = {
				model: 'nvidia/nemotron-3.5-embed-1b',
				inputMode: 'single',
				text: 'Sample sentence to embed',
				inputType: 'passage',
				simplifyOutput: true,
				additionalFields: {
					encodingFormat: 'float',
					truncate: 'END',
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

	const result = await executeEmbeddings.call(mockContext, 0);

	assert.equal(capturedRequest.credType, 'nvidianimApi');
	assert.equal(capturedRequest.reqOpts.method, 'POST');
	assert.equal(capturedRequest.reqOpts.url, 'https://integrate.api.nvidia.com/v1/embeddings');

	const body = capturedRequest.reqOpts.body;
	assert.equal(body.model, 'nvidia/nemotron-3.5-embed-1b');
	assert.deepEqual(body.input, ['Sample sentence to embed']);
	assert.equal(body.input_type, 'passage');
	assert.equal(body.encoding_format, 'float');
	assert.equal(body.truncate, 'END');

	// Output parsing
	assert.deepEqual(result.embedding, [0.12, -0.34, 0.56, 0.78]);
	assert.equal(result.dimensions, 4);
	assert.equal(result.model, 'nvidia/nemotron-3.5-embed-1b');
});

test('Generate Embeddings: batch mode preserves input ordering even when API responds out of order', async () => {
	let capturedRequest = null;
	const mockNode = { name: 'nvidianim' };

	// Simulate out of order return from backend: index 1 first, then index 0
	const mockResponse = {
		object: 'list',
		model: 'baai/bge-m3',
		data: [
			{
				object: 'embedding',
				embedding: [2.0, 2.1],
				index: 1,
			},
			{
				object: 'embedding',
				embedding: [1.0, 1.1],
				index: 0,
			},
		],
		usage: { prompt_tokens: 12, total_tokens: 12 },
	};

	const mockContext = {
		getNode: () => mockNode,
		getNodeParameter: (paramName, index, fallback) => {
			const params = {
				model: 'baai/bge-m3',
				inputMode: 'batch',
				batchTexts: {
					textValues: [{ text: 'First item' }, { text: 'Second item' }],
				},
				inputType: 'query',
				simplifyOutput: true,
				additionalFields: {},
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

	const result = await executeEmbeddings.call(mockContext, 0);

	assert.deepEqual(capturedRequest.reqOpts.body.input, ['First item', 'Second item']);
	assert.equal(capturedRequest.reqOpts.body.input_type, 'query');

	// Ordering must be strictly restored by index: [1.0, 1.1] then [2.0, 2.1]
	assert.equal(result.count, 2);
	assert.equal(result.dimensions, 2);
	assert.deepEqual(result.embeddings[0], [1.0, 1.1]);
	assert.deepEqual(result.embeddings[1], [2.0, 2.1]);
});

test('Generate Embeddings: full Node execute loop integration', async () => {
	const node = new Nvidianim();
	const mockExecContext = {
		getNode: () => ({ name: 'nvidianim' }),
		getInputData: () => [{ json: { row: 1 } }],
		getNodeParameter: (paramName) => {
			if (paramName === 'resource') return 'embedding';
			if (paramName === 'operation') return 'generate';
			if (paramName === 'model') return 'nvidia/nv-embed-v1';
			if (paramName === 'inputMode') return 'single';
			if (paramName === 'text') return 'Hello vector world';
			if (paramName === 'inputType') return 'passage';
			if (paramName === 'simplifyOutput') return true;
			if (paramName === 'additionalFields') return {};
			return '';
		},
		continueOnFail: () => false,
		helpers: {
			httpRequestWithAuthentication: async () => ({
				object: 'list',
				model: 'nvidia/nv-embed-v1',
				data: [{ object: 'embedding', embedding: [0.1, 0.2, 0.3], index: 0 }],
			}),
		},
	};

	const res = await node.execute.call(mockExecContext);
	assert.equal(res.length, 1);
	assert.equal(res[0].length, 1);
	assert.equal(res[0][0].json.dimensions, 3);
	assert.equal(res[0][0].pairedItem.item, 0);
});