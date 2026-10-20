import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api';
import { MAX_BYTES } from './files';
import { ARRIVAL_LABEL, DEPARTURE_LABEL, parseFlightTicketText, type TicketTextBlock } from '../domain/flightTicket';
import { cleanTicketText, parseItinerary, type ItineraryCandidate } from './flightItinerary';
export interface Atom { x: number; y: number; width: number; text: string }
interface Row { y: number; atoms: Atom[] }
function blocksFromAtoms(atoms: Atom[], page: number): TicketTextBlock[] {
  const rows: Row[]=[];
  for(const atom of atoms.sort((a,b)=>b.y-a.y||a.x-b.x)) {
    const last=rows.at(-1);
    if(last&&Math.abs(last.y-atom.y)<3) last.atoms.push(atom);else rows.push({y:atom.y,atoms:[atom]});
  }
  rows.forEach(r=>r.atoms.sort((a,b)=>a.x-b.x));
  const headers: {index:number;dep:number;arr:number}[]=[];
  rows.forEach((r,index)=>{
    const labels: {x:number;kind:'dep'|'arr'}[]=[];
    for(const a of r.atoms) for(const [kind,re] of [['dep',DEPARTURE_LABEL],['arr',ARRIVAL_LABEL]] as const) {
      re.lastIndex=0;
      for(const m of a.text.matchAll(re)) labels.push({kind,x:a.x+(m.index!/Math.max(1,a.text.length))*a.width});
    }
    const dep=labels.find(x=>x.kind==='dep'),arr=labels.find(x=>x.kind==='arr');
    if(dep&&arr&&Math.abs(dep.x-arr.x)>60) headers.push({index,dep:dep.x,arr:arr.x});
  });
  const used=new Set<number>();const blocks:TicketTextBlock[]=[];
  headers.forEach((h,i)=>{
    const limit=headers[i+1]?.index??rows.length,boundary=(h.dep+h.arr)/2,left=h.dep<h.arr;
    const lines:string[]=['Departure'];let ambiguousLayout=false;
    for(let j=h.index+1;j<limit;j++) {
      used.add(j);
      if(rows[j].atoms.some(a=>a.x<boundary&&a.x+a.width>boundary+8&&((a.text.match(/\b20\d{2}\b/g)?.length??0)>1||(a.text.match(/\b\d{1,2}[:.]\d{2}\b/g)?.length??0)>1))) ambiguousLayout=true;
      const parts=rows[j].atoms.filter(a=>left?a.x<boundary:a.x>=boundary);
      if(parts.length) lines.push(parts.map(a=>a.text).join(' '));
    }
    used.add(h.index);if(!ambiguousLayout)blocks.push({page,text:lines.join('\n'),departureColumn:true});
  });
  // 清洗后再交给原解析器：去掉粘在 Departure 前的页码（"1Departure" 没有单词边界，原来认不出）
  const ordinary=cleanTicketText(rows.filter((_,i)=>!used.has(i)).map(r=>r.atoms.map(a=>a.text).join(' ')).join('\n'));
  if(ordinary.trim()) blocks.push({page,text:ordinary});
  return blocks;
}
/** No OCR and no server: read text only, then release the existing pdf.js worker/document. */
/** 2026-10-19：PDF 本身设了打开密码。need = 还没给密码；wrong = 密码不对 */
export class PdfPasswordError extends Error {
  constructor(public reason: 'need' | 'wrong') {
    super(reason === 'need' ? '这份 PDF 有打开密码，请输入后再识别。' : 'PDF 密码不正确，请再试一次。');
    this.name = 'PdfPasswordError';
  }
}

