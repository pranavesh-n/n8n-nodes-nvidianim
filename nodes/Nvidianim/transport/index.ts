import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

export const NVIDIA_API_BASE_URL = 'https://integrate.api.nvidia.com/v1';
export const NVIDIA_API_HOST = 'integrate.api.nvidia.com';
export const DEFAULT_TIMEOUT_MS = 60000;

export interface IApiErrorPayload {
	statusCode?: number;
	code?: string;
	message?: string;
	response?: {
		status?: number;
		data?: {
			error?: {
				message?: string;
				type?: string;
				code?: string | number;
			};
			detail?: string | Record<string, unknown>;
			message?: string;
		};
	};
}

/**
 * Sanitizes sensitive values (like API keys or Bearer tokens) from strings and errors.
 */
export function sanitizeSecrets(text: string, additionalSecrets: string[] = []): string {
	if (!text || typeof text !== 'string') {
		return text;
	}

	let sanitized = text;

	// Redact standard Bearer authorization tokens first
	sanitized = sanitized.replace(/Bearer\s+[^\s]+/gi, 'Bearer [REDACTED]');

	// Redact standard NVIDIA API key format (starts with nvapi-)
	sanitized = sanitized.replace(/nvapi-[A-Za-z0-9_-]{6,}/gi, 'nvapi-[REDACTED]');

	// Redact any explicitly supplied secrets
	for (const secret of additionalSecrets) {
		if (secret && typeof secret === 'string' && secret.trim().length > 3) {
			const escaped = secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			sanitized = sanitized.replace(new RegExp(escaped, 'g'), '[REDACTED]');
		}
	}

	return sanitized;
}

/**
 * Validates whether a string can be parsed as a valid URL.
 */
function isValidUrlString(url: string): boolean {
	try {
		new URL(url);
		return true;
	} catch {
		return false;
	}
}

/**
 * Constructs a fully qualified NVIDIA API URL safely.
 * Enforces host restriction and prevents path traversal and duplicate /v1 prefixes.
 */
export function buildNvidiaApiUrl(endpoint: string, baseUrl: string = NVIDIA_API_BASE_URL): string {
	if (!endpoint || typeof endpoint !== 'string') {
		throw new Error('API endpoint must be a non-empty string');
	}

	const trimmedEndpoint = endpoint.trim();

	// Guard against path traversal attempts, including multi-encoded variations (%252e%252e, %2E%2E, %5c, %2f)
	let decodedEndpoint = trimmedEndpoint;
	for (let i = 0; i < 3; i++) {
		try {
			const next = decodeURIComponent(decodedEndpoint);
			if (next === decodedEndpoint) break;
			decodedEndpoint = next;
		} catch {
			break;
		}
	}

	if (
		trimmedEndpoint.includes('..') ||
		trimmedEndpoint.includes('\\') ||
		decodedEndpoint.includes('..') ||
		decodedEndpoint.includes('\\')
	) {
		throw new Error(`Invalid path: path traversal is not permitted: "${trimmedEndpoint}"`);
	}

	// Guard against protocol-relative or absolute URL attempts
	if (trimmedEndpoint.startsWith('//') || /^https?:\/\//i.test(trimmedEndpoint)) {
		throw new Error(`Invalid endpoint: absolute URLs are not permitted: "${trimmedEndpoint}"`);
	}

	if (!isValidUrlString(baseUrl)) {
		throw new Error(`Invalid base URL: "${baseUrl}"`);
	}

	const parsedBase = new URL(baseUrl);

	if (parsedBase.hostname !== NVIDIA_API_HOST) {
		throw new Error(`Disallowed host "${parsedBase.hostname}". NVIDIA NIM requests must target "${NVIDIA_API_HOST}"`);
	}

	// Normalize basePath: strip trailing slashes
	const basePath = parsedBase.pathname.replace(/\/+$/, '');

	// Enforce base-path prefix integrity (must be /v1 or start with /v1/)
	if (basePath !== '/v1' && !basePath.startsWith('/v1/')) {
		throw new Error(`Disallowed base path "${basePath}". NVIDIA NIM requests must target base path "/v1"`);
	}

	// Normalize endpoint: strip leading slashes and any duplicate /v1 prefix
	let cleanEndpoint = trimmedEndpoint.replace(/^\/+/, '');
	if (cleanEndpoint === 'v1' || cleanEndpoint.startsWith('v1/')) {
		cleanEndpoint = cleanEndpoint.slice(2).replace(/^\/+/, '');
	}

	const finalPath = cleanEndpoint.length > 0 ? `${basePath}/${cleanEndpoint}` : basePath;
	const finalUrl = new URL(finalPath, parsedBase.origin);

	// Enforce that the resolved URL path stays strictly within the allowed base path
	if (finalUrl.pathname !== basePath && !finalUrl.pathname.startsWith(basePath + '/')) {
		throw new Error(`Resolved URL path "${finalUrl.pathname}" escapes allowed base path "${basePath}"`);
	}

	// Final verification of hostname
	if (finalUrl.hostname !== NVIDIA_API_HOST) {
		throw new Error(`Resolved URL target "${finalUrl.hostname}" does not match allowed host "${NVIDIA_API_HOST}"`);
	}

	return finalUrl.toString();
}

