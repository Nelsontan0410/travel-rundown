// 第四页：实用信息与私人便签（手机 M04 / 电脑 W04）。
// 住宿与出行只引用已导入的行程（不编价格、坐标）；贴士、清单、便签是用户自己写的，可增删改、排序，清单可勾选。
import { useState } from 'react';
import g from './Guide.module.css';
import { Icon, type IconKey } from '../../components/Icon';
import { Button } from '../../components/Basics';
import { EditableText } from './parts';
import { LIMITS, TIP_CATEGORIES, TIP_EN, TIP_LABEL, type GuideTip, type TipCategory } from '../../domain/guide';

const TIP_ICON: Record<TipCategory, IconKey> = {
  tip: 'Lightbulb',
  food: 'Utensils',
  shopping: 'ShoppingBag',
  photo: 'Camera',
  checklist: 'ListChecks',
  note: 'StickyNote',
  other: 'Info',
};

export interface StayRow {
  id: string;
  icon: IconKey;
  title: string;
  sub: string;
}
export interface PlaceRow {
  id: string;
  title: string;
  place: string;
  onNav: () => void;
}

export function InfoSection({
  tips,
  edit,
  canEdit,
  stay,
  places,
  onAdd,
  onUpdate,
  onRemove,
  onMove,
  onToggle,
  compact,
}: {
  tips: GuideTip[];
  edit: boolean;
  canEdit: boolean;
  stay: StayRow[];
  places: PlaceRow[];
  onAdd: (c: TipCategory, text: string) => Promise<unknown>;
  onUpdate: (id: string, text: string) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onToggle: (id: string, done: boolean) => void | Promise<unknown>;
  /** 放在电脑编辑面板里：单栏、不要大标题 */
  compact?: boolean;
}) {
  const [cat, setCat] = useState<TipCategory>('tip');
  const [text, setText] = useState('');
  // 勾选先在界面上生效，写入完成后以数据库为准
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const isDone = (t: GuideTip) => ticks[t.id] ?? !!t.done;
  const groups = TIP_CATEGORIES.map((c) => ({ c, list: tips.filter((t) => t.category === c) })).filter((x) => x.list.length > 0);
  if (!edit && !groups.length && !stay.length && !places.length) return null;
  return (
    <section className={compact ? g.infoCompact : g.section} aria-labelledby={compact ? undefined : 'g-info'} aria-label={compact ? '编辑实用信息' : undefined}>
      {!compact && (
        <>
          <h2 id="g-info" className={g.h2}>
            旅行实用信息 <small>Useful info</small>
          </h2>
          <div className={g.rule} />
        </>
      )}
      <div className={g.infoGrid}>
        <div className={g.infoCol}>
          {places.length > 0 && (
            <div className={g.infoCard}>
              <h3 className={g.tipTitle}>
                <Icon name="MapPin" size="sm" />
                地点与导航 <small>Places</small>
              </h3>
              {places.map((p) => (
                <div key={p.id} className={g.place}>
                  <span className={g.placeName}>
                    {p.title}
                    <small className={g.placeSub}>{p.place}</small>
                  </span>
                  <button type="button" className={g.navLink} onClick={p.onNav}>
                    <Icon name="Navigation" size="sm" />
                    导航
                  </button>
                </div>
              ))}
            </div>
          )}
          {stay.length > 0 && (
            <div className={g.infoCard}>
              <h3 className={g.tipTitle}>
                <Icon name="Building2" size="sm" />
                住宿与出行 <small>Stay &amp; move</small>
              </h3>
              <ul className={g.stayList}>
                {stay.map((r) => (
                  <li key={r.id} className={g.stayRow}>
                    <Icon name={r.icon} size="sm" />
                    <span>
                      <strong>{r.title}</strong>
                      <small>{r.sub}</small>
                    </span>
                  </li>
                ))}
              </ul>
              <p className={g.hint}>以上来自你的行程，修改请到行程里改。</p>
            </div>
          )}
        </div>
        <div className={g.infoCol}>
          {groups.map(({ c, list }) => (
            <div key={c} className={g.infoCard} data-tip-group={c}>
              <h3 className={g.tipTitle}>
                <Icon name={TIP_ICON[c]} size="sm" />
                {TIP_LABEL[c]} <small>{TIP_EN[c]}</small>
              </h3>
              <ul className={c === 'food' && !edit ? g.tipChips : g.tipList}>
                {list.map((t, i) => (
                  <li key={t.id} className={`${g.tip} ${isDone(t) ? g.tipDone : ''}`} data-tip={t.id}>
                    {c === 'checklist' && (
                      <input
                        type="checkbox"
                        className={g.tipCheck}
                        checked={isDone(t)}
                        disabled={!canEdit}
                        aria-label={`${isDone(t) ? '取消勾选' : '勾选'}：${t.text}`}
                        onChange={(e) => {
                          const v = e.target.checked;
                          setTicks((m) => ({ ...m, [t.id]: v }));
                          void Promise.resolve(onToggle(t.id, v)).finally(() =>
                            setTicks((m) => {
                              const { [t.id]: _x, ...rest } = m;
                              void _x;
                              return rest;
                            }),
                          );
                        }}
                      />
                    )}
                    <EditableText as="span" className={g.tipText} editing={edit} multiline max={LIMITS.tip} label={`${TIP_LABEL[c]}内容`} placeholder="内容" value={t.text} onCommit={(v) => onUpdate(t.id, v)} />
                    {edit && (
                      <span className={g.tipTools}>
                        <button type="button" className={g.tool} disabled={i === 0} aria-label={`上移：${t.text}`} onClick={() => onMove(t.id, -1)}>
                          <Icon name="ChevronUp" size="sm" />
                        </button>
                        <button type="button" className={g.tool} disabled={i === list.length - 1} aria-label={`下移：${t.text}`} onClick={() => onMove(t.id, 1)}>
                          <Icon name="ChevronDown" size="sm" />
                        </button>
                        <button type="button" className={`${g.tool} ${g.toolDanger}`} aria-label={`删除：${t.text}`} onClick={() => onRemove(t.id)}>
                          <Icon name="Trash2" size="sm" />
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {edit && (
            <form
              className={`${g.infoCard} ${g.tipAdd}`}
              onSubmit={(e) => {
                e.preventDefault();
                const v = text.trim();
                if (!v) return;
                void onAdd(cat, v).then(() => setText(''), () => undefined);
              }}
            >
              <h3 className={g.tipTitle}>
                <Icon name="Plus" size="sm" />
                添加贴士或便签
              </h3>
              <div className={g.chips} role="group" aria-label="贴士类别">
                {TIP_CATEGORIES.map((c) => (
                  <button key={c} type="button" className={`${g.chip} ${cat === c ? g.chipOn : ''}`} aria-pressed={cat === c} onClick={() => setCat(c)}>
                    {TIP_LABEL[c]}
                  </button>
                ))}
              </div>
              <label className={g.field}>
                内容
                <textarea
                  value={text}
                  maxLength={LIMITS.tip}
                  rows={2}
                  placeholder={cat === 'checklist' ? '例如：确认民族写真预约' : '例如：建议一早出门，光线较好'}
                  onChange={(e) => setText(e.target.value)}
                  onFocus={(e) => setTimeout(() => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 320)}
                />
              </label>
              <Button type="submit" variant="outline" icon="Plus" disabled={!text.trim()}>
                添加
              </Button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
