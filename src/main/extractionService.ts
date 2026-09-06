import { Worker } from 'worker_threads';
import * as path from 'path';
import type { ExtractionResult } from './textExtraction';

interface ExtractionRequest {
  id: number;
  kind: string;
  filePath: string;
}

interface ExtractionResponse {
  id: number;
  result: ExtractionResult;
}

interface ExtractionJob {
  kind: string;
  filePath: string;
  resolve: (result: ExtractionResult) => void;
  reject: (error: Error) => void;
}

let worker: Worker | null = null;
let nextRequestId = 1;
let activeJob: { id: number; job: ExtractionJob } | null = null;
const queue: ExtractionJob[] = [];

function workerPath(): string {
  return path.join(__dirname, 'extractionWorker.js');
}

function rejectJobs(error: Error): void {
  if (activeJob) {
    activeJob.job.reject(error);
    activeJob = null;
  }
  while (queue.length > 0) queue.shift()!.reject(error);
}

function startNext(): void {
  if (!worker || activeJob || queue.length === 0) return;
  const job = queue.shift()!;
  const id = nextRequestId++;
  activeJob = { id, job };
  const request: ExtractionRequest = { id, kind: job.kind, filePath: job.filePath };
  worker.postMessage(request);
}

function ensureWorker(): Worker {
  if (worker) return worker;
  const created = new Worker(workerPath());
  worker = created;
  created.on('message', (message: ExtractionResponse) => {
    if (!activeJob || message.id !== activeJob.id) return;
    const finished = activeJob.job;
    activeJob = null;
    finished.resolve(message.result);
    startNext();
  });
  created.on('error', (error) => {
    if (worker !== created) return;
    worker = null;
    rejectJobs(error instanceof Error ? error : new Error(String(error)));
  });
  created.on('exit', (code) => {
    if (worker !== created) return;
    worker = null;
    if (code !== 0) rejectJobs(new Error(`Atlas extraction worker exited with code ${code}.`));
  });
  return created;
}

export function extractDocumentPartsInWorker(kind: string, filePath: string): Promise<ExtractionResult> {
  return new Promise<ExtractionResult>((resolve, reject) => {
    queue.push({ kind, filePath, resolve, reject });
    ensureWorker();
    startNext();
  });
}

export async function closeExtractionWorker(): Promise<void> {
  const existing = worker;
  worker = null;
  if (!existing) return;
  rejectJobs(new Error('Atlas extraction worker closed.'));
  await existing.terminate();
}
