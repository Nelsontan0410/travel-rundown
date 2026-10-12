import { Dialog } from './Layout';
import { Button } from './Basics';
import { useUI } from '../store/ui';
import { pickAndRestore } from '../features/importFlow';

/** 恢复备份前的确认：说明是合并，不是覆盖 */
export default function RestoreConfirm() {
  const open = useUI((s) => s.restoreAsk);
  const close = () => useUI.setState({ restoreAsk: false });
  return (
    <Dialog
      open={open}
      title="恢复备份？"
      text="备份里的旅程会合并到本机：同一个旅程会被备份里的版本更新，本机其他旅程不会被删除。"
      actions={
        <>
          <Button variant="outline" onClick={close}>
            取消
          </Button>
          <Button
            onClick={() => {
              close();
              void pickAndRestore();
            }}
          >
            选择备份文件
          </Button>
        </>
      }
    />
  );
}
