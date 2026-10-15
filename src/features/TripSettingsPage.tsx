import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import p from './Page.module.css';
import { TripThemeScope } from '../components/TripTheme';
import { Screen, BackHeader, Dialog, Sheet } from '../components/Layout';
import { Field, FormActions, TextInput } from '../components/Form';
import { Button, Card, InfoBanner } from '../components/Basics';
import { ReadinessRow, SettingsGroup, SettingsRow } from '../components/Cards';
import { Icon } from '../components/Icon';
import { readiness, useAppShellReady, useBlobUrl, useSettings, useTripData, useTripPackageInfo } from '../hooks/data';
import { addDays, daysBetween, fmtDate, fmtDateRange, fmtDaysDest, fmtMoney } from '../domain/format';
import { TRANSLATE_LANGS } from '../links/linkLabel';
import { NAV_APP_NAME } from '../importer/promptTemplate';
import { deleteTrip, exportBackup, exportTripPackage, setCover, setDepartTime, setParticipants, setTranslateTo, setTripTheme, shiftTripStart } from '../db/repo';
import { THEME_LABEL } from '../components/TripTheme';
import { toast } from '../store/ui';
import { downloadBlob, pickFile, prepareFile } from '../lib/files';
import { restoreFromFile } from './importFlow';
import { ChoiceSheet } from './Sheets';
import { useUI } from '../store/ui';
import { useStorageInfo } from '../hooks/storage';
import CheckList from '../components/CheckList';
import { checkTrip } from '../domain/check';
import { docsForItem } from '../domain/rules';
import { DEFAULT_SETTINGS, type TranslateLang, type TripTheme } from '../domain/types';

