import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import p from './Page.module.css';
import { Screen, BackHeader, Dialog } from '../components/Layout';
import { Button, Card, InfoBanner } from '../components/Basics';
import { ReadinessRow, SettingsGroup, SettingsRow } from '../components/Cards';
import { Icon } from '../components/Icon';
import { readiness, useAppShellReady, useBlobUrl, useTripData } from '../hooks/data';
import { fmtDateRange, fmtDaysDest } from '../domain/format';
import { navAppsUsed, TRANSLATE_LANGS } from '../links/linkLabel';
import { deleteTrip, exportBackup, setCover, setTranslateTo } from '../db/repo';
import { downloadBlob, pickFile, prepareFile } from '../lib/files';
import { restoreFromFile } from './importFlow';
import { ChoiceSheet } from './Sheets';
import { useUI } from '../store/ui';
import CheckList from '../components/CheckList';
import { checkTrip } from '../domain/check';
import { docsForItem } from '../domain/rules';
import type { TranslateLang } from '../domain/types';

/** 05 旅程设置（从 01 的设置图标进入） */
export default function TripSettingsPage() {
  const nav = useNavigate();
  const { tripId } = useParams();
  const td = useTripData(tripId);
  const app = useAppShellReady();
  const cover = useBlobUrl(td?.trip.coverBlobKey);
  const [langSheet, setLangSheet] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const setPaste = useUI((s) => s.setPasteText);

  if (td === null) return <Navigate to="/trips" replace />;
  if (!td) return <Screen tab="trips" header={<BackHeader title="旅程设置" />}>{null}</Screen>;

  const { trip } = td;
  const r = readiness(td, app);
  const navApps = navAppsUsed(td.items.map((i) => i.navUrl));
  const lang = TRANSLATE_LANGS.find((l) => l.code === trip.translate.to) ?? TRANSLATE_LANGS[0];
  const filesOk = r.filesSaved === r.filesTotal;
  const issues = checkTrip(
    td.items.map((i) => {
      const d = td.dayById.get(i.dayId);
      return {
        key: i.key, id: i.id, type: i.type, title: i.title, date: d?.date ?? '', dayIndex: d?.index ?? 0,
        start: i.start, fixed: i.fixed, place: i.place, navUrl: i.navUrl, bookingStatus: i.bookingStatus,
        docCount: docsForItem(td.docs, i.key).length,
      };
    }),
  );

  const pickCover = async () => {
    const f = await pickFile('image/*');
    if (!f) return;
    try {
      await setCover(trip.id, await prepareFile(f));
    } catch {
      /* 超过 20 MiB 时不设置 */
    }
  };
  const doExport = async () => {
    const blob = await exportBackup();
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    downloadBlob(blob, `travel-rundown-backup-${stamp}.zip`);
  };

  return (
    <Screen tab="trips" header={<BackHeader title="旅程设置" />}>
      <div className={p.summary}>
        <button type="button" className={p.thumb} aria-label="更换封面" onClick={() => void pickCover()}>
          {cover ? <img src={cover} alt="" /> : <Icon name="Building2" />}
        </button>
        <div style={{ minWidth: 0 }}>
          <p className={p.sumName}>{trip.title}</p>
          <p className={p.sumLine}>{fmtDateRange(trip.startDate, trip.endDate)}</p>
          <p className={p.sumLine}>{fmtDaysDest(trip.startDate, trip.endDate, trip.destination)}</p>
        </div>
      </div>

      <SettingsGroup title="外部工具" note="导航和翻译将在外部应用或网页中打开。">
        <SettingsRow icon="Navigation" label="导航工具" value={navApps.length ? navApps.join('、') : '—'} arrow={false} />
        <SettingsRow icon="Languages" label="翻译工具" value="Google Translate" arrow={false} />
        <SettingsRow icon="Globe" label="翻译语言" value={`自动识别 → ${lang.label}`} onClick={() => setLangSheet(true)} />
      </SettingsGroup>

      <SettingsGroup
        title="离线准备"
        after={
          <div className={p.mt8}>
            <InfoBanner variant="info">仅已保存的资料可离线查看；外部工具需按其自身条件使用。</InfoBanner>
          </div>
        }
      >
        <ReadinessRow icon="FileText" label="应用页面" state={r.app ? 'ok' : 'grey'} text={r.app ? '可离线打开' : '准备中'} />
        <ReadinessRow icon="CalendarDays" label="行程资料" state="ok" text="已保存" />
        <ReadinessRow
          icon="Paperclip"
          label="附件文件"
          state={filesOk ? 'ok' : 'warn'}
          text={`${r.filesSaved} / ${r.filesTotal} 已保存`}
        />
      </SettingsGroup>

      <h2 className={p.mt24} style={{ fontSize: 'var(--fs-section)', fontWeight: 'var(--fw-section)', marginBottom: 'var(--space-2)' }}>
        准备检查
      </h2>
      <CheckList issues={issues} onPick={(i) => i.itemId && nav(`/item/${i.itemId}`)} />

      <h2 className={p.mt24} style={{ fontSize: 'var(--fs-section)', fontWeight: 'var(--fw-section)', marginBottom: 'var(--space-2)' }}>
        备份与恢复
      </h2>
      <Card className={p.backupCard}>
        <Button block variant="outline" icon="Download" onClick={() => void doExport()}>
          导出完整备份
        </Button>
        <Button variant="link" chevron={false} onClick={() => void restoreFromFile()}>
          恢复备份
        </Button>
      </Card>
      <p className={p.mt8} style={{ fontSize: 'var(--fs-caption)', color: 'var(--color-text-2)' }}>
        备份包含行程、预订证明和完成状态。
      </p>

      <SettingsGroup title="管理">
        <SettingsRow
          icon="Upload"
          label="重新导入行程"
          onClick={() => {
            setPaste(trip.sourceMd);
            nav(`/import/paste?trip=${trip.id}`);
          }}
        />
        <SettingsRow icon="Trash2" label="删除这个旅程" danger onClick={() => setConfirmDel(true)} />
      </SettingsGroup>

      <ChoiceSheet
        open={langSheet}
        title="翻译语言"
        options={TRANSLATE_LANGS.map((l) => ({ value: l.code as TranslateLang, label: l.label }))}
        value={trip.translate.to}
        onPick={(v) => void setTranslateTo(trip.id, v)}
        onClose={() => setLangSheet(false)}
      />
      <Dialog
        open={confirmDel}
        title="删除这个旅程？"
        text="行程、证明文件和完成状态都会从本机删除，无法恢复。建议先导出备份。"
        actions={
          <>
            <Button variant="outline" onClick={() => setConfirmDel(false)}>
              取消
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                setConfirmDel(false);
                await deleteTrip(trip.id);
                nav('/trips', { replace: true });
              }}
            >
              删除
            </Button>
          </>
        }
      />
    </Screen>
  );
}
