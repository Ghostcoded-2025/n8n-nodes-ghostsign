import type { INode } from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

export function normalizeExecutionError(
	node: INode,
	error: unknown,
	itemIndex: number,
): NodeApiError | NodeOperationError {
	if (error instanceof NodeOperationError || error instanceof NodeApiError) {
		return error;
	}

	if (error instanceof Error) {
		return new NodeOperationError(node, error, { itemIndex });
	}

	return new NodeOperationError(node, String(error), { itemIndex });
}
