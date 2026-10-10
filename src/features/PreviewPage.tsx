import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import p from './Page.module.css';
import { Screen, BackHeader } from '../components/Layout';
import { Button, InfoBanner } from '../components/Basics';
import { KeyValueCard } from '../components/Cards';
import { useUI } from '../store/ui';
import { saveImport } from '../db/repo';
import { fmtDateRange, tripDays } from '../domain/format';

/** 导入预览页 */
export default function PreviewPage() {
  const nav = useNavigate();
  const draft = useUI((s) => s.draft);
  const setDraft = useUI((s) => s.setDraft);
  const setPaste = useUI((s) => s.setPasteText);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!draft) return <Navigate to="/trips" replace />;
  const { result } = draft;
  const empty = result.itemCount === 0;

  const back = () => {
    // 回到粘贴页修改：文件导入的内容也带过去
    setPaste(draft.md);
    nav(`/import/paste${draft.targetTripId ? `?trip=${draft.targetTripId}` : ''}`, { replace: true });
  };

  const confirm = async () => {
    setBusy(true);
    try {
      const id = await saveImport(result, draft.md, draft.targetTripId);
      nav(`/itinerary/${id}`, { replace: true });
      setTimeout(() => {
        setDraft(null);
        setPaste('');
      }, 0);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      tab="trips"
      header={<BackHeader title="导入预览" onBack={back} />}
      bottom={
        <>
          <Button disabled={empty || busy} onClick={() => void confirm()}>
            确认导入
          </Button>
          <Button variant="outline" onClick={back}>
            返回修改
          </Button>
        </>
      }
    >
      {empty ? (
        <div className={p.mt8}>
          <InfoBanner variant="warning">没有识别到任何行程项，请检查格式</InfoBanner>
        </div>
      ) : (
        <>
          <div className={p.mt8}>
            <KeyValueCard
              rows={[
                ['旅程名', result.trip.title],
                ['日期范围', result.trip.startDate ? fmtDateRange(result.trip.startDate, result.trip.endDate) : '—'],
                ['天数', result.trip.startDate ? `${tripDays(result.trip.startDate, result.trip.endDate)}天` : `${result.days.length}天`],
                ['行程项数', String(result.itemCount)],
              ]}
            />
          </div>
          {result.warnings.length > 0 && (
            <div className={p.mt12}>
              <InfoBanner variant="warning" onClick={() => setOpen((o) => !o)}>
                {result.warnings.length} 条提示
              </InfoBanner>
              {open && (
                <ul className={p.warnList}>
                  {result.warnings.map((w, i) => (
                    <li key={i}>{w.message}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </Screen>
  );
}
