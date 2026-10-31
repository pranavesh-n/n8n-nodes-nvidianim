import type { INodeProperties } from 'n8n-workflow';

export const textOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['text'],
			},
		},
		options: [
			{
				name: 'Message a Model',
				value: 'chat',
				action: 'Message a model with chat completions',
				description: 'Send messages to an NVIDIA NIM chat model',
			},
			{
				name: 'Generate Text',
				value: 'completion',
				action: 'Generate text completions',
				description: 'Generate text from a prompt using an NVIDIA NIM completion model',
			},
		],
		default: 'chat',
	},
];

export const textFields: INodeProperties[] = [
	{
		displayName: 'Model',
		name: 'model',
		type: 'resourceLocator',
		default: { mode: 'list', value: 'nvidia/nemotron-4-340b-instruct' },
		required: true,
		description: 'The NVIDIA NIM model to message',
		displayOptions: {
			show: {
				resource: ['text'],
				operation: ['chat', 'completion'],
			},
		},
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: {
					searchListMethod: 'getModels',
					searchable: true,
				},
			},
			{
				displayName: 'By Name / ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. meta/llama-3.3-70b-instruct',
			},
		],
	},
	{
		displayName: 'Prompt Type',
		name: 'promptType',
		type: 'options',
		options: [
			{
				name: 'Simple Prompt',
				value: 'simple',
				description: 'Provide a user prompt and optional system instructions',
			},
			{
				name: 'Chat Messages',
				value: 'messages',
				description: 'Define multiple messages with specific roles (system, user, assistant)',
			},
		],
		default: 'simple',
		description: 'How to structure the input prompt',
		displayOptions: {
			show: {
				resource: ['text'],
				operation: ['chat'],
			},
		},
	},
	{
		displayName: 'Prompt',
		name: 'prompt',
		type: 'string',
		typeOptions: {
			rows: 4,
		},
		default: '',
		required: true,
		displayOptions: {
			show: {
				resource: ['text'],
				operation: ['chat'],
				promptType: ['simple'],
			},
		},
		description: 'The prompt to send to the model',
	},
	{
		displayName: 'Prompt',
		name: 'prompt',
		type: 'string',
		typeOptions: {
			rows: 4,
		},
		default: '',
		required: true,
		displayOptions: {
			show: {
				resource: ['text'],
				operation: ['completion'],
			},
		},
		description: 'The text prompt to generate completions for',
	},
	{
		displayName: 'System Prompt',
		name: 'systemPrompt',
		type: 'string',
		typeOptions: {
			rows: 2,
		},
		default: '',
		displayOptions: {
			show: {
				resource: ['text'],
				operation: ['chat'],
				promptType: ['simple'],
			},
		},
		description: 'System instructions to guide model behavior',
	},
	{
		displayName: 'Messages',
		name: 'messages',
		placeholder: 'Add Message',
		type: 'fixedCollection',
		typeOptions: {
			multipleValues: true,
		},
		displayOptions: {
			show: {
				resource: ['text'],
				operation: ['chat'],
				promptType: ['messages'],
			},
		},
		description: 'The conversation messages',
		default: {},
		options: [
			{
				name: 'messageValues',
				displayName: 'Message',
				values: [
					{
						displayName: 'Role',
						name: 'role',
						type: 'options',
						options: [
							{ name: 'System', value: 'system' },
							{ name: 'User', value: 'user' },
							{ name: 'Assistant', value: 'assistant' },
						],
						default: 'user',
						description: 'Role of the message sender',
					},
					{
						displayName: 'Content',
						name: 'content',
						type: 'string',
						typeOptions: {
							rows: 3,
						},
						default: '',
						required: true,
						description: 'Text content of the message',
					},
				],
			},
		],
	},
	{
		displayName: 'Simplify Output',
		name: 'simplifyOutput',
		type: 'boolean',
		default: true,
		description: 'Whether to return only the generated response text and common metadata instead of the raw API response',
		displayOptions: {
			show: {
				resource: ['text'],
				operation: ['chat', 'completion'],
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
				resource: ['text'],
				operation: ['chat', 'completion'],
			},
		},
		options: [
			{
				displayName: 'Frequency Penalty',
				name: 'frequencyPenalty',
				type: 'number',
				typeOptions: {
					minValue: -2,
					maxValue: 2,
					numberPrecision: 2,
				},
				default: 0,
				description: 'Penalizes repeated tokens based on frequency (-2.0 to 2.0)',
			},
			{
				displayName: 'Maximum Tokens',
				name: 'maxTokens',
				type: 'number',
				typeOptions: {
					minValue: 1,
				},
				default: 1024,
				description: 'Maximum number of tokens to generate',
			},
			{
				displayName: 'Presence Penalty',
				name: 'presencePenalty',
				type: 'number',
				typeOptions: {
					minValue: -2,
					maxValue: 2,
					numberPrecision: 2,
				},
				default: 0,
				description: 'Penalizes repeated tokens based on presence (-2.0 to 2.0)',
			},
			{
				displayName: 'Reasoning Budget',
				name: 'reasoningBudget',
				type: 'number',
				typeOptions: {
					minValue: 0,
				},
				default: 128,
				description: 'Constrains internal chain-of-thought reasoning tokens for reasoning models (e.g. 128, 256)',
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
				description: 'Controls randomness: higher values make output more random, lower values more deterministic',
			},
			{
				displayName: 'Timeout (Ms)',
				name: 'timeout',
				type: 'number',
				default: 60000,
				description: 'Request timeout in milliseconds',
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
				description: 'Controls diversity via nucleus sampling (0.0 to 1.0)',
			},
		],
	},
];