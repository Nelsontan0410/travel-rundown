import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import p from './Page.module.css';
import { Screen, BackHeader, Dialog } from '../components/Layout';
import { Button } from '../components/Basics';
import { useUI } from '../store/ui';
import { importFile, startPreview } from './importFlow';
import ImportSteps from '../components/ImportSteps';
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
  // 从「示例与模板」进来：输入框空着就直接放示例
  useEffect(() => {
    if (sp.get('example') === '1' && !text.trim()) setText(SAMPLE_MD);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const onFile = async () => {
    if (await importFile(tripId)) nav('/import/preview');
  };

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
      header={<BackHeader title={tripId ? '重新导入行程' : '导入行程'} />}
      bottom={
        <Button block onClick={go} aria-describedby="paste-help">
          解析并预览
        </Button>
      }
    >
      <ImportSteps step={1} />
      <div className={p.stack}>
        <div className={p.pasteField}>
          <label htmlFor="paste-text" className={p.pasteLabel}>
            行程内容
          </label>
          <p className={p.lockNote}>粘贴已整理好的行程，下一步先预览，确认后才保存。草稿会留在这台设备上。</p>
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

        <div className={p.pasteActions}>
          <Button variant="outline" icon="FileText" onClick={() => (empty ? useSample() : setAskSample(true))}>
            查看格式示例
          </Button>
          <Button variant="outline" icon="FileUp" onClick={() => void onFile()}>
            导入文件
          </Button>
        </div>

        <div id="paste-help" className={p.pasteHelp}>
          <p>
            <strong>能识别的格式：</strong>按天分段的行程文字，以及按模板整理的 JSON、CSV。例如：
          </p>
          <pre className={p.pasteExample}>{`## Day 1 | 13-01-2027 | 札幌 | Asia/Tokyo | 抵达
### [spot] 10:00 大通公园
### [meal] 12:00 午餐`}</pre>
          <p>
            普通聊天文字（比如直接从对话里复制、没有分天和类型的段落）<strong>没办法直接识别</strong>。可以先让 AI 按模板整理一下再粘贴。
          </p>
          <p>下一步只是检查和预览，不会保存；有问题会列出原因，原文会保留。</p>
        </div>

        <Button variant="link" onClick={() => nav('/import/template')}>
          行程还是普通文字？用 AI 整理（可选）
        </Button>
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
