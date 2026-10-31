export interface IChatMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

export interface IChatCompletionRequest {
	model: string;
	messages: IChatMessage[];
	temperature?: number;
	max_tokens?: number;
	top_p?: number;
	frequency_penalty?: number;
	presence_penalty?: number;
	reasoning_budget?: number;
	stream?: boolean;
}

export interface IChatCompletionChoice {
	index: number;
	message: IChatMessage;
	finish_reason: string;
}

export interface ITokenUsage {
	prompt_tokens: number;
	completion_tokens: number;
	total_tokens: number;
}

export interface IChatCompletionResponse {
	id: string;
	object: string;
	created: number;
	model: string;
	choices: IChatCompletionChoice[];
	usage?: ITokenUsage;
}

export interface ITextCompletionRequest {
	model: string;
	prompt: string;
	temperature?: number;
	max_tokens?: number;
	top_p?: number;
	frequency_penalty?: number;
	presence_penalty?: number;
	stream?: boolean;
}

export interface ITextCompletionChoice {
	text: string;
	index: number;
	finish_reason: string;
}

export interface ITextCompletionResponse {
	id: string;
	object: string;
	created: number;
	model: string;
	choices: ITextCompletionChoice[];
	usage?: ITokenUsage;
}

export interface IModelItem {
	id: string;
	object?: string;
	created?: number;
	owned_by?: string;
}

export interface IListModelsResponse {
	data?: IModelItem[];
	object: string;
}