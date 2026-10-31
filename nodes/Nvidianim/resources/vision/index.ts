import type { INodeProperties } from 'n8n-workflow';

export const visionOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['vision'],
			},
		},
		options: [
			{
				name: 'Analyze an Image',
				value: 'analyze',
				action: 'Analyze an image with a vision model',
				description: 'Analyze an image using a multimodal NVIDIA NIM vision-language model',
			},
		],
		default: 'analyze',
	},
];

export const visionFields: INodeProperties[] = [
	{
		displayName: 'Model',
		name: 'model',
		type: 'resourceLocator',
		default: { mode: 'list', value: 'meta/llama-3.2-11b-vision-instruct' },
		required: true,
		description: 'The multimodal NVIDIA NIM vision model to use (requires a Vision-Language Model)',
		displayOptions: {
			show: {
				resource: ['vision'],
				operation: ['analyze'],
			},
		},
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: {
					searchListMethod: 'getVisionModels',
					searchable: true,
				},
			},
			{
				displayName: 'By Name / ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. meta/llama-3.2-11b-vision-instruct',
			},
		],
	},
	{
		displayName: 'Prompt',
		name: 'prompt',
		type: 'string',
		typeOptions: {
			rows: 3,
		},
		default: 'Describe this image in detail.',
		required: true,
		description: 'The question or instruction about the image',
		displayOptions: {
			show: {
				resource: ['vision'],
				operation: ['analyze'],
			},
		},
	},
	{
		displayName: 'Image Source',
		name: 'imageSource',
		type: 'options',
		options: [
			{
				name: 'Image URL',
				value: 'url',
				description: 'A publicly accessible HTTP/HTTPS URL or data URI',
			},
			{
				name: 'Incoming Binary Data',
				value: 'binary',
				description: 'Image binary data from a preceding workflow node',
			},
			{
				name: 'Base64 String',
				value: 'base64',
				description: 'Raw Base64 string or data URI',
			},
		],
		default: 'url',
		description: 'Where the image to analyze is located',
		displayOptions: {
			show: {
				resource: ['vision'],
				operation: ['analyze'],
			},
		},
	},
	{
		displayName: 'Image URL',
		name: 'imageUrl',
		type: 'string',
		default: '',
		required: true,
		description: 'Public URL of the image (HTTP/HTTPS) or Base64 Data URI',
		displayOptions: {
			show: {
				resource: ['vision'],
				operation: ['analyze'],
				imageSource: ['url'],
			},
		},
	},
	{
		displayName: 'Input Binary Field',
		name: 'binaryPropertyName',
		type: 'string',
		default: 'data',
		required: true,
		description: 'Name of the binary property containing the image file',
		displayOptions: {
			show: {
				resource: ['vision'],
				operation: ['analyze'],
				imageSource: ['binary'],
			},
		},
	},
	{
		displayName: 'Base64 Data',
		name: 'base64Data',
		type: 'string',
		typeOptions: {
			rows: 4,
		},
		default: '',
		required: true,
		description: 'Base64 encoded image string or data URI (data:image/...;base64,...)',
		displayOptions: {
			show: {
				resource: ['vision'],
				operation: ['analyze'],
				imageSource: ['base64'],
			},
		},
	},
	{
		displayName: 'System Prompt',
		name: 'systemPrompt',
		type: 'string',
		typeOptions: {
			rows: 2,
		},
		default: '',
		description: 'Optional system instructions to steer the model analysis',
		displayOptions: {
			show: {
				resource: ['vision'],
				operation: ['analyze'],
			},
		},
	},
	{
		displayName: 'Simplify Output',
		name: 'simplifyOutput',
		type: 'boolean',
		default: true,
		description: 'Whether to return only the model response text and common metadata instead of raw response',
		displayOptions: {
			show: {
				resource: ['vision'],
				operation: ['analyze'],
			},
		},
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: {
			show: {
				resource: ['vision'],
				operation: ['analyze'],
			},
		},
		options: [
			{
				displayName: 'Maximum Tokens',
				name: 'maxTokens',
				type: 'number',
				typeOptions: {
					minValue: 1,
				},
				default: 1024,
				description: 'Maximum number of tokens to generate in the analysis',
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
				default: 0.2,
				description: 'Controls randomness: lower values are more deterministic and factual for image analysis',
			},
			{
				displayName: 'Timeout (Ms)',
				name: 'timeout',
				type: 'number',
				default: 120000,
				description: 'Request timeout in milliseconds (multimodal inference may require more time)',
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
				default: 0.7,
				description: 'Controls diversity via nucleus sampling',
			},
		],
	},
];