// Item.key = 日期 + type + 标题 slug；同日重名加序号（PRD「解析流程」第 7 步）
export function slugify(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[\s　]+/g, '-')
    .replace(/[^\p{L}\p{N}-]+/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'item';
}

export function makeItemKey(date: string, type: string, title: string, used: Set<string>): string {
  const base = `${date}|${type}|${slugify(title)}`;
  let key = base;
  let n = 2;
  while (used.has(key)) key = `${base}#${n++}`;
  used.add(key);
  return key;
}
