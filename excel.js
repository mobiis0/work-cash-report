// Workbook values, formulas and styles remain in their original OOXML package.
const S='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const P='http://schemas.openxmlformats.org/package/2006/relationships';
const C='http://schemas.openxmlformats.org/package/2006/content-types';
const XML='http://www.w3.org/XML/1998/namespace';
const all=(node,tag,ns=S)=>Array.from(node.getElementsByTagNameNS(ns,tag));
const direct=(node,tag)=>Array.from(node.children).find(x=>x.localName===tag);
function parse(text){const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.getElementsByTagName('parsererror').length)throw Error('엑셀 내부 문서를 읽을 수 없습니다. Excel에서 다시 저장한 .xlsx 파일을 선택하세요.');return doc;}
const serialize=doc=>new XMLSerializer().serializeToString(doc);
const normalized=s=>String(s??'').replace(/\s/g,'');
const child=(doc,parent,ns,name,attrs={})=>{const e=doc.createElementNS(ns,name);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));parent.appendChild(e);return e;};
function pathFrom(base,target){if(target.startsWith('/'))return target.slice(1);const a=base.split('/');a.pop();for(const p of target.split('/')){if(p==='..')a.pop();else if(p!=='.')a.push(p);}return a.join('/');}
function relative(from,to){const a=from.split('/');a.pop();const b=to.split('/');while(a.length&&a[0]===b[0]){a.shift();b.shift();}return '../'.repeat(a.length)+b.join('/');}
const relPath=path=>path.replace(/([^/]+)$/,'_rels/$1.rels');
const sheetReference=name=>`'${name.replaceAll("'","''")}'!`;
export const todayKST=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function dateParts(s){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s);if(!m)throw Error('생성 기준일을 확인하세요.');const d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));if(d.toISOString().slice(0,10)!==s)throw Error('유효한 날짜를 입력하세요.');return d;}
function period(s){const m=String(s??'').match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})\s*[~～–-]\s*(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);if(!m)return null;const format=(y,m,d)=>`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;const start=format(m[1],m[2],m[3]),end=format(m[4],m[5],m[6]);dateParts(start);dateParts(end);return {start,end};}
export const displayDate=s=>s.replaceAll('-','.');
export function positiveNumber(value,label){const text=String(value??'').trim();if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(text))throw Error(`${label}에 올바른 숫자를 입력하세요.`);const n=Number(text.replaceAll(',',''));if(!Number.isFinite(n)||n<=0||n>1e12)throw Error(`${label}에 0보다 큰 숫자를 입력하세요.`);return n;}
export async function inspectWorkbook(buffer){
 if(!globalThis.JSZip)throw Error('엑셀 처리 기능을 불러오지 못했습니다. 페이지를 새로고침하세요.');
 let zip;try{zip=await JSZip.loadAsync(buffer);}catch{throw Error('파일을 읽을 수 없습니다. 암호가 없는 .xlsx 파일을 선택하세요.');}
 const read=async path=>{const f=zip.file(path);if(!f)throw Error('정상적인 .xlsx 파일을 선택하세요.');return f.async('string');};
 const workbook=parse(await read('xl/workbook.xml')),rels=parse(await read('xl/_rels/workbook.xml.rels'));
 let strings=[];if(zip.file('xl/sharedStrings.xml'))strings=all(parse(await read('xl/sharedStrings.xml')),'si').map(si=>all(si,'t').map(t=>t.textContent).join(''));
 const worksheets=all(workbook,'sheet');const reports=[];
 for(const sheet of worksheets){
  const relationship=all(rels,'Relationship',P).find(r=>r.getAttribute('Id')===sheet.getAttributeNS(R,'id'));
  if(!relationship)continue;const path=pathFrom('xl/workbook.xml',relationship.getAttribute('Target'));
  const doc=parse(await read(path));const cells=new Map(all(doc,'c').map(c=>[c.getAttribute('r'),c]));
  const value=ref=>{const c=cells.get(ref);if(!c)return null;const t=c.getAttribute('t'),v=direct(c,'v');if(t==='s')return strings[Number(v?.textContent)];if(t==='inlineStr')return all(c,'t').map(t=>t.textContent).join('');if(t==='str'||t==='e')return v?.textContent??'';if(!v||v.textContent==='')return null;const n=Number(v.textContent);return Number.isFinite(n)?n:null;};
  if(normalized(value('B1'))!=='주간자금현황')continue;
  const dates=period(value('B2'));if(!dates)continue;
  if(normalized(value('E5'))!=='주초잔액'||normalized(value('H5'))!=='주말잔액'||normalized(value('E44'))!=='이전주'||normalized(value('F44'))!=='금주')continue;
  const companies=[value('B35'),value('B36'),value('B37')].map(normalized);
  if(companies.join(',')!=='모비스,휴네시온,현대차')continue;
  const required=[...Array.from({length:26},(_,i)=>`H${i+6}`),...Array.from({length:5},(_,i)=>`G${i+35}`),'G40',...Array.from({length:4},(_,i)=>`F${i+45}`),'D35','D36','D37'];
  const missing=required.filter(ref=>typeof value(ref)!=='number');
  reports.push({name:sheet.getAttribute('name'),path,doc,cells,value,...dates,ready:!missing.length,missing});
 }
 if(!reports.length)throw Error('모비스 주간자금현황 시트를 찾지 못했습니다. 기존 양식의 .xlsx 파일을 선택하세요.');
 reports.sort((a,b)=>b.end.localeCompare(a.end));
 return {zip,workbook,rels,strings,reports,sheetNames:worksheets.map(s=>s.getAttribute('name')),read};
}
export function nextPeriod(model,source,end){
 dateParts(end);const startDate=dateParts(source.end);startDate.setUTCDate(startDate.getUTCDate()+1);const start=startDate.toISOString().slice(0,10);
 if(end<start)throw Error(`생성 기준일은 ${displayDate(start)} 이후여야 합니다.`);
 const base=`${+start.slice(5,7)}${start.slice(8,10)}-${end.slice(8,10)}`;
 let name=base,n=2;while(model.sheetNames.includes(name))name=`${base} (${n++})`;
 return {start,end,name,base,duplicate:name!==base};
}
export async function readWorkbookSheet(model,name){
 const sheet=all(model.workbook,'sheet').find(s=>s.getAttribute('name')===name);
 if(!sheet)throw Error(`시트를 찾지 못했습니다: ${name}`);
 const rel=all(model.rels,'Relationship',P).find(r=>r.getAttribute('Id')===sheet.getAttributeNS(R,'id'));
 const doc=parse(await model.read(pathFrom('xl/workbook.xml',rel.getAttribute('Target'))));
 const cells=new Map(all(doc,'c').map(c=>[c.getAttribute('r'),c]));
 const value=ref=>{const c=cells.get(ref);if(!c)return null;const t=c.getAttribute('t'),v=direct(c,'v');if(t==='s')return model.strings[Number(v?.textContent)];if(t==='inlineStr')return all(c,'t').map(t=>t.textContent).join('');if(t==='str'||t==='e')return v?.textContent??'';if(!v||v.textContent==='')return null;const n=Number(v.textContent);return Number.isFinite(n)?n:null;};
 return {name,cells,value,mergedRanges:all(doc,'mergeCell').map(c=>c.getAttribute('ref'))};
}
export async function generateWorkbook(model,source,inputs){
 if(!source.ready)throw Error(`선택한 시트의 금주 금액이 미완성입니다 (${source.missing.join(', ')}). Excel에서 금액을 입력하고 저장하거나 이전 완료 시트를 선택하세요.`);
 const prices=[positiveNumber(inputs.mobis,'모비스 주가'),positiveNumber(inputs.hunesion,'휴네시온 주가'),positiveNumber(inputs.hyundai,'현대차 주가')];
 const fx=[positiveNumber(inputs.eur,'유로 환율'),positiveNumber(inputs.gbp,'파운드 환율')];
 const dates=nextPeriod(model,source,inputs.endDate),ref=sheetReference(source.name);
 // Use a fresh package for every download, including repeated generations.
 const zip=await JSZip.loadAsync(await model.zip.generateAsync({type:'uint8array'}));
 const doc=source.doc.cloneNode(true),cells=new Map(all(doc,'c').map(c=>[c.getAttribute('r'),c]));
 const values=new Map();const data=all(doc,'sheetData')[0];
 function cell(address){let c=cells.get(address);if(c)return c;const rn=Number(address.match(/\d+$/)[0]);let row=all(data,'row').find(x=>Number(x.getAttribute('r'))===rn);if(!row){row=doc.createElementNS(S,'row');row.setAttribute('r',rn);const after=Array.from(data.children).find(x=>Number(x.getAttribute('r'))>rn);data.insertBefore(row,after??null);}c=doc.createElementNS(S,'c');c.setAttribute('r',address);row.appendChild(c);cells.set(address,c);return c;}
 function set(address,value,formula){const c=cell(address);for(const e of Array.from(c.children))if(['f','v','is'].includes(e.localName))c.removeChild(e);c.removeAttribute('t');if(formula){child(doc,c,S,'f').textContent=formula.replace(/^=/,'');}if(typeof value==='string'){if(formula){c.setAttribute('t','str');child(doc,c,S,'v').textContent=value;}else{c.setAttribute('t','inlineStr');const t=child(doc,child(doc,c,S,'is'),S,'t');t.setAttributeNS(XML,'xml:space','preserve');t.textContent=value;}}else if(typeof value==='boolean'){c.setAttribute('t','b');child(doc,c,S,'v').textContent=value?'1':'0';}else if(value!==null){if(!Number.isFinite(value))throw Error(`계산할 수 없는 금액입니다: ${address}`);child(doc,c,S,'v').textContent=String(value);}values.set(address,value);}
 const number=address=>{if(values.has(address)){const v=values.get(address);return typeof v==='number'?v:0;}const v=source.value(address);return typeof v==='number'?v:0;};
 const sum=(...addresses)=>addresses.reduce((total,address)=>total+number(address),0);
 // Carry the prior week's cached amount as a fixed number, not a cross-sheet formula.
 const prev=(to,from)=>set(to,source.value(from));
 set('B2',`${displayDate(dates.start)} ~ ${displayDate(dates.end)}`);
 for(let r=6;r<=23;r++){prev(`E${r}`,`H${r}`);set(`F${r}`,null);set(`G${r}`,null);set(`H${r}`,number(`E${r}`),`=E${r}+F${r}-G${r}`);}
 for(let r=24;r<=31;r++)prev(`E${r}`,`H${r}`);
 const krRows=[6,7,8,9,11,12,13,14,15,16,17,18,21,22,23];
 for(const col of ['F','G','H']){
  set(`${col}24`,sum(...krRows.map(r=>`${col}${r}`)),`=SUM(${col}6:${col}9,${col}11:${col}18,${col}21:${col}23)`);
  set(`${col}25`,sum(`${col}10`,`${col}19`),`=${col}10+${col}19`);
  set(`${col}26`,number(`${col}20`),`=${col}20`);
  for(let r=27;r<=29;r++)set(`${col}${r}`,number(`${col}${r-3}`),`=${col}${r-3}`);
 }
 set('I19',fx[0]);set('I20',fx[1]);
 set('H30',number('H25')*fx[0]+number('H26')*fx[1],'=IF(COUNT(I19:I20)<2,"",H25*I19+H26*I20)');
 set('H31',sum('H27','H30'),'=IF(H30="","",H27+H30)');
 for(let r=35;r<=39;r++)prev(`F${r}`,`G${r}`);
 for(let i=0;i<3;i++){const r=i+35;set(`E${r}`,prices[i]);set(`G${r}`,number(`D${r}`)*prices[i],`=IF(OR(D${r}="",E${r}=""),"",D${r}*E${r})`);set(`H${r}`,number(`G${r}`)-number(`F${r}`),`=IF(G${r}="","",G${r}-F${r})`);set(`I${r}`,`${+dates.end.slice(5,7)}.${+dates.end.slice(8,10)} 기준`);}
 prev('G38','G38');set('H38',number('G38')-number('F38'),'=IF(G38="","",G38-F38)');
 set('G39',sum('G35','G36','G37','G38'),'=IF(COUNT(G35:G38)<4,"",SUM(G35:G38))');set('H39',number('G39')-number('F39'),'=IF(G39="","",G39-F39)');
 prev('F40','G40');set('G40',sum('H31','G39'),'=IF(OR(H31="",G39=""),"",SUM(H31,G39))');set('H40',number('G40')-number('F40'),'=IF(G40="","",G40-F40)');
 for(let r=45;r<=48;r++)prev(`E${r}`,`F${r}`);
 for(const [address,from] of [['F45','H27'],['F46','H30'],['F47','G39']])set(address,number(from),`=IF(${from}="","",${from})`);
 set('F48',sum('F45','F46','F47'),'=IF(COUNT(F45:F47)<3,"",SUM(F45:F47))');
 for(let r=45;r<=48;r++)set(`G${r}`,number(`F${r}`)-number(`E${r}`),`=IF(F${r}="","",F${r}-E${r})`);
 set('E51',Math.abs(number('E48')-number('F40'))<.01,'=ABS(E48-F40)<0.01');set('F51',Math.abs(number('F48')-number('G40'))<.01,'=IF(F48="","",ABS(F48-G40)<0.01)');set('G51',Math.abs(number('H40')-number('G48'))<.01,'=IF(G48="","",ABS(H40-G48)<0.01)');
 // The copied worksheet may contain other formulas pointing to an older weekly tab.
 // Freeze those inherited links at their cached values, while retaining formulas
 // that calculate within the new week as the user fills in transactions.
 for(const c of all(doc,'c')){
  const f=direct(c,'f');
  if(!f||!/(?:'[^']+'|[A-Za-z0-9_() -]+)!/.test(f.textContent??''))continue;
  c.removeChild(f);
  // Existing cached <v> stays in place; no prior worksheet is needed to open this tab.
 }
 // Validate all carried balances before changing the package structure.
 const carried=[...Array.from({length:26},(_,i)=>[`E${i+6}`,`H${i+6}`]),...Array.from({length:5},(_,i)=>[`F${i+35}`,`G${i+35}`]),['F40','G40'],...Array.from({length:4},(_,i)=>[`E${i+45}`,`F${i+45}`])];
 for(const [to,from] of carried)if(Math.abs(number(to)-source.value(from))>.01)throw Error(`전주 금액을 확인할 수 없습니다 (${to}).`);
 const workbook=parse(await model.read('xl/workbook.xml')),rels=parse(await model.read('xl/_rels/workbook.xml.rels')),contentTypes=parse(await model.read('[Content_Types].xml'));
 const sheets=all(workbook,'sheets')[0],oldSheets=all(workbook,'sheet');
 const sheetId=Math.max(...oldSheets.map(x=>Number(x.getAttribute('sheetId'))))+1;
 let partNumber=1;while(zip.file(`xl/worksheets/sheet${partNumber}.xml`))partNumber++;
 const newPath=`xl/worksheets/sheet${partNumber}.xml`;
 const relationships=all(rels,'Relationship',P);let idNumber=1;while(relationships.some(x=>x.getAttribute('Id')===`rId${idNumber}`))idNumber++;
 const rid=`rId${idNumber}`;const added=child(workbook,sheets,S,'sheet',{name:dates.name,sheetId});added.setAttributeNS(R,'r:id',rid);
 child(rels,rels.documentElement,P,'Relationship',{Id:rid,Type:R+'/worksheet',Target:relative('xl/workbook.xml',newPath)});
 child(contentTypes,contentTypes.documentElement,C,'Override',{PartName:'/'+newPath,ContentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml'});
 for(const view of all(workbook,'workbookView'))view.setAttribute('activeTab',oldSheets.length);
 let calc=all(workbook,'calcPr')[0];if(!calc){calc=workbook.createElementNS(S,'calcPr');const ext=direct(workbook.documentElement,'extLst');workbook.documentElement.insertBefore(calc,ext??null);}calc.setAttribute('fullCalcOnLoad','1');calc.setAttribute('forceFullCalc','1');
 let names=all(workbook,'definedNames')[0];const sourceIndex=oldSheets.findIndex(s=>s.getAttribute('name')===source.name);
 const sourceNames=names?Array.from(names.children).filter(x=>x.getAttribute('localSheetId')===String(sourceIndex)):[];
 for(const old of sourceNames){const clone=old.cloneNode(true);clone.setAttribute('localSheetId',oldSheets.length);clone.textContent=clone.textContent.replaceAll(sheetReference(source.name),sheetReference(dates.name));names.appendChild(clone);}
 for(const view of all(doc,'sheetView')){view.setAttribute('tabSelected','1');for(const sel of all(view,'selection')){sel.setAttribute('activeCell','E6');sel.setAttribute('sqref','E6');}}
 // Clone the drawing container; preserve its embedded images and printer settings.
 const sourceRelPath=relPath(source.path);
 if(zip.file(sourceRelPath)){
  const sourceRels=parse(await zip.file(sourceRelPath).async('string'));
  for(const r of all(sourceRels,'Relationship',P)){
   if(r.getAttribute('Type')!==R+'/drawing')continue;
   const oldPath=pathFrom(source.path,r.getAttribute('Target'));
   let drawingNumber=1;while(zip.file(`xl/drawings/drawing${drawingNumber}.xml`))drawingNumber++;
   const targetPath=`xl/drawings/drawing${drawingNumber}.xml`;zip.file(targetPath,await zip.file(oldPath).async('uint8array'));
   if(zip.file(relPath(oldPath)))zip.file(relPath(targetPath),await zip.file(relPath(oldPath)).async('uint8array'));
   r.setAttribute('Target',relative(newPath,targetPath));
   child(contentTypes,contentTypes.documentElement,C,'Override',{PartName:'/'+targetPath,ContentType:'application/vnd.openxmlformats-officedocument.drawing+xml'});
  }
  zip.file(relPath(newPath),serialize(sourceRels));
 }
 // A preexisting calculation chain describes the old set of formulas only.
 for(const r of all(rels,'Relationship',P))if(r.getAttribute('Type')===R+'/calcChain'){const path=pathFrom('xl/workbook.xml',r.getAttribute('Target'));zip.remove(path);r.remove();for(const item of all(contentTypes,'Override',C))if(item.getAttribute('PartName')==='/'+path)item.remove();}
 zip.file(newPath,serialize(doc));zip.file('xl/workbook.xml',serialize(workbook));zip.file('xl/_rels/workbook.xml.rels',serialize(rels));zip.file('[Content_Types].xml',serialize(contentTypes));
 const buffer=await zip.generateAsync({type:'uint8array',compression:'DEFLATE',compressionOptions:{level:6}});
 return {buffer,...dates,carriedCount:carried.length,summary:{previousAssets:number('E48'),currentAssets:number('F48'),stocks:number('G39'),foreignCurrency:number('H30')}};
}
