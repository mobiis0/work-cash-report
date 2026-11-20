import test from 'node:test';
import assert from 'node:assert/strict';
import {dailyDateRange,nextDailyPeriods} from '../daily-rollover.js';
test('starts with Saturday and Sunday together, then Monday through Friday',()=>{
 const periods=nextDailyPeriods('2026-11-21','2026-11-27');
 assert.deepEqual(periods.map(p=>[p.start,p.end]),[
 ['2026-11-21','2026-11-22'],['2026-11-23','2026-11-23'],['2026-11-24','2026-11-24'],['2026-11-25','2026-11-25'],['2026-11-26','2026-11-26'],['2026-11-27','2026-11-27']]);
});
test('month and year changes retain all dates exactly once',()=>{
 for(const [start,end] of [['2026-10-31','2026-11-06'],['2026-12-26','2027-01-01']]){
  const periods=nextDailyPeriods(start,end);assert.equal(periods.length,6);assert.equal(periods[0].start,start);assert.equal(periods.at(-1).end,end);
 }
 assert.equal(nextDailyPeriods('2026-10-31','2026-11-06')[0].end,'2026-11-01');
});
test('partial periods stay inside the requested reporting interval',()=>{
 assert.deepEqual(nextDailyPeriods('2026-11-21','2026-11-21'),[{start:'2026-11-21',end:'2026-11-21'}]);
 assert.equal(nextDailyPeriods('2026-11-23','2026-11-27').length,5);
 assert.throws(()=>nextDailyPeriods('2026-11-27','2026-11-21'));
 assert.throws(()=>nextDailyPeriods('2026-02-30','2026-03-06'));
});
test('recognizes the existing weekend and numeric Excel date headings',()=>{
 assert.deepEqual(dailyDateRange('2026-10-17 ~ 18'),{start:'2026-10-17',end:'2026-10-18'});
 assert.deepEqual(dailyDateRange('2026-10-31 ~ 2026-11-01'),{start:'2026-10-31',end:'2026-11-01'});
 const excel=(Date.parse('2026-11-20T00:00:00Z')-Date.UTC(1899,11,30))/86400000;
 assert.deepEqual(dailyDateRange(excel),{start:'2026-11-20',end:'2026-11-20'});
 assert.equal(dailyDateRange('2026-02-30'),null);
 assert.equal(dailyDateRange('당일잔액(가용자금)'),null);
});
