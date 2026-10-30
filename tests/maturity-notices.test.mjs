import test from 'node:test';
import assert from 'node:assert/strict';
import {dueNotices,parseMaturity,depositsFromRows,koreaToday} from '../report-builder/maturity-notices.mjs';
const deposit={bank:'신한은행',type:'예금',account:'207-038-986108',amount:20000000000,maturity:'2026-11-26'};
test('November first visit and the previous calendar week each notify once',()=>{
 assert.equal(dueNotices([deposit],'2026-10-29').length,0);
 assert.equal(dueNotices([deposit],'2026-10-30')[0].title,'11월 안내사항');
 const early = dueNotices([deposit],'2026-10-30')[0];
 const earlySeen = Object.fromEntries(early.ackKeys.map(key=>[key,true]));
 assert.equal(dueNotices([deposit],'2026-11-02',earlySeen).length,0);
 assert.equal(dueNotices([deposit],'2026-11-20',earlySeen)[0].title,'다음주 안내사항');
 const monthly=dueNotices([deposit],'2026-11-02')[0];
 assert.equal(monthly.title,'11월 안내사항');
 const seen=Object.fromEntries(monthly.ackKeys.map(key=>[key,true]));
 assert.equal(dueNotices([deposit],'2026-11-15',seen).length,0);
 const weekly=dueNotices([deposit],'2026-11-16',seen)[0];
 assert.equal(weekly.title,'다음주 안내사항');
 assert.equal(dueNotices([deposit],'2026-11-22',seen).length,1);
 weekly.ackKeys.forEach(key=>seen[key]=true);
 assert.equal(dueNotices([deposit],'2026-11-22',seen).length,0);
 assert.equal(dueNotices([deposit],'2026-11-23',seen).length,0);
 assert.equal(dueNotices([deposit],'2026-11-27',{},true).length,0);
 assert.equal(dueNotices([deposit],'2026-11-23',seen,true).length,1);
});
test('late first visit merges overlapping phases without a stale monthly popup',()=>{
 const weekly=dueNotices([deposit],'2026-11-19')[0];
 assert.equal(weekly.title,'다음주 안내사항');
 const seen=Object.fromEntries(weekly.ackKeys.map(key=>[key,true]));
 assert.equal(dueNotices([deposit],'2026-11-24',seen).length,0);
});
test('advance notices cross month and year boundaries, independently of monthly notices',()=>{
 for(const maturity of ['2026-12-01','2027-01-01']){
  const d={...deposit,maturity};
  const monday=maturity==='2026-12-01'?'2026-11-23':'2026-12-21';
  assert.equal(dueNotices([d],monday)[0].title,'다음주 안내사항');
 }
});
test('maturity notes validate real dates and skip closed accounts',()=>{
 assert.equal(parseMaturity('3.11%/2026.11.26 만기'),'2026-11-26');
 assert.equal(parseMaturity('2026.02.30 만기'),null);
 assert.equal(parseMaturity('2026.11.26 금리변경'),null);
 assert.equal(depositsFromRows([{...deposit,note:'2026.11.26 만기',current:0}]).length,0);
 assert.equal(depositsFromRows([{...deposit,note:'2026.11.26 만기',current:20000000000}])[0].amount,20000000000);
 assert.equal(dueNotices([deposit,deposit],'2026-11-01').length,1);
 assert.equal(koreaToday(new Date('2026-10-31T15:01:00Z')),'2026-11-01');
});

test('month notice starts on the final weekday and handles year rollover',()=>{
 const jan={...deposit,maturity:'2027-01-26'};
 assert.equal(dueNotices([jan],'2026-12-30').length,0);
 assert.equal(dueNotices([jan],'2026-12-31')[0].title,'1월 안내사항');
 const december={...deposit,maturity:'2026-12-26'};
 assert.equal(dueNotices([december],'2026-11-29').length,0);
 assert.equal(dueNotices([december],'2026-11-30')[0].title,'12월 안내사항');
});
