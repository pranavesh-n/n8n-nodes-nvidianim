import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { NvidiaNimChatModel } from '../dist/nodes/NvidiaNimChatModel/NvidiaNimChatModel.node.js';

const require = createRequire(import.meta.url);
const { NodeConnectionTypes } = require('n8n-workflow');

test('Chat Model Sub-Node: Description and AI Agent compatibility', () => {
	const node = new NvidiaNimChatModel();
	assert.equal(node.description.name, 'nvidiaNimChatModel');
	assert.equal(node.description.displayName, 'Nvidia NIM Chat Model');
	assert.deepEqual(node.description.inputs, []);
	assert.deepEqual(node.description.outputs, [NodeConnectionTypes.AiLanguageModel]);
	assert.equal(node.description.credentials?.[0]?.name, 'nvidianimApi');
	assert.equal(node.description.credentials?.[0]?.required, true);
	assert.ok(node.description.icon, 'Must have icon defined');
	assert.ok(node.description.subtitle, 'Must have subtitle defined');

	// Verify model property
	const modelProp = node.description.properties.find((p) => p.name === 'model');
	assert.ok(modelProp, 'Model property must exist');
	assert.equal(modelProp.type, 'resourceLocator');
	assert.ok(modelProp.modes?.some((m) => m.name === 'list'));
	assert.ok(modelProp.modes?.some((m) => m.name === 'id'));

	// Verify options collection
	const optionsProp = node.description.properties.find((p) => p.name === 'options');
	assert.ok(optionsProp, 'Options property must exist');
	assert.equal(optionsProp.type, 'collection');
	const subOptions = (optionsProp.options || []).map((o) => o.name);
	assert.ok(subOptions.includes('customModel'));
	assert.ok(subOptions.includes('temperature'));
	assert.ok(subOptions.includes('maxTokens'));
	assert.ok(subOptions.includes('topP'));
	assert.ok(subOptions.includes('streaming'));
	assert.ok(subOptions.includes('timeout'));
	assert.ok(subOptions.includes('maxRetries'));
});

test('Chat Model Sub-Node: loadOptions.getModels returns API models when available', async () => {
	const node = new NvidiaNimChatModel();
	const mockContext = {
		getNode: () => ({ name: 'Test Chat Model' }),
		helpers: {
			httpRequestWithAuthentication: async () => ({
				data: [
					{ id: 'meta/llama-3.1-70b-instruct' },
					{ id: 'nvidia/llama-3.1-nemotron-70b-instruct' },
				],
			}),
		},
	};

	const models = await node.methods.loadOptions.getModels.call(mockContext);
	assert.equal(models.length, 2);
	assert.equal(models[0].value, 'meta/llama-3.1-70b-instruct');
	assert.equal(models[1].value, 'nvidia/llama-3.1-nemotron-70b-instruct');
});

test('Chat Model Sub-Node: loadOptions.getModels falls back gracefully on API error', async () => {
	const node = new NvidiaNimChatModel();
	const mockContext = {
		getNode: () => ({ name: 'Test Chat Model' }),
		helpers: {
			httpRequestWithAuthentication: async () => {
				throw new Error('API key missing or network unreachable');
			},
		},
	};

	const models = await node.methods.loadOptions.getModels.call(mockContext);
	assert.ok(Array.isArray(models));
	assert.ok(models.length > 0, 'Must return fallback models');
	assert.ok(models.some((m) => m.value === 'meta/llama-3.1-70b-instruct'));
});

test('Chat Model Sub-Node: supplyData validation', async () => {
	const node = new NvidiaNimChatModel();

	// Test 1: Missing API credentials
	await assert.rejects(
		async () => {
			const mockContext = {
				getNode: () => ({ name: 'Test Chat Model' }),
				getCredentials: async () => ({}),
				getNodeParameter: (name) => {
					if (name === 'model') return 'meta/llama-3.1-70b-instruct';
					return {};
				},
			};
			await node.supplyData.call(mockContext, 0);
		},
		(err) => err.message.includes('No NVIDIA NIM API credentials found'),
	);

	// Test 2: Missing model parameter
	await assert.rejects(
		async () => {
			const mockContext = {
				getNode: () => ({ name: 'Test Chat Model' }),
				getCredentials: async () => ({ apiKey: 'nvapi-valid-key' }),
				getNodeParameter: (name) => {
					if (name === 'model') return '';
					return {};
				},
			};
			await node.supplyData.call(mockContext, 0);
		},
		(err) => err.message.includes('Model parameter must not be empty'),
	);
});

test('Chat Model Sub-Node: supplyData supplies ChatOpenAI model with default and custom options', async () => {
	const node = new NvidiaNimChatModel();

	// Mock n8n context for supplyData
	const mockContext = {
		getNode: () => ({ name: 'Nvidia NIM Chat Model' }),
		helpers: {
			getSecureEgressFilter: () => 'disabled',
		},
		getCredentials: async (type) => {
			assert.equal(type, 'nvidianimApi');
			return { apiKey: 'nvapi-test-chat-model-key' };
		},
		getNodeParameter: (paramName) => {
			if (paramName === 'model') return 'meta/llama-3.1-70b-instruct';
			if (paramName === 'options') {
				return {
					temperature: 0.2,
					maxTokens: 4096,
					topP: 0.9,
					streaming: true,
					frequencyPenalty: 0.5,
					presencePenalty: 0.5,
					timeout: 45000,
					maxRetries: 3,
				};
			}
			return undefined;
		},
	};

	const supplyResult = await node.supplyData.call(mockContext, 0);
	assert.ok(supplyResult, 'supplyResult must be returned');
	assert.ok(supplyResult.response, 'supplyResult.response must be present');

	const modelInstance = supplyResult.response;
	assert.equal(modelInstance.constructor.name, 'ChatOpenAI');
	assert.equal(modelInstance.modelName || modelInstance.model, 'meta/llama-3.1-70b-instruct');
	assert.equal(modelInstance.temperature, 0.2);
	assert.equal(modelInstance.maxTokens, 4096);
	assert.equal(modelInstance.topP, 0.9);
	assert.equal(modelInstance.frequencyPenalty, 0.5);
	assert.equal(modelInstance.presencePenalty, 0.5);
	assert.equal(modelInstance.streaming, true);
	assert.equal(modelInstance.caller?.maxRetries, 3);
});

test('Chat Model Sub-Node: supplyData customModel option overrides dropdown model', async () => {
	const node = new NvidiaNimChatModel();

	const mockContext = {
		getNode: () => ({ name: 'Nvidia NIM Chat Model' }),
		helpers: {
			getSecureEgressFilter: () => 'disabled',
		},
		getCredentials: async () => ({ apiKey: 'nvapi-test-key' }),
		getNodeParameter: (paramName) => {
			if (paramName === 'model') return 'meta/llama-3.1-70b-instruct';
			if (paramName === 'options') {
				return {
					customModel: 'mistralai/mistral-large-2407',
				};
			}
			return undefined;
		},
	};

	const supplyResult = await node.supplyData.call(mockContext, 0);
	const modelInstance = supplyResult.response;
	assert.equal(modelInstance.modelName || modelInstance.model, 'mistralai/mistral-large-2407');
});