// v2：证明文件加密。全部在本机完成，密码不保存；忘记密码无法恢复。
// AES-GCM 256，密钥由 PBKDF2-SHA256 从密码导出。GCM 自带校验，密码错会直接解密失败。
import type { DocLock } from '../domain/types';

const ITER = 310_000;

function b64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(password: string, salt: Uint8Array, iter: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: iter, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export class WrongPasswordError extends Error {}

export async function encryptBlob(blob: Blob, password: string, hint?: string): Promise<{ blob: Blob; lock: DocLock }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ITER);
  const data = new Uint8Array(await blob.arrayBuffer());
  const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, data as BufferSource);
  return {
    blob: new Blob([enc], { type: 'application/octet-stream' }),
    lock: { salt: b64(salt), iv: b64(iv), iter: ITER, ...(hint ? { hint } : {}) },
  };
}

export async function decryptBlob(blob: Blob, lock: DocLock, password: string, mime: string): Promise<Blob> {
  const key = await deriveKey(password, unb64(lock.salt), lock.iter);
  try {
    const data = new Uint8Array(await blob.arrayBuffer());
    const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(lock.iv) as BufferSource }, key, data as BufferSource);
    return new Blob([dec], { type: mime });
  } catch {
    throw new WrongPasswordError('密码不正确');
  }
}

export const MIN_PASSWORD = 4;
