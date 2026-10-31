import test from 'node:test';
import assert from 'node:assert/strict';
import { executeCustomApiCall } from '../dist/nodes/Nvidianim/resources/custom/custom.handler.js';
import { Nvidianim } from '../dist/nodes/Nvidianim/Nvidianim.node.js';

test('Custom API Call: Input validation', async () => {
	// Missing endpoint
	await assert.rejects(
		async () => {
			const mockContext = {
				getNode: () => ({ name: 'Nvidia NIM' }),
				getNodeParameter: (name) => {
					if (name === 'method') return 'GET';
					if (name === 'endpoint') return '';
					return {};
				},
			};
			await executeCustomApiCall.call(mockContext, 0);
		},
		(err) => err.message.includes('Endpoint must not be empty'),
	);

	// Invalid JSON body
	await assert.rejects(
		async () => {
			const mockContext = {
				getNode: () => ({ name: 'Nvidia NIM' }),
				getNodeParameter: (name) => {
					if (name === 'method') return 'POST';
					if (name === 'endpoint') return '/chat/completions';
					if (name === 'body') return '{ invalid_json: ';
					return {};
				},
			};
			await executeCustomApiCall.call(mockContext, 0);
		},
		(err) => err.message.includes('Invalid JSON in request body'),
	);
});

test('Custom API Call: GET request with query parameters', async () => {
	let capturedMethod = '';
	let capturedUrl = '';
	let capturedQs = null;

	const mockContext = {
		getNode: () => ({ name: 'Nvidia NIM' }),
		getNodeParameter: (name) => {
			if (name === 'method') return 'GET';
			if (name === 'endpoint') return '/models';
			if (name === 'options') {
				return {
					queryParameters: {
						parameter: [
							{ name: 'limit', value: '10' },
							{ name: 'order', value: 'asc' },
						],
					},
				};
			}
			return undefined;
		},
		helpers: {
			httpRequestWithAuthentication: async (credType, requestOptions) => {
				assert.equal(credType, 'nvidianimApi');
				capturedMethod = requestOptions.method;
				capturedUrl = requestOptions.url;
				capturedQs = requestOptions.qs;
				return {
					data: [{ id: 'meta/llama-3.1-70b-instruct' }],
				};
			},
		},
	};

	const result = await executeCustomApiCall.call(mockContext, 0);
	assert.equal(capturedMethod, 'GET');
	assert.ok(capturedUrl.includes('/v1/models'));
	assert.deepEqual(capturedQs, { limit: '10', order: 'asc' });
	assert.equal(result.pairedItem?.item, 0);
	assert.ok(Array.isArray(result.json.data));
});

test('Custom API Call: POST request with JSON body and custom headers', async () => {
	let capturedBody = null;
	let capturedHeaders = null;

	const mockContext = {
		getNode: () => ({ name: 'Nvidia NIM' }),
		getNodeParameter: (name) => {
			if (name === 'method') return 'POST';
			if (name === 'endpoint') return '/chat/completions';
			if (name === 'body') return JSON.stringify({ model: 'meta/llama-3.1-70b-instruct', messages: [{ role: 'user', content: 'Hi' }] });
			if (name === 'options') {
				return {
					headers: {
						header: [{ name: 'X-Custom-Tracking', value: 'req-12345' }],
					},
					timeout: 45000,
				};
			}
			return undefined;
		},
		helpers: {
			httpRequestWithAuthentication: async (credType, requestOptions) => {
				capturedBody = requestOptions.body;
				capturedHeaders = requestOptions.headers;
				assert.equal(requestOptions.timeout, 45000);
				return {
					id: 'chat-resp-custom-1',
					choices: [{ message: { content: 'Custom response' } }],
				};
			},
		},
	};

	const result = await executeCustomApiCall.call(mockContext, 0);
	assert.equal(capturedBody?.model, 'meta/llama-3.1-70b-instruct');
	assert.equal(capturedHeaders?.['X-Custom-Tracking'], 'req-12345');
	assert.equal(result.json.id, 'chat-resp-custom-1');
});

test('Custom API Call: Security boundary strips sensitive headers (Authorization, Host, Cookie)', async () => {
	let capturedHeaders = null;

	const mockContext = {
		getNode: () => ({ name: 'Nvidia NIM' }),
		getNodeParameter: (name) => {
			if (name === 'method') return 'GET';
			if (name === 'endpoint') return '/models';
			if (name === 'options') {
				return {
					headers: {
						header: [
							{ name: 'Authorization', value: 'Bearer malicious-override' },
							{ name: 'Host', value: 'malicious-host.com' },
							{ name: 'Cookie', value: 'session=hijack' },
							{ name: 'X-Safe-Header', value: 'safe-value' },
						],
					},
				};
			}
			return undefined;
		},
		helpers: {
			httpRequestWithAuthentication: async (credType, requestOptions) => {
				capturedHeaders = requestOptions.headers;
				return { data: [] };
			},
		},
	};

	await executeCustomApiCall.call(mockContext, 0);
	assert.equal(capturedHeaders?.['X-Safe-Header'], 'safe-value');
	assert.equal(capturedHeaders?.['Authorization'], undefined);
	assert.equal(capturedHeaders?.['Host'], undefined);
	assert.equal(capturedHeaders?.['Cookie'], undefined);
});

