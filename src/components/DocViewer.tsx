import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import s from './DocViewer.module.css';
import { Button } from './Basics';
import { Icon } from './Icon';
import { loadPdf } from '../lib/pdf';
import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api';

const MIN = 50;
const MAX = 300;
const STEP = 25;

/** DocViewer（06）：PDF 用 pdf.js 画成 canvas，图片直接显示；缩放 50%–300%，每次 25%，支持双指缩放 */
export function DocViewer({ blob, mime, onReupload }: { blob: Blob | null | undefined; mime: string; onReupload: () => void }) {
  const [zoom, setZoom] = useState(100);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [width, setWidth] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [imgUrl, setImgUrl] = useState<string>();
  const isPdf = mime === 'application/pdf';

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const cs = getComputedStyle(el);
      setWidth(el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [blob]);

  useEffect(() => {
    if (!blob) return;
    let alive = true;
    if (isPdf) {
      void blob.arrayBuffer().then(async (buf) => {
        try {
          const doc = await loadPdf(buf);
          if (!alive) return;
          setPdf(doc);
          setPages(doc.numPages);
        } catch {
          /* 文件损坏时显示空白 */
        }
      });
    } else {
      const u = URL.createObjectURL(blob);
      setImgUrl(u);
      setPages(1);
      return () => {
        alive = false;
        URL.revokeObjectURL(u);
      };
    }
    return () => {
      alive = false;
    };
  }, [blob, isPdf]);

  // 画 PDF 页
  useEffect(() => {
    if (!pdf || !width || !pagesRef.current) return;
    let cancelled = false;
    const host = pagesRef.current;
    const t = setTimeout(async () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const canvases: HTMLCanvasElement[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const p = await pdf.getPage(i);
        if (cancelled) return;
        const base = p.getViewport({ scale: 1 });
        const cssW = (width * zoom) / 100;
        const scale = cssW / base.width;
        const vp = p.getViewport({ scale: scale * dpr });
        const c = document.createElement('canvas');
        c.className = s.page;
        c.width = Math.floor(vp.width);
        c.height = Math.floor(vp.height);
        c.style.width = `${cssW}px`;
        c.style.height = `${(base.height * scale).toFixed(1)}px`;
        c.dataset.page = String(i);
        await p.render({ canvasContext: c.getContext('2d')!, viewport: vp }).promise;
        if (cancelled) return;
        canvases.push(c);
      }
      host.replaceChildren(...canvases);
    }, 60);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [pdf, width, zoom]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    const host = pagesRef.current;
    if (!el || !host || pages < 2) return;
    const mid = el.scrollTop + el.clientHeight / 2;
    let cur = 1;
    for (const c of Array.from(host.children) as HTMLElement[]) {
      if (c.offsetTop <= mid) cur = Number(c.dataset.page) || cur;
    }
    setPage(cur);
  }, [pages]);

  // 双指缩放
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; z: number } | null>(null);
  const dist = () => {
    const [a, b] = [...pts.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size === 2) pinch.current = { d: dist(), z: zoom };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pts.current.has(e.pointerId)) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pts.current.size === 2) {
      const z = Math.round((pinch.current.z * dist()) / pinch.current.d);
      setZoom(Math.max(MIN, Math.min(MAX, z)));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pts.current.delete(e.pointerId);
    if (pts.current.size < 2) pinch.current = null;
  };

  if (blob === null) {
    return (
      <div className={s.viewer}>
        <div className={s.missing}>
          <p>文件已不在本机，请重新上传</p>
          <Button variant="outline" size="sm" onClick={onReupload}>
            重新上传
          </Button>
        </div>
      </div>
    );
  }

  const step = (dir: 1 | -1) =>
    setZoom((z) => {
      const snapped = dir > 0 ? Math.floor(z / STEP) * STEP + STEP : Math.ceil(z / STEP) * STEP - STEP;
      return Math.max(MIN, Math.min(MAX, snapped));
    });

  return (
    <div className={s.viewer}>
      <div
        ref={scrollRef}
        className={s.scroll}
        onScroll={onScroll}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {isPdf ? (
          <div ref={pagesRef} className={s.pages} />
        ) : (
          <div className={s.pages}>
            {imgUrl && width > 0 && <img className={s.img} src={imgUrl} alt="" style={{ width: (width * zoom) / 100 }} />}
          </div>
        )}
      </div>
      <div className={s.bar}>
        <button type="button" className={s.zoomBtn} aria-label="缩小" disabled={zoom <= MIN} onClick={() => step(-1)}>
          <Icon name="Minus" size="xs" />
        </button>
        <span className={s.pct}>{zoom}%</span>
        <button type="button" className={s.zoomBtn} aria-label="放大" disabled={zoom >= MAX} onClick={() => step(1)}>
          <Icon name="Plus" size="xs" />
        </button>
      </div>
      <span className={s.pageNo}>
        {page} / {pages}
      </span>
    </div>
  );
}
