/**
 * tongxing8 品牌图形（唯一设计基准：src/assets/brand/tongxing8-logo.svg）。
 * 路径与原 SVG 完全一致，全部用 currentColor：颜色由外层文字颜色（主题变量）决定，
 * 背景透明，不用 filter 反色，不维护彩色版本。
 */
const MARK_PATHS = (
  <>
    <g fill="currentColor">
      <circle cx="109" cy="81" r="31" />
      <circle cx="211" cy="81" r="31" />
      <path d="M61 189V151c0-29 17-44 48-44 26 0 41 10 47 28l-27 15v54H61z" />
      <path d="M259 189V151c0-29-17-44-48-44-26 0-41 10-47 28l27 15v54h68z" />
    </g>
    <path d="M129 141 L160 126 L191 141 V209 L160 194 L129 209 Z" fill="none" stroke="currentColor" strokeWidth={8} strokeLinejoin="miter" />
    <path d="M160 126 V194" fill="none" stroke="currentColor" strokeWidth={7} />
    <circle cx="174" cy="160" r="8" fill="currentColor" />
  </>
);

const WORDMARK_STYLE = { fontFamily: 'Arial, Helvetica, sans-serif', fontWeight: 800 } as const;

/** 只有图形（两人＋折叠行程纸），用于小尺寸与空状态 */
export function BrandMark({ height = 24, className }: { height?: number | string; className?: string }) {
  return (
    <svg viewBox="56 48 208 168" style={{ height, width: 'auto', aspectRatio: '208 / 168', flexShrink: 0, color: 'currentColor' }} className={className} aria-hidden focusable="false">
      {MARK_PATHS}
    </svg>
  );
}

/** 完整版（竖排：图形＋tongxing8），与设计源文件构图一致 */
export function BrandFull({ height = 96, className, title = 'tongxing8' }: { height?: number | string; className?: string; title?: string }) {
  return (
    <svg viewBox="50 44 220 246" style={{ height, width: 'auto', aspectRatio: '220 / 246', flexShrink: 0 }} className={className} role="img" aria-label={title}>
      {MARK_PATHS}
      <text x="160" y="268" fill="currentColor" fontSize={43} textAnchor="middle" letterSpacing={-1.4} style={WORDMARK_STYLE}>
        tongxing8
      </text>
    </svg>
  );
}

/** 页头版（横排：同一图形＋tongxing8），手机页头里字样才够大、读得清 */
export function BrandLockup({ height = 34, className }: { height?: number | string; className?: string }) {
  return (
    <svg viewBox="56 48 662 168" style={{ height, width: 'auto', aspectRatio: '662 / 168', flexShrink: 0 }} className={className} role="img" aria-label="tongxing8">
      {MARK_PATHS}
      <text x="272" y="160" fill="currentColor" fontSize={86} textLength={440} lengthAdjust="spacingAndGlyphs" style={WORDMARK_STYLE}>
        tongxing8
      </text>
    </svg>
  );
}
