import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import p from './Page.module.css';
import { Screen, BackHeader, Dialog } from '../components/Layout';
import { Button } from '../components/Basics';
import { useUI } from '../store/ui';
import { startPreview } from './importFlow';
import { SAMPLE_MD } from '../importer/sample';

/** 粘贴页（「粘贴行程文字」、旅程设置「重新导入行程」）
 * 2026-10-19：固定标签「行程内容」、常驻的格式说明（按解析器实际能力写）、查看示例、AI 模板作为可选辅助。 */
export default function PastePage() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const tripId = sp.get('trip') ?? undefined;
  const text = useUI((s) => s.pasteText);
  const setText = useUI((s) => s.setPasteText);
  const [askSample, setAskSample] = useState(false);
  const [tried, setTried] = useState(false);
  const empty = !text.trim();

  const go = () => {
    setTried(true);
    if (empty) return;
    startPreview(text, 'paste', tripId);
    nav('/import/preview');
  };
  const useSample = () => {
    setText(SAMPLE_MD);
    setAskSample(false);
  };

  return (
    <Screen
      tab="trips"
      header={<BackHeader title={tripId ? '重新导入行程' : '粘贴行程'} />}
      bottom={
        <Button block onClick={go} aria-describedby="paste-help">
          解析并预览
        </Button>
      }
    >
      <div className={p.stack}>
        <div className={p.pasteField}>
          <label htmlFor="paste-text" className={p.pasteLabel}>
            行程内容
          </label>
          <textarea
            id="paste-text"
            className={p.textarea}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="在这里粘贴行程…"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            aria-describedby="paste-help"
            aria-invalid={tried && empty ? true : undefined}
          />
          {tried && empty && (
            <p className={p.pasteError} role="alert">
              还没有内容。请先粘贴行程，或点「查看示例」看看格式。
            </p>
          )}
        </div>

        <div id="paste-help" className={p.pasteHelp}>
          <p>
            <strong>能识别的格式：</strong>按天分段的行程文字（每天一行「Day 1 | 13-01-2027 | 城市 | 时区」，每一项「### [类型] 时间 标题」），以及按模板整理的 JSON、CSV。
          </p>
          <p>
            普通聊天文字（比如直接从对话里复制、没有分天和类型的段落）<strong>没办法直接识别</strong>。可以先让 AI 按模板整理一下再粘贴。
          </p>
          <p>下一步只是检查和预览，不会保存；有问题会列出原因，原文会保留。</p>
        </div>

        <div className={p.pasteActions}>
          <Button variant="outline" icon="FileText" onClick={() => (empty ? useSample() : setAskSample(true))}>
            查看示例
          </Button>
          <Button variant="link" onClick={() => nav('/import/template')}>
            用 AI 整理行程（可选）
          </Button>
        </div>
      </div>
      <Dialog
        open={askSample}
        onClose={() => setAskSample(false)}
        title="用示例替换现在的内容？"
        text="输入框里已经有内容，看示例会把它替换掉。"
        actions={
          <>
            <Button variant="outline" onClick={() => setAskSample(false)}>
              取消
            </Button>
            <Button onClick={useSample}>替换成示例</Button>
          </>
        }
      />
    </Screen>
  );
}
