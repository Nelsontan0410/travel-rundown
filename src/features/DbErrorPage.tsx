import { Button, EmptyState } from '../components/Basics';

/** 本机数据库打不开时的错误页（无痕模式、存储被禁用或损坏） */
export default function DbErrorPage({ message }: { message: string }) {
  return (
    <div style={{ padding: 'var(--space-5)', maxWidth: 480, margin: '0 auto' }}>
      <EmptyState
        title="无法打开本机数据"
        text={`浏览器的本地存储不可用（可能是无痕模式、存储被禁用，或空间已满）。你的行程不会被丢弃；换一个普通窗口或清出空间后再试。\n\n${message}`}
        action={<Button onClick={() => window.location.reload()}>重试</Button>}
      />
    </div>
  );
}
