// 导入预览 · 映射检查：列出格式、数量、错误、需要确认的字段和认不出的字段，并提供就地修正。
// 纯展示组件：所有修改通过回调交给页面，页面只改草稿，确认导入前不写数据库。
import s from './MappingReview.module.css';
import { Card } from './Basics';
import { Icon } from './Icon';
import { TextInput } from './Form';

export interface MappingSummary {
  format: string;
  days: number;
  items: number;
  errors: number;
  toConfirm: number;
  unmapped: number;
  dropped: number;
}

export interface TypeOption {
  value: string;
  label: string;
}

export interface FixRow {
  id: string;
  /** 哪一天 / 哪一项 */
  where: string;
  /** 原始值 */
  raw?: string;
  kind: 'title' | 'date' | 'ambiguous' | 'type';
  /** date：当前值；ambiguous：两种理解 */
  value?: string;
  options?: { value: string; label: string }[];
  onChange: (v: string) => void;
}

export interface UnmappedRow {
  id: string;
  where: string;
  field: string;
  value: string;
  /** 能改映射的目标；空数组表示只能保留 */
  targets: { value: string; label: string }[];
  keptAs: string;
  onMap: (target: string) => void;
}

export interface DroppedRow {
  where: string;
  raw: string;
  reason: string;
}

export function MappingSummaryCard({ sum }: { sum: MappingSummary }) {
  const cells: [string, string, boolean?][] = [
    ['格式', sum.format],
    ['天数', String(sum.days)],
    ['活动', String(sum.items)],
    ['错误', String(sum.errors), sum.errors > 0],
    ['待确认', String(sum.toConfirm), sum.toConfirm > 0],
    ['未识别字段', String(sum.unmapped), sum.unmapped > 0],
  ];
  return (
    <Card className={s.summary}>
      {cells.map(([k, v, warn]) => (
        <div key={k} className={s.cell}>
          <span className={s.k}>{k}</span>
          <span className={`${s.v} ${warn ? s.warn : ''}`}>{v}</span>
        </div>
      ))}
    </Card>
  );
}

export function FixList({ rows }: { rows: FixRow[] }) {
  if (!rows.length) return null;
  return (
    <Card className={s.list}>
      <p className={s.head}>
        <Icon name="AlertCircle" size="sm" />
        需要你确认（{rows.length}）
      </p>
      {rows.map((r) => (
        <div key={r.id} className={s.row}>
          <div className={s.rowText}>
            <p className={s.where}>{r.where}</p>
            {r.kind === 'title' && <p className={s.why}>没有识别到旅程标题</p>}
            {r.kind === 'date' && <p className={s.why}>这一天没有可用的日期{r.raw ? `（原始值「${r.raw}」）` : ''}</p>}
            {r.kind === 'ambiguous' && <p className={s.why}>「{r.raw}」既可能是日-月-年，也可能是月-日-年，请确认</p>}
            {r.kind === 'type' && <p className={s.why}>认不出类型{r.raw ? `「${r.raw}」` : '（没写类型）'}，请选一个</p>}
          </div>
          <div className={s.ctl}>
            {r.kind === 'title' && <TextInput placeholder="例如：北海道，日本" defaultValue={r.value} onBlur={(e) => r.onChange(e.target.value)} />}
            {r.kind === 'date' && <TextInput type="date" value={r.value ?? ''} onChange={(e) => r.onChange(e.target.value)} />}
            {(r.kind === 'ambiguous' || r.kind === 'type') && (
              <select className={s.select} value="" onChange={(e) => e.target.value && r.onChange(e.target.value)} aria-label={`${r.where} 选择`}>
                <option value="">请选择…</option>
                {r.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      ))}
    </Card>
  );
}

export function UnmappedList({ rows }: { rows: UnmappedRow[] }) {
  if (!rows.length) return null;
  return (
    <Card className={s.list}>
      <p className={s.head}>
        <Icon name="Info" size="sm" />
        认不出的字段（{rows.length}）
      </p>
      <p className={s.note}>这些内容不会丢：默认原样保留，也可以改放到合适的字段。</p>
      {rows.map((r) => (
        <div key={r.id} className={s.row}>
          <div className={s.rowText}>
            <p className={s.where}>{r.where}</p>
            <p className={s.raw}>
              <span className={s.field}>{r.field}</span>
              {r.value}
            </p>
          </div>
          <div className={s.ctl}>
            {r.targets.length ? (
              <select className={s.select} value="keep" onChange={(e) => r.onMap(e.target.value)} aria-label={`${r.field} 放到`}>
                <option value="keep">{r.keptAs}</option>
                {r.targets.map((t) => (
                  <option key={t.value} value={t.value}>
                    改放到：{t.label}
                  </option>
                ))}
              </select>
            ) : (
              <span className={s.kept}>{r.keptAs}</span>
            )}
          </div>
        </div>
      ))}
    </Card>
  );
}

export function DroppedList({ rows }: { rows: DroppedRow[] }) {
  if (!rows.length) return null;
  return (
    <Card className={s.list}>
      <p className={`${s.head} ${s.warn}`}>
        <Icon name="AlertCircle" size="sm" />
        没能导入的内容（{rows.length}）
      </p>
      <p className={s.note}>下面这些行缺少必要信息，不会被导入。补全原文后重新导入即可。</p>
      {rows.map((r, i) => (
        <div key={i} className={s.row}>
          <div className={s.rowText}>
            <p className={s.where}>
              {r.where}：{r.reason}
            </p>
            <p className={s.raw}>{r.raw}</p>
          </div>
        </div>
      ))}
    </Card>
  );
}
