import { useEffect, useRef, useState } from 'react';
import type { Doc } from '../domain/types';
import type { TicketCandidate } from '../domain/flightTicket';
import { PdfPasswordError, readFlightTicketPdf, TicketParseError } from '../lib/flightTicketPdf';
import type { ItineraryCandidate } from '../lib/flightItinerary';
import { decryptBlob } from '../lib/crypto';
import { db } from '../db/schema';
import { Button } from './Basics';
import s from './FlightCountdown.module.css';

interface Props {
  documents: Doc[];
  referenceYear: number;
  // 2026-10-21：行程单认出出发机场时，顺带填入该侧时区（及受支持的国家）；仍需用户核对并保存
  onDates: (dates: { departure?: string; returning?: string; departureTz?: string; returnTz?: string; origin?: string; destination?: string }) => void;
  onBusy: (busy: boolean) => void;
}
type Source = { name: string; read: () => Promise<Blob> };

// 2026-10-19：加了密码的机票也能选。
//  · App 里上锁的证明文件 → 选中后出现「文件密码」，在本机解密后再识别（不保存密码、不改原文件）
//  · PDF 本身有打开密码 → 识别时出现「PDF 密码」，输入后重试
export default function FlightTicketImport({ documents, referenceYear, onDates, onBusy }: Props) {
  const [loading,setLoading]=useState(false);
  const [candidates,setCandidates]=useState<(TicketCandidate&Partial<ItineraryCandidate>)[]>([]);
  const [excerpt,setExcerpt]=useState('');
  const [selected,setSelected]=useState({departure:'',returning:''});
  const [documentId,setDocumentId]=useState('');
  const [filePassword,setFilePassword]=useState('');
  const [pdfPassword,setPdfPassword]=useState('');
  const [needPdfPassword,setNeedPdfPassword]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const operation=useRef<AbortController>();
  const lastSources=useRef<Source[]>([]);
  useEffect(()=>()=>{operation.current?.abort();onBusy(false);},[onBusy]);
  const pdfs=documents.filter(d=>d.kind==='flight'&&d.mime==='application/pdf');
  const chosen=pdfs.find(d=>d.id===documentId);

  async function recognize(sources: Source[], pdfPw?: string) {
    if(!sources.length) return;
    if(sources.length>4) {setError('一次最多选择 4 份机票 PDF。');return;}
    lastSources.current=sources;
    operation.current?.abort();const controller=new AbortController();operation.current=controller;
    setLoading(true);onBusy(true);setError('');setMessage('正在本机读取 PDF…');
    const found:TicketCandidate[]=[];const failures:string[]=[];let askPdfPw=false;const excerpts:string[]=[];
    try {
      for(const source of sources) {
        if(controller.signal.aborted) return;
        try {
          const blob=await source.read();
          const rows=await readFlightTicketPdf(blob,referenceYear,controller.signal,pdfPw||undefined);
          found.push(...rows.map(c=>({...c,id:`${source.name}:${c.id}`,eventId:`${source.name}:${c.eventId}`,source:`${source.name} · 第 ${c.page} 页 · ${c.source}`})));
        } catch(e) {
          if(controller.signal.aborted) return;
          if(e instanceof PdfPasswordError) askPdfPw=true;
          if(e instanceof TicketParseError&&e.excerpt) excerpts.push(`${source.name}：\n${e.excerpt}`);
          failures.push(`${source.name}：${e instanceof Error?e.message:'读取失败，请手动填写。'}`);
        }
      }
      if(controller.signal.aborted) return;
      setNeedPdfPassword(askPdfPw);
      const all=[...candidates];
      for(const candidate of found) if(!all.some(c=>c.local===candidate.local&&c.kind===candidate.kind&&c.ambiguousDate===candidate.ambiguousDate)) all.push(candidate);
      setCandidates(all.slice(0,80));setError(failures.join('\n'));setExcerpt(excerpts.join('\n\n'));
      setMessage(found.length?'已找到候选时间。请选择去程和回程航段，核对下方日期及时区后点击「保存航班时间」。':askPdfPw?'':'未填入时间，现有倒数保持不变。');
    } finally {
      if(!controller.signal.aborted) {setLoading(false);onBusy(false);}
    }
  }

  function savedSource(doc: Doc): Source {
    return {name:doc.title,read:async()=>{
      const record=await db.blobs.get(doc.blobKey);
      if(!record) throw new Error('文件不在本机，请重新选择 PDF。');
      if(!doc.lock) return record.blob;
      if(!filePassword) throw new Error('这份文件已上锁，请先输入文件密码。');
      try { return await decryptBlob(record.blob,doc.lock,filePassword,doc.mime); }
      catch { throw new Error('文件密码不正确，请再试一次。'); }
    }};
  }

  function choose(side: 'departure'|'returning',id:string) {
    const candidate=candidates.find(c=>c.id===id);
    const other=candidates.find(c=>c.id===selected[side==='departure'?'returning':'departure']);
    if(candidate&&other&&candidate.eventId===other.eventId) {setError('同一个航段不能同时作为去程和回程，请选择另一航段。');return;}
    setSelected({...selected,[side]:id});setError('');
    const zone=candidate?.tz?(side==='departure'?{departureTz:candidate.tz,...(candidate.country?{origin:candidate.country}:{})}:{returnTz:candidate.tz,...(candidate.country?{destination:candidate.country}:{})}):{};
    onDates({[side]:candidate?.local??'',...zone});
  }
  return <details className={s.ticketImport}>
    <summary>从 PDF 机票填写时间</summary>
    <div className={s.ticketBody}>
      <p>仅在本机读取文字型 PDF，扫描件暂不支持。识别后先核对起飞航段和出发地时区，保存时才会更新倒数。</p>
      <label className={s.upload}>选择 PDF 机票（可选去程和回程两份）<input type="file" accept="application/pdf,.pdf" multiple disabled={loading} onChange={e=>{const files=Array.from(e.target.files??[]);e.target.value='';setNeedPdfPassword(false);setPdfPassword('');void recognize(files.map(file=>({name:file.name,read:async()=>file})));}} /></label>
      {pdfs.length>0&&<>
        <label>已保存的 PDF 机票<select value={documentId} disabled={loading} onChange={e=>{setDocumentId(e.target.value);setFilePassword('');setNeedPdfPassword(false);setPdfPassword('');setError('');}}><option value="">请选择机票</option>{pdfs.map(d=><option key={d.id} value={d.id}>{d.title}{d.lock?'（已上锁，需要密码）':''}</option>)}</select></label>
        {chosen?.lock&&<label>文件密码{chosen.lock.hint?`（提示：${chosen.lock.hint}）`:''}<input type="password" autoComplete="off" value={filePassword} disabled={loading} placeholder="输入这份文件的密码" onChange={e=>setFilePassword(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&filePassword){e.preventDefault();void recognize([savedSource(chosen)]);}}} /></label>}
        <Button type="button" variant="outline" disabled={loading||!chosen||(!!chosen.lock&&!filePassword)} onClick={()=>{if(!chosen)return;setNeedPdfPassword(false);setPdfPassword('');void recognize([savedSource(chosen)]);}}>{chosen?.lock?'解锁并识别':'识别已保存机票'}</Button>
      </>}
      {needPdfPassword&&<>
        <label>PDF 打开密码<input type="password" autoComplete="off" value={pdfPassword} disabled={loading} placeholder="机票 PDF 的打开密码" onChange={e=>setPdfPassword(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&pdfPassword){e.preventDefault();void recognize(lastSources.current,pdfPassword);}}} /></label>
        <Button type="button" variant="outline" disabled={loading||!pdfPassword} onClick={()=>void recognize(lastSources.current,pdfPassword)}>用这个密码识别</Button>
      </>}
      {message&&<p role="status">{message}</p>}
      {error&&<p className={s.error} role="alert">{error}</p>}
      {error&&excerpt&&<details><summary><small>查看提取到的文字（从航班信息起约 1200 字）</small></summary><pre style={{whiteSpace:'pre-wrap',fontSize:'0.75em'}}>{excerpt}</pre></details>}
      {candidates.length>0&&<>
        {(['departure','returning'] as const).map((side,i)=><label key={side}>{i?'选择回程起飞航段':'选择去程起飞航段'}<select value={selected[side]} disabled={loading} onChange={e=>choose(side,e.target.value)}><option value="">请选择航段</option>{candidates.map(c=><option key={c.id} value={c.id}>{c.local.replace('T',' ')} · {c.kind==='departure'?'起飞候选':'需核对是否起飞'}{c.ambiguousDate?' · 日/月顺序待核对':''}{c.inferredYear?' · 年份待核对':''} · {c.source.slice(0,130)}</option>)}</select></label>)}
        <ul className={s.ticketSources}>{candidates.filter(c=>Object.values(selected).includes(c.id)).map(c=><li key={c.id}><strong>{c.local.replace('T',' ')}</strong><span>{c.source}</span>{(c.ambiguousDate||c.inferredYear)&&<span>请对照机票核对完整日期，避免日/月或年份混淆。</span>}</li>)}</ul>
        <p>候选时间采用机票上的当地时间，不自动猜测机场时区；请在下方核对国家及时区。中转机票请选择你要倒数的起飞航段。</p>
      </>}
    </div>
  </details>;
}
