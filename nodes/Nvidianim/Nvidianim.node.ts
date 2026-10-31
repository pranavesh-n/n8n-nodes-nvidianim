import type {
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodeListSearchResult,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import {
	embeddingsFields,
	embeddingsOperations,
	executeChat,
	executeEmbeddings,
	executeListModels,
	executeTextCompletion,
	executeVisionAnalysis,
	modelFields,
	modelOperations,
	textFields,
	textOperations,
	customFields,
	customOperations,
	executeCustomApiCall,
	visionFields,
	visionOperations,
} from './resources';
import { nvidiaApiRequest } from './transport';

export class Nvidianim implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Nvidia NIM',
		name: 'nvidianim',
		icon: { light: 'file:nvidia-nim.svg', dark: 'file:nvidia-nim.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Interact with NVIDIA-hosted NIM models and inference APIs',
		defaults: {
			name: 'NVIDIA NIM',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'nvidianimApi', required: true }],
		requestDefaults: {
			baseURL: 'https://integrate.api.nvidia.com/v1',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
			},
		},
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Custom API',
						value: 'custom',
					},
					{
						name: 'Embedding',
						value: 'embedding',
					},
					{
						name: 'Model',
						value: 'model',
					},
					{
						name: 'Text',
						value: 'text',
					},
					{
						name: 'Vision',
						value: 'vision',
					},
				],
				default: 'text',
			},
			...textOperations,
			...textFields,
			...visionOperations,
			...visionFields,
			...embeddingsOperations,
			...embeddingsFields,
			...modelOperations,
			...modelFields,
			...customOperations,
			...customFields,
		],
	};

	methods = {
		listSearch: {
			async getModels(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
				const fallbacks = [
					{ name: 'nvidia/nemotron-3.5-bolt-e4b', value: 'nvidia/nemotron-3.5-bolt-e4b' },
					{ name: 'meta/llama-3.2-11b-vision-instruct', value: 'meta/llama-3.2-11b-vision-instruct' },
					{ name: 'nvidia/nemotron-4-340b-instruct', value: 'nvidia/nemotron-4-340b-instruct' },
					{ name: 'mistralai/mistral-large-2-instruct', value: 'mistralai/mistral-large-2-instruct' },
					{ name: 'deepseek-ai/deepseek-v4.1-flash', value: 'deepseek-ai/deepseek-v4.1-flash' },
				];

				try {
					const response = await nvidiaApiRequest.call(this, 'GET', '/models');
					const data = (response.data as Array<{ id: string }>) || [];
					let results = data.length > 0 ? data.map((item) => ({ name: item.id, value: item.id })) : [...fallbacks];

					if (filter) {
						results = results.filter((m) => m.name.toLowerCase().includes(filter.toLowerCase()));
					}

					results.sort((a, b) => a.name.localeCompare(b.name));
					return { results };
				} catch {
					const filtered = filter
						? fallbacks.filter((m) => m.name.toLowerCase().includes(filter.toLowerCase()))
						: fallbacks;
					return { results: filtered };
				}
			},

			async getVisionModels(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
				const fallbacks = [
					{ name: 'meta/llama-3.2-11b-vision-instruct', value: 'meta/llama-3.2-11b-vision-instruct' },
					{ name: 'meta/llama-3.2-90b-vision-instruct', value: 'meta/llama-3.2-90b-vision-instruct' },
					{ name: 'nvidia/neva-22b', value: 'nvidia/neva-22b' },
				];

				try {
					const response = await nvidiaApiRequest.call(this, 'GET', '/models');
					const data = (response.data as Array<{ id: string }>) || [];
					let results = data
						.filter((item) => typeof item?.id === 'string' && (item.id.toLowerCase().includes('vision') || item.id.toLowerCase().includes('vl') || item.id.toLowerCase().includes('neva')))
						.map((item) => ({
							name: item.id,
							value: item.id,
						}));

					if (results.length === 0) {
						results = fallbacks;
					}

					if (filter) {
						results = results.filter((m) => m.name.toLowerCase().includes(filter.toLowerCase()));
					}

					results.sort((a, b) => a.name.localeCompare(b.name));
					return { results };
				} catch {
					const filtered = filter
						? fallbacks.filter((m) => m.name.toLowerCase().includes(filter.toLowerCase()))
						: fallbacks;
					return { results: filtered };
				}
			},

			async getEmbeddingModels(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
				const fallbacks = [
					{ name: 'nvidia/nemotron-3.5-embed-1b', value: 'nvidia/nemotron-3.5-embed-1b' },
					{ name: 'nvidia/nv-embed-v1', value: 'nvidia/nv-embed-v1' },
					{ name: 'baai/bge-m3', value: 'baai/bge-m3' },
					{ name: 'snowflake/arctic-embed-l', value: 'snowflake/arctic-embed-l' },
				];

				try {
					const response = await nvidiaApiRequest.call(this, 'GET', '/models');
					const data = (response.data as Array<{ id: string }>) || [];
					let results = data
						.filter((item) => typeof item?.id === 'string' && (item.id.toLowerCase().includes('embed') || item.id.toLowerCase().includes('bge')))
						.map((item) => ({
							name: item.id,
							value: item.id,
						}));

					if (results.length === 0) {
						results = fallbacks;
					}

					if (filter) {
						results = results.filter((m) => m.name.toLowerCase().includes(filter.toLowerCase()));
					}

					results.sort((a, b) => a.name.localeCompare(b.name));
					return { results };
				} catch {
					const filtered = filter
						? fallbacks.filter((m) => m.name.toLowerCase().includes(filter.toLowerCase()))
						: fallbacks;
					return { results: filtered };
				}
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;

				if (resource === 'text' && operation === 'chat') {
					const responseData = await executeChat.call(this, i);
					returnData.push({
						json: responseData,
						pairedItem: { item: i },
					});
				} else if (resource === 'text' && operation === 'completion') {
					const responseData = await executeTextCompletion.call(this, i);
					returnData.push({
						json: responseData,
						pairedItem: { item: i },
					});
				} else if (resource === 'vision' && operation === 'analyze') {
					const responseData = await executeVisionAnalysis.call(this, i);
					returnData.push({
						json: responseData,
						pairedItem: { item: i },
					});
				} else if (resource === 'embedding' && operation === 'generate') {
					const responseData = await executeEmbeddings.call(this, i);
					returnData.push({
						json: responseData,
						pairedItem: { item: i },
					});
				} else if (resource === 'custom' && operation === 'customApiCall') {
					const itemResult = await executeCustomApiCall.call(this, i);
					returnData.push(itemResult);
				} else if (resource === 'model' && operation === 'getAll') {
					const models = await executeListModels.call(this, i);
					for (const model of models) {
						returnData.push({
							json: model,
							pairedItem: { item: i },
						});
					}
				} else {
					throw new NodeOperationError(
						this.getNode(),
						`Unsupported resource "${resource}" or operation "${operation}"`,
						{ itemIndex: i },
					);
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: (error as Error).message,
						},
						pairedItem: { item: i },
					});
					continue;
				}

				throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
