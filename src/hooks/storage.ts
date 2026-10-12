import { useEffect, useState } from 'react';

export interface StorageInfo {
  usedMB?: number;
  persisted?: boolean;
}

/** 存储状态：已用空间和是否已申请持久存储 */
export function useStorageInfo(): StorageInfo {
  const [info, setInfo] = useState<StorageInfo>({});
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const [est, persisted] = await Promise.all([
          navigator.storage?.estimate?.(),
          navigator.storage?.persisted?.(),
        ]);
        if (live) setInfo({ usedMB: est?.usage != null ? Math.round((est.usage / 1048576) * 10) / 10 : undefined, persisted });
      } catch {
        /* 不支持就不显示 */
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  return info;
}
