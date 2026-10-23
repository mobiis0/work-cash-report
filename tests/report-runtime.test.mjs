import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto,createHash} from 'node:crypto';
import {reportRuntimeHash,reportRendererURL} from '../report-builder/report-history.js';
import {compareEvidence} from '../report-builder/evidence-data.js';
const hash='a'.repeat(64),other='b'.repeat(64);
assert.equal(reportRendererURL(hash,hash,'https://mobiis0.github.io/work-cash-report/reports/latest/#evidence'),null);
const changed=reportRendererURL(hash,other,'https://mobiis0.github.io/work-cash-report/reports/latest/?period=2026-10-17_2026-10-23#evidence');
assert(changed.includes('renderer='+hash));assert(changed.endsWith('#evidence'));assert(changed.includes('period='));
assert.equal(reportRendererURL(hash,other,changed),null,'prevent reload loop');
assert.equal(reportRendererURL('invalid',other,changed),null);
assert.equal(reportRendererURL(hash,other,'file:///tmp/report.html'),null);
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const html=fs.readFileSync('reports/latest/index.html','utf8'),script=html.split('<script>')[1].split('</script>')[0];
const marker=/\bconst\s+reportData\s*=\s*(?=\{)/.exec(script);
const digest=createHash('sha256').update(script.slice(0,marker.index)).digest('hex');
assert.equal(await reportRuntimeHash(script),digest,'browser hash matches archive SHA-256');
// Verify the exact pasted standalone renderer, rather than only imported preview functions.
const start=script.indexOf('const evidenceStockFields'),end=script.indexOf('const evEscape',start);
const ctx={};vm.createContext(ctx);vm.runInContext(script.slice(start,end)+'\nglobalThis.compare=compareEvidence;',ctx);
const encoded=script.slice(marker.index+marker[0].length),boundary=encoded.lastIndexOf(';\nmountReportHistory');
const data=JSON.parse(encoded.slice(0,boundary));
for(const proof of data.evidence.proofs){
 const preview=compareEvidence(data,proof),published=ctx.compare(data,proof);
 assert.equal(published.state,'match');assert.equal(preview.state,published.state);
 assert.deepEqual(Array.from(published.results,r=>r.state),preview.results.map(r=>r.state));
 for(const row of published.results)assert.equal(row.actual,row.expected);
}
console.log('PASS: exact standalone and preview agree on all published evidence; low OCR confidence does not override numeric equality; renderer reload preserves selected period and evidence view; SHA-256 agrees');
