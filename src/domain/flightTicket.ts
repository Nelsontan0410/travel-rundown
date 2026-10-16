/** Conservative text-ticket parsing: local wall times only; the user confirms roles and time zones. */
export interface TicketTextBlock { page: number; text: string; departureColumn?: boolean }
export interface TicketCandidate {
  id: string;
  eventId: string;
  local: string;
  page: number;
  source: string;
  kind: 'departure' | 'uncertain';
  ambiguousDate: boolean;
  inferredYear: boolean;
}
const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const MONTH = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
const DATE_PATTERNS = [
  { re: /\b(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})(?:日)?\b/g, kind: 'iso' },
  { re: new RegExp(`\\b(\\d{1,2})[\\s-]*(${MONTH})[\\s,-]*(20\\d{2}|\\d{2})\\b`, 'gi'), kind: 'dayMonth' },
  { re: new RegExp(`\\b(${MONTH})[\\s-]+(\\d{1,2})[\\s,-]+(20\\d{2}|\\d{2})\\b`, 'gi'), kind: 'monthDay' },
  { re: /\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/g, kind: 'numeric' },
] as const;
export const DEPARTURE_LABEL = /\b(?:depart(?:ure|s|ing)?|take[- ]?off)\b|起飞|起飛|出发|出發/gi;
export const ARRIVAL_LABEL = /\b(?:arriv(?:al|e|es|ing)|landing)\b|抵达|抵達|到达|到達|降落/gi;
const IGNORE_LABEL = /\b(?:issued?|book(?:ed|ing)?|reserv(?:ation|ed)|boarding|duration|payment|birth|check[- ]?in)\b|出票|签发|簽發|预订|預訂|登机|登機|时长|時長|支付|出生|值机|值機/gi;
function yearOf(raw: string, referenceYear?: number): number | undefined {
  const year = Number(raw);
  if (raw.length === 4) return year;
  if (!referenceYear || referenceYear < 2000 || referenceYear > 2099) return;
  return [1900 + year, 2000 + year, 2100 + year].sort((a,b)=>Math.abs(a-referenceYear)-Math.abs(b-referenceYear))[0];
}
function dateOf(year: number | undefined, month: number, day: number): string | undefined {
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return;
  const d = new Date(Date.UTC(year,month-1,day));
  if (d.getUTCFullYear()!==year || d.getUTCMonth()!==month-1 || d.getUTCDate()!==day) return;
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}
interface DateToken { start: number; end: number; date: string; ambiguous: boolean; inferred: boolean }
function datesIn(text: string, referenceYear?: number): DateToken[] {
  const out: DateToken[]=[];
  const order = /DD\s*[/.-]\s*MM\s*[/.-]\s*Y{2,4}/i.test(text) ? 'day' : /MM\s*[/.-]\s*DD\s*[/.-]\s*Y{2,4}/i.test(text) ? 'month' : undefined;
  for (const {re,kind} of DATE_PATTERNS) {
    re.lastIndex=0;
    for (const m of text.matchAll(re)) {
      if(out.length>=500) break;
      const start=m.index!,end=start+m[0].length;
      if(out.some(d=>start<d.end&&end>d.start)) continue;
      const choices: (string|undefined)[]=[];
      let inferred=false;
      if(kind==='iso') choices.push(dateOf(Number(m[1]),Number(m[2]),Number(m[3])));
      else if(kind==='numeric') {
        if(order!=='month') choices.push(dateOf(Number(m[3]),Number(m[2]),Number(m[1])));
        if(order!=='day') choices.push(dateOf(Number(m[3]),Number(m[1]),Number(m[2])));
      } else {
        const mon=MONTHS.indexOf((kind==='dayMonth'?m[2]:m[1]).slice(0,3).toLowerCase())+1;
        inferred=m[3].length===2;
        choices.push(dateOf(yearOf(m[3],referenceYear),mon,Number(kind==='dayMonth'?m[1]:m[2])));
      }
      const valid=[...new Set(choices.filter((d):d is string=>!!d))];
      for(const date of valid) out.push({start,end,date,ambiguous:valid.length>1,inferred});
    }
  }
  return out.sort((a,b)=>a.start-b.start);
}
function lastLabel(text: string, re: RegExp): number {
  re.lastIndex=0;
  return [...text.matchAll(re)].at(-1)?.index ?? -1;
}
export function parseFlightTicketText(blocks: TicketTextBlock[], referenceYear?: number): TicketCandidate[] {
  const result: TicketCandidate[]=[];
  blocks.forEach((block,bi)=>{
    const text=block.text.normalize('NFKC').replace(/\u00a0/g,' ').replace(/(\d)\s*([/-])\s*(?=\d)/g,'$1$2');
    const dates=datesIn(text,referenceYear);
    let count=0;
    for(const t of text.matchAll(/\b(\d{1,2})(?:[:.]|时|時)([0-5]\d)(?:分)?\s*(AM|PM)?\b/gi)) {
      if(++count>500 || result.length>=80) break;
      const start=t.index!,end=start+t[0].length;
      if(dates.some(d=>start<d.end&&end>d.start)) continue;
      if(/(?:UTC|GMT)\s*[+-]?\s*$/i.test(text.slice(Math.max(0,start-12),start)) || /[+-]$/.test(text.slice(Math.max(0,start-1),start))) continue;
      let hour=Number(t[1]);const before=text.slice(Math.max(0,start-8),start);const meridian=t[3]?.toUpperCase()??(/下午|晚上/.test(before)?'PM':/上午|早上/.test(before)?'AM':undefined);
      if(meridian) {if(hour<1||hour>12) continue;hour=hour%12+(meridian==='PM'?12:0);} else if(hour>23) continue;
      const prefix=text.slice(Math.max(0,start-500),start);
      const dep=lastLabel(prefix,DEPARTURE_LABEL),arr=lastLabel(prefix,ARRIVAL_LABEL),ignore=lastLabel(prefix,IGNORE_LABEL);
      if(arr>dep || ignore>dep) continue;
      const kind=dep>=0||block.departureColumn?'departure':'uncertain';
      const candidates=dates.map(d=>({d,distance:d.end<=start?start-d.end:d.start-end+30})).filter(x=>x.distance>=0&&x.distance<=180);
      const distance=Math.min(...candidates.map(x=>x.distance));
      for(const {d} of candidates.filter(x=>x.distance===distance)) {
        const local=`${d.date}T${String(hour).padStart(2,'0')}:${t[2]}`;
        const eventId=`${block.page}:${bi}:${start}`;
        if(result.some(c=>c.local===local&&c.kind===kind&&c.ambiguousDate===d.ambiguous)) continue;
        result.push({id:`${eventId}:${d.date}`,eventId,local,page:block.page,kind,ambiguousDate:d.ambiguous,inferredYear:d.inferred,source:text.slice(Math.max(0,Math.min(start,d.start)-65),Math.min(text.length,Math.max(end,d.end)+65)).replace(/\s+/g,' ').trim()});
      }
    }
  });
  // Once departures are explicit, never offer unrelated timestamps from other blocks.
  return result.some(c=>c.kind==='departure')?result.filter(c=>c.kind==='departure'):result;
}
