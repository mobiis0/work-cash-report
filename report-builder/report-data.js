import {historyForPeriod} from './print-report.js?v=20261002-8';
import {inspectWorkbook,readWorkbookSheet} from '../excel.js?v=20261002-5';
export {inspectWorkbook};
const compact=v=>String(v??'').replace(/\s/g,'');
const num=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
const number=(v,fallback=0)=>num(v)??fallback;
const dateFromSerial=v=>new Date(Date.UTC(1899,11,30)+Math.round(v)*86400000).toISOString().slice(0,10);
const bank=v=>compact(v).replace(/\(.*?\)/g,'');
const money=(v,currency='KRW')=>new Intl.NumberFormat('ko-KR',{maximumFractionDigits:currency==='KRW'?0:2}).format(v)+(currency==='KRW'?'원':currency==='EUR'?'유로':'파운드');
const rate=v=>new Intl.NumberFormat('ko-KR',{maximumFractionDigits:2}).format(v)+'원';
const accountMask=v=>{const digits=String(v??'').replace(/\D/g,'');return digits?'•••• '+digits.slice(-4):'—';};
const categories=['cash','foreign','stocks','assets'];
function dateRange(value,year){
 if(typeof value==='number'&&value>30000&&value<100000){const d=dateFromSerial(value);return{start:d,end:d};}
 const s=String(value??'');let m=s.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:\s*[~～–]\s*(?:(\d{4})[-./])?(?:(\d{1,2})[-./])?(\d{1,2}))?/);
 if(!m)return null;
 const pad=x=>String(x).padStart(2,'0'),start=`${m[1]}-${pad(m[2])}-${pad(m[3])}`,end=m[6]?`${m[4]||m[1]}-${pad(m[5]||m[2])}-${pad(m[6])}`:start;
 return{start,end};
}
export function parseDailyLedger(sheet,report){
 const v=sheet.value,days=[],merged=new Set(sheet.mergedRanges||[]);
 let day=null,direction=null;
 const rowNumbers=[...new Set([...sheet.cells.keys()].map(ref=>+ref.match(/\d+$/)[0]))].sort((a,b)=>a-b);
 for(const r of rowNumbers){
  const dr=dateRange(v(`B${r}`),report.end.slice(0,4));if(dr){day={...dr,columns:[],entries:{in:[],out:[]},summaries:{},source:`${sheet.name}!B${r}`};days.push(day);direction=null;continue;}
  if(!day)continue;
  const label=compact(v(`B${r}`));if(label==='입금'||label==='출금')direction=label==='입금'?'in':'out';
  if(compact(v(`C${r}`))==='내용'){
   day.columns=[...sheet.cells.keys()].filter(ref=>+ref.match(/\d+$/)[0]===r&&columnNumber(ref.replace(/\d+$/,''))>=5).map(ref=>({col:ref.replace(/\d+$/,''),label:String(v(ref)??'').trim()})).filter(h=>h.label).sort((a,b)=>columnNumber(a.col)-columnNumber(b.col)).map(h=>({...h,currency:/유로|EUR/i.test(h.label)?'EUR':/파운드|GBP/i.test(h.label)?'GBP':'KRW',total:compact(h.label)==='합계'}));
   continue;
  }
  if(!day.columns.length)continue;
  const who=String(v(`C${r}`)??'').trim(),description=String(v(`D${r}`)??'').trim();
  const amounts=Object.fromEntries(day.columns.map(h=>[h.col,num(v(`${h.col}${r}`))]));
  const kind=compact(who);
  let summary=kind==='소계'?(direction==='in'?'income':'outcome'):kind==='합계'?'net':kind==='전일잔액'?'opening':/^당일잔액/.test(kind)?'closing':null;
  // In this template C:D is merged for subtotal/balance rows, including a subtotal whose label was left blank.
  if(!who&&!description&&direction&&merged.has(`C${r}:D${r}`)&&Object.values(amounts).some(n=>n!==null))summary=direction==='in'?'income':'outcome';
  if(summary){day.summaries[summary]={label:who||'소계',amounts,source:`${sheet.name}!C${r}:N${r}`};continue;}
  if(!direction||(!who&&!description&&!Object.values(amounts).some(n=>n!==null&&n!==0)))continue;
  day.entries[direction].push({counterparty:who,description,amounts,source:`${sheet.name}!C${r}:N${r}`,row:r});
 }
 return{sheet:sheet.name,days:days.filter(d=>d.end>=report.start&&d.start<=report.end)};
}
export async function readDailyLedger(model,sheetName,report){
 return sheetName?parseDailyLedger(await readWorkbookSheet(model,sheetName),report):{sheet:'',days:[]};
}
export function ledgerTransactions(ledger){
 const result=[];
 for(const day of ledger.days)for(const direction of ['in','out'])for(const entry of day.entries[direction])for(const h of day.columns){
  if(h.total)continue;const amount=entry.amounts[h.col];if(amount===null||amount===0)continue;
  result.push({bank:bank(h.label),currency:h.currency,direction,amount:Math.abs(amount),counterparty:entry.counterparty,description:entry.description,date:day.end,dateLabel:day.start===day.end?day.end.slice(5):`${day.start.slice(5)}~${day.end.slice(5)}`,source:`${ledger.sheet}!${h.col}${entry.row}`});
  }
 return result;
}
export async function dailyTransactions(model,sheetName,report){return ledgerTransactions(await readDailyLedger(model,sheetName,report));}
function transactionLabel(t){
 // Only customer/company names from sales receipts are published. Individual payee names stay in the workbook.
 if(t.direction==='in'&&/매출|대금입금|대금 입금/.test(t.description))return `${t.counterparty} · ${t.description}`;
 return t.description||(/이자/.test(t.counterparty)?'결산이자':'기타 거래');
}
function narrative(top,direction){
 if(!top.length)return'해당 기간의 일일 거래내역이 없습니다.';
 if(direction==='out'){
  if(/급여/.test(top[0].description))return'금주에는 급여이체가 있었습니다.';
  if(/상여/.test(top[0].description))return'금주에는 상여금 지급이 있었습니다.';
  return`금주의 가장 큰 출금 항목은 ${top[0].description||'기타 지급'}입니다.`;
 }
 const sales=top.filter(t=>/매출|대금입금|대금 입금/.test(t.description));
 if(sales.length){const companies=[...new Set(sales.map(t=>t.counterparty).filter(Boolean))];return`금주에는 ${companies.join('·')}에서 매출대금 입금이 있었습니다.`;}
 if(/이자/.test(top[0].description+' '+top[0].counterparty))return'금주에는 결산이자 입금이 있었습니다.';
 return`금주의 가장 큰 입금 항목은 ${top[0].description||'기타 입금'}입니다.`;
}
function attachTransactions(rows,transactions,warnings){
 for(const row of rows)for(const direction of ['in','out']){
  const amount=row[direction];if(!amount)continue;
  const pool=transactions.filter(t=>t.direction===direction&&t.currency===row.currency&&(row.currency!=='KRW'||t.bank===bank(row.bank)));
  const active=rows.filter(r=>r.currency===row.currency&&(row.currency!=='KRW'||bank(r.bank)===bank(row.bank))&&r[direction]>0);
  const sum=pool.reduce((s,t)=>s+t.amount,0),matched=active.length===1&&Math.abs(sum-amount)<.02;
  const top=pool.sort((a,b)=>b.amount-a.amount).slice(0,3);
  row.details??={};row.details[direction]={message:pool.length?(matched?'':'은행별 주요 거래: ')+narrative(top,direction):'해당 기간의 주요 거래내역이 없습니다.',matched,total:sum,scope:matched?'주간 금액과 일일내역 합계 일치':pool.length?'은행별 주요 거래':'일일내역 미연결',items:top.map(t=>({label:transactionLabel(t),amount:t.amount,date:t.dateLabel,source:t.source})),count:pool.length};
  if(!matched)warnings.push(`${row.bank} ${row.type} ${direction==='in'?'입금':'출금'}: 일일내역과 계좌 연결을 확인하세요.`);
 }
}
function columnNumber(s){return[...s].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);}
function colName(n){let s='';while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);}return s;}
// The workbook has a separate three-year total series in millions of won.
export function parseThreeYearTotals(sheet,end){
 const v=sheet.value;
 const ref=[...sheet.cells.keys()].find(ref=>/^C\d+$/.test(ref)&&/^총합.*백만/.test(compact(v(ref))));
 if(!ref)return [];
 const row=+ref.slice(1),dateRow=row-1;
 const columns=[...sheet.cells.keys()].filter(ref=>+ref.match(/\d+$/)[0]===row&&columnNumber(ref.replace(/\d+$/,''))>=4&&num(v(ref))!==null).map(ref=>ref.replace(/\d+$/,'')).sort((a,b)=>columnNumber(a)-columnNumber(b));
 let month=null;
 const points=columns.map(col=>{
  const raw=v(col+dateRow),label=String(raw??'').trim();let parts=null;
  if(typeof raw==='number'&&raw>30000&&raw<100000){const date=dateFromSerial(raw);parts={year:+date.slice(0,4),month:+date.slice(5,7),day:+date.slice(8)};month=parts.month;}
  else {const full=label.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/),md=label.match(/(\d{1,2})\s*[월/.-]\s*(\d{1,2})/),d=label.match(/^(\d{1,2})일?$/);
   if(full){parts={year:+full[1],month:+full[2],day:+full[3]};month=parts.month;}
   else if(md){parts={month:+md[1],day:+md[2]};month=parts.month;}
   else if(d&&month)parts={month,day:+d[1]};
  }
  return {parts,label,assets:num(v(col+row))*1e6,source:sheet.name+'!'+col+row};
 });
 let year=+end.slice(0,4),nextMonth=+end.slice(5,7),nextDay=+end.slice(8);
 for(let i=points.length-1;i>=0;i--){const p=points[i],d=p.parts;if(!d)continue;
  if(d.year)year=d.year;else if(d.month-nextMonth>=6)year--;
  p.date=String(year)+'-'+String(d.month).padStart(2,'0')+'-'+String(d.day).padStart(2,'0');nextMonth=d.month;nextDay=d.day;
 }
 let anchorDate=null;
 for(const p of points){p.exactDate=Boolean(p.date);if(p.date)anchorDate=p.date;else p.date=anchorDate;delete p.parts;}
 return historyForPeriod(points.filter(p=>p.date),end,3);
}
export async function graphHistory(model,name,report,summary,warnings){
 const history=[];if(name){const sh=await readWorkbookSheet(model,name),v=sh.value;
  const labels=new Map([...sh.cells.keys()].filter(x=>/^C\d+$/.test(x)).map(ref=>[compact(v(ref)),+ref.slice(1)]));
  const foreign=labels.get('외화'),stocks=labels.get('주식'),cash=labels.get('원화'),assets=labels.get('총계');
  if(foreign&&stocks&&cash&&assets){
   const dateLabel=labels.get('날짜'),dateRow=dateLabel&&dateLabel<foreign?dateLabel:foreign-6,max=Math.max(...[...sh.cells.keys()].filter(x=>new RegExp(`^[A-Z]+${dateRow}$`).test(x)).map(x=>columnNumber(x.replace(/\d+$/,''))));
   const seen=new Set();let duplicate=0,mismatch=0,incomplete=0;
   for(let c=4;c<=max;c++){const col=colName(c),date=num(v(`${col}${dateRow}`));if(date===null||date<30000||date>100000)continue;
    const d=dateFromSerial(date);if(d>report.end)continue;
    const point={date:d,cash:num(v(`${col}${cash}`)),foreign:num(v(`${col}${foreign}`)),stocks:num(v(`${col}${stocks}`)),assets:num(v(`${col}${assets}`)),source:`${name}!${col}${dateRow}:${col}${assets}`};
    if(categories.some(k=>point[k]===null)){incomplete++;continue;}
    if(seen.has(d)){duplicate++;continue;}
    if(Math.abs(point.cash+point.foreign+point.stocks-point.assets)>1){mismatch++;continue;}
    seen.add(d);history.push(point);
   }
   if(duplicate)warnings.push(`그래프에 날짜 중복 ${duplicate}개가 있어 중복 열을 제외했습니다.`);
   if(mismatch)warnings.push(`그래프의 구성금액과 총계가 불일치하는 ${mismatch}개 열을 제외했습니다.`);
   if(incomplete)warnings.push(`그래프의 금액이 누락된 ${incomplete}개 열을 제외했습니다.`);
  }else warnings.push('그래프의 외화·주식·원화·총계 데이터 행을 찾지 못했습니다.');
 }else warnings.push('그래프 시트가 없어 이전주와 금주 두 시점만 표시합니다.');
 history.sort((a,b)=>a.date.localeCompare(b.date));
 const previousDate=new Date(Date.parse(report.start+'T00:00:00Z')-86400000).toISOString().slice(0,10);
 if(!history.some(p=>p.date===previousDate))history.push({date:previousDate,...Object.fromEntries(summary.map(s=>[s.key,s.previous])),source:`${report.name}!E45:E48`});
 const current={date:report.end,...Object.fromEntries(summary.map(s=>[s.key,s.current])),source:`${report.name}!F45:F48`};
 const i=history.findIndex(p=>p.date===report.end);if(i>=0){if(categories.some(k=>Math.abs(history[i][k]-current[k])>1))warnings.push('그래프의 금주 금액이 주간표와 달라 주간표의 최신 금액으로 갱신했습니다.');history[i]=current;}else history.push(current);
 return historyForPeriod(history,report.end,3);
}
// Keep the original three-year series (including undated columns), but use
// weekly won amounts for the report end instead of stale million-won cells.
export function updateThreeYearTotals(points,report,summary,warnings){
 if(!points.length)return [];
 const current=summary.find(s=>s.key==='assets')?.current;
 if(num(current)===null)throw Error('3년 총계 그래프에 반영할 금주 자산 총계를 확인하세요.');
 const matches=points.filter(p=>p.date===report.end&&p.exactDate);
 // Source totals are rounded to millions; a half-million difference is normal.
 if(matches.some(p=>Math.abs(p.assets-current)>500001))warnings.push('3년 총계 그래프의 금주 금액이 주간표와 달라 주간표의 최신 금액으로 갱신했습니다.');
 if(matches.length>1)warnings.push(`3년 총계 그래프의 금주 날짜 중복 ${matches.length-1}개를 정리했습니다.`);
 const history=points.filter(p=>!(p.date===report.end&&p.exactDate));
 history.push({date:report.end,label:report.end,exactDate:true,assets:current,source:`${report.name}!F48`});
 return historyForPeriod(history,report.end,3);
}
export async function buildReport(model,source,{dailySheet='',graphSheet='',fileName=''}={}){
 const v=source.value,warnings=[];
 if(!source.ready)throw Error('선택한 주간 시트의 금주 금액이 미완성입니다. Excel에서 금액을 입력하고 저장하세요.');
 const rows=[];for(let r=6;r<=23;r++)rows.push({id:`account-${r}`,bank:String(v(`B${r}`)??''),type:String(v(`C${r}`)??''),account:accountMask(v(`D${r}`)),previous:number(v(`E${r}`)),in:number(v(`F${r}`)),out:number(v(`G${r}`)),current:number(v(`H${r}`)),note:r===19?`EUR ${rate(number(v('I19')))}`:r===20?`GBP ${rate(number(v('I20')))}`:String(v(`I${r}`)??''),currency:r===10||r===19?'EUR':r===20?'GBP':'KRW'});
 const dailyLedger=await readDailyLedger(model,dailySheet,source),transactions=ledgerTransactions(dailyLedger);attachTransactions(rows,transactions,warnings);
 if(dailySheet&&!dailyLedger.days.length)warnings.push('보고기간에 해당하는 일일내역 구간을 찾지 못했습니다. 일일 시트와 날짜를 확인하세요.');
 const stocks=[];for(let r=35;r<=38;r++)stocks.push({name:String(v(`B${r}`)??''),broker:String(v(`C${r}`)??''),quantity:num(v(`D${r}`)),price:num(v(`E${r}`)),previous:number(v(`F${r}`)),current:number(v(`G${r}`)),change:number(v(`H${r}`)),note:String(v(`I${r}`)??'')});
 const summary=[45,46,47,48].map((r,i)=>({key:categories[i],label:['현금','외화','주식','자산 총계'][i],previous:number(v(`E${r}`)),current:number(v(`F${r}`)),change:number(v(`G${r}`))}));
 const subtotal=[24,25,26,30,31].map(r=>({label:r===24?'원화 소계':r===25?'유로 소계':r===26?'파운드 소계':r===30?'외화 합계 (원화 환산)':'현금·외화 합계',previous:number(v(`E${r}`)),in:r<=26?number(v(`F${r}`)):null,out:r<=26?number(v(`G${r}`)):null,current:number(v(`H${r}`)),currency:r===25?'EUR':r===26?'GBP':'KRW',key:r===24?'cash':r===30?'foreign':r===31?'cashForeign':null}));
 const history=await graphHistory(model,graphSheet,source,summary,warnings);
 const originalTotals=graphSheet?parseThreeYearTotals(await readWorkbookSheet(model,graphSheet),source.end):[];
 const totalHistory=updateThreeYearTotals(originalTotals,source,summary,warnings);
 if(Math.abs(summary[0].current+summary[1].current+summary[2].current-summary[3].current)>1)throw Error('자금 총액비교 현황의 구성금액과 자산 총계가 일치하지 않습니다.');
 return {version:1,title:'주간 자금현황',company:'모비스',sheet:source.name,start:source.start,end:source.end,updatedAt:new Date().toISOString(),source:{weekly:source.name,daily:dailySheet,graph:graphSheet,fileName},rows,subtotal,stocks,stockTotal:{previous:number(v('F39')),current:number(v('G39')),change:number(v('H39'))},summary,history,totalHistory,dailyLedger,warnings:[...new Set(warnings)],privacy:'계좌번호는 끝 4자리만 표시합니다. 일일내역의 거래처와 내용은 원문대로 표시합니다.'};
}
export function validateReport(report){
 if(report?.version!==1||!Array.isArray(report.rows)||report.rows.length!==18||!Array.isArray(report.summary)||report.summary.length!==4||!Array.isArray(report.history))throw Error('게시 파일 형식이 올바르지 않습니다. 갱신 화면에서 다시 생성하세요.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(report.start)||!/^\d{4}-\d{2}-\d{2}$/.test(report.end))throw Error('보고기간을 확인하세요.');
 for(const row of report.rows)for(const k of ['previous','in','out','current'])if(num(row[k])===null)throw Error('계좌 금액이 올바르지 않습니다.');
 for(const s of report.summary)for(const k of ['previous','current','change'])if(num(s[k])===null)throw Error('총계 금액이 올바르지 않습니다.');
 return report;
}


