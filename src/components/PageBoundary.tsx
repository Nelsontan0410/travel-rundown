// 2026-10-18：页面出错时不要整页空白。
// 数据库连接断了（iOS 从后台回来常见）→ 自动重新连接后重画这一页；其他错误 → 显示「重新载入」。
// 换页面时自动复原。
import { Component, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Button, EmptyState } from './Basics';
import { isDbLost, recoverDb } from '../db/recover';

interface State {
  error: unknown;
  retried: number;
}

class Boundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, retried: 0 };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error };
  }

  componentDidCatch(error: unknown) {
    if (isDbLost(error) && this.state.retried < 2) {
      void recoverDb().then((ok) => {
        if (ok) this.setState((s) => ({ error: null, retried: s.retried + 1 }));
        else window.location.reload();
      });
    }
  }

  render() {
    const { error, retried } = this.state;
    if (!error) return this.props.children;
    if (isDbLost(error) && retried < 2) return null;
    return (
      <div style={{ padding: 'var(--space-5)', maxWidth: 480, margin: '0 auto' }}>
        <EmptyState
          title="这一页没有显示出来"
          text="资料都还在手机上。重新载入一下就好。"
          action={<Button onClick={() => window.location.reload()}>重新载入</Button>}
        />
      </div>
    );
  }
}

export default function PageBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <Boundary key={pathname}>{children}</Boundary>;
}
