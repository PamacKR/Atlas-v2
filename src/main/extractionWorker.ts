import { parentPort } from 'worker_threads';
import { extractDocumentParts } from './textExtraction';

if (!parentPort) {
  throw new Error('Atlas extraction worker requires a parent thread.');
}

interface ExtractionRequest {
  id: number;
  kind: string;
  filePath: string;
}

parentPort.on('message', async (request: ExtractionRequest) => {
  try {
    const result = await extractDocumentParts(request.kind, request.filePath);
    parentPort!.postMessage({ id: request.id, result });
  } catch (error) {
    parentPort!.postMessage({
      id: request.id,
      result: {
        status: 'failed',
        parts: [],
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
});
