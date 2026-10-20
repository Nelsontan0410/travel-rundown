import { describe, it, expect } from 'vitest';
import { cleanTicketText, parseDateTime, parseItinerary } from '../lib/flightItinerary';
import { joinRow, pageText, ticketCandidates } from '../lib/flightTicketPdf';

// 2026-10-21：真机 pdf.js 提取形态——同一行被拆成多个 text item 再用空格拼接，长句在中间换行。
const expectTrip = (pages: string[]) => {
  const rows = parseItinerary(pages);
  expect(rows.map(r => [r.role, r.local, r.flight, r.from?.iata, r.tz])).toEqual([
    ['outbound', '2026-11-26T13:05', 'AK168', 'KUL', 'Asia/Kuala_Lumpur'],
    ['return', '2026-11-29T17:30', 'AK169', 'NNG', 'Asia/Shanghai'],
  ]);
  // PDF 读取路径（含原解析器兜底）结果一致
  expect(ticketCandidates(pages, pages.map((text, i) => ({ page: i + 1, text: cleanTicketText(text) })), 2026).map(r => r.local))
    .toEqual(['2026-11-26T13:05', '2026-11-29T17:30']);
};
const REAL = `Passenger Information
Name TAN JING QUAN
Flight Information
Kuala Lumpur - Nanning
Departure 13 : 05 ,
November 26 , 2026 , Kuala Lumpur International Airport T2
Arrival 16 : 45 ,
November 26 , 2026 , Nanning Wuxu International Airport T2
Airline AirAsia Berhad (Malaysia) AK168
Nanning - Kuala Lumpur
1Departure 17 : 30 ,
November 29 , 2026 , Nanning Wuxu International Airport T2
Arrival 21 : 20 ,
November 29 , 2026 , Kuala Lumpur International Airport T2
Airline AirAsia Berhad (Malaysia) AK169`;

describe('real pdf.js text shapes (split items, spaces, line breaks)', () => {
  it('"13 : 05 ," with the date on the next line', () => expectTrip([REAL]));
  it('multiple spaces between items and a page break before the return leg', () => {
    const spaced = REAL.replace(/ /g, '   ');
    const at = spaced.indexOf('Nanning   -   Kuala');
    expectTrip([spaced.slice(0, at), spaced.slice(at)]);
  });
  it('tokens broken across many lines', () => {
    expectTrip([`Flight Information
Kuala Lumpur - Nanning
Departure
13
:
05
,
November
26
,
2026
,
Kuala Lumpur
International Airport T2
Arrival 16:45, November 26, 2026, Nanning Wuxu
International Airport T2
Airline AirAsia Berhad (Malaysia) AK168
Nanning - Kuala Lumpur
1 Departure 17 :
30 , November
29 , 2026 , Nanning Wuxu International Airport T2
Arrival 21:20, November 29, 2026, Kuala Lumpur International Airport T2
Airline AirAsia Berhad (Malaysia) AK169`]);
  });
  it('whole leg flattened into one line, full-width punctuation', () => {
    expectTrip([
      'Flight Information Kuala Lumpur - Nanning Departure 13：05， November 26， 2026， Kuala Lumpur International Airport T2 Arrival 16 : 45 , November 26 , 2026 , Nanning Wuxu International Airport T2 Airline AirAsia Berhad (Malaysia) AK168',
      'Nanning - Kuala Lumpur 1Departure 17 : 30 , November 29 , 2026 , Nanning Wuxu International Airport T2 Arrival 21 : 20 , November 29 , 2026 , Kuala Lumpur International Airport T2 Airline AirAsia Berhad (Malaysia) AK169',
    ]);
  });
  it('character spacing ("2 0 2 6", "N o v e m b e r") is collapsed', () => {
    expectTrip([REAL.replace(/2026/g, '2 0 2 6').replace(/November/g, 'N o v e m b e r')]);
  });
  it('cleanTicketText normalizes split times and spaces before punctuation', () => {
    expect(cleanTicketText('Departure 13 : 05 ,\nNovember 26 , 2026 , KLIA')).toBe('Departure 13:05,\nNovember 26, 2026, KLIA');
    expect(cleanTicketText('Departure 13：05，November 26，2026')).toBe('Departure 13:05,November 26,2026');
    expect(cleanTicketText('13 :\n05')).toBe('13:05');
  });
  it('parseDateTime tolerates whitespace and line breaks between month, day and year', () => {
    expect(parseDateTime('13 : 05 , November\n26 ,\n2026')?.local).toBe('2026-11-26T13:05');
    expect(parseDateTime('November26,2026 1 : 05 PM')?.local).toBe('2026-11-26T13:05');
  });
});

describe('row assembly from pdf.js items', () => {
  it('joins tightly spaced items without a space and keeps real word gaps', () => {
    const atoms = [
      { text: 'Departure', x: 10, y: 700, width: 50, size: 10 },
      { text: '13', x: 64, y: 700, width: 10, size: 10 },
      { text: ':', x: 74.2, y: 700, width: 3, size: 10 },
      { text: '05', x: 77.3, y: 700, width: 10, size: 10 },
      { text: ',', x: 87.3, y: 700, width: 2, size: 10 },
      { text: 'November', x: 92, y: 700.5, width: 45, size: 10 },
      { text: '26', x: 140, y: 700, width: 10, size: 10 },
      { text: ',', x: 150, y: 700, width: 2, size: 10 },
      { text: '2026', x: 155, y: 700, width: 20, size: 10 },
    ];
    expect(joinRow(atoms)).toBe('Departure 13:05, November 26, 2026');
    expect(pageText(atoms)).toBe('Departure 13:05, November 26, 2026');
  });
  it('items without width still produce readable, spaced text', () => {
    expect(joinRow([{ text: 'Arrival', x: 0, y: 0, width: 0 }, { text: '16:45', x: 1, y: 0, width: 0 }])).toBe('Arrival 16:45');
  });
});
