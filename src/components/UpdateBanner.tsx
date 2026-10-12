import { useUI } from '../store/ui';
import { InfoBanner } from './Basics';

/** 有新版本：顶部固定提示，点击刷新 */
export default function UpdateBanner() {
  const update = useUI((s) => s.updateSW);
  if (!update) return null;
  return (
    <div style={{ position: 'fixed', top: 'var(--safe-top, 0px)', left: 0, right: 0, zIndex: 50, padding: 'var(--space-2) var(--space-4)' }}>
      <InfoBanner variant="info" onClick={update}>
        有新版本，点此刷新
      </InfoBanner>
    </div>
  );
}
