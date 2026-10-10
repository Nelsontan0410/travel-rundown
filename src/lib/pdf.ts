// pdf.js 按需加载；worker 打包进应用，由 Service Worker 预缓存，离线可用。
import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api';

export async function loadPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs.getDocument({ data, isEvalSupported: false }).promise;
}