/**
 * Formats API errors with user-friendly diagnostics while ensuring secrets are not leaked.
 */
export function formatNvidiaApiErrorMessage(error: unknown): string {
	const err = (error ?? {}) as IApiErrorPayload;
	const status = err.statusCode ?? err.response?.status;
	const responseData = err.response?.data;

	let rawMessage = '';
	if (responseData?.error?.message) {
		rawMessage = responseData.error.message;
	} else if (responseData?.detail) {
		rawMessage = typeof responseData.detail === 'string' ? responseData.detail : JSON.stringify(responseData.detail);
	} else if (responseData?.message) {
		rawMessage = responseData.message;
	} else if (err.message) {
		rawMessage = err.message;
	} else {
		rawMessage = 'Unknown error occurred while contacting NVIDIA NIM API';
	}

	let contextualHint = '';
	if (status === 401) {
		contextualHint = 'Authentication failed. Please verify that your NVIDIA API key is valid and has not expired.';
	} else if (status === 403) {
		contextualHint = 'Access forbidden. Your NVIDIA account may lack permission or credits to access this hosted model.';
	} else if (status === 404) {
		contextualHint = 'Endpoint or model not found. Verify the selected model ID and endpoint path.';
	} else if (status === 429) {
		contextualHint = 'Rate limit or quota exceeded. Please reduce request frequency or check your NVIDIA developer quota.';
	} else if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
		contextualHint = 'The request timed out. NVIDIA NIM model inference may take longer for large prompts or models.';
	}

	const combined = contextualHint ? `${contextualHint} Details: ${rawMessage}` : rawMessage;
	return sanitizeSecrets(combined);
}

/**
 * Executes an HTTP request to the NVIDIA NIM API using n8n credentials and helpers.
 */
export async function nvidiaApiRequest(
	this: IExecuteFunctions | ILoadOptionsFunctions | IHookFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	body?: IDataObject | string,
	qs?: IDataObject,
	options: { timeout?: number; headers?: Record<string, string> } = {},
): Promise<JsonObject> {
	let url: string;
	try {
		url = buildNvidiaApiUrl(endpoint);
	} catch (error) {
		throw new NodeOperationError(this.getNode(), error as Error);
	}

	const requestOptions: IHttpRequestOptions = {
		method,
		url,
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			...(options.headers ?? {}),
		},
		timeout: options.timeout ?? DEFAULT_TIMEOUT_MS,
		disableFollowRedirect: true,
	};

	if (body !== undefined) {
		requestOptions.body = body;
	}

	if (qs && Object.keys(qs).length > 0) {
		requestOptions.qs = qs;
	}

	try {
		const response = await this.helpers.httpRequestWithAuthentication.call(this, 'nvidianimApi', requestOptions);
		return response as JsonObject;
	} catch (error) {
		const formattedMessage = formatNvidiaApiErrorMessage(error);
		throw new NodeApiError(this.getNode(), error as JsonObject, {
			message: formattedMessage,
			httpCode: (error as IApiErrorPayload).statusCode?.toString() ?? (error as IApiErrorPayload).response?.status?.toString(),
		});
	}
}