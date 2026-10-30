// Embedded in published reports; each visitor acknowledges notices independently.
const DAY = 86400000;
const STORE = 'mobiis.cash.maturity.v1';
const SEEN = 'mobiis.cash.maturity.seen.v1';
const seed = {end:'2026-10-23', deposits:[{bank:'신한은행',type:'예금',account:'207-038-986108',amount:20000000000,maturity:'2026-11-26'}]};
const memory = new Map();
function read(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return memory.get(key) ?? fallback; } }
function write(key, value) { memory.set(key,value); try { localStorage.setItem(key,JSON.stringify(value)); } catch { /* In-memory deduplication still works for this visit. */ } }
const iso = date => date.toISOString().slice(0,10);
export function koreaToday(now = new Date()) { return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(now); }
export function parseMaturity(note) {
 if (!/만기/.test(note)) return null;
 const match = String(note).match(/(20\d{2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{1,2})/);
 if (!match) return null;
 const date = `${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`;
 const parsed = new Date(date+'T00:00:00Z');
 return Number.isFinite(+parsed) && iso(parsed) === date ? date : null;
}
export function depositsFromRows(rows) {
 return (rows||[]).flatMap(row => {
  const maturity = parseMaturity(row.note);
  return maturity && row.current > 0 ? [{bank:row.bank,type:row.type,account:row.account,amount:row.current,maturity}] : [];
 });
}
const identity = item => `${item.bank}:${String(item.account).replace(/\D/g,'').slice(-4)}:${item.maturity}`;
export function dueNotices(deposits, today, seen = {}, includeSeen = false) {
 const now = Date.parse(today+'T00:00:00Z');
 const unique = new Map();
 for (const item of deposits) {
  const maturity = Date.parse(item.maturity+'T00:00:00Z');
  if (!Number.isFinite(maturity) || maturity < now || !(item.amount>0)) continue;
  const weekday = (new Date(maturity).getUTCDay()+6)%7;
  const weekStart = maturity - (weekday+7)*DAY;
  const weekly = now >= weekStart && now < weekStart+7*DAY;
  // The final weekday before the maturity month is the last reporting day.
  const monthStart = new Date(item.maturity.slice(0,7)+'-01T00:00:00Z');
  const noticeStart = new Date(+monthStart-DAY);
  while ([0,6].includes(noticeStart.getUTCDay())) noticeStart.setUTCDate(noticeStart.getUTCDate()-1);
  const monthly = now >= +noticeStart && now <= maturity;
  if (!weekly && !monthly) continue;
  const id = identity(item), monthlyKey = id+':month', weeklyKey = id+':week';
  // First arrival during the advance week gets a single, more timely notice.
  const phase = weekly ? 'week' : 'month';
  const key = phase === 'week' ? weeklyKey : monthlyKey;
  if (!includeSeen && seen[key]) continue;
  unique.set(id,{...item,key,ackKeys:weekly?[monthlyKey,weeklyKey]:[monthlyKey],title:weekly?'다음주 안내사항':`${+item.maturity.slice(5,7)}월 안내사항`});
 }
 return [...unique.values()];
}
export function mountMaturityNotices(report = null) {
 const STORE = report ? 'mobiis.cash.report-maturity.v1' : 'mobiis.cash.maturity.v1';
 const SEEN = report ? 'mobiis.cash.report-maturity.seen.v1' : 'mobiis.cash.maturity.seen.v1';
 let data = seed;
 const cached = read(STORE,null);
 if (cached && /^\d{4}-\d{2}-\d{2}$/.test(cached.end) && Array.isArray(cached.deposits) && cached.end>=data.end) data=cached;
 const style = document.createElement('style');
 style.textContent = `.maturity-popup{position:fixed;right:24px;top:78px;z-index:1500;width:500px;max-width:calc(100vw - 32px);box-sizing:border-box;background:#fff;border:1px solid #cfdaeb;border-left:4px solid #3764ab;border-radius:9px;box-shadow:0 8px 30px #1d355529;padding:15px 38px 13px 17px;color:#2e4566;font-family:inherit}.maturity-popup[hidden]{display:none}.maturity-popup h2{font-size:13px;margin:0 0 7px}.maturity-popup p{font-size:12px;line-height:1.7;margin:0 0 7px;overflow-wrap:anywhere}.maturity-popup p:last-child{margin-bottom:0}.maturity-close{position:absolute;right:10px;top:8px;background:none;border:0;font-size:23px;color:#7384a0;cursor:pointer}.maturity-open{background:none;border:0;color:#687b98;font:inherit;font-size:11px;cursor:pointer;padding:0}.maturity-popup section+section{margin-top:12px}.maturity-foot{font-size:10px!important;color:#8b99ad;margin-top:9px!important}@media(max-width:600px){.maturity-popup{top:70px;right:16px}}@media print{.maturity-popup,.maturity-open{display:none!important}}`;
 document.head.append(style);
 const popup=document.createElement('aside');popup.className='maturity-popup';popup.hidden=true;popup.setAttribute('role','dialog');popup.setAttribute('aria-label','예금 만기 안내');
 const close=document.createElement('button');close.className='maturity-close';close.type='button';close.textContent='×';close.setAttribute('aria-label','안내 확인 후 닫기');
 const body=document.createElement('div');popup.append(close,body);document.body.append(popup);
 const opener=document.createElement('button');opener.className='maturity-open';opener.type='button';opener.textContent='만기 안내';opener.setAttribute('aria-expanded','false');if(report){opener.style.cssText='position:fixed;right:24px;bottom:18px;z-index:1400;background:#fff;border:1px solid #cfdaeb;border-radius:6px;padding:8px 12px';document.body.append(opener);}else document.querySelector('.builder-header nav')?.append(opener);
 let displayed=[];
 function dismiss() {
  const seen=read(SEEN,{});
  for(const item of displayed) for(const key of item.ackKeys) seen[key]=true;
  write(SEEN,seen);popup.hidden=true;opener.setAttribute('aria-expanded','false');
  if(popup.contains(document.activeElement))opener.focus();
 }
 function show(manual=false, refreshVisible=false) {
  if(!manual&&!popup.hidden&&!refreshVisible)return;
  displayed=dueNotices(data.deposits,koreaToday(),read(SEEN,{}),manual);
  body.replaceChildren();
  for(const title of new Set(displayed.map(item=>item.title))) {
   const section=document.createElement('section'),heading=document.createElement('h2');heading.textContent=title;section.append(heading);
   for(const item of displayed.filter(item=>item.title===title)) {
    const text=document.createElement('p');
    text.append(document.createTextNode(`${item.bank} ${item.account} ${item.type||'예금'} ${+item.maturity.slice(5,7)}.${item.maturity.slice(8)} 만기 예정`),document.createElement('br'),document.createTextNode(`금액 ${new Intl.NumberFormat('ko-KR').format(item.amount)}원`));
    section.append(text);
   }
   body.append(section);
  }
  if(manual&&!displayed.length){const text=document.createElement('p');text.textContent='이번 달 또는 다음 주에 만기 예정인 예금이 없습니다.';body.append(text);}
  popup.hidden=!displayed.length&&!manual;opener.setAttribute('aria-expanded',String(!popup.hidden));
  if(manual)close.focus();
 }
 close.addEventListener('click',dismiss);
 popup.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();dismiss();}});
 opener.addEventListener('click',()=>popup.hidden?show(true):dismiss());
 function update(next) {
  if(!next || next.end<data.end || !Array.isArray(next.deposits))return;
  // Preserve full account numbers obtained locally when published rows are masked.
  next.deposits=next.deposits.map(item=>{
   const known=data.deposits.find(previous=>identity(previous)===identity(item));
   return known && /[•*]/.test(item.account)?{...item,account:known.account}:item;
  });
  data=next;write(STORE,data);show(false,true);
 }
 // Read only the newest published snapshot, without downloading historical reports.
 async function refresh() {
  const base=location.hostname==='mobiis0.github.io'?new URL('https://raw.githubusercontent.com/mobiis0/work-cash-report/main/reports/'):new URL(report?'../':'../reports/',location.href);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6000);
  try {
   const readJSON=async url=>{const response=await fetch(url,{cache:'no-store',signal:controller.signal});if(!response.ok)throw Error('unavailable');return response.json();};
   const index=await readJSON(new URL('history.json',base));
   const latest=(index.reports||[]).filter(entry=>/^archive\/\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.json$/.test(entry.path)).sort((a,b)=>b.end.localeCompare(a.end))[0];
   if(latest){const report=await readJSON(new URL(latest.path,base));if(report.end===latest.end&&Array.isArray(report.rows))update({end:report.end,deposits:depositsFromRows(report.rows)});}
  } catch { /* Use the last known snapshot when offline. */ }
  finally { clearTimeout(timer);show(); }
 }
 if(report)update({end:report.end,deposits:depositsFromRows(report.rows)});
 if(location.protocol!=='file:')refresh();else show();
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')show();});
 return {updateFromSheet(source){
  const rows=[];for(let r=6;r<=23;r++)rows.push({bank:String(source.value(`B${r}`)||''),type:String(source.value(`C${r}`)||''),account:String(source.value(`D${r}`)||''),current:source.value(`H${r}`),note:String(source.value(`I${r}`)||'')});
  if(source.ready)update({end:source.end,deposits:depositsFromRows(rows)});
 }};
}