/** 05 旅程设置（从 01 的设置图标进入） */
export default function TripSettingsPage() {
  const nav = useNavigate();
  const { tripId } = useParams();
  const td = useTripData(tripId);
  const app = useAppShellReady();
  const cover = useBlobUrl(td?.trip.coverBlobKey);
  const [langSheet, setLangSheet] = useState(false);
  const [themeSheet, setThemeSheet] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const setPaste = useUI((s) => s.setPasteText);
  const storage = useStorageInfo();
  const settings = useSettings() ?? DEFAULT_SETTINGS;
  const [dateSheet, setDateSheet] = useState(false);
  const [newStart, setNewStart] = useState('');
  const [factSheet, setFactSheet] = useState<'people' | 'time' | null>(null);
  const [factVal, setFactVal] = useState('');
  const [exportSheet, setExportSheet] = useState(false);
  const pkg = useTripPackageInfo(tripId);

  if (td === null) return <Navigate to="/trips" replace />;
  if (!td) return <Screen tab="trips" header={<BackHeader title="旅程设置" />}>{null}</Screen>;

  const { trip } = td;
  const r = readiness(td, app);
  const navApps =
    settings.navElsewhere === settings.navInChina
      ? NAV_APP_NAME[settings.navElsewhere]
      : `${NAV_APP_NAME[settings.navElsewhere]}（中国大陆：${NAV_APP_NAME[settings.navInChina]}）`;
  const span = daysBetween(trip.startDate, trip.endDate);
  const saveStart = async () => {
    if (!newStart || newStart === trip.startDate) return setDateSheet(false);
    await shiftTripStart(trip.id, newStart);
    setDateSheet(false);
    toast('行程日期已更新');
  };
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
  const stamp = () => {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  };
  const doExport = async () => {
    setExportSheet(false);
    downloadBlob(await exportBackup(), `travel-rundown-backup-${stamp()}.zip`);
  };
  const doExportTrip = async (attachments: boolean) => {
    setExportSheet(false);
    const safe = trip.title.replace(/[\\/:*?"<>|\s，,]+/g, '-').replace(/^-+|-+$/g, '') || 'trip';
    downloadBlob(await exportTripPackage(trip.id, { attachments }), `旅行包-${safe}-${stamp()}-${attachments ? '含附件' : '不含附件'}.zip`);
    toast(attachments ? '已导出旅行包（含附件）' : '已导出旅行包（不含附件）');
  };
  const mb = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

  return (
    <>
    <TripThemeScope theme={td.trip.theme} />
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

      <SettingsGroup title="行程">
        <SettingsRow
          icon="CalendarDays"
          label="出发日期"
          value={fmtDate(trip.startDate)}
          onClick={() => {
            setNewStart(trip.startDate);
            setDateSheet(true);
          }}
        />
        <SettingsRow
          icon="CalendarDays"
          label="出发时间"
          value={trip.departTime ? `${trip.departTime}（${trip.homeTz}）` : `未设置，按 00:00（${trip.homeTz}）倒数`}
          onClick={() => {
            setFactVal(trip.departTime ?? '');
            setFactSheet('time');
          }}
        />
        <SettingsRow
          icon="Home"
          label="参与人数"
          value={trip.participants ? `${trip.participants} 人` : '未设置'}
          onClick={() => {
            setFactVal(trip.participants ? String(trip.participants) : '');
            setFactSheet('people');
          }}
        />
        <SettingsRow icon="Image" label="穿搭与打包" value="每日穿搭、衣橱、打包清单" onClick={() => nav(`/trip/${trip.id}/outfits`)} />
        <SettingsRow
          icon="Wallet"
          label="旅行账本"
          value={trip.budget !== undefined ? `预算 ${fmtMoney(trip.budget)}` : '未设置预算'}
          onClick={() => nav(`/trip/${trip.id}/ledger`)}
        />
      </SettingsGroup>

      <SettingsGroup title="外观" note="只影响这份旅程；其他旅程保持各自的外观。">
        <SettingsRow icon="Image" label="主题" value={THEME_LABEL[trip.theme ?? 'classic']} onClick={() => setThemeSheet(true)} />
      </SettingsGroup>

      <SettingsGroup title="外部工具" note="导航和翻译将在外部应用或网页中打开。">
        <SettingsRow icon="Navigation" label="导航工具" value={navApps} onClick={() => nav('/import/template')} />
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
        {storage.usedMB != null && (
          <ReadinessRow
            icon="Globe"
            label="本机存储"
            state={storage.persisted ? 'ok' : 'grey'}
            text={`已用 ${storage.usedMB} MB · ${storage.persisted ? '已持久保存' : '未申请持久存储'}`}
          />
        )}
      </SettingsGroup>

      <h2 className={p.mt24} style={{ fontSize: 'var(--fs-section)', fontWeight: 'var(--fw-section)', marginBottom: 'var(--space-2)' }}>
        准备检查
      </h2>
      <CheckList issues={issues} onPick={(i) => i.itemId && nav(`/item/${i.itemId}`)} />

      <h2 className={p.mt24} style={{ fontSize: 'var(--fs-section)', fontWeight: 'var(--fw-section)', marginBottom: 'var(--space-2)' }}>
        备份与恢复
      </h2>
      <Card className={p.backupCard}>
        <Button block variant="outline" icon="Download" onClick={() => setExportSheet(true)}>
          导出旅行包
        </Button>
        <Button variant="link" chevron={false} onClick={() => void restoreFromFile()}>
          恢复备份
        </Button>
      </Card>
      <p className={p.mt8} style={{ fontSize: 'var(--fs-caption)', color: 'var(--color-text-2)' }}>
        旅行包包含这份旅程的行程、完成状态、预订资料和账本；可选择是否连附件（证明文件、封面）一起导出。
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
        open={themeSheet}
        title="外观主题"
        options={(Object.keys(THEME_LABEL) as TripTheme[]).map((t) => ({ value: t, label: THEME_LABEL[t] }))}
        value={trip.theme ?? 'classic'}
        onPick={(v) => void setTripTheme(trip.id, v)}
        onClose={() => setThemeSheet(false)}
      />
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
        onClose={() => setConfirmDel(false)}
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
      <Sheet open={exportSheet} onClose={() => setExportSheet(false)} title="导出旅行包">
        <div className={p.exportList}>
          <Button block icon="Download" onClick={() => void doExportTrip(true)}>
            {pkg && pkg.files > 0 ? `含附件（${pkg.files} 个文件，约 ${mb(pkg.bytes)}）` : '含附件'}
          </Button>
          <p className={p.exportNote}>换手机或长期保存用这个。证明文件、二维码图片、封面都在包里；加密的文件仍保持加密。</p>
          <Button block variant="outline" icon="Download" onClick={() => void doExportTrip(false)}>
            不含附件（只有资料，体积小）
          </Button>
          <p className={p.exportNote}>
            只有行程、完成状态、预订编号和账本。{pkg && pkg.files > 0 ? `恢复到另一台手机后，${pkg.files} 个附件需要重新添加。` : ''}
          </p>
          <Button block variant="link" chevron={false} onClick={() => void doExport()}>
            导出本机全部旅程（含附件）
          </Button>
        </div>
      </Sheet>
      <Sheet open={factSheet !== null} onClose={() => setFactSheet(null)} title={factSheet === 'time' ? '出发时间' : '参与人数'}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const v = factVal.trim();
            if (factSheet === 'time') void setDepartTime(trip.id, v || undefined).then(() => toast(v ? '出发时间已更新' : '已改回按 00:00 倒数'));
            else {
              const n = Number(v);
              if (v && !(Number.isInteger(n) && n > 0 && n < 1000)) return toast('人数请填 1 以上的整数');
              void setParticipants(trip.id, v ? n : undefined).then(() => toast('人数已更新'));
            }
            setFactSheet(null);
          }}
        >
          {factSheet === 'time' ? (
            <Field label={`出发时间（${trip.homeTz}）`} hint="倒计时按出发日的这个时间计算；留空则按 00:00。">
              <TextInput type="time" value={factVal} onChange={(e) => setFactVal(e.target.value)} />
            </Field>
          ) : (
            <Field label="参与人数" hint="留空表示未设置">
              <TextInput type="number" inputMode="numeric" min={1} max={999} value={factVal} onChange={(e) => setFactVal(e.target.value)} />
            </Field>
          )}
          <FormActions>
            <Button type="submit">保存</Button>
          </FormActions>
        </form>
      </Sheet>
      <Sheet open={dateSheet} onClose={() => setDateSheet(false)} title="修改出发日期">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void saveStart();
          }}
        >
          <Field
            label="出发日期"
            hint={newStart ? `整份行程一起平移：${fmtDateRange(newStart, addDays(newStart, span))}。完成状态、证明和账本关联都会保留。` : undefined}
          >
            <TextInput type="date" value={newStart} onChange={(e) => setNewStart(e.target.value)} />
          </Field>
          <FormActions>
            <Button type="submit">保存</Button>
          </FormActions>
        </form>
      </Sheet>
    </Screen>
    </>
  );
}
