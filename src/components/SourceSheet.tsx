import s from './SourceSheet.module.css';
import { Sheet } from './Layout';

interface Props {
  open: boolean;
  onClose: () => void;
  md: string;
  /** 高亮范围（含） */
  from: number;
  to: number;
  /** 上下各多显示几行 */
  context?: number;
  title?: string;
}

/** 查看原文：显示导入 md 里对应的几行（等宽字体，带行号） */
export default function SourceSheet({ open, onClose, md, from, to, context = 0, title = '原文' }: Props) {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const a = Math.max(1, from - context);
  const b = Math.min(lines.length, to + context);
  const shown = [];
  for (let n = a; n <= b; n++) shown.push(n);
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <pre className={s.pre}>
        {shown.map((n) => (
          <div key={n} className={`${s.row} ${n >= from && n <= to ? s.hit : ''}`}>
            <span className={s.no}>{n}</span>
            <span>{lines[n - 1]}</span>
          </div>
        ))}
      </pre>
      <p className={s.hint}>第 {from}{to > from ? `–${to}` : ''} 行</p>
    </Sheet>
  );
}
