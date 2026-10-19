import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import './styles/tokens.css';
import './styles/global.css';
import App from './App';
import { Boundary } from './components/PageBoundary';

import { useUI } from './store/ui';
import { db } from './db/schema';
import DbErrorPage from './features/DbErrorPage';
import { installDbRecovery } from './db/recover';
import { installDiag } from './lib/diag';

installDiag();

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    useUI.setState({ updateSW: () => void updateSW(true) });
  },
  // 回到前台时顺便检查有没有新版本（有就自动换上）
  onRegisteredSW(_url, reg) {
    if (!reg) return;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void reg.update().catch(() => undefined);
    });
  },
});

installDbRecovery();

const root = createRoot(document.getElementById('root')!);
db.open()
  .then(() =>
    root.render(
      <StrictMode>
        <BrowserRouter>
          {/* 2026-10-19：最外层也接住错误，不会整个 App 卸载成白屏 */}
          <Boundary>
            <App />
          </Boundary>
        </BrowserRouter>
      </StrictMode>,
    ),
  )
  .catch((e: unknown) => root.render(<DbErrorPage message={e instanceof Error ? e.message : String(e)} />));
