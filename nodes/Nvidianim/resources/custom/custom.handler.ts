import type { IDataObject, IExecuteFunctions, IHttpRequestMethods, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { DEFAULT_TIMEOUT_MS, nvidiaApiRequest } from '../../transport/index.js';

export const FORBIDDEN_CUSTOM_HEADERS = new Set([
	'authorization',
	'host',
	'cookie',
	'set-cookie',
	'proxy-authorization',
	'proxy-authenticate',
	'proxy-connection',
	'connection',
	'upgrade',
	'keep-alive',
	'transfer-encoding',
	'te',
	'trailer',
	'forwarded',
	'x-forwarded-for',
	'x-forwarded-host',
	'x-forwarded-proto',
]);

export async function executeCustomApiCall(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<INodeExecutionData> {
	const method = this.getNodeParameter('method', itemIndex, 'GET') as IHttpRequestMethods;
	const endpoint = this.getNodeParameter('endpoint', itemIndex, '') as string;
	const options = (this.getNodeParameter('options', itemIndex, {}) as IDataObject) || {};

	if (!endpoint || typeof endpoint !== 'string' || endpoint.trim().length === 0) {
		throw new NodeOperationError(this.getNode(), 'Endpoint must not be empty', { itemIndex });
	}

	let bodyPayload: IDataObject | undefined;
	if (['POST', 'PUT', 'PATCH'].includes(method)) {
		const rawBody = this.getNodeParameter('body', itemIndex, '{}');
		if (typeof rawBody === 'string') {
			try {
				bodyPayload = JSON.parse(rawBody) as IDataObject;
			} catch (e) {
				throw new NodeOperationError(
					this.getNode(),
					`Invalid JSON in request body: ${(e as Error).message}`,
					{ itemIndex },
				);
			}
		} else if (typeof rawBody === 'object' && rawBody !== null) {
			bodyPayload = rawBody as IDataObject;
		}
	}

	let qs: IDataObject | undefined;
	if (options.queryParameters && typeof options.queryParameters === 'object') {
		const params = (options.queryParameters as { parameter?: Array<{ name: string; value: string }> }).parameter;
		if (Array.isArray(params) && params.length > 0) {
			qs = {};
			for (const p of params) {
				if (p.name && p.name.trim()) {
					qs[p.name.trim()] = p.value ?? '';
				}
			}
		}
	}

	let customHeaders: Record<string, string> | undefined;
	if (options.headers && typeof options.headers === 'object') {
		const headersList = (options.headers as { header?: Array<{ name: string; value: string }> }).header;
		if (Array.isArray(headersList) && headersList.length > 0) {
			customHeaders = {};
			for (const h of headersList) {
				if (h.name && h.name.trim()) {
					const headerName = h.name.trim();
					const lowerName = headerName.toLowerCase();
					// Protect against sensitive header tampering, hop-by-hop headers, and host override
					if (FORBIDDEN_CUSTOM_HEADERS.has(lowerName)) {
						continue;
					}
					customHeaders[headerName] = h.value ?? '';
				}
			}
		}
	}

	const timeout = typeof options.timeout === 'number' ? options.timeout : DEFAULT_TIMEOUT_MS;

	const response = await nvidiaApiRequest.call(
		this,
		method,
		endpoint,
		bodyPayload,
		qs,
		{ timeout, headers: customHeaders },
	);

	const returnData: IDataObject =
		typeof response === 'object' && response !== null
			? (response as IDataObject)
			: { data: response };

	return {
		json: returnData,
		pairedItem: { item: itemIndex },
	};
}