/** 2026-10-21：识别失败时带上提取到的原始文字（前约 600 字），方便对照。 */
export class TicketParseError extends Error {
  constructor(message: string, public excerpt: string) { super(message); this.name = 'TicketParseError'; }
}
/** 一页的阅读顺序文字（按行，从上到下、从左到右）。 */
export function pageText(atoms: Atom[]): string {
  const rows: Row[]=[];
  for(const atom of [...atoms].sort((a,b)=>b.y-a.y||a.x-b.x)) {
    const last=rows.at(-1);
    if(last&&Math.abs(last.y-atom.y)<3) last.atoms.push(atom);else rows.push({y:atom.y,atoms:[atom]});
  }
  return rows.map(r=>r.atoms.sort((a,b)=>a.x-b.x).map(a=>a.text).join(' ')).join('\n');
}
/** 纯文字 → 候选：先按行程单航段解析（带航班号、机场时区），认不出再用原有的通用解析。 */
export function ticketCandidates(pages: string[], blocks: TicketTextBlock[], referenceYear: number): ItineraryCandidate[] {
  const itinerary=parseItinerary(pages);
  if(itinerary.length) return itinerary;
  return parseFlightTicketText(blocks,referenceYear);
}
export const excerptOf=(pages: string[])=>cleanTicketText(pages.join('\n')).slice(0,600);

export async function readFlightTicketPdf(blob: Blob, referenceYear: number, signal?: AbortSignal, password?: string) {
  if(blob.size>MAX_BYTES) throw new Error('PDF 超过 20 MB，请选择较小的机票文件。');
  let pdf: PDFDocumentProxy|undefined;let task: PDFDocumentLoadingTask|undefined;
  let expired=false;
  const timer=setTimeout(()=>{expired=true;void task?.destroy().catch(()=>{});},30000);
  const check=()=>{if(signal?.aborted) throw new DOMException('已取消','AbortError');if(expired) throw new Error('PDF 读取超时，请使用较小的文字型机票 PDF。');};
  const abort=()=>{void task?.destroy().catch(()=>{});};signal?.addEventListener('abort',abort);
  try {
    check();
    // Reuse the app's existing pdf.js package/worker; own the task so cancellation also releases failed loads.
    const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
    const worker=await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
    check();pdfjs.GlobalWorkerOptions.workerSrc=worker.default;
    const data=await blob.arrayBuffer();check();task=pdfjs.getDocument({data,isEvalSupported:false,...(password?{password}:{})});
    pdf=await task.promise;check();
    if(pdf.numPages>20) throw new Error('请选取不超过 20 页的机票 PDF。');
    const blocks:TicketTextBlock[]=[];const pages:string[]=[];let chars=0;
    for(let n=1;n<=pdf.numPages;n++) {
      check();const page=await pdf.getPage(n);const content=await page.getTextContent();check();
      const atoms:Atom[]=[];
      for(const item of content.items) if('str' in item&&item.str.trim()) {
        chars+=item.str.length;
        if(chars>200000||atoms.length>50000) throw new Error('PDF 文字过多，请只保留机票页面后重试。');
        atoms.push({text:item.str,x:item.transform[4],y:item.transform[5],width:item.width});
      }
      pages.push(pageText(atoms));blocks.push(...blocksFromAtoms(atoms,n));page.cleanup();
    }
    if(!chars) throw new Error('这份 PDF 没有可读取的文字，可能是扫描件。请使用文字型 PDF 或手动填写。');
    const candidates=ticketCandidates(pages,blocks,referenceYear);
    if(!candidates.length) throw new TicketParseError('未找到可确认的起飞日期与时间，请手动填写；不会修改现有倒数。',excerptOf(pages));
    return candidates;
  } catch(e) {
    if(signal?.aborted) throw new DOMException('已取消','AbortError');
    if(expired) throw new Error('PDF 读取超时，请使用较小的文字型机票 PDF。');
    if(e instanceof Error&&e.name==='PasswordException') throw new PdfPasswordError((e as Error&{code?:number}).code===2||password?'wrong':'need');
    if(e instanceof Error&&['InvalidPDFException','MissingPDFException'].includes(e.name)) throw new Error('无法读取这份 PDF，请检查文件是否完整。');
    throw e;
  } finally {clearTimeout(timer);signal?.removeEventListener('abort',abort);await task?.destroy().catch(()=>{});}
}
