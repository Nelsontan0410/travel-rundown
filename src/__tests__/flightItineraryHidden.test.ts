import { describe, expect, it } from 'vitest';
import { parseItinerary } from '../lib/flightItinerary';
import { excerptOf } from '../lib/flightTicketPdf';

// 2026-10-21：真机 PDF 夹带看不见的字符时，显示正常但原来匹配失败
const base = `Flight Information
Kuala Lumpur - Nanning
Departure 13:05, November 26, 2026, Kuala Lumpur International Airport T2
Arrival 16:45, November 26, 2026, Nanning Wuxu International Airport T2
Airline AirAsia Berhad (Malaysia) AK168
Nanning - Kuala Lumpur
1Departure 17:30, November 29, 2026, Nanning Wuxu International Airport T2
Arrival 21:20, November 29, 2026, Kuala Lumpur International Airport T2
Airline AirAsia Berhad (Malaysia) AK169`;

describe('行程单夹带看不见的字符', () => {
  const variants: [string, string][] = [
    ['方向标记 U+200E', base.replace(/(\d)/g, '‎$1')],
    ['方向嵌入 U+202A/U+202C', base.replace(/^/gm, '‪').replace(/$/gm, '‬')],
    ['软连字符拆词', base.replace(/November/g, 'Nov­ember').replace(/Departure/g, 'Depar­ture')],
    ['标签与时间之间只有隐藏字符', base.replace(/Departure /g, 'Departure‎').replace(/Arrival /g, 'Arrival⁠')],
    ['窄不换行空格 U+202F', base.replace(/ /g, ' ')],
    ['控制字符', base.replace(/, /g, ',\u0003')],
  ];
  for (const [name, text] of variants) it(name, () => {
    const c = parseItinerary([text]);
    expect(c.map(x => [x.local, x.flight, x.role])).toEqual([
      ['2026-11-26T13:05', 'AK168', 'outbound'],
      ['2026-11-29T17:30', 'AK169', 'return'],
    ]);
  });
  it('失败片段列出看不见的字符', () => {
    expect(excerptOf(['Flight Information‎ x'])).toMatch(/U\+200E×1/);
    expect(excerptOf(['Flight Information x'])).not.toMatch(/看不见/);
  });
});
