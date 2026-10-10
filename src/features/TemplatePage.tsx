import { useState } from 'react';
import p from './Page.module.css';
import { Screen, BackHeader } from '../components/Layout';
import { Button, NoteBox } from '../components/Basics';
import { SettingsGroup, SettingsRow } from '../components/Cards';
import { useSettings } from '../hooks/data';
import { buildPrompt, NAV_APP_NAME } from '../importer/promptTemplate';
import { updateSettings } from '../db/repo';
import { copyWithToast } from '../links/openLink';
import { ChoiceSheet } from './Sheets';
import { DEFAULT_SETTINGS, type NavApp } from '../domain/types';

const NAV_OPTIONS: { value: NavApp; label: string }[] = [
  { value: 'amap', label: NAV_APP_NAME.amap },
  { value: 'google-maps', label: NAV_APP_NAME['google-maps'] },
  { value: 'apple-maps', label: NAV_APP_NAME['apple-maps'] },
];

/** 导入模板页（设计稿没有，按「状态与文案」补） */
export default function TemplatePage() {
  const settings = useSettings() ?? DEFAULT_SETTINGS;
  const [sheet, setSheet] = useState<'china' | 'elsewhere' | null>(null);
  const prompt = buildPrompt(settings.navInChina, settings.navElsewhere);

  return (
    <Screen
      tab="trips"
      header={<BackHeader title="导入模板" />}
      bottom={
        <Button block icon="Copy" onClick={() => void copyWithToast(prompt)}>
          复制提示词
        </Button>
      }
    >
      <p className={p.lead}>把下面的提示词连同你的行程发给任意 AI，再把它回复的 Markdown 粘贴回来</p>
      <SettingsGroup title="导航偏好">
        <SettingsRow label="中国大陆" value={NAV_APP_NAME[settings.navInChina]} onClick={() => setSheet('china')} />
        <SettingsRow label="其他地区" value={NAV_APP_NAME[settings.navElsewhere]} onClick={() => setSheet('elsewhere')} />
      </SettingsGroup>
      <NoteBox className={p.prompt}>{prompt}</NoteBox>

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
