import { useNavigate, useSearchParams } from 'react-router-dom';
import p from './Page.module.css';
import { Screen, BackHeader } from '../components/Layout';
import { Button } from '../components/Basics';
import { useUI } from '../store/ui';
import { startPreview } from './importFlow';

/** 粘贴页（04「粘贴行程文字」、05「重新导入行程」） */
export default function PastePage() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const tripId = sp.get('trip') ?? undefined;
  const text = useUI((s) => s.pasteText);
  const setText = useUI((s) => s.setPasteText);

  return (
    <Screen
      tab="trips"
      header={<BackHeader title="粘贴行程" />}
      bottom={
        <Button
          block
          disabled={!text.trim()}
          onClick={() => {
            startPreview(text, 'paste', tripId);
            nav('/import/preview');
          }}
        >
          解析并预览
        </Button>
      }
    >
      <textarea
        className={p.textarea}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="把 AI 回复的 Markdown 粘贴到这里"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
      />
    </Screen>
  );
}
