// 2026-10-19 手机诊断：网址加 ?debug=1 打开（?debug=0 关掉）。
// 屏幕底部显示一小块日志：版本、每次换页后多久画出内容、页面里有没有内容、错误、主线程卡顿。
// 用原生 DOM 写，不靠 React —— 就算 React 那边整页空白，这块也看得到。点「复制」贴给开发者。
declare const __BUILD__: string;

const KEY = 'trip-debug';
const lines: string[] = [];
let box: HTMLDivElement | null = null;
let list: HTMLPreElement | null = null;
const t0 = performance.now();
const ts = () => `${((performance.now() - t0) / 1000).toFixed(2)}s`;

function render() {
  if (list) list.textContent = lines.slice(-14).join('\n');
}
export function diag(msg: string) {
  if (!box) return;
  lines.push(`${ts()} ${msg}`);
  if (lines.length > 400) lines.splice(0, 100);
  render();
}

const rootInfo = () => {
  const r = document.getElementById('root');
  const text = (r?.innerText ?? '').replace(/\s+/g, '').length;
  return `root文字=${text} 元素=${r?.querySelectorAll('*').length ?? 0}`;
};

function watchNav(kind: string) {
  const start = performance.now();
  diag(`→ ${kind} ${location.pathname}`);
  let frames = 0;
  const raf = () => {
    frames += 1;
    if (frames === 1) diag(`  首帧 ${Math.round(performance.now() - start)}ms · ${rootInfo()}`);
    else if (frames < 3) requestAnimationFrame(raf);
  };
  requestAnimationFrame(raf);
  for (const ms of [300, 1500, 4000]) setTimeout(() => diag(`  +${ms}ms ${rootInfo()}`), ms);
}

export function installDiag() {
  try {
    const q = new URLSearchParams(location.search).get('debug');
    if (q === '1') localStorage.setItem(KEY, '1');
    if (q === '0') localStorage.removeItem(KEY);
    if (localStorage.getItem(KEY) !== '1') return;
  } catch {
    return;
  }
  box = document.createElement('div');
  box.setAttribute('style', 'position:fixed;left:4px;right:4px;top:calc(env(safe-area-inset-top,0px) + 4px);z-index:2147483647;background:rgba(20,16,12,.78);color:#fff;font:10px/1.35 ui-monospace,monospace;border-radius:8px;padding:6px;pointer-events:none;max-height:34vh;display:flex;flex-direction:column;gap:4px');
  list = document.createElement('pre');
  list.setAttribute('style', 'margin:0;white-space:pre-wrap;word-break:break-all;overflow:auto;flex:1');
  const bar = document.createElement('div');
  bar.setAttribute('style', 'display:flex;gap:6px');
  const btn = (label: string, fn: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.setAttribute('style', 'pointer-events:auto;flex:1;padding:6px;border-radius:6px;border:0;background:#c9a46a;color:#1c140c;font:600 12px sans-serif');
    b.onclick = fn;
    bar.appendChild(b);
  };
  btn('复制日志', () => {
    const text = lines.join('\n');
    void navigator.clipboard?.writeText(text).then(
      () => diag('已复制'),
      () => {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        diag('已复制');
      },
    );
  });
  btn('现在状态', () => diag(`状态 ${location.pathname} · ${rootInfo()} · 可见=${document.visibilityState}`));
  btn('收起', () => {
    list!.style.display = list!.style.display === 'none' ? '' : 'none';
  });
  box.append(list, bar);
  const mount = () => document.body.appendChild(box!);
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);

  diag(`版本 ${typeof __BUILD__ === 'string' ? __BUILD__ : '?'} · ${navigator.userAgent.replace(/^Mozilla\/5\.0 /, '').slice(0, 90)}`);
  diag(`SW控制=${navigator.serviceWorker?.controller ? '是' : '否'} · 主屏幕=${matchMedia('(display-mode: standalone)').matches ? '是' : '否'} · 屏幕 ${innerWidth}x${innerHeight}@${devicePixelRatio}`);
  watchNav('打开');

  for (const k of ['pushState', 'replaceState'] as const) {
    const orig = history[k].bind(history);
    history[k] = (...a: Parameters<History['pushState']>) => {
      const r = orig(...a);
      watchNav(k === 'pushState' ? '跳转' : '替换');
      return r;
    };
  }
  addEventListener('popstate', () => watchNav('返回'));
  addEventListener('error', (e) => diag(`❌ 错误 ${e.message} @${(e.filename ?? '').split('/').pop()}:${e.lineno}`));
  addEventListener('unhandledrejection', (e) => {
    const r = e.reason as { name?: string; message?: string };
    diag(`❌ 未处理 ${r?.name ?? ''} ${r?.message ?? String(e.reason)}`.slice(0, 220));
  });
  document.addEventListener('visibilitychange', () => diag(`可见=${document.visibilityState}`));
  const ce = console.error.bind(console);
  console.error = (...a: unknown[]) => {
    diag(`console.error ${a.map((x) => (x instanceof Error ? x.message : String(x))).join(' ')}`.slice(0, 220));
    ce(...a);
  };
  const cw = console.warn.bind(console);
  console.warn = (...a: unknown[]) => {
    const s = a.map(String).join(' ');
    if (!/React Router Future Flag/.test(s)) diag(`warn ${s}`.slice(0, 200));
    cw(...a);
  };
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (e.duration > 200) diag(`⏳ 主线程卡住 ${Math.round(e.duration)}ms`);
    }).observe({ type: 'longtask', buffered: true });
  } catch {
    /* 不支持就算了 */
  }
}
