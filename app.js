import {nextFridayAfter} from './daily-rollover.js?v=20261120-1';
import {inspectWorkbook,generateWorkbook,nextPeriod,todayKST,displayDate,positiveNumber} from './excel.js?v=20261120-1';
const $=id=>document.getElementById(id);
let model=null,source=null,fileName='',loading=false,resultURL=null;
const fields={mobis:'mobis-price',hunesion:'hunesion-price',hyundai:'hyundai-price',eur:'eur-rate',gbp:'gbp-rate'};
const labels={mobis:'모비스 주가',hunesion:'휴네시온 주가',hyundai:'현대차 주가',eur:'유로 환율',gbp:'파운드 환율'};
$('end-date').value=todayKST();
function status(text,type=''){const el=$('status');el.textContent=text;el.className='status'+(type?' '+type:'');}
function clearDownload(){if(resultURL)URL.revokeObjectURL(resultURL);resultURL=null;$('download-again').hidden=true;$('download-again').removeAttribute('href');}
function readInputs(){const v={endDate:$('end-date').value};for(const [name,id] of Object.entries(fields))v[name]=$(id).value;return v;}
function validateInputs(){if(!source||loading)return false;try{nextPeriod(model,source,$('end-date').value);for(const [name,id] of Object.entries(fields))positiveNumber($(id).value,labels[name]);return source.ready;}catch{return false;}}
function refresh(){
 $('generate').disabled=!validateInputs();if(!source)return;
 try{const p=nextPeriod(model,source,$('end-date').value);$('new-period').textContent=`${displayDate(p.start)} ~ ${displayDate(p.end)}`;$('new-sheet').textContent=`추가할 시트: ${p.name} · 일일자금일보`+(p.duplicate?' · 같은 이름의 시트는 보존':'');if(!source.ready)status('선택한 시트의 금주 금액이 미완성입니다. 이전 완료 시트를 선택하거나 Excel에서 금액을 입력하고 저장하세요.','error');else if(!loading)status('주가 3개와 환율 2개를 입력한 뒤 새 엑셀을 생성하세요.');}
 catch(error){$('new-period').textContent='생성 기준일 확인';$('new-sheet').textContent=error.message;status(error.message,'error');}
}
async function loadFile(file){
 clearDownload();model=null;source=null;loading=true;$('generate').disabled=true;$('source-settings').hidden=true;$('new-period').textContent='파일 확인 중';$('new-sheet').textContent='';
 try{if(!file||!file.name.toLowerCase().endsWith('.xlsx'))throw Error('.xlsx 엑셀 파일을 선택하세요.');if(file.size>50*1024*1024)throw Error('50MB 이하의 엑셀 파일을 선택하세요.');status('엑셀의 보고기간과 금주 금액을 확인하고 있습니다.');model=await inspectWorkbook(await file.arrayBuffer());fileName=file.name;$('file-label').textContent=file.name;$('source-sheet').replaceChildren();for(const report of model.reports){const option=document.createElement('option');option.value=report.name;option.textContent=report.name+(report.ready?'':' · 미완성');$('source-sheet').appendChild(option);}source=model.reports.find(r=>r.ready)??model.reports[0];$('source-sheet').value=source.name;if(!$('end-date').value||$('end-date').value<=source.end)$('end-date').value=nextFridayAfter(source.end);$('source-period').textContent=`${displayDate(source.start)} ~ ${displayDate(source.end)}`;$('source-settings').hidden=false;}
 catch(error){status(error.message,'error');$('file-label').textContent='엑셀을 여기에 드롭하세요';$('new-period').textContent='파일 선택 후 표시';}
 finally{loading=false;refresh();}
}
$('file-input').addEventListener('change',event=>loadFile(event.target.files[0]));
const zone=$('drop-zone');for(const type of ['dragenter','dragover'])zone.addEventListener(type,event=>{event.preventDefault();zone.classList.add('drag-over');});for(const type of ['dragleave','drop'])zone.addEventListener(type,event=>{event.preventDefault();zone.classList.remove('drag-over');});zone.addEventListener('drop',event=>{if(event.dataTransfer.files.length!==1){status('엑셀 파일을 하나씩 선택하세요.','error');return;}loadFile(event.dataTransfer.files[0]);});
$('source-sheet').addEventListener('change',()=>{clearDownload();source=model.reports.find(r=>r.name===$('source-sheet').value);if(!$('end-date').value||$('end-date').value<=source.end)$('end-date').value=nextFridayAfter(source.end);$('source-period').textContent=`${displayDate(source.start)} ~ ${displayDate(source.end)}`;refresh();});
for(const id of ['end-date',...Object.values(fields)])$(id).addEventListener('input',()=>{clearDownload();refresh();});
for(const id of Object.values(fields))$(id).addEventListener('blur',()=>{try{const n=positiveNumber($(id).value,'입력값');$(id).value=n.toLocaleString('en-US',{maximumFractionDigits:10});}catch{/* Keep invalid inputs visible for correction. */}});
async function generate(){
 if(!model||!source)throw Error('지난 보고서 파일을 먼저 선택하세요.');
 clearDownload();const inputs=readInputs();for(const [name] of Object.entries(fields))positiveNumber(inputs[name],labels[name]);nextPeriod(model,source,inputs.endDate);
 loading=true;$('generate').disabled=true;$('generate').textContent='엑셀 생성 중…';status('주간표와 일일표를 이월하고 날짜·잔액 수식을 준비하고 있습니다.');
 try{const result=await generateWorkbook(model,source,inputs);const blob=new Blob([result.buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});resultURL=URL.createObjectURL(blob);const link=$('download-again');link.href=resultURL;link.download=fileName.replace(/\.xlsx$/i,'')+'_'+result.name.replaceAll(' ','')+'.xlsx';link.hidden=false;link.click();status(`${result.name} 주간표와 ${result.daily.name} 일일표를 추가했습니다. 일일 입출금 내역은 비우고, 마지막 가용잔액을 이월해 ${result.daily.days.length}개 날짜 구간의 잔액을 자동 연결했습니다.`,'success');return {sheet:result.name,dailySheet:result.daily.name,start:result.start,end:result.end,download:link.download};}
 finally{loading=false;$('generate').disabled=!validateInputs();$('generate').textContent='새 엑셀 생성하고 다운로드';}
}
$('report-form').addEventListener('submit',async event=>{event.preventDefault();try{await generate();}catch(error){status(error.message,'error');}});
// Optional agent access uses the same inputs and action as the visible page.
const context=document.modelContext;
if(context?.registerTool){const lifecycle=new AbortController();const tool={name:'generate_weekly_cash_workbook',title:'주간자금일보 생성',description:'현재 페이지에 선택된 엑셀을 사용해, 주가와 환율을 입력하고 다음 보고기간 주간표와 잔액 연결 수식이 있는 빈 일일자금일보를 추가한 엑셀을 다운로드합니다.',inputSchema:{type:'object',properties:{endDate:{type:'string',format:'date'},mobis:{type:'number',exclusiveMinimum:0},hunesion:{type:'number',exclusiveMinimum:0},hyundai:{type:'number',exclusiveMinimum:0},eur:{type:'number',exclusiveMinimum:0},gbp:{type:'number',exclusiveMinimum:0}},required:['endDate','mobis','hunesion','hyundai','eur','gbp'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},async execute(input){if(!input||typeof input!=='object'||Object.keys(input).some(k=>!['endDate',...Object.keys(fields)].includes(k)))throw Error('입력 형식을 확인하세요.');if(!model||!source)throw Error('엑셀 파일을 먼저 선택하세요.');nextPeriod(model,source,input.endDate);for(const key of Object.keys(fields))positiveNumber(input[key],labels[key]);$('end-date').value=input.endDate;for(const [key,id] of Object.entries(fields))$(id).value=String(input[key]);refresh();return generate();}};try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{/* Standard controls work without WebMCP. */}window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});}
