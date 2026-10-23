import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {compareEvidence,evidenceNumber,parseEvidenceOCR,nhDepositRegion} from '../report-builder/evidence-data.js';
import {evidencePageHTML,pastedEvidenceImage} from '../report-builder/evidence.js';
const report={start:'2026-10-17',end:'2026-10-23',rows:[{bank:'기업은행',type:'보통',account:'•••• 1001',currency:'KRW',current:0}],stocks:[{name:'현대차',quantity:2,price:10,current:20,broker:'NH투자증권'},{name:'모비스',quantity:30,price:99,current:2970,broker:'NH투자증권'},{name:'휴네시온',quantity:400,price:1,current:400,broker:'NH투자증권'},{name:'',quantity:null,current:5000,broker:'NH투자증권'},{name:'모비스4CB',quantity:123456,current:99999,broker:'NH투자증권'}]};
const field=(key,value,confirmed=true)=>({key,value,confirmed,label:key});
let proof={kind:'nh',date:report.end,fields:[field('005380',2),field('250060',30),field('290270',400),field('deposit',5000)]};
let check=compareEvidence(report,proof);assert.equal(check.state,'match');assert.equal(check.results.length,4);
const change=structuredClone(report);change.stocks[0].price=999;change.stocks[0].current=1998;assert.equal(compareEvidence(change,proof).state,'match','valuation ignored');
proof.fields[0].value=3;check=compareEvidence(report,proof);assert.equal(check.state,'mismatch');assert.equal(check.results[0].difference,1);
proof.fields[0].value=2;proof.fields[3].confirmed=false;assert.equal(compareEvidence(report,proof).results[3].state,'match','numeric values compare without confirmation checkbox');proof.fields[3].confidence=95;assert.equal(compareEvidence(report,proof).state,'match');
proof.fields[3].value=null;assert.equal(compareEvidence(report,proof).results[3].state,'unknown');proof.fields[3].value=5000;
proof.date='2026-10-22';assert.equal(compareEvidence(report,proof).state,'mismatch');proof.date='';assert.equal(compareEvidence(report,proof).state,'match');proof.date='2026-10-22';proof.dateSource='report';assert.equal(compareEvidence(report,proof).state,'match','report date overrides OCR date');
const bank={kind:'bank',date:report.end,fields:[field('1001',0)]};assert.equal(compareEvidence(report,bank).state,'match','zero is a real amount');bank.fields[0].value=null;assert.equal(compareEvidence(report,bank).state,'review','missing not zero');bank.fields[0].value=0;
const duplicate=structuredClone(report);duplicate.rows.push({...duplicate.rows[0],bank:'다른은행'});assert.equal(compareEvidence(duplicate,bank).results[0].state,'unknown','ambiguous account never matches');
assert.equal(evidenceNumber(''),null);assert.equal(evidenceNumber('0'),0);assert.equal(evidenceNumber('1,234원'),1234);assert.equal(evidenceNumber('1,2345'),null);assert.equal(evidenceNumber('abc'),null);
const malicious={...proof,fileName:'<script>alert(1)</script>',image:'data:image/svg+xml;base64,xxx'};report.evidence={proofs:[malicious]};const html=evidencePageHTML(report);assert(!html.includes('<script>alert'));assert(!html.includes('data:image/svg'));assert(html.includes('&lt;script&gt;'));assert(html.includes('자금일보 작성일 적용'));
assert(evidencePageHTML({...report,evidence:undefined}).includes('첨부된 증빙이 없습니다'));
// Missing source columns must never select an income/outflow value as closing balance.
const w=(text,x0,y0,confidence=99)=>({text,bbox:{x0,x1:x0+40,y0,y1:y0+10},confidence});
let ocr=parseEvidenceOCR('bank',{words:[w('12345678901001',200,100),w('5',400,100),w('6',500,100),w('7',600,100)],text:'2026-10-01 ~ 2026-10-23'},1600,400);assert.equal(ocr.fields[0].value,null);assert.equal(ocr.date,'2026-10-23');
ocr=parseEvidenceOCR('nh',{words:[w('005380',200,300),w('2',300,300),w('250060',200,340),w('30',300,340),w('290270',200,380),w('400',300,380)]},1000,600);assert.equal(ocr.fields[0].value,2);assert.equal(ocr.fields[3].value,null);
// Split Korean labels and the independent summary-cell numeric pass.
ocr=parseEvidenceOCR('nh',{words:[w('예',20,100),w('수금',65,100),w('62,568,258원',250,100)]},985,493);
assert.equal(ocr.fields[3].value,62568258);
ocr=parseEvidenceOCR('nh',{words:[w('출금가능금액',700,60),w('99,000',840,60),w('예수금(D+1)',400,100),w('88,000',590,100)],nhDeposit:{value:62568258,confidence:45}},985,493);
assert.equal(ocr.fields[3].value,62568258);
const actualNH={...report,stocks:report.stocks.map(s=>s.quantity===null?{...s,current:62568258}:s)};
assert.equal(compareEvidence(actualNH,{...proof,fields:[...proof.fields.slice(0,3),ocr.fields[3]]}).state,'match','no OCR confidence gate');
assert.equal(nhDepositRegion(new Uint8ClampedArray(985*493*4).fill(255),985,493),null,'no grid means no guessed crop');
// The generated stand-alone report must bundle all imports and retain valid syntax.
const get=p=>fs.readFileSync('report-builder/'+p,'utf8');
const removeExports=s=>s.replace(/^export /gm,'');
const bundle=s=>removeExports(s.replace(/^import .*?;\s*/gm,''));
const code=removeExports(get('evidence-data.js'))+'\n'+bundle(get('evidence.js'))+'\n'+bundle(get('print-report.js'))+'\n'+bundle(get('viewer.js'))+'\n'+removeExports(get('report-history.js'));
new vm.Script('(()=>{'+code+'\n})();');
assert(code.includes('installEvidenceView'));assert(!code.includes('treasury-evidence-page'));
console.log('PASS: 4 NH fields, bond/valuation exclusion, bank zero/missing/duplicate matching, confidence/date checks, XSS/image guard, OCR missing columns, standalone bundle syntax.');

const clipboardFile=new File([new Uint8Array([1,2,3])],'image.png',{type:'image/png'});
const pasted=pastedEvidenceImage({items:[{kind:'string',type:'text/html'},{kind:'file',type:'image/png',getAsFile:()=>clipboardFile}]},'nh',12345);
assert.equal(pasted.name,'NH-증빙-붙여넣기-12345.png');assert.equal(pasted.type,'image/png');assert.equal(pasted.size,3);
assert.equal(pastedEvidenceImage({items:[{kind:'string',type:'text/plain'}]},'bank'),null);
assert.equal(pastedEvidenceImage({files:[new File(['x'],'x.svg',{type:'image/svg+xml'})]},'bank'),null);
assert.equal(pastedEvidenceImage({files:[clipboardFile]},'bank',1).name,'은행-증빙-붙여넣기-1.png');
console.log('PASS: clipboard images, HTML plus image clipboard, files fallback, text paste passthrough, unsupported images.');
