import { memo, useEffect, useRef, useState } from 'react';
import { Plane, MapPin, Settings2 } from 'lucide-react';
import type { TripData } from '../hooks/data';
import type { FlightCountdownSettings } from '../domain/types';
import { asset, countries, countryOf, crossedDeparture, flightPhase, fromLocal, localTime, validFlightSettings, validZone } from '../domain/flightCountdown';
import { remaining } from '../domain/countdown';
import { setFlightCountdown } from '../db/repo';
import { Sheet } from './Layout';
import { Button, StatusChip } from './Basics';
import s from './FlightCountdown.module.css';
import credits from '../../public/landing/flight-countdown/credits.json';

const Scenery = memo(function Scenery({ origin, destination }: { origin: string; destination: string }) {
  return <div className={s.scenery} aria-hidden="true">{[origin, destination].map((code, i) => <div className={i ? s.rightImage : s.leftImage} key={i}>
    {countryOf(code) && <><img className={s.landmark} src={asset(code, 'landmark')} alt="" /><img className={s.flag} src={asset(code, 'flag')} alt="" /></>}
  </div>)}<div className={s.blend} /></div>;
});

function Clock({ value, demo = false }: { value: FlightCountdownSettings; demo?: boolean }) {
  const [now, setNow] = useState(Date.now);
  const previous = useRef(now);
  const transition = useRef<number>();
  const visible = useRef(document.visibilityState === 'visible');
  useEffect(() => {
    const tick = () => {
      const next = Date.now();
      const isVisible = document.visibilityState === 'visible';
      if (!isVisible || !visible.current) transition.current = undefined;
      if (crossedDeparture(value.departureAt, previous.current, next, isVisible && visible.current)
        && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) transition.current = next;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) transition.current = undefined;
      previous.current = next;
      visible.current = isVisible;
      setNow(next);
    };
    const timer = window.setInterval(tick, 200);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); window.removeEventListener('focus', tick); };
  }, [value.departureAt]);
  const phase = flightPhase(value, now, transition.current);
  const at = phase === 'before' ? value.departureAt : value.returnAt;
  const tz = phase === 'before' ? value.departureTz : value.returnTz;
  const r = remaining(at, now)!;
  const title = phase === 'before' ? '距离去程起飞' : phase === 'flying' ? `正在飞往${countryOf(value.destination)!.zh}` : phase === 'vacation' ? '开始玩乐！距离回程起飞' : '旅程已结束';
  return <>
    <div className={s.information} data-flight-phase={phase}>
      <p className={s.heading} aria-live="polite">{demo ? `演示 · ${title}` : title}</p>
      <p className={s.date}>{phase === 'flying' ? '即将开启你的旅程' : `${localTime(at, tz).replace('T', ' ')} · ${tz}`}</p>
      {phase !== 'flying' && phase !== 'ended' && <div className={s.numbers} role="timer" aria-label={`${r.days}天 ${r.hours}小时 ${r.minutes}分钟 ${r.seconds}秒`}>
        {[[r.days, '天'], [r.hours, '小时'], [r.minutes, '分钟'], [r.seconds, '秒']].map(([v, unit]) => <div key={unit}><strong>{String(v).padStart(2, '0')}</strong><span>{unit}</span></div>)}
      </div>}
      {phase === 'flying' && <p className={s.transitionNote}>起飞过场 · 随后切换回程倒数</p>}
    </div>
    <div className={`${s.route} ${phase === 'flying' ? s.flying : ''} ${phase === 'vacation' || phase === 'ended' ? s.arrived : ''}`} data-flight-route={phase} aria-hidden="true">
      <div className={s.trail} /><span className={s.aircraft}><Plane size={34} /></span>
    </div>
  </>;
}

type Draft = { origin: string; destination: string; departure: string; returning: string; departureTz: string; returnTz: string };
function initialDraft(td: TripData): Draft {
  const v = td.trip.flightCountdown;
  if (validFlightSettings(v)) return { origin: v.origin, destination: v.destination, departure: localTime(v.departureAt,v.departureTz), returning: localTime(v.returnAt,v.returnTz), departureTz: v.departureTz, returnTz:v.returnTz };
  // Known trip fields prefill the form only. Never invent a return flight from the trip end date.
  const origin = countries.find(c => c.tz === td.trip.homeTz);
  const destination = countries.find(c => td.trip.destination === c.zh || td.trip.destination === c.en);
  return { origin: origin?.code ?? '', destination: destination?.code ?? '', departure: td.trip.departTime ? `${td.trip.startDate}T${td.trip.departTime}` : '', returning: '', departureTz: td.trip.homeTz || 'UTC', returnTz: destination?.tz ?? td.days[0]?.tz ?? 'UTC' };
}

