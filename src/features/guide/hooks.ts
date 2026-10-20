import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import { thumbKeyOf } from '../../lib/photo';

/** 电脑宽度（≥ 1024px）用右侧面板 / 居中对话框，否则用底部弹层 */
export function useWide(): boolean {
  const q = '(min-width: 1024px)';
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches);
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return;
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

/** 照片地址：thumb=true 时优先用缩略图，没有缩略图（旧照片、同步来的）就用原图。null = 找不到文件 */
export function usePhotoUrl(key: string | undefined, thumb = false): string | null | undefined {
  const blob = useLiveQuery(async () => {
    if (!key) return null;
    if (thumb) {
      const t = await db.blobs.get(thumbKeyOf(key));
      if (t) return t.blob;
    }
    return (await db.blobs.get(key))?.blob ?? null;
  }, [key, thumb]);
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : blob), [blob]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  return url;
}
