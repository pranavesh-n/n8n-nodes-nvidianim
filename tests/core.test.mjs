import test from 'node:test';
import assert from 'node:assert/strict';
import { NvidianimApi } from '../dist/credentials/NvidianimApi.credentials.js';
import {
	buildNvidiaApiUrl,
	formatNvidiaApiErrorMessage,
	NVIDIA_API_BASE_URL,
	NVIDIA_API_HOST,
	sanitizeSecrets,
} from '../dist/nodes/Nvidianim/transport/index.js';
import { executeChat } from '../dist/nodes/Nvidianim/resources/text/chat.handler.js';
import { Nvidianim } from '../dist/nodes/Nvidianim/Nvidianim.node.js';

test('1. Credential: configuration and test request', () => {
	const cred = new NvidianimApi();
	assert.equal(cred.name, 'nvidianimApi');
	assert.equal(cred.displayName, 'Nvidia NIM API');
	assert.ok(cred.icon, 'Icon property must be present');
	assert.equal(typeof cred.icon, 'object');
	assert.equal(cred.icon.light, 'file:nvidia-nim.svg');

	// Properties check
	const apiKeyProp = cred.properties.find((p) => p.name === 'apiKey');
	assert.ok(apiKeyProp, 'apiKey property should exist');
	assert.equal(apiKeyProp.type, 'string');
	assert.equal(apiKeyProp.typeOptions?.password, true);

	// Test request endpoint check: MUST NOT double append /v1
	assert.equal(cred.test?.request.baseURL, 'https://integrate.api.nvidia.com/v1');
	assert.equal(cred.test?.request.url, '/models');
	assert.equal(cred.test?.request.method, 'GET');
});

test('2. Credential: Authorization header expression formatting', () => {
	const cred = new NvidianimApi();
	const authHeaderExpression = cred.authenticate.properties.headers.Authorization;
	assert.ok(authHeaderExpression.startsWith('='), 'Must be an n8n expression starting with =');

	// Simulate the expression evaluation
	const evaluateAuth = (apiKey) => {
		const credentials = { apiKey };
		return 'Bearer ' + (credentials.apiKey ? credentials.apiKey.toString().replace(/^Bearer\s+/i, '').trim() : '');
	};

	assert.equal(evaluateAuth('nvapi-test12345'), 'Bearer nvapi-test12345');
	assert.equal(evaluateAuth('Bearer nvapi-test12345'), 'Bearer nvapi-test12345');
	assert.equal(evaluateAuth('  nvapi-test12345  '), 'Bearer nvapi-test12345');
});

test('3. Transport: buildNvidiaApiUrl safe construction', () => {
	// Standard relative endpoints
	assert.equal(buildNvidiaApiUrl('/chat/completions'), 'https://integrate.api.nvidia.com/v1/chat/completions');
	assert.equal(buildNvidiaApiUrl('chat/completions'), 'https://integrate.api.nvidia.com/v1/chat/completions');
	assert.equal(buildNvidiaApiUrl('/models'), 'https://integrate.api.nvidia.com/v1/models');

	// Prevents duplicate /v1
	assert.equal(buildNvidiaApiUrl('/v1/chat/completions'), 'https://integrate.api.nvidia.com/v1/chat/completions');
	assert.equal(buildNvidiaApiUrl('v1/chat/completions'), 'https://integrate.api.nvidia.com/v1/chat/completions');
	assert.equal(buildNvidiaApiUrl('v1/models'), 'https://integrate.api.nvidia.com/v1/models');

	// Rejects path traversal
	assert.throws(() => buildNvidiaApiUrl('../evil'), /path traversal is not permitted/i);
	assert.throws(() => buildNvidiaApiUrl('..\\evil'), /path traversal is not permitted/i);
	assert.throws(() => buildNvidiaApiUrl('/chat/../../evil'), /path traversal is not permitted/i);

	// Rejects absolute URLs and protocol manipulation
	assert.throws(() => buildNvidiaApiUrl('https://evil.com/chat'), /absolute URLs are not permitted/i);
	assert.throws(() => buildNvidiaApiUrl('//evil.com/chat'), /absolute URLs are not permitted/i);

	// Rejects disallowed host in baseUrl
	assert.throws(
		() => buildNvidiaApiUrl('/chat/completions', 'https://api.openai.com/v1'),
		/Disallowed host "api.openai.com"/i,
	);
});

