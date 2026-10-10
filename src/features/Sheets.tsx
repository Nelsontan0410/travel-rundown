import p from './Page.module.css';
import { Sheet } from '../components/Layout';
import { Card } from '../components/Basics';
import { Icon } from '../components/Icon';

/** 底部弹层里的单选列表 */
export function ChoiceSheet<T extends string>({
  open,
  title,
  options,
  value,
  onPick,
  onClose,
}: {
  open: boolean;
  title: string;
  options: { value: T; label: string }[];
  value: T;
  onPick: (v: T) => void;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <Card>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`${p.option} ${o.value === value ? p.optionOn : ''}`}
            onClick={() => {
              onPick(o.value);
              onClose();
            }}
          >
            {o.label}
            {o.value === value && <Icon name="CheckCircle2" size="sm" color="var(--color-primary)" />}
          </button>
        ))}
      </Card>
    </Sheet>
  );
}