test('Custom API Call: Full Node execute loop dispatch', async () => {
	const node = new Nvidianim();

	const mockContext = {
		getNode: () => ({ name: 'Nvidia NIM' }),
		getInputData: () => [{ json: {} }],
		continueOnFail: () => false,
		getNodeParameter: (name) => {
			if (name === 'resource') return 'custom';
			if (name === 'operation') return 'customApiCall';
			if (name === 'method') return 'GET';
			if (name === 'endpoint') return '/models';
			if (name === 'options') return {};
			return undefined;
		},
		helpers: {
			httpRequestWithAuthentication: async () => ({
				status: 'ok',
				data: [],
			}),
		},
	};

	const executionResult = await node.execute.call(mockContext);
	assert.ok(Array.isArray(executionResult));
	assert.equal(executionResult[0].length, 1);
	assert.equal(executionResult[0][0].json.status, 'ok');
	assert.equal(executionResult[0][0].pairedItem?.item, 0);
});

test('Custom API Call: Adversarial security prevents credential leakage to external hostnames', async () => {
	const mockContext = (endpoint) => ({
		getNode: () => ({ name: 'Nvidia NIM' }),
		getNodeParameter: (name) => {
			if (name === 'method') return 'GET';
			if (name === 'endpoint') return endpoint;
			return {};
		},
		helpers: {
			httpRequestWithAuthentication: async () => ({}),
		},
	});

	// Absolute external URLs
	await assert.rejects(
		async () => executeCustomApiCall.call(mockContext('https://evil.com/steal-creds'), 0),
		/absolute URLs are not permitted/i,
	);
	await assert.rejects(
		async () => executeCustomApiCall.call(mockContext('http://169.254.169.254/metadata'), 0),
		/absolute URLs are not permitted/i,
	);

	// Protocol-relative URLs
	await assert.rejects(
		async () => executeCustomApiCall.call(mockContext('//attacker.com/leak'), 0),
		/absolute URLs are not permitted/i,
	);

	// Path traversal attempts
	await assert.rejects(
		async () => executeCustomApiCall.call(mockContext('../../unauthorized'), 0),
		/path traversal is not permitted/i,
	);
	await assert.rejects(
		async () => executeCustomApiCall.call(mockContext('%252e%252e%252fadmin'), 0),
		/path traversal is not permitted/i,
	);
});

test('Custom API Call: Strips all sensitive, proxy and hop-by-hop headers', async () => {
	let capturedHeaders = null;

	const headersToTest = [
		{ name: 'Authorization', value: 'Bearer stolen' },
		{ name: 'authorization', value: 'Bearer lower' },
		{ name: 'Host', value: 'fake.target' },
		{ name: 'Cookie', value: 'auth=123' },
		{ name: 'Set-Cookie', value: 'id=bad' },
		{ name: 'Proxy-Authorization', value: 'Basic admin:pass' },
		{ name: 'proxy-authenticate', value: 'challenge' },
		{ name: 'Proxy-Connection', value: 'keep-alive' },
		{ name: 'Connection', value: 'close' },
		{ name: 'Upgrade', value: 'websocket' },
		{ name: 'Keep-Alive', value: 'timeout=5' },
		{ name: 'Transfer-Encoding', value: 'chunked' },
		{ name: 'TE', value: 'trailers' },
		{ name: 'Trailer', value: 'X-Checksum' },
		{ name: 'Forwarded', value: 'for=1.2.3.4' },
		{ name: 'X-Forwarded-For', value: '1.2.3.4' },
		{ name: 'X-Forwarded-Host', value: 'target.internal' },
		{ name: 'X-Forwarded-Proto', value: 'http' },
		{ name: 'X-Allowed-Header', value: 'valid-header-value' },
	];

	const mockContext = {
		getNode: () => ({ name: 'Nvidia NIM' }),
		getNodeParameter: (name) => {
			if (name === 'method') return 'GET';
			if (name === 'endpoint') return '/models';
			if (name === 'options') {
				return {
					headers: {
						header: headersToTest,
					},
				};
			}
			return undefined;
		},
		helpers: {
			httpRequestWithAuthentication: async (credType, requestOptions) => {
				capturedHeaders = requestOptions.headers;
				return { data: [] };
			},
		},
	};

	await executeCustomApiCall.call(mockContext, 0);

	// Allowed header preserved
	assert.equal(capturedHeaders['X-Allowed-Header'], 'valid-header-value');

	// All sensitive, proxy and hop-by-hop headers must be excluded
	for (const h of headersToTest) {
		if (h.name !== 'X-Allowed-Header') {
			assert.equal(
				capturedHeaders[h.name],
				undefined,
				`Header "${h.name}" should have been stripped`,
			);
		}
	}
});