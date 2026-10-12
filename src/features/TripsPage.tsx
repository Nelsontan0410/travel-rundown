import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import p from './Page.module.css';
import { Screen, RootHeader, Menu, Dialog } from '../components/Layout';
import { Button, Card, EmptyState, SectionTitle } from '../components/Basics';
import { Icon } from '../components/Icon';
import { TripCard } from '../components/Cards';
import { useTrips } from '../hooks/data';
import { fmtDateRange, fmtDaysDest, nowIn } from '../domain/format';
import { setLastTrip } from '../db/repo';
import { importMdFile, restoreFromFile } from './importFlow';
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

  const openTrip = async (id: string) => {
    await setLastTrip(id);
    nav('/itinerary');
  };
  const onImportFile = async () => {
    if (await importMdFile()) nav('/import/preview');
  };

  return (
    <Screen tab="trips" header={<RootHeader title="我的旅程" icon="MoreHorizontal" iconLabel="更多" onIcon={() => setMenu(true)} />}>
      <Card className={p.importCard}>
        <Icon name="FileUp" size="xl" color="var(--color-primary)" />
        <h2 className={p.importTitle}>把行程带进来</h2>
        <p className={p.importSub}>导入 AI 已整理好的 Markdown 行程</p>
        <Button block onClick={onImportFile}>
          导入 MD 文件
        </Button>
        <Button block variant="outline" onClick={() => nav('/import/paste')}>
          粘贴行程文字
        </Button>
        <Button variant="link" onClick={() => nav('/import/template')}>
          获取导入模板
        </Button>
      </Card>

      {trips && trips.length > 0 ? (
        <>
          <SectionTitle>已导入旅程</SectionTitle>
          <div className={p.stack}>
            {sortTrips(trips).map((t) => (
              <TripCard
                key={t.id}
                coverKey={t.coverBlobKey}
                title={t.title}
                dateRange={fmtDateRange(t.startDate, t.endDate)}
                meta={fmtDaysDest(t.startDate, t.endDate, t.destination)}
                onOpen={() => void openTrip(t.id)}
              />
            ))}
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
        open={about}
        onClose={() => setAbout(false)}
        title="旅程 Rundown"
        text="V1 · 所有行程和证明只保存在这台设备上。"
        actions={
          <Button variant="outline" onClick={() => setAbout(false)}>
            知道了
          </Button>
        }
      />
    </Screen>
  );
}
