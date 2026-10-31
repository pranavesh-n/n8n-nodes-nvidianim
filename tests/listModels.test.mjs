import test from 'node:test';
import assert from 'node:assert/strict';
import { executeListModels } from '../dist/nodes/Nvidianim/resources/model/getAll.handler.js';
import { Nvidianim } from '../dist/nodes/Nvidianim/Nvidianim.node.js';

test('List Models: successfully fetches and parses all models', async () => {
	let capturedRequest = null;
	const mockModelsData = [
		{ id: 'meta/llama-3.3-70b-instruct', object: 'model', created: 1730000000, owned_by: 'system' },
		{ id: 'nvidia/nemotron-4-340b-instruct', object: 'model', created: 1730000001, owned_by: 'system' },
		{ id: 'deepseek-ai/deepseek-r1', object: 'model', created: 1730000002, owned_by: 'system' },
	];

	const mockContext = {
		getNode: () => ({ name: 'nvidianim' }),
		getNodeParameter: (paramName, index, fallback) => {
			if (paramName === 'returnAll') return true;
			return fallback;
		},
		helpers: {
			httpRequestWithAuthentication: async (credType, reqOpts) => {
				capturedRequest = { credType, reqOpts };
				return { object: 'list', data: mockModelsData };
			},
		},
	};

	const results = await executeListModels.call(mockContext, 0);

	assert.equal(capturedRequest.credType, 'nvidianimApi');
	assert.equal(capturedRequest.reqOpts.method, 'GET');
	assert.equal(capturedRequest.reqOpts.url, 'https://integrate.api.nvidia.com/v1/models');

	assert.equal(results.length, 3);
	assert.equal(results[0].id, 'meta/llama-3.3-70b-instruct');
	assert.equal(results[1].id, 'nvidia/nemotron-4-340b-instruct');
	assert.equal(results[2].id, 'deepseek-ai/deepseek-r1');
});

test('List Models: respects limit when returnAll is false', async () => {
	const mockModelsData = [
		{ id: 'model-1' },
		{ id: 'model-2' },
		{ id: 'model-3' },
		{ id: 'model-4' },
	];

	const mockContext = {
		getNode: () => ({ name: 'nvidianim' }),
		getNodeParameter: (paramName, index, fallback) => {
			if (paramName === 'returnAll') return false;
			if (paramName === 'limit') return 2;
			return fallback;
		},
		helpers: {
			httpRequestWithAuthentication: async () => ({
				data: mockModelsData,
			}),
		},
	};

	const results = await executeListModels.call(mockContext, 0);
	assert.equal(results.length, 2);
	assert.equal(results[0].id, 'model-1');
	assert.equal(results[1].id, 'model-2');
});

test('List Models: handles empty and malformed responses', async () => {
	const mockNode = { name: 'nvidianim' };

	// Malformed response (not an object)
	await assert.rejects(
		async () => {
			const ctx = {
				getNode: () => mockNode,
				getNodeParameter: () => true,
				helpers: { httpRequestWithAuthentication: async () => null },
			};
			await executeListModels.call(ctx, 0);
		},
		(err) => err.message.includes('Received malformed response'),
	);

	// Malformed response (data is not array)
	await assert.rejects(
		async () => {
			const ctx = {
				getNode: () => mockNode,
				getNodeParameter: () => true,
				helpers: { httpRequestWithAuthentication: async () => ({ data: 'not-an-array' }) },
			};
			await executeListModels.call(ctx, 0);
		},
		(err) => err.message.includes('Expected "data" property in NVIDIA NIM models response to be an array'),
	);

	// Empty data array returns empty list cleanly
	const emptyCtx = {
		getNode: () => mockNode,
		getNodeParameter: () => true,
		helpers: { httpRequestWithAuthentication: async () => ({ data: [] }) },
	};
	const emptyResult = await executeListModels.call(emptyCtx, 0);
	assert.deepEqual(emptyResult, []);
});

test('List Models: full Node execute loop produces paired items', async () => {
	const node = new Nvidianim();
	const mockExecContext = {
		getNode: () => ({ name: 'nvidianim' }),
		getInputData: () => [{ json: {} }],
		getNodeParameter: (paramName) => {
			if (paramName === 'resource') return 'model';
			if (paramName === 'operation') return 'getAll';
			if (paramName === 'returnAll') return true;
			return '';
		},
		continueOnFail: () => false,
		helpers: {
			httpRequestWithAuthentication: async () => ({
				data: [
					{ id: 'meta/llama-3.1-8b-instruct', object: 'model' },
					{ id: 'nvidia/nemotron-4-340b-instruct', object: 'model' },
				],
			}),
		},
	};

	const result = await node.execute.call(mockExecContext);
	assert.equal(result.length, 1);
	const items = result[0];
	assert.equal(items.length, 2);
	assert.equal(items[0].json.id, 'meta/llama-3.1-8b-instruct');
	assert.equal(items[0].pairedItem.item, 0);
	assert.equal(items[1].json.id, 'nvidia/nemotron-4-340b-instruct');
	assert.equal(items[1].pairedItem.item, 0);
});