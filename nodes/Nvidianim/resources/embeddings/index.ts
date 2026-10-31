import type { INodeProperties } from 'n8n-workflow';

export const embeddingsOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['embedding'],
			},
		},
		options: [
			{
				name: 'Generate Embeddings',
				value: 'generate',
				action: 'Generate vector embeddings',
				description: 'Generate vector embeddings for text using an NVIDIA NIM embedding model',
			},
		],
		default: 'generate',
	},
];

export const embeddingsFields: INodeProperties[] = [
	{
		displayName: 'Model',
		name: 'model',
		type: 'resourceLocator',
		default: { mode: 'list', value: 'nvidia/nemotron-3.5-embed-1b' },
		required: true,
		description: 'The NVIDIA NIM embedding model to use',
		displayOptions: {
			show: {
				resource: ['embedding'],
				operation: ['generate'],
			},
		},
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: {
					searchListMethod: 'getEmbeddingModels',
					searchable: true,
				},
			},
			{
				displayName: 'By Name / ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. nvidia/nemotron-3.5-embed-1b',
			},
		],
	},
	{
		displayName: 'Input Mode',
		name: 'inputMode',
		type: 'options',
		options: [
			{
				name: 'Single Text',
				value: 'single',
				description: 'Generate embedding for a single text string',
			},
			{
				name: 'Batch Texts',
				value: 'batch',
				description: 'Generate embeddings for multiple text strings',
			},
		],
		default: 'single',
		description: 'Whether to embed a single text string or a batch of texts',
		displayOptions: {
			show: {
				resource: ['embedding'],
				operation: ['generate'],
			},
		},
	},
	{
		displayName: 'Text',
		name: 'text',
		type: 'string',
		typeOptions: {
			rows: 4,
		},
		default: '',
		required: true,
		displayOptions: {
			show: {
				resource: ['embedding'],
				operation: ['generate'],
				inputMode: ['single'],
			},
		},
		description: 'The text to embed',
	},
	{
		displayName: 'Texts',
		name: 'batchTexts',
		placeholder: 'Add Text Item',
		type: 'fixedCollection',
		typeOptions: {
			multipleValues: true,
		},
		displayOptions: {
			show: {
				resource: ['embedding'],
				operation: ['generate'],
				inputMode: ['batch'],
			},
		},
		description: 'The list of texts to embed in batch',
		default: {},
		options: [
			{
				name: 'textValues',
				displayName: 'Text Item',
				values: [
					{
						displayName: 'Text',
						name: 'text',
						type: 'string',
						typeOptions: {
							rows: 2,
						},
						default: '',
						required: true,
						description: 'Content to embed',
					},
				],
			},
		],
	},
	{
		displayName: 'Input Type',
		name: 'inputType',
		type: 'options',
		options: [
			{
				name: 'Passage (Document Indexing)',
				value: 'passage',
				description: 'Used when indexing documents or passages for asymmetric retrieval models (NeMo Retriever)',
			},
			{
				name: 'Query (Search Query)',
				value: 'query',
				description: 'Used when generating embeddings for a search query',
			},
			{
				name: 'None (Standard / Symmetric)',
				value: 'none',
				description: 'Do not send input_type parameter (for symmetric or general embedding models)',
			},
		],
		default: 'passage',
		description: 'Optimization hint for asymmetric retrieval models',
		displayOptions: {
			show: {
				resource: ['embedding'],
				operation: ['generate'],
			},
		},
	},
	{
		displayName: 'Simplify Output',
		name: 'simplifyOutput',
		type: 'boolean',
		default: true,
		description: 'Whether to return clean embedding vectors and dimension metadata instead of raw API wrapper',
		displayOptions: {
			show: {
				resource: ['embedding'],
				operation: ['generate'],
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
				resource: ['embedding'],
				operation: ['generate'],
			},
		},
		options: [
			{
				displayName: 'Encoding Format',
				name: 'encodingFormat',
				type: 'options',
				options: [
					{ name: 'Float', value: 'float' },
					{ name: 'Base64', value: 'base64' },
				],
				default: 'float',
				description: 'The format to return the embeddings in',
			},
			{
				displayName: 'Timeout (Ms)',
				name: 'timeout',
				type: 'number',
				default: 60000,
				description: 'Request timeout in milliseconds',
			},
			{
				displayName: 'Truncate',
				name: 'truncate',
				type: 'options',
				options: [
					{ name: 'None', value: 'NONE' },
					{ name: 'Start', value: 'START' },
					{ name: 'End', value: 'END' },
				],
				default: 'NONE',
				description: 'How to truncate input exceeding model token limits',
			},
		],
	},
];