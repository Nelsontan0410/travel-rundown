// 从导航链接的域名认出 App（设计参考 05「导航工具」、PRD「按钮名称」）
export function navAppName(url: string): string | null {
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    if (h.endsWith('amap.com')) return '高德地图';
    if (h === 'maps.apple.com') return 'Apple Maps';
    if (h === 'maps.google.com' || h === 'maps.app.goo.gl') return 'Google Maps';
    if ((h === 'google.com' || h.endsWith('.google.com')) && u.pathname.startsWith('/maps')) return 'Google Maps';
    if (h === 'goo.gl' && u.pathname.startsWith('/maps')) return 'Google Maps';
    return null;
  } catch {
    return null;
  }
}

export function navAppsUsed(urls: (string | undefined)[]): string[] {
  const out: string[] = [];
  for (const u of urls) {
    if (!u) continue;
    const n = navAppName(u);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

export const TRANSLATE_LANGS = [
  { code: 'zh-CN', label: '中文' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
] as const;

export function translateUrl(to: string): string {
  return `https://translate.google.com/?sl=auto&tl=${encodeURIComponent(to)}&op=translate`;
}
