// Calendar windows are anchored to the report end, never to a point count.
export function historyForPeriod(history,end,years=1){
 const last=new Date(end+'T00:00:00Z');
 if(!Number.isFinite(last.getTime()))return [];
 const cutoff=new Date(last);const month=cutoff.getUTCMonth();
 cutoff.setUTCFullYear(cutoff.getUTCFullYear()-(years===3?3:1));
 if(cutoff.getUTCMonth()!==month)cutoff.setUTCDate(0);
 const start=cutoff.toISOString().slice(0,10);
 return history.filter(p=>/^\d{4}-\d{2}-\d{2}$/.test(p.date)&&p.date>=start&&p.date<=end).sort((a,b)=>a.date.localeCompare(b.date));
}
const pEscape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pNumber=(v,decimals=0)=>Number.isFinite(v)?v.toLocaleString('ko-KR',{maximumFractionDigits:decimals}):'-';
const pChange=v=>!v?'-':v<0?`(${pNumber(-v)})`:`+${pNumber(v)}`;
const pPercent=(a,b)=>b?`${(100*(a-b)/b).toFixed(2)}%`:'-';
const pClass=v=>v<0?'p-negative':v>0?'p-positive':'';
export function renderDailyLedger(ledger){
 if(!ledger?.days?.length)return `<p class="p-daily-empty">${ledger?.sheet?'보고기간에 해당하는 일일내역이 없습니다.':'일일내역 미연결'}</p>`;
 return ledger.days.map(day=>{
  const columns=day.columns,count=columns.length+3;
  const date=day.start===day.end?day.start.replaceAll('-','.'):day.start.replaceAll('-','.')+' ~ '+day.end.replaceAll('-','.');
  const cells=(values,direction='')=>columns.map(h=>{const n=values?.[h.col],color=n?(direction==='out'?'p-negative':direction==='in'?'p-positive':direction==='net'?pClass(n):''):'';return `<td class="p-daily-amount ${h.total?'p-daily-total':''} ${color}">${n===null||n===undefined?'—':pNumber(n,h.currency==='KRW'?0:2)}</td>`;}).join('');
  const groups=['in','out'].map(direction=>{
   const entries=day.entries[direction],label=direction==='in'?'입금':'출금';
   const rows=entries.length?entries.map(entry=>`<tr class="p-daily-entry" data-source="${pEscape(entry.source)}"><th class="p-daily-direction p-daily-${direction}">${label}</th><td class="p-daily-party">${pEscape(entry.counterparty)||'—'}</td><td class="p-daily-description">${pEscape(entry.description)||'—'}</td>${cells(entry.amounts,direction)}</tr>`).join(''):`<tr class="p-daily-empty-row"><th class="p-daily-direction p-daily-${direction}">${label}</th><td colspan="${count-1}">자금내역없음</td></tr>`;
   const total=day.summaries[direction==='in'?'income':'outcome'];
   return rows+(entries.length&&total?`<tr class="p-subtotal"><th colspan="3">${label} 소계</th>${cells(total.amounts,direction)}</tr>`:'');
  }).join('');
  const balances=['net','opening','closing'].map(key=>{const s=day.summaries[key];return s?`<tr class="${key==='closing'?'p-daily-closing':'p-daily-balance'}"><th colspan="3">${key==='net'?'입출금 차액':pEscape(s.label)}</th>${cells(s.amounts,key==='net'?'net':'')}</tr>`:'';}).join('');
  return `<section class="p-daily-day"><table class="p-table p-daily-table"><colgroup><col class="p-col-direction"><col class="p-col-party"><col class="p-col-description">${columns.map(()=>'<col>').join('')}</colgroup><thead><tr class="p-daily-date"><th colspan="${count}">${pEscape(date)}</th></tr><tr><th>구분</th><th>거래처</th><th>내용</th>${columns.map(h=>`<th>${pEscape(h.label)}${h.currency==='KRW'?'':`<small>${h.currency}</small>`}</th>`).join('')}</tr></thead><tbody>${groups}${balances}</tbody></table></section>`;
 }).join('');
}
function pLine(points,{key='assets',label='',width=650,height=300,color='#28598f',spark=false,unit=1e8,categorical=false}={}){
 const data=points.map(p=>({...p,value:key==='cashForeign'?p.cash+p.foreign:p[key]})).filter(p=>Number.isFinite(p.value));
 if(data.length<2)return'<p class="p-empty">추이 자료 없음</p>';
 const l=spark?3:51,r=spark?3:16,t=spark?3:23,b=spark?3:35;
 const lo=Math.min(...data.map(p=>p.value)),hi=Math.max(...data.map(p=>p.value)),pad=Math.max((hi-lo)*.17,Math.abs(hi)*.001,1),min=lo-pad,max=hi+pad;
 const dates=data.map(p=>Date.parse(p.date+'T00:00:00Z')),start=Math.min(...dates),end=Math.max(...dates);
 const x=i=>l+(categorical?i/(data.length-1):(dates[i]-start)/(end-start||1))*(width-l-r),y=v=>t+(max-v)/(max-min)*(height-t-b);
 const path=data.map((p,i)=>`${i?'L':'M'}${x(i).toFixed(2)},${y(p.value).toFixed(2)}`).join(' ');
 let ticks='';if(!spark){for(let i=0;i<4;i++){const v=min+(max-min)*i/3,yy=y(v);ticks+=`<line x1="${l}" x2="${width-r}" y1="${yy}" y2="${yy}" stroke="#dce4ed"/><text x="${l-8}" y="${yy+4}" text-anchor="end">${pNumber(v/unit,unit===1?0:1)}</text>`;}const indices=[0,Math.floor((data.length-1)/3),Math.floor(2*(data.length-1)/3),data.length-1];for(const i of new Set(indices))ticks+=`<text x="${x(i)}" y="${height-11}" text-anchor="${i===0?'start':i===data.length-1?'end':'middle'}">${categorical&&!data[i].exactDate?'':data[i].date.slice(5).replace('-','/')}</text>`;ticks+=`<text x="${l}" y="12">${unit===1?'원':unit===1e4?'만원':'억원'}</text>`;}
 return`<svg class="p-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${pEscape(label)} 추이"><title>${pEscape(label)} ${data[0].date} ~ ${data.at(-1).date}</title>${ticks}<path d="${path} L${x(data.length-1)},${height-b} L${l},${height-b} Z" fill="${color}" fill-opacity=".08"/><path d="${path}" fill="none" stroke="${color}" stroke-width="${spark?1.8:2.1}"/>${!spark?data.map((p,i)=>`<circle cx="${x(i)}" cy="${y(p.value)}" r="${i===data.length-1?3.5:2.4}" fill="${color}"><title>${categorical&&!p.exactDate?pEscape(p.source):p.date}: ${pNumber(p.value)}원</title></circle>`).join(''):''}</svg>`;
}
function pBars(points){
 if(points.length<2)return'<p class="p-empty">증감 자료 없음</p>';
 const changes=points.slice(1).map((p,i)=>({date:p.date,cash:p.cash-points[i].cash,foreign:p.foreign-points[i].foreign,stocks:p.stocks-points[i].stocks}));
 const keys=['cash','foreign','stocks'],colors=['#28598f','#379d91','#cc852c'],w=1050,h=120,l=48,r=12,t=12,b=30;
 const pos=Math.max(...changes.map(p=>keys.reduce((s,k)=>s+Math.max(0,p[k]),0))),neg=Math.min(...changes.map(p=>keys.reduce((s,k)=>s+Math.min(0,p[k]),0))),span=pos-neg||1,lo=neg-span*.1,hi=pos+span*.1;
 const y=v=>t+(hi-v)/(hi-lo)*(h-t-b),step=(w-l-r)/changes.length,bw=Math.min(28,step*.58);
 let marks='';for(let i=0;i<4;i++){const v=lo+(hi-lo)*i/3;marks+=`<line x1="${l}" x2="${w-r}" y1="${y(v)}" y2="${y(v)}" stroke="#dce4ed"/><text x="${l-7}" y="${y(v)+4}" text-anchor="end">${pNumber(v/1e8,1)}</text>`;}
 changes.forEach((p,i)=>{let up=0,down=0;keys.forEach((k,j)=>{const v=p[k],base=v>=0?up:down;marks+=`<rect x="${l+i*step+(step-bw)/2}" y="${Math.min(y(base),y(base+v))}" width="${bw}" height="${Math.abs(y(base+v)-y(base))}" fill="${colors[j]}"/>`;if(v>=0)up+=v;else down+=v;});if(i%Math.max(1,Math.ceil(changes.length/7))===0||i===changes.length-1)marks+=`<text x="${l+(i+.5)*step}" y="${h-9}" text-anchor="middle">${p.date.slice(5).replace('-','/')}</text>`;});
 return`<svg class="p-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="주간 자산 증감 요인, 원화 외화 주식"><text x="0" y="10">억원</text>${marks}<line x1="${l}" x2="${w-r}" y1="${y(0)}" y2="${y(0)}" stroke="#92a1b6"/></svg>`;
}
export function makePrintPages(report){
 const sums=Object.fromEntries(report.summary.map(s=>[s.key,s])),hist=historyForPeriod(report.history,report.end),totalHist=historyForPeriod(report.totalHistory?.length?report.totalHistory:report.history,report.end,3),stocks=report.stocks.filter(s=>s.quantity!==null),deposit=report.stocks.filter(s=>s.quantity===null),stockPrevious=stocks.reduce((n,s)=>n+s.previous,0),stockCurrent=stocks.reduce((n,s)=>n+s.current,0);
 const short=row=>row.currency==='KRW'&&(/신탁|예금/.test(row.type)||row.id==='account-23');
 const ordinary=report.rows.filter(r=>r.currency==='KRW'&&!short(r)),term=report.rows.filter(short),foreign=report.rows.filter(r=>r.currency!=='KRW');
 const total=rows=>({previous:rows.reduce((n,s)=>n+s.previous,0),current:rows.reduce((n,s)=>n+s.current,0)}),a=total(ordinary),b=total(term);
 const rows=[['보통예금',a],['단기금융상품',b],['원화 현금 및 예금',sums.cash,'subtotal'],['외화예금 (원화환산)',sums.foreign],['주식 평가액',{previous:stockPrevious,current:stockCurrent}],['증권 예수금',total(deposit)],['주식 및 증권계좌',sums.stocks,'subtotal'],['자산 총계',sums.assets,'grand']];
 const dateText=s=>{const d=new Date(s+'T00:00:00Z');return s.replaceAll('-','.')+' ('+['일','월','화','수','목','금','토'][d.getUTCDay()]+')';};
 const header=(subtitle='')=>`<header class="p-header"><div><p class="p-eyebrow">TREASURY REPORT</p><h1>주간 자금현황${subtitle?` <span>${subtitle}</span>`:''}</h1><p class="p-period">${dateText(report.start)} ~ ${dateText(report.end)}</p></div><table class="p-approval"><tr><th rowspan="2">결<br>재</th><th>담당</th><th>검토</th><th>승인</th></tr><tr><td></td><td></td><td></td></tr></table></header>`;
 const footer=page=>`<footer class="p-footer"><span>단위: 원 (외화예금은 해당 통화, 원화환산은 적용환율 기준)</span><span>작성 ${new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date(report.updatedAt))} · ${page}</span></footer>`;
 const metrics=[['assets','총 자산 (원화·외화·주식)'],['cash','원화 현금 및 예금'],['foreign','외화예금 (원화환산)'],['stocks','주식 및 증권계좌']];
 const highlights=[...report.rows.filter(r=>r.currency==='KRW').map(r=>({label:r.bank+' '+r.type,change:r.current-r.previous})),...stocks.map(s=>({label:s.name+' 평가액',change:s.change}))].filter(x=>x.change).sort((x,y)=>Math.abs(y.change)-Math.abs(x.change)).slice(0,5);
 const tableHead='<thead><tr><th>구분</th><th>이전주</th><th>금주</th><th>차액</th><th>증감률</th></tr></thead>';
 const page1=`<section class="treasury-page">${header()}<div class="p-metrics">${metrics.map(([key,label])=>{const s=sums[key];return`<div class="p-metric ${key==='assets'?'p-main-metric':''}"><span>${label}</span><strong>${pNumber(s.current)}</strong><div class="${pClass(s.change)}">${pChange(s.change)} (${pPercent(s.current,s.previous)})</div>${pLine(hist,{key,label,width:270,height:35,spark:true,color:key==='assets'?'#9cb8df':key==='foreign'?'#379d91':key==='stocks'?'#cc852c':'#28598f'})}</div>`;}).join('')}</div><div class="p-overview"><div><h2>자금 총액 비교</h2><table class="p-table p-summary">${tableHead}<tbody>${rows.map(([label,s,cls=''])=>`<tr class="p-${cls}"><th>${label}</th><td>${pNumber(s.previous)}</td><td>${pNumber(s.current)}</td><td class="${pClass(s.current-s.previous)}">${pChange(s.current-s.previous)}</td><td class="${pClass(s.current-s.previous)}">${pPercent(s.current,s.previous)}</td></tr>`).join('')}</tbody></table><h2>주요 변동 <small>전주 대비 원화환산 금액 기준 상위 5</small></h2><ul class="p-highlights">${highlights.map(x=>`<li>${pEscape(x.label)} <strong class="${pClass(x.change)}">${pChange(x.change)}</strong></li>`).join('')}</ul></div><div><h2>3개년 총액 추이(주식합산) <small>단위 억원</small></h2>${pLine(totalHist,{label:'3개년 총액 추이(주식합산)',width:610,height:330,categorical:Boolean(report.totalHistory?.length)})}<p class="p-note">${totalHist.length?totalHist[0].date.replaceAll('-','.'):''} ~ ${report.end.replaceAll('-','.')} · ${report.totalHistory?.length?'원본 백만원 자료를 억원으로 환산':'세로축은 표시 구간에 맞춰 조정'}</p></div></div>${footer(1)}</section>`;
 const currencyValue=(value,currency)=>`${currency==='EUR'?'€ ':currency==='GBP'?'£ ':''}${pNumber(value,currency==='KRW'?0:2)}`;
 const accountRows=rows=>rows.map(r=>`<tr class="${r.in||r.out?'p-account-active':'p-account-inactive'}"><td>${pEscape(r.bank)}</td><td>${pEscape(r.type)}</td><td class="p-account">${pEscape(r.account)}</td><td>${currencyValue(r.previous,r.currency)}</td><td class="p-bold">${currencyValue(r.current,r.currency)}</td><td class="${pClass(r.current-r.previous)}">${currencyValue(r.current-r.previous,r.currency)}</td><td class="p-account">${pEscape(r.note)}</td></tr>`).join('');
 const page2=`<section class="treasury-page">${header('· 현금·예금 입출금 요약')}<table class="p-table p-accounts"><thead><tr><th>은행</th><th>계좌명</th><th>계좌번호</th><th>주초잔액</th><th>주말잔액</th><th>증감</th><th>비고</th></tr></thead><tbody><tr class="p-group"><th colspan="7">보통예금</th></tr>${accountRows(ordinary)}<tr class="p-group"><th colspan="7">단기금융상품</th></tr>${accountRows(term)}<tr class="p-group"><th colspan="7">외화예금</th></tr>${accountRows(foreign)}${report.subtotal.map(s=>`<tr class="${s.key==='cashForeign'?'p-grand':'p-subtotal'}"><th colspan="3">${pEscape(s.label)}</th><td>${currencyValue(s.previous,s.currency)}</td><td>${currencyValue(s.current,s.currency)}</td><td class="${pClass(s.current-s.previous)}">${currencyValue(s.current-s.previous,s.currency)}</td><td>${s.currency==='KRW'?'원화환산 포함':s.currency}</td></tr>`).join('')}</tbody></table><p class="p-note">전체 계좌 표시 · 입출금이 있는 계좌를 진한 색으로 표시합니다.</p>${footer(2)}</section>`;
 const pdate=new Date(Date.parse(report.start+'T00:00:00Z')-86400000).toISOString().slice(0,10);
 const page3=`<section class="treasury-page">${header('· 주식보유 현황 및 변동')}<table class="p-table p-stocks"><thead><tr><th>종목</th><th>증권사</th><th>보유주식수</th><th>전주 환산주가</th><th>금주 주가</th><th>등락률</th><th>이전주 총액</th><th>금주 총액</th><th>차액</th></tr></thead><tbody>${stocks.map(s=>{const previous=s.previous/s.quantity;return`<tr><th>${pEscape(s.name)}</th><td>${pEscape(s.broker)}</td><td>${pNumber(s.quantity)}</td><td>${pNumber(previous)}</td><td class="p-bold">${pNumber(s.price)}</td><td class="${pClass(s.change)}">${pPercent(s.current,s.previous)}</td><td>${pNumber(s.previous)}</td><td>${pNumber(s.current)}</td><td class="${pClass(s.change)}">${pChange(s.change)}</td></tr>`;}).join('')}<tr class="p-subtotal"><th colspan="6">주식 평가액 소계</th><td>${pNumber(stockPrevious)}</td><td>${pNumber(stockCurrent)}</td><td class="${pClass(stockCurrent-stockPrevious)}">${pChange(stockCurrent-stockPrevious)}</td></tr>${deposit.map(s=>`<tr><th>${pEscape(s.name)} 예수금</th><td colspan="5">증권계좌 예수금</td><td>${pNumber(s.previous)}</td><td>${pNumber(s.current)}</td><td>${pChange(s.change)}</td></tr>`).join('')}<tr class="p-grand"><th colspan="6">주식 및 증권계좌 합계</th><td>${pNumber(sums.stocks.previous)}</td><td>${pNumber(sums.stocks.current)}</td><td>${pChange(sums.stocks.change)}</td></tr></tbody></table><p class="p-note">전주 환산주가 = 이전주 평가금액 ÷ 금주 보유주식수. 과거 종목별 주가 자료는 원본에 포함되어 있지 않습니다.</p><h2>종목별 주가 비교 <small>전주 환산주가·금주 주가 기준</small></h2><div class="p-stock-charts">${stocks.map(s=>`<div class="p-stock-chart"><div><strong>${pEscape(s.name)}</strong><span>${pNumber(s.price)}원 · ${pPercent(s.current,s.previous)}</span></div>${pLine([{date:pdate,price:s.previous/s.quantity},{date:report.end,price:s.price}],{key:'price',label:s.name,width:345,height:135,color:'#cc852c',unit:1})}</div>`).join('')}</div><h2>주간 자산 증감 요인 <small><span class="p-legend-blue">원화 현금·예금</span> <span class="p-legend-teal">외화</span> <span class="p-legend-orange">주식·증권</span></small></h2>${pBars(hist)}${footer(3)}</section>`;
 const daily=`<section class="treasury-page treasury-daily-page">${header('· 일일자금일보')}<p class="p-daily-units">원화: 원 · 외화: EUR / GBP</p>${renderDailyLedger(report.dailyLedger)}${footer('일일내역')}</section>`;
 return page1+page2+page3+daily;
}
export function installReportPrint(root,report){
 const paper=document.createElement('div');paper.className='treasury-print-root';paper.hidden=true;paper.innerHTML=makePrintPages(report);document.body.append(paper);
 const toolbar=document.createElement('div');toolbar.className='treasury-toolbar';toolbar.innerHTML='<button type="button" class="paper-preview-button">보고서 양식 보기</button><button type="button" class="paper-print-button">PDF / 인쇄</button><span>A4 가로 · 주간 요약 + 일일자금일보 · 결재란 포함</span>';root.prepend(toolbar);
 const preview=toolbar.querySelector('.paper-preview-button');
 preview.addEventListener('click',()=>{paper.hidden=!paper.hidden;preview.textContent=paper.hidden?'보고서 양식 보기':'보고서 양식 닫기';if(!paper.hidden)paper.scrollIntoView({behavior:'smooth',block:'start'});});
 const before=()=>document.body.classList.add('treasury-printing');
 const printing=()=>{before();window.print();};toolbar.querySelector('.paper-print-button').addEventListener('click',printing);
 window.addEventListener('beforeprint',before);
 const after=()=>document.body.classList.remove('treasury-printing');window.addEventListener('afterprint',after);
 return()=>{paper.remove();toolbar.remove();after();window.removeEventListener('beforeprint',before);window.removeEventListener('afterprint',after);};
}

