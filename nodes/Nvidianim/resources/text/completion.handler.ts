import type { IDataObject, IExecuteFunctions, JsonObject } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { nvidiaApiRequest } from '../../transport';
import type { ITextCompletionRequest, ITextCompletionResponse } from '../../types';

export async function executeTextCompletion(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const modelParam = this.getNodeParameter('model', itemIndex) as { mode: string; value: string } | string;
	const model = typeof modelParam === 'string' ? modelParam.trim() : (modelParam?.value ?? '').trim();

	if (!model) {
		throw new NodeOperationError(this.getNode(), 'Model parameter cannot be empty', { itemIndex });
	}

	const prompt = (this.getNodeParameter('prompt', itemIndex, '') as string).trim();
	if (!prompt) {
		throw new NodeOperationError(this.getNode(), 'Prompt parameter cannot be empty for text completion', { itemIndex });
	}

	const additionalFields = this.getNodeParameter('additionalFields', itemIndex, {}) as {
		temperature?: number;
		maxTokens?: number;
		topP?: number;
		frequencyPenalty?: number;
		presencePenalty?: number;
		timeout?: number;
	};

	const requestBody: ITextCompletionRequest = {
		model,
		prompt,
		stream: false,
	};

	if (additionalFields.temperature !== undefined) {
		requestBody.temperature = additionalFields.temperature;
	}
	if (additionalFields.maxTokens !== undefined) {
		requestBody.max_tokens = additionalFields.maxTokens;
	}
	if (additionalFields.topP !== undefined) {
		requestBody.top_p = additionalFields.topP;
	}
	if (additionalFields.frequencyPenalty !== undefined) {
		requestBody.frequency_penalty = additionalFields.frequencyPenalty;
	}
	if (additionalFields.presencePenalty !== undefined) {
		requestBody.presence_penalty = additionalFields.presencePenalty;
	}

	const rawResponse = (await nvidiaApiRequest.call(
		this,
		'POST',
		'/completions',
		requestBody as unknown as IDataObject,
		undefined,
		{ timeout: additionalFields.timeout },
	)) as unknown as ITextCompletionResponse;

	const simplifyOutput = this.getNodeParameter('simplifyOutput', itemIndex, true) as boolean;

	if (simplifyOutput) {
		const primaryChoice = rawResponse.choices?.[0];
		return {
			text: primaryChoice?.text ?? '',
			finish_reason: primaryChoice?.finish_reason,
			model: rawResponse.model,
			usage: rawResponse.usage as unknown as JsonObject,
			id: rawResponse.id,
		};
	}

	return rawResponse as unknown as IDataObject;
}