export default function FlightCountdown({ td, dateRange, offline }: { td: TripData; dateRange?: string; offline?: boolean }) {
  const value = validFlightSettings(td.trip.flightCountdown) ? td.trip.flightCountdown : undefined;
  const [editing, setEditing] = useState(false);
  const [demo, setDemo] = useState<FlightCountdownSettings>();
  useEffect(() => {
    if (!demo) return;
    const timer = window.setTimeout(() => { setDemo(undefined); setNotice('演示结束，已恢复真实航班状态。'); }, 8500);
    return () => window.clearTimeout(timer);
  }, [demo]);
  const [pick, setPick] = useState<'origin' | 'destination'>();
  const [draft, setDraft] = useState(() => initialDraft(td));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const defaults = initialDraft(td);
  const origin = demo?.origin ?? value?.origin ?? defaults.origin;
  const destination = demo?.destination ?? value?.destination ?? defaults.destination;
  function preview() {
    const now = Date.now();
    setDemo({ origin: origin || 'SG', destination: destination || 'JP', departureTz: value?.departureTz ?? 'Asia/Singapore', returnTz: value?.returnTz ?? 'Asia/Tokyo', departureAt: now + 1500, returnAt: now + 86400000 });
    setNotice(window.matchMedia('(prefers-reduced-motion: reduce)').matches ? '系统已开启减少动态效果，演示将跳过飞行移动。' : '正在演示起飞过程；真实航班时间和保存数据保持不变。');
  }
  function openSettings() { setDemo(undefined); setDraft(initialDraft(td)); setError(''); setEditing(true); }
  async function choose(code: string) {
    if (!pick) return;
    if (!value) {
      setDraft({ ...initialDraft(td), [pick]: code, [pick === 'origin' ? 'departureTz' : 'returnTz']: countryOf(code)!.tz });
      setPick(undefined); setEditing(true); return;
    }
    const next = { ...value, [pick]: code, [pick === 'origin' ? 'departureTz' : 'returnTz']: countryOf(code)!.tz };
    setBusy(true); setError('');
    try { await setFlightCountdown(td.trip.id, next); setPick(undefined); setNotice('国家已更新；真实起飞时刻不变，显示已换为新国家当地时间。'); }
    catch (e) { setError(e instanceof Error ? e.message : '保存失败，请重试。'); }
    finally { setBusy(false); }
  }
  function changeCountry(side: 'origin' | 'destination', code: string) {
    const zoneKey = side === 'origin' ? 'departureTz' : 'returnTz';
    const timeKey = side === 'origin' ? 'departure' : 'returning';
    const tz = countryOf(code)?.tz ?? draft[zoneKey];
    const at = fromLocal(draft[timeKey], draft[zoneKey]);
    setDraft({ ...draft, [side]:code, [zoneKey]:tz, [timeKey]:Number.isFinite(at) ? localTime(at,tz) : draft[timeKey] });
  }
  async function save(e: React.FormEvent) {
    e.preventDefault(); setError('');
    const next = { origin:draft.origin, destination:draft.destination, departureTz:draft.departureTz, returnTz:draft.returnTz, departureAt:fromLocal(draft.departure,draft.departureTz), returnAt:fromLocal(draft.returning,draft.returnTz) };
    if (!validFlightSettings(next)) { setError('请填写有效的国家、IANA 时区和当地时间，回程须晚于去程。夏令时跳过或重复的时刻请改用明确的 UTC 时间。'); return; }
    setBusy(true);
    try { await setFlightCountdown(td.trip.id,next); setEditing(false); setNotice(next.returnAt <= Date.now() ? '已保存：回程起飞时刻已过，当前显示旅程已结束。可点预览查看起飞动画。' : next.departureAt <= Date.now() ? '已保存：去程起飞时刻已过，直接显示回程倒数，不重复播放起飞。' : '已保存。保持本页打开，去程到点后飞机将飞往右侧 Pin。'); }
    catch(e) { setError(e instanceof Error ? e.message : '保存失败，请重试。'); }
    finally { setBusy(false); }
  }
  return <section className={s.module} aria-label="航班倒计时">
    <div className={s.card}>
      <Scenery origin={origin} destination={destination} />
      <button className={s.edit} aria-label="设置航班时间" onClick={openSettings}><Settings2 size={20} /></button>
      {demo || value ? <Clock key={JSON.stringify(demo ?? value)} value={(demo ?? value)!} demo={!!demo} /> : <div className={s.information}><p className={s.heading}>下一段旅程，从这里开始</p><p className={s.date}>设置去程与回程起飞时间，开启准确倒数</p><Button variant="outline" onClick={openSettings}>设置航班时间</Button></div>}
      {!demo && !value && <div className={s.route} aria-hidden="true"><span className={s.aircraft}><Plane size={34} /></span></div>}
      {(['origin','destination'] as const).map((side,i) => {
        const code = i ? destination : origin;
        const c = countryOf(code);
        return <button key={side} className={`${s.pin} ${i ? s.destination : s.origin}`} aria-label={i ? '修改目的地国家' : '修改出发国家'} onClick={() => {setDemo(undefined);setError('');setPick(side);}}>
          <span className={s.pinIcon}><MapPin size={46} fill="var(--color-surface)" />{c && <img src={asset(code,'flag')} alt="" />}</span>
          <strong>{c?.en ?? (i ? '目的地' : '出发地')}</strong><span>{c?.zh ?? '选择国家'}</span>
        </button>;
      })}
    </div>
    <div className={s.footer}>
      {dateRange && <span>{dateRange}</span>}
      {offline && <StatusChip variant="success">行程已离线保存</StatusChip>}
      <button type="button" className={s.preview} onClick={() => { if (demo) { setDemo(undefined); setNotice('已恢复真实航班状态。'); } else preview(); }}>{demo ? '返回真实倒数' : '预览起飞动画'}</button>
    </div>
    <p className={s.notice} role="status">{notice}</p>
    <details className={s.credits}><summary>地标照片来源</summary><ul>{credits.filter(c => c.country === origin || c.country === destination).map(c => <li key={c.country}><a href={c.source} target="_blank" rel="noreferrer">{countryOf(c.country)?.landmark}</a> · {c.author} · <a href={c.license_url || c.source} target="_blank" rel="noreferrer">{c.license}</a>（已缩小、裁切与渐隐）</li>)}</ul></details>
    <Sheet open={!!pick} onClose={() => !busy && setPick(undefined)} title={pick === 'origin' ? '选择出发国家' : '选择目的地国家'}>
      <div className={s.form}><p>每国一个固定地标。切换国家保留真实起飞时刻，并换算为该国默认时区。</p>
        <div className={s.countryGrid}>{countries.map(c => <button disabled={busy} key={c.code} onClick={() => void choose(c.code)} aria-pressed={(pick === 'origin' ? origin : destination) === c.code}><img src={asset(c.code,'flag')} alt="" /><span>{c.zh}<small>{c.en}</small></span></button>)}</div>
        {error && <p role="alert">{error}</p>}<Button variant="outline" disabled={busy} onClick={() => setPick(undefined)}>关闭</Button>
      </div>
    </Sheet>
    <Sheet open={editing} onClose={() => !busy && setEditing(false)} title="航班时间设置">
      <form className={s.form} onSubmit={e => void save(e)}>
        <p>时间按各航段出发地的当地时区填写。国家采用默认时区；多时区国家可在下方调整。切换国家会换算已填写的有效时间，保持真实起飞时刻。</p>
        {(['origin','destination'] as const).map((side,i) => <label key={side}>{i ? '目的地国家' : '出发国家'}<select required value={draft[side]} onChange={e => changeCountry(side,e.target.value)}><option value="">请选择国家</option>{countries.map(c=><option key={c.code} value={c.code}>{c.zh} · {c.en}</option>)}</select></label>)}
        <label>去程起飞（当地时间）<input required type="datetime-local" value={draft.departure} onChange={e=>setDraft({...draft,departure:e.target.value})} /></label>
        <label>去程 IANA 时区<input required value={draft.departureTz} aria-invalid={!validZone(draft.departureTz)} onChange={e=>setDraft({...draft,departureTz:e.target.value})} /></label>
        <label>回程起飞（当地时间）<input required type="datetime-local" value={draft.returning} onChange={e=>setDraft({...draft,returning:e.target.value})} /></label>
        <label>回程 IANA 时区<input required value={draft.returnTz} aria-invalid={!validZone(draft.returnTz)} onChange={e=>setDraft({...draft,returnTz:e.target.value})} /></label>
        <p>直接修改时区会按新时区解释上面的当地时间。此设置仅用于航班卡，不改动原行程日期。</p>
        {error && <p role="alert" className={s.error}>{error}</p>}
        <div className={s.actions}><Button variant="outline" disabled={busy} onClick={()=>setEditing(false)}>取消</Button><Button type="submit" disabled={busy}>{busy ? '保存中…' : '保存航班时间'}</Button></div>
      </form>
    </Sheet>
  </section>;
}
