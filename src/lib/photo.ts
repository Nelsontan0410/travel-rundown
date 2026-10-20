// 旅行亮点的照片：选图后在浏览器里检查、缩小再保存。不依赖临时 Object URL。
export const PHOTO_MAX_INPUT = 30 * 1024 * 1024;
export const PHOTO_MAX_EDGE = 1600;
export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,image/*';

export type PhotoErrorCode = 'type' | 'big' | 'decode' | 'encode';
export class PhotoError extends Error {
  constructor(public code: PhotoErrorCode) {
    super(PHOTO_ERROR_TEXT[code]);
  }
}
export const PHOTO_ERROR_TEXT: Record<PhotoErrorCode, string> = {
  type: '这不是图片文件，请选 JPG / PNG / WebP 照片',
  big: '这张照片太大了（超过 30 MB），请换一张或先缩小',
  decode: '读不出这张照片，请换成 JPG / PNG / WebP 格式',
  encode: '处理照片失败，请再试一次',
};

/** 长边不超过 max，不放大 */
export function fitSize(w: number, h: number, max = PHOTO_MAX_EDGE): { w: number; h: number } {
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

export function checkPhotoFile(f: { type: string; size: number; name?: string }): PhotoErrorCode | null {
  const looksImage = f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name ?? '');
  if (!looksImage) return 'type';
  if (f.size > PHOTO_MAX_INPUT) return 'big';
  return null;
}

/** 检查 → 解码（按照片自带的方向）→ 缩到 1600px → 存成 JPEG */
export async function processPhoto(file: File): Promise<Blob> {
  const bad = checkPhotoFile(file);
  if (bad) throw new PhotoError(bad);
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new PhotoError('decode');
  }
  const { w, h } = fitSize(bmp.width, bmp.height);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new PhotoError('encode');
  ctx.fillStyle = '#fff'; // 带透明的 PNG 垫白底
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
  if (!blob) throw new PhotoError('encode');
  return blob;
}
