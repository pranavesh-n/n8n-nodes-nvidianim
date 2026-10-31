import { supplyModel } from '@n8n/ai-node-sdk';
import type {
	IDataObject,
	ILoadOptionsFunctions,
	INodeListSearchResult,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	ISupplyDataFunctions,
	SupplyData,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { DEFAULT_TIMEOUT_MS, NVIDIA_API_BASE_URL, nvidiaApiRequest } from '../Nvidianim/transport/index.js';

const FALLBACK_MODELS: INodePropertyOptions[] = [
	{ name: 'NVIDIA: Nemotron 4 340B Instruct', value: 'nvidia/nemotron-4-340b-instruct' },
	{ name: 'NVIDIA: Nemotron 3.5 Bolt', value: 'nvidia/nemotron-3.5-bolt-e4b' },
	{ name: 'NVIDIA: Nemotron 3 Nano Omni Reasoning', value: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning' },
	{ name: 'NVIDIA: Nemotron 3 Super 120B', value: 'nvidia/nemotron-3-super-120b-a12b' },
	{ name: 'NVIDIA: Nemotron 3 Ultra 550B', value: 'nvidia/nemotron-3-ultra-550b-a55b' },
	{ name: 'Mistral: Mistral Large 2 Instruct', value: 'mistralai/mistral-large-2-instruct' },
	{ name: 'Mistral: Mistral 7B Instruct v0.3', value: 'mistralai/mistral-7b-instruct-v0.3' },
	{ name: 'Mistral / NVIDIA: Mistral NeMo 12B Instruct', value: 'nv-mistralai/mistral-nemo-12b-instruct' },
	{ name: 'Meta: Llama 3.2 11B Vision Instruct', value: 'meta/llama-3.2-11b-vision-instruct' },
	{ name: 'Meta: Llama 3.2 90B Vision Instruct', value: 'meta/llama-3.2-90b-vision-instruct' },
	{ name: 'DeepSeek: DeepSeek v4.1 Flash', value: 'deepseek-ai/deepseek-v4.1-flash' },
	{ name: 'Google: Gemma 3 12B Instruct', value: 'google/gemma-3-12b-it' },
	{ name: 'Google: Gemma 3 4B Instruct', value: 'google/gemma-3-4b-it' },
	{ name: 'Meta: Llama 3.1 70B Instruct', value: 'meta/llama-3.1-70b-instruct' },
	{ name: 'IBM: Granite 3.0 8B Instruct', value: 'ibm/granite-3.0-8b-instruct' },
];

function isChatCompatible(modelId: string): boolean {
	const lower = modelId.toLowerCase();
	// Exclude non-chat endpoint models (embeddings, rerankers, image/diffusion models)
	if (
		lower.includes('embed') ||
		lower.includes('rerank') ||
		lower.includes('clip') ||
		lower.includes('sdxl') ||
		lower.includes('flux') ||
		lower.includes('audio') ||
		lower.includes('starcoder') ||
		lower.includes('reward') ||
		lower.includes('guard')
	) {
		return false;
	}

	return (
		lower.includes('instruct') ||
		lower.includes('chat') ||
		lower.includes('nemotron') ||
		lower.includes('-it') ||
		lower.includes('deepseek')
	);
}

export class NvidiaNimChatModel implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Nvidia NIM Chat Model',
		name: 'nvidiaNimChatModel',
		icon: { light: 'file:nvidia-nim.svg', dark: 'file:nvidia-nim.dark.svg' },
		group: ['transform'],
		version: 1,
		description: 'Language model sub-node for NVIDIA NIM AI agents and chains',
		defaults: {
			name: 'Nvidia NIM Chat Model',
		},
		codex: {
			categories: ['Development', 'Utility'],
			subcategories: {
				AI: ['Language Models'],
			},
			resources: {
				primaryDocumentation: [
					{
						url: 'https://build.nvidia.com/explore/discover',
					},
				],
			},
		},
		inputs: [],
		outputs: [NodeConnectionTypes.AiLanguageModel],
		outputNames: ['Model'],
		credentials: [
			{
				name: 'nvidianimApi',
				required: true,
			},
		],
		subtitle:
			'={{$parameter["options"]?.["customModel"] || (typeof $parameter["model"] === "object" ? $parameter["model"]?.["value"] : $parameter["model"]) || ""}}',
		properties: [
			{
				displayName: 'Model',
				name: 'model',
				type: 'resourceLocator',
				default: { mode: 'list', value: 'nvidia/nemotron-4-340b-instruct' },
				required: true,
				modes: [
					{
						displayName: 'From List',
						name: 'list',
						type: 'list',
						placeholder: 'Select a model...',
						typeOptions: {
							searchListMethod: 'searchModels',
							searchable: true,
						},
					},
					{
						displayName: 'By ID / Name',
						name: 'id',
						type: 'string',
						placeholder: 'e.g. meta/llama-3.1-70b-instruct, deepseek-ai/deepseek-r1',
					},
				],
				description: 'Choose from the list of hosted NVIDIA models, or specify any model ID directly',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Base URL Override',
						name: 'baseUrl',
						type: 'string',
						default: '',
						placeholder: 'e.g. https://integrate.api.nvidia.com/v1 or http://localhost:8000/v1',
						description: 'Override the base URL to connect to any custom, enterprise, or self-hosted NIM instance',
					},
					{
						displayName: 'Custom Model ID',
						name: 'customModel',
						type: 'string',
						default: '',
						description: 'Override model selection with a custom or newly hosted NVIDIA NIM model ID',
					},
					{
						displayName: 'Frequency Penalty',
						name: 'frequencyPenalty',
						type: 'number',
						typeOptions: {
							minValue: -2,
							maxValue: 2,
							numberPrecision: 1,
						},
						default: 0,
						description:
							'Number between -2.0 and 2.0. Positive values penalize new tokens based on their existing frequency in the text so far.',
					},
					{
						displayName: 'Max Retries',
						name: 'maxRetries',
						type: 'number',
						default: 2,
						description: 'Maximum number of retries upon network or rate-limit failure',
					},
					{
						displayName: 'Maximum Number of Tokens',
						name: 'maxTokens',
						type: 'number',
						typeOptions: {
							minValue: 1,
						},
						default: 2048,
						description: 'The maximum number of tokens to generate. Leave empty for the model default limit.',
					},
					{
						displayName: 'Presence Penalty',
						name: 'presencePenalty',
						type: 'number',
						typeOptions: {
							minValue: -2,
							maxValue: 2,
							numberPrecision: 1,
						},
						default: 0,
						description:
							'Number between -2.0 and 2.0. Positive values penalize new tokens based on whether they appear in the text so far.',
					},
					{
						displayName: 'Reasoning Budget',
						name: 'reasoningBudget',
						type: 'number',
						typeOptions: {
							minValue: 0,
						},
						default: 128,
						description:
							'Allocated token budget for internal reasoning steps (supported on reasoning models like nemotron-3-nano-omni-30b-a3b-reasoning and DeepSeek R1)',
					},
					{
						displayName: 'Streaming',
						name: 'streaming',
						type: 'boolean',
						default: true,
						description: 'Whether to stream tokens back as they are generated',
					},
					{
						displayName: 'Temperature',
						name: 'temperature',
						type: 'number',
						typeOptions: {
							minValue: 0,
							maxValue: 2,
							numberPrecision: 2,
						},
						default: 0.7,
						description: 'Controls randomness. Lower values make responses more deterministic and focused.',
					},
					{
						displayName: 'Timeout (Ms)',
						name: 'timeout',
						type: 'number',
						default: DEFAULT_TIMEOUT_MS,
						description: 'Maximum time in milliseconds to wait for the complete model response',
					},
					{
						displayName: 'Top P',
						name: 'topP',
						type: 'number',
						typeOptions: {
							minValue: 0,
							maxValue: 1,
							numberPrecision: 2,
						},
						default: 1,
						description:
							'Controls nucleus sampling diversity. 0.1 means only tokens comprising top 10% probability mass are considered.',
					},
				],
			},
		],
	};

	methods = {
		listSearch: {
			async searchModels(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
				const query = filter ? filter.trim().toLowerCase() : '';
				let allModels: INodePropertyOptions[] = [];

				try {
					const response = await nvidiaApiRequest.call(this, 'GET', '/models');
					const data = (response as { data?: Array<{ id: string }> })?.data;
					if (Array.isArray(data) && data.length > 0) {
						allModels = data
							.filter((item) => typeof item.id === 'string' && item.id.trim().length > 0 && isChatCompatible(item.id))
							.map((item) => ({
								name: item.id,
								value: item.id,
							}))
							.sort((a, b) => a.name.localeCompare(b.name));
					}
				} catch {
					// Fall back to curated list when credentials are not yet configured or API is unreachable
				}

				if (allModels.length === 0) {
					allModels = FALLBACK_MODELS;
				}

				const results = query
					? allModels.filter(
							(m) => m.name.toLowerCase().includes(query) || m.value.toString().toLowerCase().includes(query),
						)
					: allModels;

				return { results };
			},
		},
		loadOptions: {
			async getModels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				try {
					const response = await nvidiaApiRequest.call(this, 'GET', '/models');
					const data = (response as { data?: Array<{ id: string }> })?.data;
					if (Array.isArray(data) && data.length > 0) {
						return data
							.filter((item) => typeof item.id === 'string' && item.id.trim().length > 0 && isChatCompatible(item.id))
							.map((item) => ({
								name: item.id,
								value: item.id,
							}))
							.sort((a, b) => a.name.localeCompare(b.name));
					}
				} catch {
					// Fall back to curated list when credentials are not yet configured or API is unreachable
				}
				return FALLBACK_MODELS;
			},
		},
	};

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		const credentials = await this.getCredentials<{ apiKey?: string; baseUrl?: string; url?: string }>('nvidianimApi');
		const options = (this.getNodeParameter('options', itemIndex, {}) as IDataObject) || {};

		if (!credentials?.apiKey && !credentials?.baseUrl && !options.baseUrl) {
			throw new NodeOperationError(this.getNode(), 'No NVIDIA NIM API credentials found');
		}

		const rawModel = this.getNodeParameter('model', itemIndex, '') as
			| string
			| { mode?: string; value?: string };
		let model = typeof rawModel === 'string' ? rawModel : (rawModel?.value ?? '');

		if (typeof options.customModel === 'string' && options.customModel.trim()) {
			model = options.customModel.trim();
		}

		if (!model) {
			throw new NodeOperationError(this.getNode(), 'Model parameter must not be empty');
		}

		const rawBaseUrl = (typeof options.baseUrl === 'string' && options.baseUrl.trim())
			? options.baseUrl.trim()
			: credentials.baseUrl || credentials.url || NVIDIA_API_BASE_URL;
		const baseUrl = rawBaseUrl.replace(/\/+$/, '');

		const temperature = typeof options.temperature === 'number' ? options.temperature : undefined;
		const maxTokens = typeof options.maxTokens === 'number' ? options.maxTokens : undefined;
		const topP = typeof options.topP === 'number' ? options.topP : undefined;
		const frequencyPenalty = typeof options.frequencyPenalty === 'number' ? options.frequencyPenalty : undefined;
		const presencePenalty = typeof options.presencePenalty === 'number' ? options.presencePenalty : undefined;
		const streaming = typeof options.streaming === 'boolean' ? options.streaming : true;
		const timeout = typeof options.timeout === 'number' ? options.timeout : DEFAULT_TIMEOUT_MS;
		const maxRetries = typeof options.maxRetries === 'number' ? options.maxRetries : 2;
		const additionalParams: Record<string, unknown> = {};
		if (typeof options.reasoningBudget === 'number') {
			additionalParams.reasoning_budget = options.reasoningBudget;
		}

		const passthroughFilter = {
			validateUrl: async () => ({ ok: true as const, value: undefined }),
			validateConnectionHost: () => ({ ok: true as const, value: undefined }),
			createSecureLookup: () => undefined,
			validateRedirectSync: () => {},
		};

		const safeContext = new Proxy(this, {
			get(target, prop, receiver) {
				if (prop === 'helpers') {
					return {
						...target.helpers,
						getSecureEgressFilter: () => {
							const filter = target.helpers?.getSecureEgressFilter?.();
							return filter ?? passthroughFilter;
						},
					};
				}
				const val = Reflect.get(target, prop, receiver);
				if (typeof val === 'function') {
					return val.bind(target);
				}
				return val;
			},
		});

		const onFailedAttempt = (error: unknown) => {
			const err = error as { status?: number; statusCode?: number; error?: { detail?: string }; message?: string };
			if (err?.status === 404 || err?.statusCode === 404) {
				const detail = err?.error?.detail || err?.message || '';
				throw new NodeOperationError(
					this.getNode(),
					`NVIDIA NIM API Error (404 Not Found): Model "${model}" is not supported on the chat endpoint (it is either deprecated or a raw text model). Please select a different model.${detail ? ` [Detail: ${detail}]` : ''}`,
				);
			}
			if (err?.status === 410 || err?.statusCode === 410) {
				const detail = err?.error?.detail || err?.message || 'Model has reached end of life';
				throw new NodeOperationError(
					this.getNode(),
					`NVIDIA NIM API Error (410 End of Life): ${detail}`,
				);
			}
		};

		const supplyResult = await supplyModel(safeContext, {
			type: 'openai',
			baseUrl,
			apiKey: credentials.apiKey || 'unused',
			model,
			temperature,
			maxTokens,
			topP,
			frequencyPenalty,
			presencePenalty,
			streaming,
			timeout,
			maxRetries,
			additionalParams: Object.keys(additionalParams).length > 0 ? additionalParams : undefined,
			onFailedAttempt,
		});

		const modelResponse = supplyResult.response as unknown as {
			completions?: {
				clientConfig?: {
					fetch?: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>;
				};
			};
		};
		const completions = modelResponse?.completions;
		if (completions?.clientConfig) {
			const originalFetch = completions.clientConfig.fetch ?? fetch;
			completions.clientConfig.fetch = async (
				input: Parameters<typeof fetch>[0],
				init?: Parameters<typeof fetch>[1],
			) => {
				const response = await originalFetch(input, init);
				if (!response.ok) {
					try {
						const clone = response.clone();
						const rawText = await clone.text();
						let parsed: { detail?: string; title?: string; error?: { message?: string } } | undefined;
						try {
							parsed = JSON.parse(rawText) as { detail?: string; title?: string; error?: { message?: string } };
						} catch {
							parsed = undefined;
						}

						if (parsed && (parsed.detail || parsed.title) && !parsed.error?.message) {
							const message = parsed.detail || parsed.title || response.statusText;
							const customBody = JSON.stringify({
								error: {
									message: `[NVIDIA NIM ${response.status}] ${message}. Check model availability or account entitlements on build.nvidia.com.`,
									type: 'nvidia_api_error',
									code: response.status,
								},
							});
							const headers = new Headers(response.headers);
							headers.delete('content-length');
							headers.delete('content-encoding');
							headers.set('content-type', 'application/json');
							return new Response(customBody, {
								status: response.status,
								statusText: response.statusText,
								headers,
							});
						}
					} catch {
						return response;
					}
				}
				return response;
			};
		}

		return supplyResult;
	}
}
