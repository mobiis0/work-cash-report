import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const script=readFileSync('report-builder/report-history.js','utf8').replace('export function','function');
class Events {
  listeners=new Map();
  addEventListener(name,fn){if(!this.listeners.has(name))this.listeners.set(name,new Set());this.listeners.get(name).add(fn);}
  removeEventListener(name,fn){this.listeners.get(name)?.delete(fn);}
  async fire(name,event={}){await Promise.all([...(this.listeners.get(name)||[])].map(fn=>fn(event)));}
}
class Element extends Events {
  children=[];dataset={};attributes={};textContent='';
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;}
  setAttribute(name,value){this.attributes[name]=value;}
  contains(target){return this===target||this.children.some(child=>child.contains?.(target));}
  focus(){}
}
const report=(end,updatedAt=end+'T00:00:00Z')=>({start:end.slice(0,8)+'01',end,updatedAt,rows:[],summary:[]});
const old=report('2026-10-08'),current=report('2026-10-16');
const entry=r=>({id:`${r.start}_${r.end}`,start:r.start,end:r.end,updatedAt:r.updatedAt,path:`archive/${r.start}_${r.end}.json`});
const settle=()=>new Promise(resolve=>setImmediate(resolve));
async function setup({url='https://mobiis0.github.io/work-cash-report/reports/latest/',embedded=old,reports=[current,old]}={}){
 const document=new Events(),window=new Events(),heading=new Element(),root=new Element();document.createElement=()=>new Element();document.visibilityState='visible';root.querySelector=selector=>selector.endsWith(' > p')?{replaceWith:menu=>root.menu=menu}:heading;
 const location=new URL(url),renders=[],requests=[],intervals=new Map();let server=reports,fail=false,disposedCount=0;
 const history={pushState(a,b,url){location.href=String(url);}};
 const context=vm.createContext({document,window,location,history,URL,Date,AbortController,setTimeout,clearTimeout,
  setInterval:fn=>{intervals.set(1,fn);return 1;},clearInterval:id=>intervals.delete(id),
  fetch:async(url,options)=>{requests.push({url:String(url),options});if(fail)throw Error('offline');const path=new URL(url).pathname;const data=path.endsWith('history.json')?{reports:server.map(entry)}:server.find(r=>path.endsWith(entry(r).path));return{ok:!!data,json:async()=>structuredClone(data)};}
 });
 vm.runInContext(script,context);
 const dispose=context.mountReportHistory(root,embedded,(root,data)=>{renders.push(data);return()=>disposedCount++;});
 await settle();await settle();
 return{document,window,root,renders,requests,intervals,location,dispose,setServer:r=>server=r,setFail:v=>fail=v,get disposedCount(){return disposedCount;}};
}
const t=await setup();assert.equal(t.renders.at(-1).end,current.end,'cached old HTML advances to latest');
assert(t.requests.every(r=>r.options.cache==='no-store'&&new URL(r.url).searchParams.has('_fresh')));
const revised=report(current.end,'2026-10-16T03:00:00Z');t.setServer([revised,old]);await t.window.fire('focus');assert.equal(t.renders.at(-1).updatedAt,revised.updatedAt,'same-period corrections refresh');
const n=t.renders.length;await t.window.fire('focus');assert.equal(t.renders.length,n,'unchanged data does not redraw');
const next=report('2026-10-23');t.setServer([next,revised,old]);t.document.visibilityState='hidden';await t.window.fire('focus');assert.equal(t.renders.at(-1).end,current.end,'hidden tab avoids work');t.document.visibilityState='visible';await t.document.fire('visibilitychange');await settle();assert.equal(t.renders.at(-1).end,next.end,'returning to tab loads latest');
t.setFail(true);await t.window.fire('focus');assert.equal(t.root.menu.children[0].children[1].textContent,'갱신 확인 필요');t.setFail(false);await t.window.fire('online');assert.equal(t.root.menu.children[0].children[1].textContent,'최신');
t.dispose();assert.equal(t.intervals.size,0);assert.equal(t.window.listeners.get('focus').size,0);assert(t.disposedCount>0);
const p=await setup({url:'https://mobiis0.github.io/work-cash-report/reports/latest/?period='+entry(old).id});assert.equal(p.renders.at(-1).end,old.end);p.setServer([next,current,old]);await p.window.fire('focus');assert.equal(p.renders.at(-1).end,old.end,'explicit previous-period selection remains');p.dispose();
const embedded=report('2026-10-23');const lag=await setup({embedded,reports:[current,old]});assert.equal(lag.renders.at(-1).end,embedded.end,'archive lag never rolls back embedded data');lag.dispose();
const b=await setup({embedded:current,reports:[current,old]});assert.equal(b.requests.length,2,'same-period initial load checks archive rather than trusting HTML');b.dispose();
console.log('PASS: cached HTML, same-date correction, unchanged render, visibility/focus/online refresh, offline warning/recovery, period selection, archive lag, no-store + unique requests, event cleanup.');
