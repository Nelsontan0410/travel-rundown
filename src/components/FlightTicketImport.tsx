import { useEffect, useRef, useState } from 'react';
import type { Doc } from '../domain/types';
import type { TicketCandidate } from '../domain/flightTicket';
import { readFlightTicketPdf } from '../lib/flightTicketPdf';
import { db } from '../db/schema';
import { Button } from './Basics';
import s from './FlightCountdown.module.css';

interface Props {
  documents: Doc[];
  referenceYear: number;
  onDates: (dates: { departure?: string; returning?: string }) => void;
  onBusy: (busy: boolean) => void;
}
export default function FlightTicketImport({ documents, referenceYear, onDates, onBusy }: Props) {
  const [loading,setLoading]=useState(false);
  const [candidates,setCandidates]=useState<TicketCandidate[]>([]);
  const [selected,setSelected]=useState({departure:'',returning:''});
  const [documentId,setDocumentId]=useState('');
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const operation=useRef<AbortController>();
  useEffect(()=>()=>{operation.current?.abort();onBusy(false);},[onBusy]);
  const pdfs=documents.filter(d=>d.kind==='flight'&&d.mime==='application/pdf');
  async function recognize(sources: {name:string;read:()=>Promise<Blob>}[]) {
    if(!sources.length) return;
    if(sources.length>4) {setError('一次最多选择 4 份机票 PDF。');return;}
    operation.current?.abort();const controller=new AbortController();operation.current=controller;
    setLoading(true);onBusy(true);setError('');setMessage('正在本机读取 PDF…');
    const found:TicketCandidate[]=[];const failures:string[]=[];
    try {
      for(const source of sources) {
        if(controller.signal.aborted) return;
        try {
          const blob=await source.read();
          const rows=await readFlightTicketPdf(blob,referenceYear,controller.signal);
          found.push(...rows.map(c=>({...c,id:`${source.name}:${c.id}`,eventId:`${source.name}:${c.eventId}`,source:`${source.name} · 第 ${c.page} 页 · ${c.source}`})));
        } catch(e) {
          if(controller.signal.aborted) return;
          failures.push(`${source.name}：${e instanceof Error?e.message:'读取失败，请手动填写。'}`);
        }
      }
      if(controller.signal.aborted) return;
      const all=[...candidates];
      for(const candidate of found) if(!all.some(c=>c.local===candidate.local&&c.kind===candidate.kind&&c.ambiguousDate===candidate.ambiguousDate)) all.push(candidate);
      setCandidates(all.slice(0,80));setError(failures.join('\n'));
      setMessage(found.length?'已找到候选时间。请选择去程和回程航段，核对下方日期及时区后点击「保存航班时间」。':'未填入时间，现有倒数保持不变。');
    } finally {
      if(!controller.signal.aborted) {setLoading(false);onBusy(false);}
    }
  }
  function choose(side: 'departure'|'returning',id:string) {
    const candidate=candidates.find(c=>c.id===id);
    const other=candidates.find(c=>c.id===selected[side==='departure'?'returning':'departure']);
    if(candidate&&other&&candidate.eventId===other.eventId) {setError('同一个航段不能同时作为去程和回程，请选择另一航段。');return;}
    setSelected({...selected,[side]:id});setError('');onDates({[side]:candidate?.local??''});
  }
  return <details className={s.ticketImport}>
    <summary>从 PDF 机票填写时间</summary>
    <div className={s.ticketBody}>
      <p>仅在本机读取文字型 PDF，扫描件暂不支持。识别后先核对起飞航段和出发地时区，保存时才会更新倒数。</p>
      <label className={s.upload}>选择 PDF 机票（可选去程和回程两份）<input type="file" accept="application/pdf,.pdf" multiple disabled={loading} onChange={e=>{const files=Array.from(e.target.files??[]);e.target.value='';void recognize(files.map(file=>({name:file.name,read:async()=>file})));}} /></label>
      {pdfs.length>0&&<>
        <label>已保存的 PDF 机票<select value={documentId} disabled={loading} onChange={e=>setDocumentId(e.target.value)}><option value="">请选择机票</option>{pdfs.map(d=><option key={d.id} value={d.id} disabled={!!d.lock}>{d.title}{d.lock?'（已加密，请先解锁文件）':''}</option>)}</select></label>
        <Button type="button" variant="outline" disabled={loading||!documentId} onClick={()=>{const doc=pdfs.find(d=>d.id===documentId);if(!doc||doc.lock)return;void recognize([{name:doc.title,read:async()=>{const record=await db.blobs.get(doc.blobKey);if(!record)throw new Error('文件不在本机，请重新选择 PDF。');return record.blob;}}]);}}>识别已保存机票</Button>
      </>}
      {message&&<p role="status">{message}</p>}
      {error&&<p className={s.error} role="alert">{error}</p>}
      {candidates.length>0&&<>
        {(['departure','returning'] as const).map((side,i)=><label key={side}>{i?'选择回程起飞航段':'选择去程起飞航段'}<select value={selected[side]} disabled={loading} onChange={e=>choose(side,e.target.value)}><option value="">请选择航段</option>{candidates.map(c=><option key={c.id} value={c.id}>{c.local.replace('T',' ')} · {c.kind==='departure'?'起飞候选':'需核对是否起飞'}{c.ambiguousDate?' · 日/月顺序待核对':''}{c.inferredYear?' · 年份待核对':''} · {c.source.slice(0,130)}</option>)}</select></label>)}
        <ul className={s.ticketSources}>{candidates.filter(c=>Object.values(selected).includes(c.id)).map(c=><li key={c.id}><strong>{c.local.replace('T',' ')}</strong><span>{c.source}</span>{(c.ambiguousDate||c.inferredYear)&&<span>请对照机票核对完整日期，避免日/月或年份混淆。</span>}</li>)}</ul>
        <p>候选时间采用机票上的当地时间，不自动猜测机场时区；请在下方核对国家及时区。中转机票请选择你要倒数的起飞航段。</p>
      </>}
    </div>
  </details>;
}