test('4. Transport: sanitizeSecrets redacts sensitive credentials', () => {
	const rawError = 'Failed to connect with key nvapi-abc1234567890XYZ and header Bearer nvapi-sec9876543210';
	const sanitized = sanitizeSecrets(rawError);

	assert.ok(!sanitized.includes('nvapi-abc1234567890XYZ'));
	assert.ok(!sanitized.includes('nvapi-sec9876543210'));
	assert.ok(sanitized.includes('nvapi-[REDACTED]'));
	assert.ok(sanitized.includes('Bearer [REDACTED]'));

	// Explicit secret masking
	const explicit = sanitizeSecrets('Key is my-secret-token-xyz', ['my-secret-token-xyz']);
	assert.ok(!explicit.includes('my-secret-token-xyz'));
	assert.ok(explicit.includes('[REDACTED]'));
});

test('5. Transport: formatNvidiaApiErrorMessage status code diagnostics', () => {
	const authErr = formatNvidiaApiErrorMessage({
		statusCode: 401,
		response: { data: { error: { message: 'Invalid API key nvapi-1234567890' } } },
	});
	assert.ok(authErr.includes('Authentication failed'), 'Should contain auth hint');
	assert.ok(!authErr.includes('nvapi-1234567890'), 'Should redact raw key');

	const forbiddenErr = formatNvidiaApiErrorMessage({
		statusCode: 403,
		response: { data: { error: { message: 'User not entitled' } } },
	});
	assert.ok(forbiddenErr.includes('Access forbidden'));

	const notFoundErr = formatNvidiaApiErrorMessage({
		statusCode: 404,
		response: { data: { error: { message: 'Model xyz not found' } } },
	});
	assert.ok(notFoundErr.includes('Endpoint or model not found'));

	const rateLimitErr = formatNvidiaApiErrorMessage({
		statusCode: 429,
		response: { data: { error: { message: 'Rate limit exceeded' } } },
	});
	assert.ok(rateLimitErr.includes('Rate limit or quota exceeded'));

	const timeoutErr = formatNvidiaApiErrorMessage({
		code: 'ETIMEDOUT',
		message: 'Connection timed out',
	});
	assert.ok(timeoutErr.includes('timed out'));
});

test('6. Operation: Message a Model input validation', async () => {
	// Missing model should throw
	const mockNode = { name: 'nvidianim' };
	const createMockContext = (params) => ({
		getNode: () => mockNode,
		getNodeParameter: (paramName, index, fallback) => {
			if (paramName in params) return params[paramName];
			return fallback;
		},
		helpers: {
			httpRequestWithAuthentication: async () => ({}),
		},
	});

	// Empty model
	await assert.rejects(
		async () => {
			await executeChat.call(createMockContext({ model: '' }), 0);
		},
		(err) => err.message.includes('Model parameter cannot be empty'),
	);

	// Empty prompt in simple mode
	await assert.rejects(
		async () => {
			await executeChat.call(
				createMockContext({
					model: 'meta/llama-3.3-70b-instruct',
					promptType: 'simple',
					prompt: '   ',
				}),
				0,
			);
		},
		(err) => err.message.includes('Prompt cannot be empty'),
	);

	// Empty messages in messages mode
	await assert.rejects(
		async () => {
			await executeChat.call(
				createMockContext({
					model: 'meta/llama-3.3-70b-instruct',
					promptType: 'messages',
					messages: { messageValues: [] },
				}),
				0,
			);
		},
		(err) => err.message.includes('At least one message is required'),
	);
});

