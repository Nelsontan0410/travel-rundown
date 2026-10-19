// 2026-10-19：每日行程 / 预订资料顶部的一行，说明「现在看的是哪份旅程」，并可以切换旅程、邀请同伴。
import { useNavigate } from 'react-router-dom';
import s from './TripSwitchBar.module.css';
import { Icon } from './Icon';
import { useTrips } from '../hooks/data';

export default function TripSwitchBar({ tripId, title }: { tripId: string; title: string }) {
  const nav = useNavigate();
  const trips = useTrips();
  const many = (trips?.length ?? 0) > 1;
  return (
    <nav className={s.bar} aria-label="当前旅程">
      <span className={s.label}>当前旅程</span>
      <strong className={s.title}>{title || '未命名旅程'}</strong>
      <button type="button" className={s.btn} onClick={() => nav(`/trip/${tripId}/settings#sync`)}>
        <Icon name="Upload" size="sm" />
        分享 / 邀请
      </button>
      <button type="button" className={s.btn} onClick={() => nav('/trips')}>
        {many ? '切换' : '全部'}
        <Icon name="ChevronRight" size="sm" />
      </button>
    </nav>
  );
}
