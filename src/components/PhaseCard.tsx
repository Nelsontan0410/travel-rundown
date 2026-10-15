import s from './PhaseCard.module.css';
import { Button, Card } from './Basics';
import { tripPhase } from '../domain/phase';
import { checkTrip } from '../domain/check';
import { statusOf, type TripData } from '../hooks/data';
import { exportBackup } from '../db/repo';
import { downloadBlob } from '../lib/files';
import { docsForItem } from '../domain/rules';
import { departureOf } from '../domain/countdown';
import { Countdown } from './Countdown';

/** 01 顶部的阶段提示：出发前 / 已结束显示；旅行中不显示 */
export default function PhaseCard({ td, now }: { td: TripData; now: Date }) {
  const phase = tripPhase(td.days, now);
  // 倒计时按出发地时间算：目的地时区更早进入行程日时，出发前仍然显示倒计时
  const beforeDeparture = (() => {
    const at = departureOf(td.trip).at;
    return at !== undefined && now.getTime() < at;
  })();
  if (phase.kind === 'during' && !beforeDeparture) return null;

  if (phase.kind === 'before' || beforeDeparture) {
    const dep = departureOf(td.trip);
    const need = td.items.filter((i) => i.type === 'flight' || i.type === 'lodging');
    const done = need.filter((i) => docsForItem(td.docs, i.key).length > 0).length;
    const dayOf = (id: string) => td.dayById.get(id);
    const issues = checkTrip(
      td.items.map((i) => ({
        key: i.key, id: i.id, type: i.type, title: i.title, date: dayOf(i.dayId)?.date ?? '', dayIndex: dayOf(i.dayId)?.index ?? 0,
        start: i.start, fixed: i.fixed, place: i.place, navUrl: i.navUrl, bookingStatus: i.bookingStatus,
        docCount: docsForItem(td.docs, i.key).length,
      })),
    );
    return (
      <Card className={s.wrap}>
        <Countdown at={dep.at} note={dep.assumed ? `按出发日 00:00（${dep.tz}）倒数，可在旅程设置里填准确的出发时间` : `出发时间 ${dep.time}（${dep.tz}）`} />
        <p className={s.sub}>
          {need.length ? `航班和住宿已关联证明 ${done} / ${need.length}` : '这份行程里没有航班或住宿'}
          {issues.length ? `${need.length ? '，' : ''}还有 ${issues.length} 条准备提醒（旅程设置里查看）` : ''}
        </p>
      </Card>
    );
  }

  const states = td.items.map((i) => statusOf(td, i.key));
  const done = states.filter((x) => x === 'done').length;
  const skipped = states.filter((x) => x === 'skipped').length;
  const todo = states.filter((x) => x === 'todo').length;
  const doExport = async () => {
    const blob = await exportBackup();
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    downloadBlob(blob, `travel-rundown-backup-${stamp}.zip`);
  };
  return (
    <Card className={s.wrap}>
      <p className={s.big}>旅程已结束</p>
      <div className={s.row}>
        <div className={s.stat}><span className={s.num}>{done}</span><span className={s.sub}>已完成</span></div>
        <div className={s.stat}><span className={s.num}>{skipped}</span><span className={s.sub}>已跳过</span></div>
        <div className={s.stat}><span className={s.num}>{todo}</span><span className={s.sub}>未标记</span></div>
      </div>
      <Button block variant="outline" icon="Download" onClick={() => void doExport()}>
        导出完整备份
      </Button>
    </Card>
  );
}
