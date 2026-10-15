import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import p from './Page.module.css';
import { BackHeader } from '../components/Layout';
import { Button } from '../components/Basics';
import { FileRow } from '../components/Cards';
import { DocViewer } from '../components/DocViewer';
import { db } from '../db/schema';
import { deleteDoc, lockDoc, openLockedDoc, replaceDocBlob, setDocCodeKind, unlockDoc } from '../db/repo';
import { isLinkDoc } from '../domain/bookings';
import { openExternal } from '../links/openLink';
import { Icon } from '../components/Icon';
import PasswordSheet from '../components/PasswordSheet';
import { WrongPasswordError } from '../lib/crypto';
import { toast } from '../store/ui';
import { downloadBlob, extOf, pickFile, prepareFile } from '../lib/files';
import { copyWithToast } from '../links/openLink';

/** 06 证明查看（全屏，没有 TabBar） */
export default function DocPage() {
  const nav = useNavigate();
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
  // 加密文件：解开后的明文只放在内存里，离开页面就丢掉
  const [plain, setPlain] = useState<Blob | null>(null);
  const [pw, setPw] = useState('');
  const [ask, setAsk] = useState<'unlock' | 'set' | 'remove' | null>(null);
  const locked = !!doc?.lock;
  useEffect(() => {
    if (doc?.lock && !plain && blob) setAsk('unlock');
  }, [doc?.id, !!blob]); // eslint-disable-line react-hooks/exhaustive-deps

  if (doc === null) return <Navigate to="/docs" replace />;
  if (!doc) return null;

  const view = locked ? plain : blob;
  const download = () => {
    if (!view) return;
    const name = /\.[a-z0-9]+$/i.test(doc.title) ? doc.title : `${doc.title}.${extOf(doc.mime)}`;
    downloadBlob(view, name);
  };
  const reupload = async () => {
    const f = await pickFile('image/*,application/pdf');
    if (!f) return;
    try {
      const b = await prepareFile(f);
      await replaceDocBlob(doc.id, b, locked ? pw : undefined);
      if (locked) setPlain(b);
    } catch {
      /* 超过 20 MiB */
    }
  };
  const submitPw = async (password: string, hint?: string): Promise<string | void> => {
    try {
      if (ask === 'unlock') {
        setPlain(await openLockedDoc(doc.id, password));
        setPw(password);
      } else if (ask === 'set') {
        await lockDoc(doc.id, password, hint);
        setPlain(blob ?? null);
        setPw(password);
        toast('已设置密码');
      } else if (ask === 'remove') {
        await unlockDoc(doc.id, password);
        setPlain(null);
        setPw('');
        toast('已移除密码');
      }
      setAsk(null);
    } catch (e) {
      if (e instanceof WrongPasswordError) return '密码不正确';
      return '操作失败，请再试一次';
    }
  };

  // 2026-10：只有链接的资料（网页订单 / 动态票码）
  if (isLinkDoc(doc)) {
    return (
      <div className={p.docPage}>
        <BackHeader title={doc.codeKind === 'dynamic' ? '动态票码' : '订单链接'} />
        <div className={p.lockPanel}>
          <Icon name={doc.codeKind === 'dynamic' ? 'Ticket' : 'Globe'} size="xl" />
          <p>{doc.title}</p>
          <p className={p.lockNote}>
            {doc.codeKind === 'dynamic'
              ? `动态票码会定时变化，截图无效。请在${doc.app ? `「${doc.app}」` : '官方 App '}里现场打开，需要联网。`
              : '这是网页链接，没网时打不开。可以的话，把订单页截图或存成 PDF 再添加一份。'}
          </p>
          <p className={p.lockNote} style={{ overflowWrap: 'anywhere' }}>{doc.url}</p>
          {doc.url && (
            <Button icon="ExternalLink" onClick={() => openExternal(doc.url!)}>
              打开链接
            </Button>
          )}
          {doc.url && (
            <Button variant="outline" icon="Copy" onClick={() => void copyWithToast(doc.url!)}>
              复制链接
            </Button>
          )}
          <Button
            variant="link"
            chevron={false}
            icon="Trash2"
            onClick={() => {
              void deleteDoc(doc.id).then(() => {
                toast('已删除');
                nav(-1);
              });
            }}
          >
            删除这条
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={p.docPage}>
      <BackHeader title="预订证明" right={{ icon: 'Download', label: '下载原文件', onClick: download, primary: true }} />
      <div className={p.docFile}>
        <FileRow title={doc.title} mime={doc.mime} blobKey={doc.blobKey} saved={!!blob} locked={locked} />
        {blob && (!locked || plain) && (
          <Button variant="link" chevron={false} icon={locked ? 'LockOpen' : 'Lock'} onClick={() => setAsk(locked ? 'remove' : 'set')}>
            {locked ? '移除密码' : '设置密码'}
          </Button>
        )}
        {doc.mime.startsWith('image/') && (
          <Button
            variant="link"
            chevron={false}
            icon="Ticket"
            onClick={() => void setDocCodeKind(doc.id, doc.codeKind === 'static' ? undefined : 'static').then(() => toast(doc.codeKind === 'static' ? '已取消票码标记' : '已标记为二维码 / 票码'))}
          >
            {doc.codeKind === 'static' ? '取消票码标记' : '标记为票码'}
          </Button>
        )}
      </div>
      {locked && !plain && blob ? (
        <div className={p.lockPanel}>
          <Icon name="Lock" size="xl" />
          <p>这份文件已加密</p>
          {doc.lock?.hint && <p className={p.lockNote}>提示：{doc.lock.hint}</p>}
          <Button icon="LockOpen" onClick={() => setAsk('unlock')}>
            输入密码查看
          </Button>
        </div>
      ) : (
        <DocViewer blob={locked && blob ? plain : blob} mime={doc.mime} onReupload={() => void reupload()} />
      )}
      <div className={p.docBottom}>
        <Button icon="Download" disabled={!view} onClick={download}>
          下载原文件
        </Button>
        {bookingRef && (
          <Button variant="outline" icon="Copy" onClick={() => void copyWithToast(bookingRef)}>
            复制预订编号
          </Button>
        )}
      </div>
      <PasswordSheet
        open={ask !== null}
        onClose={() => setAsk(null)}
        mode={ask === 'set' ? 'set' : 'unlock'}
        title={ask === 'set' ? '为这份文件设置密码' : ask === 'remove' ? '输入密码以移除' : '输入密码'}
        hint={doc.lock?.hint}
        onSubmit={submitPw}
      />
    </div>
  );
}
