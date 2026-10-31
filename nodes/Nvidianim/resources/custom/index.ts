import type { INodeProperties } from 'n8n-workflow';

export const customOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['custom'],
			},
		},
		options: [
			{
				name: 'Make a Custom API Call',
				value: 'customApiCall',
				description: 'Make an arbitrary authenticated call to the NVIDIA NIM API',
				action: 'Make a custom NVIDIA NIM API call',
			},
		],
		default: 'customApiCall',
	},
];

export const customFields: INodeProperties[] = [
	{
		displayName: 'Method',
		name: 'method',
		type: 'options',
		options: [
			{ name: 'DELETE', value: 'DELETE' },
			{ name: 'GET', value: 'GET' },
			{ name: 'PATCH', value: 'PATCH' },
			{ name: 'POST', value: 'POST' },
			{ name: 'PUT', value: 'PUT' },
		],
		default: 'GET',
		description: 'The HTTP method to use',
		displayOptions: {
			show: {
				resource: ['custom'],
				operation: ['customApiCall'],
			},
		},
	},
	{
		displayName: 'Endpoint',
		name: 'endpoint',
		type: 'string',
		default: '',
		placeholder: '/chat/completions',
		description: 'The API endpoint to call, relative to https://integrate.api.nvidia.com/v1',
		required: true,
		displayOptions: {
			show: {
				resource: ['custom'],
				operation: ['customApiCall'],
			},
		},
	},
	{
		displayName: 'Body',
		name: 'body',
		type: 'json',
		default: '{}',
		description: 'The JSON body payload to send with the request',
		displayOptions: {
			show: {
				resource: ['custom'],
				operation: ['customApiCall'],
				method: ['POST', 'PUT', 'PATCH'],
			},
		},
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: {
			show: {
				resource: ['custom'],
				operation: ['customApiCall'],
			},
		},
		options: [
			{
				displayName: 'Headers',
				name: 'headers',
				placeholder: 'Add Header',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				default: {},
				options: [
					{
						name: 'header',
						displayName: 'Header',
						values: [
							{
								displayName: 'Name',
								name: 'name',
								type: 'string',
								default: '',
								description: 'Header name',
							},
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
								description: 'Header value',
							},
						],
					},
				],
			},
			{
				displayName: 'Query Parameters',
				name: 'queryParameters',
				placeholder: 'Add Parameter',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				default: {},
				options: [
					{
						name: 'parameter',
						displayName: 'Parameter',
						values: [
							{
								displayName: 'Name',
								name: 'name',
								type: 'string',
								default: '',
								description: 'Query parameter name',
							},
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
								description: 'Query parameter value',
							},
						],
					},
				],
			},
			{
				displayName: 'Timeout',
				name: 'timeout',
				type: 'number',
				default: 60000,
				description: 'Time in milliseconds to wait for a response before timing out',
			},
		],
	},
];