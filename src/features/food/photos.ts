// 美食照片：从本机 blobs 表读出来变成图片地址，并缓存。
// 照片键每次换照片都会变（food:<id>:<随机>），所以按键缓存是安全的，不会拿到旧图。
import { useEffect, useState } from 'react';
import { db } from '../../db/schema';
import { thumbKeyOf } from '../../lib/photo';

const urls = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();

async function load(key: string): Promise<string | null> {
  const hit = urls.get(key);
  if (hit !== undefined) return hit;
  let p = pending.get(key);
  if (!p) {
    p = db.blobs.get(key).then(
      (r) => {
        const u = r?.blob ? URL.createObjectURL(r.blob) : null;
        urls.set(key, u);
        pending.delete(key);
        return u;
      },
      () => {
        pending.delete(key);
        return null;
      },
    );
    pending.set(key, p);
  }
  return p;
}

/** 缩略图地址（没有缩略图就用原图）。null = 本机找不到这张照片 */
export async function thumbUrl(key: string): Promise<string | null> {
  return (await load(thumbKeyOf(key))) ?? (await load(key));
}

/** 原图地址（主图用）。null = 找不到 */
export const fullUrl = (key: string) => load(key);

/** 已经在缓存里的缩略图地址（同步读取，动画开始时直接用，不等） */
export const cachedThumb = (key: string): string | undefined => urls.get(thumbKeyOf(key)) ?? urls.get(key) ?? undefined;

/** 预载并解码原图，最多等 timeout 毫秒；解码好才换上，避免动画中途卡顿或闪烁 */
export async function decodedFull(key: string, timeout = 900): Promise<string | null> {
  const u = await fullUrl(key);
  if (!u) return null;
  const img = new Image();
  img.src = u;
  try {
    await Promise.race([img.decode(), new Promise((_, rej) => setTimeout(rej, timeout))]);
  } catch {
    /* 超时或解码失败：照样返回地址，由 <img> 自己加载 */
  }
  return u;
}

/** 列表里的一张缩略图：visible=false 时先不读（进入可见范围才读，省内存） */
export function useThumb(key: string | undefined, visible = true): string | null | undefined {
  const [url, setUrl] = useState<string | null | undefined>(() => (key ? cachedThumb(key) : null));
  useEffect(() => {
    if (!key) return setUrl(null);
    const c = cachedThumb(key);
    if (c) return setUrl(c);
    if (!visible) return;
    let alive = true;
    void thumbUrl(key).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [key, visible]);
  return url;
}

/** 预览（表单）：原图 */
export function useFullPhoto(key: string | undefined): string | null | undefined {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!key) return setUrl(null);
    let alive = true;
    void fullUrl(key).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [key]);
  return url;
}

// ———— 可见范围：所有格子共用一个 IntersectionObserver ————
const watchers = new Map<Element, () => void>();
let io: IntersectionObserver | undefined;
export function watchVisible(el: Element, onVisible: () => void): () => void {
  if (typeof IntersectionObserver === 'undefined') {
    onVisible();
    return () => {};
  }
  io ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        watchers.get(e.target)?.();
        watchers.delete(e.target);
        io!.unobserve(e.target);
      }
    },
    { rootMargin: '600px 0px' },
  );
  watchers.set(el, onVisible);
  io.observe(el);
  return () => {
    watchers.delete(el);
    io?.unobserve(el);
  };
}
