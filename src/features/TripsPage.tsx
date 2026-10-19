import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import p from './Page.module.css';
import { Screen, RootHeader, Menu, Dialog } from '../components/Layout';
import { Button, SectionTitle } from '../components/Basics';
import { TripDeck, type DeckTrip } from '../components/TripDeck';
import { useTripCovers, useTrips } from '../hooks/data';
import { fmtDateRange, isIsoDate, nowIn } from '../domain/format';
import { deleteTrip, setLastTrip } from '../db/repo';
import { toast } from '../store/ui';
import { restoreFromFile } from './importFlow';
import { CreateOrJoin, NewUserHome } from './FirstRun';
import type { Trip } from '../domain/types';

/** 排序：没结束的旅程按开始日期升序排前面，已结束的按开始日期降序排后面 */
function sortTrips(trips: Trip[]): Trip[] {
  const today = nowIn(Intl.DateTimeFormat().resolvedOptions().timeZone).date;
  const live = trips.filter((t) => t.endDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const done = trips.filter((t) => t.endDate < today).sort((a, b) => b.startDate.localeCompare(a.startDate));
  return [...live, ...done];
}

/** 04 旅程与导入（旅程 Tab 的首页） */
export default function TripsPage() {
  const nav = useNavigate();
  const trips = useTrips();
  const [menu, setMenu] = useState(false);
  const [about, setAbout] = useState(false);
  const covers = useTripCovers();
  const [toDelete, setToDelete] = useState<DeckTrip | null>(null);

  const openTrip = async (id: string) => {
    await setLastTrip(id);
    nav('/itinerary');
  };
  const { hash } = useLocation();
  // 从其他页的「用邀请码加入」进来：滚到加入区块
  useEffect(() => {
    if (hash !== '#join' || !trips) return;
    const t = setTimeout(() => {
      document.getElementById('join')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      document.getElementById('join-code')?.focus({ preventScroll: true });
    }, 200);
    return () => clearTimeout(t);
  }, [hash, trips]);

  // 2026-10-19 首页：有旅程的人先看到自己的旅程；没有旅程时只给两条路「创建」「加入」。恢复备份放进右上角菜单。
  return (
    <Screen tab="trips" header={<RootHeader title="我的旅程" icon="MoreHorizontal" iconLabel="更多" onIcon={() => setMenu(true)} />}>
      {trips === undefined ? null : trips.length > 0 ? (
        <>
          <SectionTitle first>我的旅程（{trips.length}）</SectionTitle>
          <div className={p.stack}>
            <TripDeck
              trips={sortTrips(trips).map((t) => ({
                id: t.id,
                title: t.title || '未命名旅程',
                dates: isIsoDate(t.startDate) && isIsoDate(t.endDate) ? fmtDateRange(t.startDate, t.endDate) : '日期未设置',
                people: t.participants ? `${t.participants} 人` : '人数未设置',
                cover: covers?.get(t.id),
              }))}
              onOpen={(id) => void openTrip(id)}
              onDelete={(t) => setToDelete(t)}
            />
          </div>
          <SectionTitle>新建或加入</SectionTitle>
          <CreateOrJoin />
        </>
      ) : (
        <NewUserHome />
      )}

      <Menu
        open={menu}
        onClose={() => setMenu(false)}
        items={[
          { label: '恢复备份', onClick: () => restoreFromFile() },
          { label: '示例与模板', onClick: () => nav('/import/template') },
          { label: '关于', onClick: () => setAbout(true) },
        ]}
      />
      <Dialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title={`删除「${toDelete?.title ?? ''}」？`}
        text={`将删除这份旅程（${toDelete?.dates ?? ''}）的行程、完成状态、预订证明和账本，删除后无法恢复。其他旅程不受影响。`}
        actions={
          <>
            <Button variant="outline" onClick={() => setToDelete(null)}>
              取消
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const t = toDelete;
                setToDelete(null);
                if (t) void deleteTrip(t.id).then(() => toast(`已删除「${t.title}」`));
              }}
            >
              删除
            </Button>
          </>
        }
      />
      <Dialog
        open={about}
        onClose={() => setAbout(false)}
        title="旅程 Rundown"
        text="行程和证明保存在这台设备上，没网也能用。开启同步后，主用户发布的版本和共享文件会存到云端，供被邀请的同伴下载。"
        actions={
          <Button variant="outline" onClick={() => setAbout(false)}>
            知道了
          </Button>
        }
      />
    </Screen>
  );
}
