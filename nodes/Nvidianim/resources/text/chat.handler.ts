import type { IDataObject, IExecuteFunctions, JsonObject } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { nvidiaApiRequest } from '../../transport';
import type { IChatCompletionRequest, IChatCompletionResponse, IChatMessage } from '../../types';

export async function executeChat(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const modelParam = this.getNodeParameter('model', itemIndex) as { mode: string; value: string } | string;
	const model = typeof modelParam === 'string' ? modelParam.trim() : (modelParam?.value ?? '').trim();

	if (!model) {
		throw new NodeOperationError(this.getNode(), 'Model parameter cannot be empty', { itemIndex });
	}

	const promptType = this.getNodeParameter('promptType', itemIndex, 'simple') as string;
	const messages: IChatMessage[] = [];

	if (promptType === 'simple') {
		const prompt = (this.getNodeParameter('prompt', itemIndex, '') as string).trim();
		const systemPrompt = (this.getNodeParameter('systemPrompt', itemIndex, '') as string).trim();

		if (!prompt) {
			throw new NodeOperationError(this.getNode(), 'Prompt cannot be empty when using Simple Prompt mode', { itemIndex });
		}

		if (systemPrompt) {
			messages.push({ role: 'system', content: systemPrompt });
		}
		messages.push({ role: 'user', content: prompt });
	} else if (promptType === 'messages') {
		const messagesData = this.getNodeParameter('messages', itemIndex, {}) as {
			messageValues?: IChatMessage[];
		};
		const values = messagesData.messageValues ?? [];

		if (values.length === 0) {
			throw new NodeOperationError(this.getNode(), 'At least one message is required when using Chat Messages mode', {
				itemIndex,
			});
		}

		for (let idx = 0; idx < values.length; idx++) {
			const msg = values[idx];
			const content = (msg.content ?? '').trim();
			if (!content) {
				throw new NodeOperationError(this.getNode(), `Message at position ${idx + 1} has empty content`, { itemIndex });
			}
			messages.push({
				role: msg.role ?? 'user',
				content,
			});
		}
	} else {
		throw new NodeOperationError(this.getNode(), `Unsupported promptType: "${promptType}"`, { itemIndex });
	}

	const additionalFields = this.getNodeParameter('additionalFields', itemIndex, {}) as {
		temperature?: number;
		maxTokens?: number;
		topP?: number;
		frequencyPenalty?: number;
		presencePenalty?: number;
		reasoningBudget?: number;
		timeout?: number;
	};

	const requestBody: IChatCompletionRequest = {
		model,
		messages,
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
	if (additionalFields.reasoningBudget !== undefined) {
		requestBody.reasoning_budget = additionalFields.reasoningBudget;
	}

	const rawResponse = (await nvidiaApiRequest.call(
		this,
		'POST',
		'/chat/completions',
		requestBody as unknown as IDataObject,
		undefined,
		{ timeout: additionalFields.timeout },
	)) as unknown as IChatCompletionResponse;

	const simplifyOutput = this.getNodeParameter('simplifyOutput', itemIndex, true) as boolean;

	if (simplifyOutput) {
		const primaryChoice = rawResponse.choices?.[0];
		return {
			text: primaryChoice?.message?.content ?? '',
			message: primaryChoice?.message as unknown as JsonObject,
			finish_reason: primaryChoice?.finish_reason,
			model: rawResponse.model,
			usage: rawResponse.usage as unknown as JsonObject,
			id: rawResponse.id,
		};
	}

	return rawResponse as unknown as IDataObject;
}