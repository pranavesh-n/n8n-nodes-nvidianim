import type { IDataObject, IExecuteFunctions, JsonObject } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { nvidiaApiRequest } from '../../transport';
import type { IChatCompletionResponse } from '../../types';

export const SUPPORTED_IMAGE_MIME_TYPES = new Set([
	'image/jpeg',
	'image/jpg',
	'image/png',
	'image/webp',
	'image/gif',
]);

export async function executeVisionAnalysis(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject> {
	const modelParam = this.getNodeParameter('model', itemIndex) as { mode: string; value: string } | string;
	const model = typeof modelParam === 'string' ? modelParam.trim() : (modelParam?.value ?? '').trim();

	if (!model) {
		throw new NodeOperationError(this.getNode(), 'Model parameter cannot be empty for image analysis', { itemIndex });
	}

	const prompt = (this.getNodeParameter('prompt', itemIndex, '') as string).trim();
	if (!prompt) {
		throw new NodeOperationError(this.getNode(), 'Prompt parameter cannot be empty', { itemIndex });
	}

	const imageSource = this.getNodeParameter('imageSource', itemIndex, 'url') as string;
	let formattedImageUrl = '';

	if (imageSource === 'url') {
		const rawUrl = (this.getNodeParameter('imageUrl', itemIndex, '') as string).trim();
		if (!rawUrl) {
			throw new NodeOperationError(this.getNode(), 'Image URL parameter cannot be empty', { itemIndex });
		}

		if (!/^https?:\/\//i.test(rawUrl) && !rawUrl.startsWith('data:image/')) {
			throw new NodeOperationError(
				this.getNode(),
				'Image URL must be a valid HTTP/HTTPS URL or base64 data URI (starting with data:image/)',
				{ itemIndex },
			);
		}

		formattedImageUrl = rawUrl;
	} else if (imageSource === 'binary') {
		const binaryPropertyName = this.getNodeParameter('binaryPropertyName', itemIndex, 'data') as string;
		const binaryData = this.helpers.assertBinaryData(itemIndex, binaryPropertyName);

		const mimeType = (binaryData.mimeType ?? '').toLowerCase();
		if (!mimeType.startsWith('image/')) {
			throw new NodeOperationError(
				this.getNode(),
				`Binary field "${binaryPropertyName}" must be an image, but found "${mimeType}"`,
				{ itemIndex },
			);
		}

		if (!SUPPORTED_IMAGE_MIME_TYPES.has(mimeType)) {
			throw new NodeOperationError(
				this.getNode(),
				`Unsupported image format "${mimeType}". Supported formats: JPEG, PNG, WEBP, GIF`,
				{ itemIndex },
			);
		}

		const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
		const base64String = buffer.toString('base64');
		formattedImageUrl = `data:${mimeType};base64,${base64String}`;
	} else if (imageSource === 'base64') {
		const rawBase64 = (this.getNodeParameter('base64Data', itemIndex, '') as string).trim();
		if (!rawBase64) {
			throw new NodeOperationError(this.getNode(), 'Base64 data parameter cannot be empty', { itemIndex });
		}

		if (rawBase64.startsWith('data:image/')) {
			formattedImageUrl = rawBase64;
		} else {
			// Auto-wrap bare base64 as JPEG data URI
			formattedImageUrl = `data:image/jpeg;base64,${rawBase64}`;
		}
	} else {
		throw new NodeOperationError(this.getNode(), `Unsupported imageSource: "${imageSource}"`, { itemIndex });
	}

	const systemPrompt = (this.getNodeParameter('systemPrompt', itemIndex, '') as string).trim();
	const additionalFields = this.getNodeParameter('additionalFields', itemIndex, {}) as {
		temperature?: number;
		maxTokens?: number;
		topP?: number;
		timeout?: number;
	};

	const userContent = [
		{ type: 'text', text: prompt },
		{
			type: 'image_url',
			image_url: {
				url: formattedImageUrl,
			},
		},
	];

	const messages: Array<{ role: string; content: unknown }> = [];
	if (systemPrompt) {
		messages.push({ role: 'system', content: systemPrompt });
	}
	messages.push({ role: 'user', content: userContent });

	const requestBody: IDataObject = {
		model,
		messages: messages as unknown as IDataObject[],
		max_tokens: additionalFields.maxTokens ?? 1024,
		stream: false,
	};

	if (additionalFields.temperature !== undefined) {
		requestBody.temperature = additionalFields.temperature;
	}
	if (additionalFields.topP !== undefined) {
		requestBody.top_p = additionalFields.topP;
	}

	const rawResponse = (await nvidiaApiRequest.call(
		this,
		'POST',
		'/chat/completions',
		requestBody,
		undefined,
		{ timeout: additionalFields.timeout ?? 120000 },
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