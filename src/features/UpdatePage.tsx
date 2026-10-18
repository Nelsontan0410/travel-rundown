// 2026-10-18 同步：同伴预览主用户的新版本 → 冲突逐项选择 → 套用或暂不套用
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import p from './Page.module.css';
import { TripThemeScope } from '../components/TripTheme';
import { Screen, BackHeader } from '../components/Layout';
import { Button, Card, EmptyState, FilterChips, InfoBanner, SectionTitle } from '../components/Basics';
import { useTripData } from '../hooks/data';
import { toast } from '../store/ui';
import { cloudErrorText } from '../cloud/backend';
import { refreshCloud } from '../cloud/session';
import { applyUpdate, previewUpdate, type UpdatePreview } from '../cloud/sync';
import type { Choice } from '../cloud/merge';
import { fmtTimeRange } from '../domain/format';
import { DiffList } from './CloudParts';
import type { Item } from '../domain/types';

const CHOICES: { value: Choice; label: string }[] = [
  { value: 'theirs', label: '用主用户的' },
  { value: 'mine', label: '保留我的' },
];

function brief(it: Item | undefined): string {
  if (!it) return '（删除了这一项）';
  return [fmtTimeRange(it.start, it.end, it.endDayOffset), it.title, it.place?.localName ?? it.place?.name, it.note].filter(Boolean).join(' · ');
}

export default function UpdatePage() {
  const nav = useNavigate();
  const { tripId } = useParams();
  const td = useTripData(tripId);
  const [pv, setPv] = useState<UpdatePreview | null | undefined>(undefined);
  const [err, setErr] = useState('');
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!tripId) return;
    previewUpdate(tripId)
      .then(setPv)
      .catch((e) => {
        setErr(cloudErrorText(e));
        setPv(null);
      });
  }, [tripId]);

  if (!tripId || td === null) return <Screen tab="itinerary" header={<BackHeader title="收到更新" />}>{null}</Screen>;
  const cur = td?.trip.cloud?.version ?? 0;

  const apply = async () => {
    if (!pv) return;
    setBusy(true);
    try {
      await applyUpdate(tripId, pv, choices);
      await refreshCloud();
      toast(`已套用 v${pv.version}`);
      nav(`/itinerary/${tripId}`, { replace: true });
    } catch (e) {
      toast(cloudErrorText(e));
    } finally {
      setBusy(false);
    }
  };
  const later = () => {
    toast('之后可以在行程页或旅程设置里再查看');
    nav(-1);
  };

  return (
    <>
      {td && <TripThemeScope theme={td.trip.theme} />}
      <Screen
        tab="itinerary"
        header={<BackHeader title="收到更新" />}
        bottom={
          pv && pv.version > cur ? (
            <>
              <Button icon="Download" disabled={busy} onClick={() => void apply()}>
                {busy ? '套用中…' : '套用这个版本'}
              </Button>
              <Button variant="outline" style={{ flex: '0 0 var(--w-skip)' }} onClick={later}>
                暂不套用
              </Button>
            </>
          ) : undefined
        }
      >
        {pv === undefined ? (
          <p className={p.lockNote}>正在读取…</p>
        ) : !pv ? (
          <EmptyState title="读取不到更新" text={err || '主用户还没有发布版本，或者你已不在成员名单里'} compact />
        ) : pv.version <= cur ? (
          <EmptyState title="已经是最新版本" text={`本机已套用 v${cur}`} compact />
        ) : (
          <div className={p.stack}>
            <Card className={p.cloudCard}>
              <p className={p.cloudTitle}>
                v{pv.version}
                {pv.important ? ' · 重要更新' : ''}
              </p>
              <p className={p.inviteTitle}>{pv.note || '（没有说明）'}</p>
              <p className={p.lockNote}>本机现在是 v{cur}。套用后行程会换成这个版本；你的完成勾选、记账、穿搭打包都不受影响。</p>
            </Card>

            {pv.localEdits > 0 && (
              <InfoBanner variant="info">
                你在本机改过 {pv.localEdits} 处。主用户没动的那些会保留；两边都改了的列在下面，由你选择。
              </InfoBanner>
            )}

            {pv.conflicts.length > 0 && (
              <div>
                <SectionTitle>两边都改了（{pv.conflicts.length}）</SectionTitle>
                <div className={p.stack}>
                  {pv.conflicts.map((c) => (
                    <Card key={c.id} className={p.cloudCard}>
                      <p className={p.inviteTitle}>
                        {c.dayIndex ? `Day ${c.dayIndex} · ` : ''}
                        {c.title}
                      </p>
                      <p className={p.lockNote}>改了：{c.fields.join('、')}</p>
                      <div className={p.conflictCols}>
                        <div>
                          <p className={p.groupLabel}>我的</p>
                          <p className={p.diffText}>{brief(c.mine)}</p>
                        </div>
                        <div>
                          <p className={p.groupLabel}>主用户的</p>
                          <p className={p.diffText}>{brief(c.theirs)}</p>
                        </div>
                      </div>
                      <FilterChips options={CHOICES} value={choices[c.id] ?? 'theirs'} onChange={(v) => setChoices({ ...choices, [c.id]: v })} />
                    </Card>
                  ))}
                </div>
              </div>
            )}

            <div>
              <SectionTitle>这个版本改了什么</SectionTitle>
              <DiffList diff={pv.diff} empty="内容和本机上次套用的版本一样" />
            </div>
          </div>
        )}
      </Screen>
    </>
  );
}
