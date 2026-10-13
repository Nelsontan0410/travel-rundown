import { useEffect, useMemo, useState } from 'react';
import p from './Page.module.css';
import { Sheet } from '../components/Layout';
import { Button, Card, FilterChips, InfoBanner } from '../components/Basics';
import { FileRow, SettingsGroup, SettingsRow } from '../components/Cards';
import { CheckFilled } from '../components/Icon';
import { prepareFile, pickFile, TooLargeError } from '../lib/files';
import { addDoc } from '../db/repo';
import { Field, SwitchRow, TextInput } from '../components/Form';
import { MIN_PASSWORD } from '../lib/crypto';
import { fmtMonthDay, SEP } from '../domain/format';
import type { DocKind, Item, ItemType } from '../domain/types';
import type { TripData } from '../hooks/data';

const KIND_OPTIONS: { value: DocKind; label: string }[] = [
  { value: 'flight', label: '机票' },
  { value: 'lodging', label: '酒店' },
  { value: 'ticket', label: '景点' },
  { value: 'other', label: '其他' },
];

export function kindForType(t?: ItemType): DocKind {
  if (t === 'flight') return 'flight';
  if (t === 'lodging') return 'lodging';
  if (t === 'spot' || t === 'meal' || t === 'transit') return 'ticket';
  return 'other';
}

/** 行程项多选列表（可以不选） */
export function ItemPickerSheet({
  open,
  td,
  value,
  onDone,
  onClose,
}: {
  open: boolean;
  td: TripData;
  value: string[];
  onDone: (keys: string[]) => void;
  onClose: () => void;
}) {
  const [sel, setSel] = useState<string[]>(value);
  useEffect(() => {
    if (open) setSel(value);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (k: string) => setSel((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  const label = (it: Item) => {
    const d = td.dayById.get(it.dayId);
    return [d ? fmtMonthDay(d.date) : '', it.start].filter(Boolean).join(SEP);
  };
  return (
    <Sheet open={open} onClose={onClose} title="关联行程项">
      <Card className={p.sheetList}>
        {td.items
          .filter((i) => i.type !== 'note')
          .map((it) => {
            const on = sel.includes(it.key);
            return (
              <button key={it.id} type="button" className={p.pickItem} onClick={() => toggle(it.key)}>
                {on ? <CheckFilled size="sm" color="var(--color-primary)" /> : <span className={p.check} />}
                <span className={p.pickText}>
                  <span>{it.title}</span>
                  <br />
                  <span className={p.pickSub}>{label(it)}</span>
                </span>
              </button>
            );
          })}
      </Card>
      <div className={p.mt16}>
        <Button
          block
          onClick={() => {
            onDone(sel);
            onClose();
          }}
        >
          完成
        </Button>
      </div>
    </Sheet>
  );
}

/** 添加证明弹层（03 的「添加」、02 和 03 的「上传文件」） */
export function AddDocSheet({
  open,
  onClose,
  td,
  presetKeys = [],
  presetType,
}: {
  open: boolean;
  onClose: () => void;
  td: TripData;
  presetKeys?: string[];
  presetType?: ItemType;
}) {
  const [file, setFile] = useState<{ blob: Blob; name: string } | null>(null);
  const [kind, setKind] = useState<DocKind>(kindForType(presetType));
  const [keys, setKeys] = useState<string[]>(presetKeys);
  const [tooLarge, setTooLarge] = useState(false);
  const [picker, setPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lockOn, setLockOn] = useState(false);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [hint, setHint] = useState('');
  const [pwErr, setPwErr] = useState('');
  const preview = useMemo(() => (file && file.blob.type.startsWith('image/') ? URL.createObjectURL(file.blob) : undefined), [file]);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  useEffect(() => {
    if (open) {
      setFile(null);
      setKind(kindForType(presetType));
      setKeys(presetKeys);
      setTooLarge(false);
      setLockOn(false);
      setPw('');
      setPw2('');
      setHint('');
      setPwErr('');
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = async (accept: string, capture?: boolean) => {
    const f = await pickFile(accept, capture);
    if (!f) return;
    try {
      const blob = await prepareFile(f);
      setTooLarge(false);
      const name = blob === f ? f.name : f.name.replace(/\.[^.]+$/, '') + '.jpg';
      setFile({ blob, name });
    } catch (e) {
      if (e instanceof TooLargeError) setTooLarge(true);
    }
  };

  const save = async () => {
    if (!file) return;
    if (lockOn) {
      if (pw.length < MIN_PASSWORD) return setPwErr(`密码至少 ${MIN_PASSWORD} 位`);
      if (pw !== pw2) return setPwErr('两次输入的密码不一致');
    }
    setSaving(true);
    try {
      await addDoc({
        tripId: td.trip.id,
        blob: file.blob,
        title: file.name,
        kind,
        itemKeys: keys,
        ...(lockOn ? { password: pw, hint: hint.trim() || undefined } : {}),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const linked = keys.length ? `${keys.length} 项` : '不关联';

  return (
    <Sheet open={open} onClose={onClose} title="添加预订证明">
      {!file ? (
        <>
          <Card>
            <SettingsRow icon="Camera" label="拍照" onClick={() => void choose('image/*', true)} />
            <SettingsRow icon="Image" label="从相册选择" onClick={() => void choose('image/*')} />
            <SettingsRow icon="FileUp" label="从文件选择" onClick={() => void choose('image/*,application/pdf')} />
          </Card>
          {tooLarge && (
            <div className={p.mt12}>
              <InfoBanner variant="warning">文件超过 20 MiB，请压缩后再添加</InfoBanner>
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ display: 'flex' }}>
            <FileRow title={file.name} mime={file.blob.type} blobKey="" saved={false} previewUrl={preview} />
          </div>
          <div className={p.mt12}>
            <FilterChips options={KIND_OPTIONS} value={kind} onChange={setKind} />
          </div>
          <div className={p.mt12}>
            <SettingsGroup>
              <SettingsRow label="关联行程项" value={linked} onClick={() => setPicker(true)} />
              <SwitchRow label="设置密码（防止别人打开）" on={lockOn} onChange={setLockOn} />
            </SettingsGroup>
          </div>
          {lockOn && (
            <div className={p.mt12}>
              <Field label="密码" error={pwErr || undefined}>
                <TextInput type="password" autoComplete="new-password" value={pw} onChange={(e) => { setPw(e.target.value); setPwErr(''); }} />
              </Field>
              <Field label="再输入一次">
                <TextInput type="password" autoComplete="new-password" value={pw2} onChange={(e) => { setPw2(e.target.value); setPwErr(''); }} />
              </Field>
              <Field label="密码提示（可选）" hint="文件会在这台设备上加密，密码不会保存。忘记密码将无法打开。">
                <TextInput value={hint} maxLength={40} onChange={(e) => setHint(e.target.value)} />
              </Field>
            </div>
          )}
          <div className={p.mt16}>
            <Button block disabled={saving} onClick={() => void save()}>
              保存
            </Button>
          </div>
          <ItemPickerSheet open={picker} td={td} value={keys} onDone={setKeys} onClose={() => setPicker(false)} />
        </>
      )}
    </Sheet>
  );
}
