import type { IDataObject, IExecuteFunctions, JsonObject } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { nvidiaApiRequest } from '../../transport';

export interface IEmbeddingItem {
	object: string;
	embedding: number[] | string;
	index: number;
}

export interface IEmbeddingsApiResponse {
	object: string;
	data: IEmbeddingItem[];
	model: string;
	usage?: {
		prompt_tokens: number;
		total_tokens: number;
	};
}

export async function executeEmbeddings(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const modelParam = this.getNodeParameter('model', itemIndex) as { mode: string; value: string } | string;
	const model = typeof modelParam === 'string' ? modelParam.trim() : (modelParam?.value ?? '').trim();

	if (!model) {
		throw new NodeOperationError(this.getNode(), 'Model parameter cannot be empty for embeddings', { itemIndex });
	}

	const inputMode = this.getNodeParameter('inputMode', itemIndex, 'single') as string;
	const inputStrings: string[] = [];

	if (inputMode === 'single') {
		const text = (this.getNodeParameter('text', itemIndex, '') as string).trim();
		if (!text) {
			throw new NodeOperationError(this.getNode(), 'Text parameter cannot be empty', { itemIndex });
		}
		inputStrings.push(text);
	} else if (inputMode === 'batch') {
		const batchTexts = this.getNodeParameter('batchTexts', itemIndex, {}) as {
			textValues?: Array<{ text: string }>;
		};
		const values = batchTexts.textValues ?? [];

		if (values.length === 0) {
			throw new NodeOperationError(this.getNode(), 'At least one text item is required for batch embeddings', {
				itemIndex,
			});
		}

		for (let i = 0; i < values.length; i++) {
			const itemText = (values[i].text ?? '').trim();
			if (!itemText) {
				throw new NodeOperationError(this.getNode(), `Text at batch position ${i + 1} cannot be empty`, { itemIndex });
			}
			inputStrings.push(itemText);
		}
	} else {
		throw new NodeOperationError(this.getNode(), `Unsupported inputMode: "${inputMode}"`, { itemIndex });
	}

	const inputType = this.getNodeParameter('inputType', itemIndex, 'passage') as string;
	const additionalFields = this.getNodeParameter('additionalFields', itemIndex, {}) as {
		encodingFormat?: string;
		truncate?: string;
		timeout?: number;
	};

	const requestBody: IDataObject = {
		model,
		input: inputStrings,
	};

	if (inputType && inputType !== 'none') {
		requestBody.input_type = inputType;
	}

	if (additionalFields.encodingFormat) {
		requestBody.encoding_format = additionalFields.encodingFormat;
	}

	if (additionalFields.truncate && additionalFields.truncate !== 'NONE') {
		requestBody.truncate = additionalFields.truncate;
	}

	const rawResponse = (await nvidiaApiRequest.call(
		this,
		'POST',
		'/embeddings',
		requestBody,
		undefined,
		{ timeout: additionalFields.timeout },
	)) as unknown as IEmbeddingsApiResponse;

	if (!rawResponse || typeof rawResponse !== 'object' || !Array.isArray(rawResponse.data)) {
		throw new NodeOperationError(this.getNode(), 'Received malformed embeddings response from NVIDIA NIM API', {
			itemIndex,
		});
	}

	// Sort response items strictly by index to preserve input ordering
	const sortedItems = [...rawResponse.data].sort((a, b) => a.index - b.index);

	const simplifyOutput = this.getNodeParameter('simplifyOutput', itemIndex, true) as boolean;

	if (simplifyOutput) {
		if (inputMode === 'single') {
			const first = sortedItems[0];
			const dimensions = Array.isArray(first?.embedding) ? first.embedding.length : undefined;
			return {
				embedding: first?.embedding,
				dimensions,
				model: rawResponse.model,
				usage: rawResponse.usage as unknown as JsonObject,
			};
		}

		const dimensions = Array.isArray(sortedItems[0]?.embedding) ? sortedItems[0].embedding.length : undefined;
		return {
			embeddings: sortedItems.map((item) => item.embedding),
			count: sortedItems.length,
			dimensions,
			model: rawResponse.model,
			usage: rawResponse.usage as unknown as JsonObject,
		};
	}

	return rawResponse as unknown as IDataObject;
}