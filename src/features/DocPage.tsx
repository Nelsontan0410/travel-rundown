import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import p from './Page.module.css';
import { BackHeader } from '../components/Layout';
import { Button } from '../components/Basics';
import { FileRow } from '../components/Cards';
import { DocViewer } from '../components/DocViewer';
import { db } from '../db/schema';
import { replaceDocBlob } from '../db/repo';
import { downloadBlob, extOf, pickFile, prepareFile } from '../lib/files';
import { copyWithToast } from '../links/openLink';

/** 06 证明查看（全屏，没有 TabBar） */
export default function DocPage() {
  const { docId } = useParams();
  const [sp] = useSearchParams();
  const itemKey = sp.get('item');
  const doc = useLiveQuery(async () => (docId ? (await db.docs.get(docId)) ?? null : null), [docId]);
  const blob = useLiveQuery(async () => {
    if (!doc) return undefined;
    return (await db.blobs.get(doc.blobKey))?.blob ?? null;
  }, [doc?.blobKey, doc?.updatedAt]);
  // 预订编号：优先取进入时的行程项，否则取第一个有订单号的关联项
  const bookingRef = useLiveQuery(async () => {
    if (!doc) return undefined;
    const keys = itemKey ? [itemKey, ...doc.itemKeys] : doc.itemKeys;
    for (const k of keys) {
      const it = await db.items.where('key').equals(k).and((i) => i.tripId === doc.tripId).first();
      if (it?.bookingRef) return it.bookingRef;
    }
    return null;
  }, [doc?.id, itemKey]);

  if (doc === null) return <Navigate to="/docs" replace />;
  if (!doc) return null;

  const download = () => {
    if (!blob) return;
    const name = /\.[a-z0-9]+$/i.test(doc.title) ? doc.title : `${doc.title}.${extOf(doc.mime)}`;
    downloadBlob(blob, name);
  };
  const reupload = async () => {
    const f = await pickFile('image/*,application/pdf');
    if (!f) return;
    try {
      await replaceDocBlob(doc.id, await prepareFile(f));
    } catch {
      /* 超过 20 MiB */
    }
  };

  return (
    <div className={p.docPage}>
      <BackHeader title="预订证明" right={{ icon: 'Download', label: '下载原文件', onClick: download, primary: true }} />
      <div className={p.docFile}>
        <FileRow title={doc.title} mime={doc.mime} blobKey={doc.blobKey} saved={!!blob} />
      </div>
      <DocViewer blob={blob} mime={doc.mime} onReupload={() => void reupload()} />
      <div className={p.docBottom}>
        <Button icon="Download" disabled={!blob} onClick={download}>
          下载原文件
        </Button>
        {bookingRef && (
          <Button variant="outline" icon="Copy" onClick={() => void copyWithToast(bookingRef)}>
            复制预订编号
          </Button>
        )}
      </div>
    </div>
  );
}
