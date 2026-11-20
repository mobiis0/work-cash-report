import test from 'node:test';
import assert from 'node:assert/strict';
import {parseEvidenceOCR} from '../report-builder/evidence-data.js';
const word=(text,right,y)=>({text,confidence:95,bbox:{x0:right-Math.max(5,text.length*5),x1:right,y0:y,y1:y+12}});
const account=(suffix,y)=>word('1234567890'+suffix,310,y);
const row=(values,y)=>[account(String(y).padStart(4,'0'),y),...values.map((value,i)=>word(String(value),500+100*i,y))];
test('reads the bank closing column past the middle of a bank-and-ledger table',()=>{
 const fields=parseEvidenceOCR('bank',{words:row([1000,25,10,1015,9999,99,88,7777],100)},1300,400).fields;
 assert.equal(fields[0].value,1015,'use fourth bank column, not eighth ledger column');
});
test('reads a cropped bank-only table with closing balance at its right edge',()=>{
 assert.equal(parseEvidenceOCR('bank',{words:row([1000,25,10,1015],100)},820,400).fields[0].value,1015);
});
test('missing amounts never shift another column into the closing balance',()=>{
 const complete=row([1000,25,10,1015,9000,99,88,7777],100);
 const missingOpening=row([2000,25,10,2015,9000,99,88,7777],150).filter(w=>w.bbox.x1!==500);
 const missingClosing=row([3000,25,10,3015,9000,99,88,7777],200).filter(w=>w.bbox.x1!==800);
 const fields=parseEvidenceOCR('bank',{words:[...complete,...missingOpening,...missingClosing]},1300,400).fields;
 assert.deepEqual(fields.map(x=>x.value),[1015,2015,null]);
});
test('zero is retained and unsupported incomplete layouts stay unknown',()=>{
 assert.equal(parseEvidenceOCR('bank',{words:row([0,0,0,0,100,1,2,99],100)},1300,400).fields[0].value,0);
 assert.equal(parseEvidenceOCR('bank',{words:row([100,25,10],100)},1300,400).fields[0].value,null);
});
