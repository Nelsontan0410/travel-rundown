import { InfoBanner, Card } from './Basics';
import { SettingsRow } from './Cards';
import { RULE_LABEL, type Issue } from '../domain/check';

/** 准备检查结果。onPick 有值时每条可点击跳转。 */
export default function CheckList({ issues, onPick }: { issues: Issue[]; onPick?: (i: Issue) => void }) {
  if (issues.length === 0) return <InfoBanner variant="success">准备就绪</InfoBanner>;
  return (
    <Card>
      {issues.map((i, n) => (
        <SettingsRow
          key={`${i.itemKey}-${i.rule}-${n}`}
          label={`Day ${i.dayIndex} · ${i.title}`}
          value={RULE_LABEL[i.rule]}
          arrow={!!onPick}
          onClick={onPick ? () => onPick(i) : undefined}
        />
      ))}
    </Card>
  );
}
