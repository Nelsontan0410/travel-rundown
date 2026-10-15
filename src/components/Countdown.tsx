// 修订 2026-10 · ISSUE-002：四单位实时倒计时。每秒按真实时间重算（不累加），切回页面立即重算。
import { useEffect, useState } from 'react';
import s from './Countdown.module.css';
import { remaining } from '../domain/countdown';

const pad = (n: number) => String(n).padStart(2, '0');

export function Countdown({ at, note }: { at?: number; note?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const t = window.setInterval(tick, 1000);
    const vis = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('focus', tick);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', vis);
      window.removeEventListener('focus', tick);
    };
  }, []);
  const r = remaining(at, now);
  if (!r) return <p className={s.missing}>还没有出发日期，无法倒数</p>;
  if (r.started) return <p className={s.started}>旅程已开始</p>;
  const units: [number, string, string][] = [
    [r.days, 'DAYS', '天'],
    [r.hours, 'HOURS', '时'],
    [r.minutes, 'MINUTES', '分'],
    [r.seconds, 'SECONDS', '秒'],
  ];
  return (
    <div className={s.wrap}>
      <p className={s.label}>距离出发</p>
      <div className={s.grid} role="timer" aria-label={`距离出发 ${r.days} 天 ${r.hours} 小时 ${r.minutes} 分 ${r.seconds} 秒`}>
        {units.map(([v, en, zh], i) => (
          <div key={en} className={`${s.unit} ${i === 0 ? s.days : ''}`}>
            <span className={s.num}>{i === 0 ? v : pad(v)}</span>
            <span className={s.unitLabel}>
              {en} / {zh}
            </span>
          </div>
        ))}
      </div>
      {note && <p className={s.note}>{note}</p>}
    </div>
  );
}
