import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import p from './Page.module.css';
import { Screen, BackHeader } from '../components/Layout';
import { Button, NoteBox } from '../components/Basics';
import { SettingsGroup, SettingsRow } from '../components/Cards';
import { useSettings } from '../hooks/data';
import { buildPrompt, NAV_APP_NAME } from '../importer/promptTemplate';
import { updateSettings } from '../db/repo';
import { copyWithToast } from '../links/openLink';
import { ChoiceSheet } from './Sheets';
import { downloadTemplate } from './importFlow';
import { DEFAULT_SETTINGS, type NavApp } from '../domain/types';

const NAV_OPTIONS: { value: NavApp; label: string }[] = [
  { value: 'amap', label: NAV_APP_NAME.amap },
  { value: 'google-maps', label: NAV_APP_NAME['google-maps'] },
  { value: 'apple-maps', label: NAV_APP_NAME['apple-maps'] },
];

/** 导入模板页（设计稿没有，按「状态与文案」补） */
export default function TemplatePage() {
  const nav = useNavigate();
  const settings = useSettings() ?? DEFAULT_SETTINGS;
  const [sheet, setSheet] = useState<'china' | 'elsewhere' | null>(null);
  const prompt = buildPrompt(settings.navInChina, settings.navElsewhere);

  return (
    <Screen
      header={<BackHeader title="示例与模板" />}
      bottom={
        <Button block icon="Copy" onClick={() => void copyWithToast(prompt)}>
          复制提示词
        </Button>
      }
    >
      <SettingsGroup title="示例">
        <SettingsRow icon="FileText" label="打开示例行程" value="看看格式长什么样" onClick={() => nav('/import/paste?example=1')} />
      </SettingsGroup>
      <p className={p.lead}>AI 整理（可选）：如果你的行程还是一段普通文字、表格或网页，可以把下面的提示词连同行程发给任意 AI（ChatGPT、Claude 等，用你自己的账号），让它整理成 App 能识别的格式，再回到「粘贴行程」贴进来。已经整理好的行程不需要这一步。</p>
      <SettingsGroup title="导航偏好">
        <SettingsRow label="中国大陆" value={NAV_APP_NAME[settings.navInChina]} onClick={() => setSheet('china')} />
        <SettingsRow label="其他地区" value={NAV_APP_NAME[settings.navElsewhere]} onClick={() => setSheet('elsewhere')} />
      </SettingsGroup>
      <NoteBox className={p.prompt}>{prompt}</NoteBox>
      <SettingsGroup title="结构化模板（JSON / CSV）">
        <SettingsRow label="下载 JSON 模板" value="按格式填写可精准导入" onClick={() => downloadTemplate('json')} />
        <SettingsRow label="下载 CSV 模板" value="每行一个活动，可用 Excel 编辑" onClick={() => downloadTemplate('csv')} />
      </SettingsGroup>

      <ChoiceSheet
        open={sheet !== null}
        title={sheet === 'china' ? '中国大陆' : '其他地区'}
        options={NAV_OPTIONS}
        value={sheet === 'china' ? settings.navInChina : settings.navElsewhere}
        onPick={(v) => void updateSettings(sheet === 'china' ? { navInChina: v } : { navElsewhere: v })}
        onClose={() => setSheet(null)}
      />
    </Screen>
  );
}
