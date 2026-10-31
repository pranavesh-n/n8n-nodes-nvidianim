import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { nvidiaApiRequest } from '../../transport';
import type { IListModelsResponse, IModelItem } from '../../types';

export async function executeListModels(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject[]> {
	const returnAll = this.getNodeParameter('returnAll', itemIndex, true) as boolean;
	const limit = returnAll ? undefined : (this.getNodeParameter('limit', itemIndex, 50) as number);

	const response = (await nvidiaApiRequest.call(
		this,
		'GET',
		'/models',
	)) as unknown as IListModelsResponse;

	if (!response || typeof response !== 'object') {
		throw new NodeOperationError(this.getNode(), 'Received malformed response from NVIDIA NIM API', {
			itemIndex,
		});
	}

	const rawData = response.data;
	if (!Array.isArray(rawData)) {
		throw new NodeOperationError(
			this.getNode(),
			'Expected "data" property in NVIDIA NIM models response to be an array',
			{ itemIndex },
		);
	}

	let models: IModelItem[] = rawData.filter(
		(item): item is IModelItem => item !== null && typeof item === 'object' && typeof item.id === 'string',
	);

	if (limit && limit > 0) {
		models = models.slice(0, limit);
	}

	return models as unknown as IDataObject[];
}