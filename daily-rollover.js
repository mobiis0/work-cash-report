// Prepare a fresh daily ledger inside the original OOXML package.
const S='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const P='http://schemas.openxmlformats.org/package/2006/relationships';
const C='http://schemas.openxmlformats.org/package/2006/content-types';
const DAY=86400000;
const all=(node,tag,ns=S)=>Array.from(node.getElementsByTagNameNS(ns,tag));
const direct=(node,tag)=>Array.from(node.children).find(x=>x.localName===tag);
const compact=v=>String(v??'').replace(/\s/g,'');
const parse=text=>{const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.getElementsByTagName('parsererror').length)throw Error('일일자금일보 양식을 읽을 수 없습니다.');return doc;};
const serialize=doc=>new XMLSerializer().serializeToString(doc);
const add=(doc,parent,ns,name,attrs={})=>{const e=doc.createElementNS(ns,name);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));parent.appendChild(e);return e;};
function resolve(base,target){if(target.startsWith('/'))return target.slice(1);const a=base.split('/');a.pop();for(const p of target.split('/')){if(p==='..')a.pop();else if(p!=='.')a.push(p);}return a.join('/');}
const relPath=path=>path.replace(/([^/]+)$/,'_rels/$1.rels');
const iso=d=>d.toISOString().slice(0,10);
function validDate(s){const d=new Date(s+'T00:00:00Z');return Number.isFinite(+d)&&iso(d)===s;}
export function dailyDateRange(value){
 if(typeof value==='number'&&value>30000&&value<100000){const day=iso(new Date(Date.UTC(1899,11,30)+Math.round(value)*DAY));return{start:day,end:day};}
 const m=String(value??'').match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:\s*[~～–]\s*(?:(\d{4})[-./])?(?:(\d{1,2})[-./])?(\d{1,2}))?/);
 if(!m)return null;
 const pad=n=>String(n).padStart(2,'0');const start=`${m[1]}-${pad(m[2])}-${pad(m[3])}`,end=m[6]?`${m[4]||m[1]}-${pad(m[5]||m[2])}-${pad(m[6])}`:start;
 return validDate(start)&&validDate(end)&&start<=end?{start,end}:null;
}
export function nextFridayAfter(end){
 if(!validDate(end))throw Error('마지막 보고일을 확인하세요.');
 const date=new Date(end+'T00:00:00Z');
 date.setUTCDate(date.getUTCDate()+((5-date.getUTCDay()+7)%7||7));
 return iso(date);
}
export function nextDailyPeriods(start,end){
 if(!validDate(start)||!validDate(end)||start>end)throw Error('일일자금일보의 생성 기간을 확인하세요.');
 const periods=[];
 for(let time=Date.parse(start+'T00:00:00Z'),last=Date.parse(end+'T00:00:00Z');time<=last;time+=DAY){
  const date=new Date(time),to=date.getUTCDay()===6&&time+DAY<=last?time+DAY:time;
  periods.push({start:iso(date),end:iso(new Date(to))});time=to;
 }
 return periods;
}
function sheetModel(doc,strings){
 const cells=new Map(all(doc,'c').map(c=>[c.getAttribute('r'),c]));
 const value=ref=>{const c=cells.get(ref);if(!c)return null;const t=c.getAttribute('t'),v=direct(c,'v');if(t==='s')return strings[Number(v?.textContent)];if(t==='inlineStr')return all(c,'t').map(x=>x.textContent).join('');if(t==='str'||t==='e')return v?.textContent??'';return v&&v.textContent!==''?Number(v.textContent):null;};
 const dates=all(doc,'row').map(row=>+row.getAttribute('r')).flatMap(row=>{const period=dailyDateRange(value('B'+row));return period?[{...period,row}]:[];});
 const blocks=dates.map((date,i)=>{
  const limit=dates[i+1]?.row??Infinity;
  const rows=all(doc,'row').map(row=>+row.getAttribute('r')).filter(r=>r>date.row&&r<limit);
  const header=rows.find(r=>compact(value('C'+r))==='내용'&&compact(value('B'+r))==='입금');
  const outgoing=rows.find(r=>compact(value('B'+r))==='출금');
  const opening=rows.find(r=>compact(value('C'+r))==='전일잔액');
  const closing=rows.find(r=>/^당일잔액/.test(compact(value('C'+r))));
  if(!header||!outgoing||!opening||!closing||!(header<outgoing&&outgoing<opening-2&&opening<closing))return null;
  const columns=all(doc,'c').filter(c=>+c.getAttribute('r').match(/\d+$/)[0]===header).map(c=>c.getAttribute('r').replace(/\d+$/,'')).filter(col=>col!=='B'&&col!=='C'&&col!=='D'&&compact(value(col+header))).map(col=>({col,label:compact(value(col+header)),total:compact(value(col+header))==='합계'}));
  if(!columns.length||columns.filter(c=>c.total).length!==1)return null;
  return{...date,header,outgoing,opening,closing,inSubtotal:outgoing-1,outSubtotal:opening-2,net:opening-1,columns};
 });
 return{cells,value,blocks:blocks.every(Boolean)?blocks:[]};
}
function setCell(doc,cells,address,value,formula){
 let c=cells.get(address);
 if(!c){const data=all(doc,'sheetData')[0],rowNum=+address.match(/\d+$/)[0];let row=all(data,'row').find(r=>+r.getAttribute('r')===rowNum);if(!row){row=doc.createElementNS(S,'row');row.setAttribute('r',rowNum);data.insertBefore(row,Array.from(data.children).find(r=>+r.getAttribute('r')>rowNum)??null);}c=doc.createElementNS(S,'c');c.setAttribute('r',address);const colNum=ref=>[...ref.replace(/\d+$/,'')].reduce((n,ch)=>n*26+ch.charCodeAt(0)-64,0);row.insertBefore(c,Array.from(row.children).find(x=>x.localName==='c'&&colNum(x.getAttribute('r'))>colNum(address))??null);cells.set(address,c);}
 for(const e of Array.from(c.children))if(['f','v','is'].includes(e.localName))c.removeChild(e);c.removeAttribute('t');
 if(formula)add(doc,c,S,'f').textContent=formula;
 if(typeof value==='string'){c.setAttribute('t','inlineStr');add(doc,add(doc,c,S,'is'),S,'t').textContent=value;}
 else if(value!==null){if(!Number.isFinite(value))throw Error('일일자금일보 잔액이 올바르지 않습니다.');add(doc,c,S,'v').textContent=String(value);}
}
export async function addDailyWorksheet({model,source,dates,zip,workbook,rels,contentTypes}){
 const candidates=[];
 for(const sheet of all(model.workbook,'sheet')){
  const rel=all(model.rels,'Relationship',P).find(r=>r.getAttribute('Id')===sheet.getAttributeNS(R,'id'));if(!rel)continue;
  const path=resolve('xl/workbook.xml',rel.getAttribute('Target'));if(model.reports.some(report=>report.path===path))continue;
  const doc=parse(await model.read(path)),ledger=sheetModel(doc,model.strings);
  if(!ledger.blocks.length)continue;
  const last=ledger.blocks.at(-1);if(last.end===source.end)candidates.push({name:sheet.getAttribute('name'),path,doc,...ledger});
 }
 if(!candidates.length)throw Error(`${source.end}에 끝나는 일일자금일보가 없습니다. 주간표와 같은 주의 일일내역이 있는 파일을 선택하세요.`);
 candidates.sort((a,b)=>Number(b.blocks[0].start===source.start)-Number(a.blocks[0].start===source.start));
 const template=candidates[0],last=template.blocks.at(-1),initial=new Map();
 for(const {col,label} of last.columns){const n=template.value(col+last.closing);if(typeof n!=='number'||!Number.isFinite(n))throw Error(`${template.name} 시트의 마지막 가용잔액(${col}${last.closing}, ${label})이 비어 있습니다. Excel에서 계산 후 저장하세요.`);initial.set(label,n);}
 const periods=nextDailyPeriods(dates.start,dates.end),doc=template.doc.cloneNode(true),data=all(doc,'sheetData')[0],oldRows=all(template.doc,'row');
 const first=template.blocks[0].row,merges=all(template.doc,'mergeCell').map(x=>x.getAttribute('ref'));
 data.replaceChildren(...oldRows.filter(r=>+r.getAttribute('r')<first).map(r=>r.cloneNode(true)));
 let mergeContainer=all(doc,'mergeCells')[0];if(mergeContainer)mergeContainer.replaceChildren();
 const shift=(ref,offset)=>ref.replace(/(\$?\d+)/g,n=>String(+n.replace('$','')+offset));
 const addMerge=ref=>{if(!mergeContainer){mergeContainer=doc.createElementNS(S,'mergeCells');const after=Array.from(doc.documentElement.children).find(e=>['phoneticPr','conditionalFormatting','dataValidations','hyperlinks','printOptions','pageMargins','pageSetup','headerFooter','rowBreaks','colBreaks','drawing','legacyDrawing','extLst'].includes(e.localName));doc.documentElement.insertBefore(mergeContainer,after??null);}add(doc,mergeContainer,S,'mergeCell',{ref});};
 for(const ref of merges)if(Math.max(...ref.match(/\d+/g).map(Number))<first)addMerge(ref);
 const blocks=[];let cursor=first;
 for(let i=0;i<periods.length;i++){
  const block=template.blocks[Math.min(i,template.blocks.length-1)],offset=cursor-block.row;
  for(const old of oldRows.filter(r=>+r.getAttribute('r')>=block.row&&+r.getAttribute('r')<=block.closing)){
   const row=old.cloneNode(true);row.setAttribute('r',+old.getAttribute('r')+offset);
   for(const cell of all(row,'c')){cell.setAttribute('r',shift(cell.getAttribute('r'),offset));const f=direct(cell,'f');if(f)cell.removeChild(f);}
   data.appendChild(row);
  }
  for(const ref of merges){const rows=ref.match(/\d+/g).map(Number);if(Math.min(...rows)>=block.row&&Math.max(...rows)<=block.closing)addMerge(shift(ref,offset));}
  const moved={...block,...periods[i]};for(const key of ['row','header','outgoing','opening','closing','inSubtotal','outSubtotal','net'])moved[key]+=offset;
  blocks.push(moved);cursor=moved.closing+2;
 }
 if(mergeContainer)mergeContainer.setAttribute('count',all(mergeContainer,'mergeCell').length);
 // Prevent old print page breaks from cutting through newly repeated day blocks.
 for(const node of [...all(doc,'rowBreaks'),...all(doc,'colBreaks')])node.remove();
 const dimension=all(doc,'dimension')[0];if(dimension){const endCol=dimension.getAttribute('ref').match(/([A-Z]+)\d+$/)?.[1]||'O';dimension.setAttribute('ref',`B1:${endCol}${blocks.at(-1).closing}`);}
 const cells=new Map(all(doc,'c').map(c=>[c.getAttribute('r'),c]));
 const set=(ref,value,formula)=>setCell(doc,cells,ref,value,formula);
 for(let i=0;i<blocks.length;i++){
  const b=blocks[i],previous=blocks[i-1];
  set('B'+b.row,b.start===b.end?b.start:`${b.start} ~ ${b.end.slice(0,7)===b.start.slice(0,7)?b.end.slice(8):b.end}`);
  for(const [start,end] of [[b.header+1,b.inSubtotal-1],[b.outgoing,b.outSubtotal-1]])for(let r=start;r<=end;r++){
   for(const c of [...cells.values()].filter(c=>+c.getAttribute('r').match(/\d+$/)[0]===r&&!/^A|^B\d/.test(c.getAttribute('r'))))set(c.getAttribute('r'),null);
   const total=b.columns.find(c=>c.total),banks=b.columns.filter(c=>!c.total&&!/외환|외화|유로|파운드|EUR|GBP/.test(c.label));
   set(total.col+r,0,`SUM(${banks.map(c=>c.col+r).join(',')})`);
  }
  for(const {col,label} of b.columns){
   if(!initial.has(label))throw Error(`일일자금일보의 은행 열이 일치하지 않습니다: ${label}`);
   const opening=initial.get(label);
   set(col+b.inSubtotal,0,`SUM(${col}${b.header+1}:${col}${b.inSubtotal-1})`);
   set(col+b.outSubtotal,0,`SUM(${col}${b.outgoing}:${col}${b.outSubtotal-1})`);
   set(col+b.net,0,`${col}${b.inSubtotal}-${col}${b.outSubtotal}`);
   set(col+b.opening,opening,previous?`${col}${previous.closing}`:undefined);
   set(col+b.closing,opening,`${col}${b.opening}+${col}${b.inSubtotal}-${col}${b.outSubtotal}`);
  }
  for(const c of [...cells.values()].filter(c=>+c.getAttribute('r').match(/\d+$/)[0]===b.closing&&!b.columns.some(x=>x.col+b.closing===c.getAttribute('r'))&&c.getAttribute('r').replace(/\d+$/,'')==='O'))set(c.getAttribute('r'),null);
 }
 for(const view of all(doc,'sheetView')){view.setAttribute('tabSelected','0');for(const selection of all(view,'selection')){selection.setAttribute('activeCell','C'+(blocks[0].header+1));selection.setAttribute('sqref','C'+(blocks[0].header+1));}}
 const sheets=all(workbook,'sheets')[0],oldSheets=all(workbook,'sheet');let name=`${+dates.end.slice(8)}일일`,counter=2;while(oldSheets.some(s=>s.getAttribute('name')===name))name=`${+dates.end.slice(8)}일일 (${counter++})`;
 let part=1;while(zip.file(`xl/worksheets/sheet${part}.xml`))part++;const path=`xl/worksheets/sheet${part}.xml`;
 let id=1;while(all(rels,'Relationship',P).some(r=>r.getAttribute('Id')===`rId${id}`))id++;
 const added=add(workbook,sheets,S,'sheet',{name,sheetId:Math.max(...oldSheets.map(s=>+s.getAttribute('sheetId')))+1});added.setAttributeNS(R,'r:id',`rId${id}`);
 add(rels,rels.documentElement,P,'Relationship',{Id:`rId${id}`,Type:R+'/worksheet',Target:`worksheets/sheet${part}.xml`});
 add(contentTypes,contentTypes.documentElement,C,'Override',{PartName:'/'+path,ContentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml'});
 const names=all(workbook,'definedNames')[0],sourceIndex=all(model.workbook,'sheet').findIndex(s=>s.getAttribute('name')===template.name),quoted=n=>`'${n.replaceAll("'","''")}'!`;
 if(names)for(const old of Array.from(names.children).filter(n=>n.getAttribute('localSheetId')===String(sourceIndex))){const copy=old.cloneNode(true);copy.setAttribute('localSheetId',oldSheets.length);copy.textContent=copy.textContent.replaceAll(quoted(template.name),quoted(name));if(copy.getAttribute('name')==='_xlnm.Print_Area')copy.textContent=`${quoted(name)}$B$1:$N$${blocks.at(-1).closing}`;names.appendChild(copy);}
 if(zip.file(relPath(template.path))){const sheetRels=parse(await model.read(relPath(template.path)));for(const r of all(sheetRels,'Relationship',P))if(r.getAttribute('Type')===R+'/drawing'){
  const oldPath=resolve(template.path,r.getAttribute('Target'));let n=1;while(zip.file(`xl/drawings/drawing${n}.xml`))n++;const newPath=`xl/drawings/drawing${n}.xml`;
  zip.file(newPath,await zip.file(oldPath).async('uint8array'));if(zip.file(relPath(oldPath)))zip.file(relPath(newPath),await zip.file(relPath(oldPath)).async('uint8array'));r.setAttribute('Target',`../drawings/drawing${n}.xml`);
  add(contentTypes,contentTypes.documentElement,C,'Override',{PartName:'/'+newPath,ContentType:'application/vnd.openxmlformats-officedocument.drawing+xml'});
 }zip.file(relPath(path),serialize(sheetRels));}
 zip.file(path,serialize(doc));
 return{name,source:template.name,days:blocks.map(b=>({start:b.start,end:b.end,openingRow:b.opening,closingRow:b.closing})),opening:Object.fromEntries(initial)};
}
