import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { NvidiaNimChatModel } from '../dist/nodes/NvidiaNimChatModel/NvidiaNimChatModel.node.js';

const require = createRequire(import.meta.url);
const { NodeConnectionTypes } = require('n8n-workflow');

test('AI Agent Workflow: Full supplyData to ChatOpenAI end-to-end model pipeline', async () => {
	const chatModelNode = new NvidiaNimChatModel();

	// 1. Verify Node connection type matches n8n AI Agent input requirement
	assert.deepEqual(chatModelNode.description.outputs, [NodeConnectionTypes.AiLanguageModel]);

	// 2. Simulate n8n workflow execution context when AI Agent calls supplyData
	const mockAgentContext = {
		getNode: () => ({ name: 'Nvidia NIM Chat Model', type: 'nvidiaNimChatModel' }),
		helpers: {
			getSecureEgressFilter: () => 'disabled',
		},
		getCredentials: async (type) => {
			assert.equal(type, 'nvidianimApi');
			return { apiKey: 'nvapi-agent-e2e-test-key' };
		},
		getNodeParameter: (paramName) => {
			if (paramName === 'model') return 'meta/llama-3.1-70b-instruct';
			if (paramName === 'options') {
				return {
					temperature: 0.5,
					maxTokens: 1024,
					topP: 0.95,
					streaming: true,
					maxRetries: 3,
				};
			}
			return undefined;
		},
	};

	const supplyResult = await chatModelNode.supplyData.call(mockAgentContext, 0);
	assert.ok(supplyResult, 'supplyResult must be returned');
	assert.ok(supplyResult.response, 'supplyResult must provide response model');

	const agentModel = supplyResult.response;

	// 3. Verify Agent Model properties
	assert.equal(agentModel.modelName || agentModel.model, 'meta/llama-3.1-70b-instruct');
	assert.equal(agentModel.temperature, 0.5);
	assert.equal(agentModel.maxTokens, 1024);
	assert.equal(agentModel.topP, 0.95);
	assert.equal(agentModel.streaming, true);
	assert.equal(agentModel.caller?.maxRetries, 3);

	// 4. Verify tool calling capability (LangChain bindTools used by n8n AI Agent)
	assert.equal(typeof agentModel.bindTools, 'function', 'Model must support bindTools for AI Agent tools');

	const mockTool = {
		name: 'get_current_weather',
		description: 'Get the current weather in a given location',
		parameters: {
			type: 'object',
			properties: {
				location: { type: 'string', description: 'City name' },
			},
			required: ['location'],
		},
	};

	const boundModel = agentModel.bindTools([mockTool]);
	assert.ok(boundModel, 'Model successfully binds tools for AI Agent tool use');
});

test('AI Agent Workflow: Error propagation and secret protection', async () => {
	const chatModelNode = new NvidiaNimChatModel();

	// Test missing credentials
	const missingCredsContext = {
		getNode: () => ({ name: 'Nvidia NIM Chat Model' }),
		helpers: { getSecureEgressFilter: () => 'disabled' },
		getCredentials: async () => ({}),
		getNodeParameter: () => 'meta/llama-3.1-70b-instruct',
	};

	await assert.rejects(
		async () => {
			await chatModelNode.supplyData.call(missingCredsContext, 0);
		},
		(err) => err.message.includes('No NVIDIA NIM API credentials found'),
	);

	// Test missing model
	const missingModelContext = {
		getNode: () => ({ name: 'Nvidia NIM Chat Model' }),
		helpers: { getSecureEgressFilter: () => 'disabled' },
		getCredentials: async () => ({ apiKey: 'nvapi-key' }),
		getNodeParameter: (param) => {
			if (param === 'model') return '';
			return {};
		},
	};

	await assert.rejects(
		async () => {
			await chatModelNode.supplyData.call(missingModelContext, 0);
		},
		(err) => err.message.includes('Model parameter must not be empty'),
	);
});

test('AI Agent Workflow: reasoning_budget parameter forwarding verification', async () => {
	const chatModelNode = new NvidiaNimChatModel();

	// Case 1: reasoningBudget specified
	const setContext = {
		getNode: () => ({ name: 'Nvidia NIM Chat Model' }),
		helpers: { getSecureEgressFilter: () => 'disabled' },
		getCredentials: async () => ({ apiKey: 'nvapi-test-key' }),
		getNodeParameter: (paramName) => {
			if (paramName === 'model') return 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning';
			if (paramName === 'options') {
				return {
					reasoningBudget: 128,
				};
			}
			return undefined;
		},
	};

	const setResult = await chatModelNode.supplyData.call(setContext, 0);
	const setModel = setResult.response;
	assert.deepEqual(setModel.modelKwargs, { reasoning_budget: 128 });
	assert.equal(setModel.invocationParams().reasoning_budget, 128);

	// Case 2: reasoningBudget omitted
	const unsetContext = {
		getNode: () => ({ name: 'Nvidia NIM Chat Model' }),
		helpers: { getSecureEgressFilter: () => 'disabled' },
		getCredentials: async () => ({ apiKey: 'nvapi-test-key' }),
		getNodeParameter: (paramName) => {
			if (paramName === 'model') return 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning';
			if (paramName === 'options') return {};
			return undefined;
		},
	};

	const unsetResult = await chatModelNode.supplyData.call(unsetContext, 0);
	const unsetModel = unsetResult.response;
	assert.deepEqual(unsetModel.modelKwargs, {});
	assert.equal(unsetModel.invocationParams().reasoning_budget, undefined);
});