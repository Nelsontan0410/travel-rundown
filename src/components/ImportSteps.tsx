// 2026-10-19 导入流程的步骤条：1 粘贴内容 → 2 预览确认
import s from './ImportSteps.module.css';

export default function ImportSteps({ step }: { step: 1 | 2 }) {
  const steps = ['粘贴内容', '预览确认'];
  return (
    <ol className={s.steps} aria-label={`导入步骤：第 ${step} 步，共 2 步`}>
      {steps.map((label, i) => {
        const n = i + 1;
        const state = n === step ? s.on : n < step ? s.done : '';
        return (
          <li key={label} className={`${s.step} ${state}`} aria-current={n === step ? 'step' : undefined}>
            <span className={s.num} aria-hidden="true">
              {n < step ? '✓' : n}
            </span>
            <span>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