test('7. Operation: Message a Model request construction and response parsing (Simple Prompt)', async () => {
	let capturedRequest = null;
	const mockNode = { name: 'nvidianim' };

	const mockResponse = {
		id: 'chatcmpl-test-123',
		object: 'chat.completion',
		created: 1730000000,
		model: 'meta/llama-3.3-70b-instruct',
		choices: [
			{
				index: 0,
				message: {
					role: 'assistant',
					content: 'Hello! I am Llama running on NVIDIA NIM.',
				},
				finish_reason: 'stop',
			},
		],
		usage: {
			prompt_tokens: 18,
			completion_tokens: 12,
			total_tokens: 30,
		},
	};

	const mockContext = {
		getNode: () => mockNode,
		getNodeParameter: (paramName, index, fallback) => {
			const params = {
				model: { mode: 'list', value: 'meta/llama-3.3-70b-instruct' },
				promptType: 'simple',
				prompt: 'Tell me a joke',
				systemPrompt: 'You are a concise comedian.',
				simplifyOutput: true,
				additionalFields: {
					temperature: 0.5,
					maxTokens: 500,
					topP: 0.9,
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

	const result = await executeChat.call(mockContext, 0);

	// Verify request formatting
	assert.equal(capturedRequest.credType, 'nvidianimApi');
	assert.equal(capturedRequest.reqOpts.method, 'POST');
	assert.equal(capturedRequest.reqOpts.url, 'https://integrate.api.nvidia.com/v1/chat/completions');

	const sentBody = capturedRequest.reqOpts.body;
	assert.equal(sentBody.model, 'meta/llama-3.3-70b-instruct');
	assert.equal(sentBody.temperature, 0.5);
	assert.equal(sentBody.max_tokens, 500);
	assert.equal(sentBody.top_p, 0.9);
	assert.equal(sentBody.stream, false);

	// Messages verification
	assert.equal(sentBody.messages.length, 2);
	assert.deepEqual(sentBody.messages[0], { role: 'system', content: 'You are a concise comedian.' });
	assert.deepEqual(sentBody.messages[1], { role: 'user', content: 'Tell me a joke' });

	// Output parsing verification (simplified mode)
	assert.equal(result.text, 'Hello! I am Llama running on NVIDIA NIM.');
	assert.equal(result.finish_reason, 'stop');
	assert.equal(result.model, 'meta/llama-3.3-70b-instruct');
	assert.equal(result.usage.total_tokens, 30);
	assert.equal(result.id, 'chatcmpl-test-123');
});

test('8. Operation: Message a Model with Chat Messages mode and raw output', async () => {
	let capturedRequest = null;
	const mockNode = { name: 'nvidianim' };

	const mockResponse = {
		id: 'chatcmpl-raw-456',
		object: 'chat.completion',
		model: 'nvidia/nemotron-4-340b-instruct',
		choices: [
			{
				index: 0,
				message: { role: 'assistant', content: 'Understood.' },
				finish_reason: 'stop',
			},
		],
	};

	const mockContext = {
		getNode: () => mockNode,
		getNodeParameter: (paramName, index, fallback) => {
			const params = {
				model: 'nvidia/nemotron-4-340b-instruct',
				promptType: 'messages',
				messages: {
					messageValues: [
						{ role: 'system', content: 'System instruction' },
						{ role: 'user', content: 'First query' },
						{ role: 'assistant', content: 'First reply' },
						{ role: 'user', content: 'Second query' },
					],
				},
				simplifyOutput: false,
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

	const result = await executeChat.call(mockContext, 0);

	assert.equal(capturedRequest.reqOpts.body.messages.length, 4);
	assert.deepEqual(capturedRequest.reqOpts.body.messages[2], { role: 'assistant', content: 'First reply' });

	// Raw output when simplifyOutput is false
	assert.deepEqual(result, mockResponse);
});

test('9. Full Node execute flow with continueOnFail support', async () => {
	const node = new Nvidianim();
	assert.equal(node.description.name, 'nvidianim');
	assert.equal(node.description.displayName, 'Nvidia NIM');

	let failCalled = false;
	const mockExecContext = {
		getNode: () => ({ name: 'nvidianim' }),
		getInputData: () => [{ json: { input: 'item1' } }, { json: { input: 'item2' } }],
		getNodeParameter: (paramName, index) => {
			if (paramName === 'resource') return 'text';
			if (paramName === 'operation') return 'chat';
			if (paramName === 'model') return 'meta/llama-3.1-8b-instruct';
			if (paramName === 'promptType') return 'simple';
			if (paramName === 'prompt') return index === 0 ? 'Success prompt' : 'Fail prompt';
			if (paramName === 'systemPrompt') return '';
			if (paramName === 'simplifyOutput') return true;
			if (paramName === 'additionalFields') return {};
			return '';
		},
		continueOnFail: () => true,
		helpers: {
			httpRequestWithAuthentication: async (credType, reqOpts) => {
				if (reqOpts.body.messages[0].content === 'Fail prompt') {
					failCalled = true;
					const err = new Error('Simulated upstream failure');
					throw err;
				}
				return {
					id: 'chatcmpl-ok',
					model: 'meta/llama-3.1-8b-instruct',
					choices: [{ index: 0, message: { role: 'assistant', content: 'Success response' }, finish_reason: 'stop' }],
				};
			},
		},
	};

	const executionResult = await node.execute.call(mockExecContext);
	assert.equal(executionResult.length, 1);
	const items = executionResult[0];
	assert.equal(items.length, 2);

	// First item succeeded
	assert.equal(items[0].json.text, 'Success response');
	assert.equal(items[0].pairedItem.item, 0);

	// Second item caught via continueOnFail
	assert.ok(failCalled);
	assert.equal(items[1].pairedItem.item, 1);
	assert.ok(items[1].json.error);
});

test('10. Adversarial Security: Path traversal variants and multi-pass encoding', () => {
	// Standard traversal
	assert.throws(() => buildNvidiaApiUrl('../evil'), /path traversal is not permitted/i);
	assert.throws(() => buildNvidiaApiUrl('..\\evil'), /path traversal is not permitted/i);
	assert.throws(() => buildNvidiaApiUrl('foo/../../bar'), /path traversal is not permitted/i);

	// URL encoded traversal (%2e%2e, %2e%2e%2f)
	assert.throws(() => buildNvidiaApiUrl('%2e%2e/models'), /path traversal is not permitted/i);
	assert.throws(() => buildNvidiaApiUrl('%2e%2e%2fmodels'), /path traversal is not permitted/i);
	assert.throws(() => buildNvidiaApiUrl('%2e%2e%5cmodels'), /path traversal is not permitted/i);

	// Mixed-case encoding (%2E%2e, %2e%2E, %2E%2E)
	assert.throws(() => buildNvidiaApiUrl('%2E%2e/chat'), /path traversal is not permitted/i);
	assert.throws(() => buildNvidiaApiUrl('%2e%2E/chat'), /path traversal is not permitted/i);
	assert.throws(() => buildNvidiaApiUrl('%2E%2E/chat'), /path traversal is not permitted/i);

	// Double URL-encoded traversal (%252e%252e, %252f, %255c)
	assert.throws(() => buildNvidiaApiUrl('%252e%252e/admin'), /path traversal is not permitted/i);
	assert.throws(() => buildNvidiaApiUrl('%252e%252e%252fadmin'), /path traversal is not permitted/i);
	assert.throws(() => buildNvidiaApiUrl('models/%252e%252e/%252e%252e/secret'), /path traversal is not permitted/i);
	assert.throws(() => buildNvidiaApiUrl('%252E%252E%252Fadmin'), /path traversal is not permitted/i);

	// Encoded separators and backslashes (%5c, %2f)
	assert.throws(() => buildNvidiaApiUrl('..%5cevil'), /path traversal is not permitted/i);
	assert.throws(() => buildNvidiaApiUrl('..%2fevil'), /path traversal is not permitted/i);
	assert.throws(() => buildNvidiaApiUrl('%2e%2e%255cevil'), /path traversal is not permitted/i);
});

test('11. Adversarial Security: Base-path prefix confusion and external hostname rejection', () => {
	// Base-path prefix confusion attacks
	assert.throws(
		() => buildNvidiaApiUrl('/models', 'https://integrate.api.nvidia.com/v1-fake'),
		/Disallowed base path/i,
	);
	assert.throws(
		() => buildNvidiaApiUrl('/models', 'https://integrate.api.nvidia.com/v10'),
		/Disallowed base path/i,
	);
	assert.throws(
		() => buildNvidiaApiUrl('/models', 'https://integrate.api.nvidia.com/v1_admin'),
		/Disallowed base path/i,
	);
	assert.throws(
		() => buildNvidiaApiUrl('/models', 'https://integrate.api.nvidia.com/v1beta'),
		/Disallowed base path/i,
	);

	// External hostnames and SSRF attempts
	assert.throws(
		() => buildNvidiaApiUrl('/chat', 'https://evil.com/v1'),
		/Disallowed host "evil.com"/i,
	);
	assert.throws(
		() => buildNvidiaApiUrl('/chat', 'https://integrate.api.nvidia.com.evil.com/v1'),
		/Disallowed host "integrate.api.nvidia.com.evil.com"/i,
	);
	assert.throws(
		() => buildNvidiaApiUrl('/chat', 'http://169.254.169.254/v1'),
		/Disallowed host "169.254.169.254"/i,
	);
	assert.throws(
		() => buildNvidiaApiUrl('https://evil.com/v1/chat'),
		/absolute URLs are not permitted/i,
	);
	assert.throws(
		() => buildNvidiaApiUrl('//attacker.com/v1/chat'),
		/absolute URLs are not permitted/i,
	);
});

test('12. Adversarial Security: Redirect protection and requestOptions configuration', async () => {
	const mockNode = { name: 'nvidianim' };
	let capturedOptions = null;

	const mockContext = {
		getNode: () => mockNode,
		getNodeParameter: (paramName) => {
			if (paramName === 'model') return 'meta/llama-3.1-8b-instruct';
			if (paramName === 'promptType') return 'simple';
			if (paramName === 'prompt') return 'test';
			if (paramName === 'simplifyOutput') return true;
			return '';
		},
		helpers: {
			httpRequestWithAuthentication: async (credType, reqOpts) => {
				capturedOptions = reqOpts;
				return { choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] };
			},
		},
	};

	await executeChat.call(mockContext, 0);

	// disableFollowRedirect must be strictly enabled
	assert.equal(capturedOptions.disableFollowRedirect, true, 'Must disable redirect following to protect credentials');
	assert.ok(capturedOptions.url.startsWith('https://integrate.api.nvidia.com/v1/'), 'Must target official host');
});