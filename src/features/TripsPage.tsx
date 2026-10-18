import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import p from './Page.module.css';
import { Screen, RootHeader, Menu, Dialog } from '../components/Layout';
import { Button, Card, EmptyState, SectionTitle } from '../components/Basics';
import { Icon } from '../components/Icon';
import { TripDeck, type DeckTrip } from '../components/TripDeck';
import { useTripCovers, useTrips } from '../hooks/data';
import { fmtDateRange, isIsoDate, nowIn } from '../domain/format';
import { deleteTrip, setLastTrip } from '../db/repo';
import { toast } from '../store/ui';
import { importFile, restoreFromFile } from './importFlow';
import { JoinCard } from './CloudParts';
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
  const onImportFile = async () => {
    if (await importFile()) nav('/import/preview');
  };

  return (
    <Screen tab="trips" header={<RootHeader title="我的旅程" icon="MoreHorizontal" iconLabel="更多" onIcon={() => setMenu(true)} />}>
      <Card className={p.importCard}>
        <Icon name="FileUp" size="xl" color="var(--color-primary)" />
        <h2 className={p.importTitle}>把行程带进来</h2>
        <p className={p.importSub}>支持 Markdown、JSON、CSV 文件，或直接粘贴文字</p>
        <Button block onClick={onImportFile}>
          导入文件
        </Button>
        <Button block variant="outline" onClick={() => nav('/import/paste')}>
          粘贴行程文字
        </Button>
        <Button variant="link" onClick={() => nav('/import/template')}>
          获取导入模板
        </Button>
      </Card>

      <div className={p.mt12}>
        <JoinCard />
      </div>

      {trips && trips.length > 0 ? (
        <>
          <SectionTitle>已导入旅程</SectionTitle>
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
            <Button block variant="outline" icon="RotateCcw" onClick={() => void restoreFromFile()}>
              恢复备份
            </Button>
          </div>
        </>
      ) : (
        trips && (
          <>
            <EmptyState compact title="还没有旅程" />
            <Button block variant="outline" icon="RotateCcw" onClick={() => void restoreFromFile()}>
              恢复备份
            </Button>
          </>
        )
      )}

      <Menu
        open={menu}
        onClose={() => setMenu(false)}
        items={[
          { label: '获取导入模板', onClick: () => nav('/import/template') },
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
