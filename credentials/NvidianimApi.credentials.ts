import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
	Icon,
} from 'n8n-workflow';

export class NvidianimApi implements ICredentialType {
	name = 'nvidianimApi';

	displayName = 'Nvidia NIM API';

	documentationUrl = 'https://build.nvidia.com';

	icon: Icon = {
		light: 'file:nvidia-nim.svg',
		dark: 'file:nvidia-nim.dark.svg',
	};

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description: 'The NVIDIA API key from build.nvidia.com (starts with nvapi-)',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://integrate.api.nvidia.com/v1',
			description: 'The base URL for NVIDIA NIM. Use default for build.nvidia.com cloud, or your self-hosted NIM container URL (e.g. http://localhost:8000/v1).',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '={{"Bearer " + ($credentials.apiKey ? $credentials.apiKey.toString().replace(/^Bearer\\s+/i, "").trim() : "")}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials?.baseUrl || "https://integrate.api.nvidia.com/v1"}}',
			url: '/models',
			method: 'GET',
		},
	};
}
