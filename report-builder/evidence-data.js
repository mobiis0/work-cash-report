export const evidenceStockFields = [
  {key:'005380',label:'현대차 보유 주식수',unit:'주'},
  {key:'250060',label:'모비스 보유 주식수',unit:'주'},
  {key:'290270',label:'휴네시온 보유 주식수',unit:'주'},
  {key:'deposit',label:'NH투자증권 예수금',unit:'원'}
];
export function evidenceNumber(value){
  if(typeof value==='number')return Number.isFinite(value)?value:null;
  const s=String(value??'').trim().replace(/[원주\s]/g,'');
  if(!s||!/^[-+]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(s))return null;
  const n=Number(s.replaceAll(',',''));return Number.isFinite(n)?n:null;
}
export function evidenceLines(words){
  const sorted=words.filter(w=>w.text?.trim()&&w.bbox).sort((a,b)=>a.bbox.y0-b.bbox.y0||a.bbox.x0-b.bbox.x0);
  const groups=[];
  for(const word of sorted){
    const cy=(word.bbox.y0+word.bbox.y1)/2,h=word.bbox.y1-word.bbox.y0;
    let line=groups.find(g=>Math.abs(g.cy-cy)<Math.max(6,Math.min(g.h,h)*.6));
    if(!line){line={cy,h,words:[]};groups.push(line);}
    line.words.push(word);
  }
  return groups.sort((a,b)=>a.cy-b.cy).map(g=>g.words.sort((a,b)=>a.bbox.x0-b.bbox.x0));
}
export function parseEvidenceOCR(kind,data,width,height){
  const words=data.words||data.blocks?.flatMap(b=>b.paragraphs?.flatMap(p=>p.lines?.flatMap(l=>l.words||[])||[])||[])||[];
  const lines=evidenceLines(words),fields=[];
  const text=data.text||lines.map(line=>line.map(w=>w.text).join(' ')).join('\n');
  const dates=[...text.matchAll(/(20\d{2})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})/g)]
    .map(m=>`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`).sort();
  if(kind==='bank'){
    for(const line of lines){
      const account=line.find(w=>/^\d{10,16}$/.test(w.text.replace(/\s/g,'')));
      if(!account){
        const code=line.find(w=>/^\d{5}$/.test(w.text)&&w.bbox.x0<width*.10);
        if(code)fields.push({key:'',label:'계좌 식별 확인 필요 (코드 '+code.text+')',value:null,confidence:0,confirmed:false});
        continue;
      }
      const amounts=line.filter(w=>w.bbox.x0>account.bbox.x1&&w.bbox.x0<width*.50)
        .map(w=>({...w,value:evidenceNumber(w.text)})).filter(w=>w.value!==null);
      // The supplied ERP layout has four columns (opening/in/out/closing) in its left ledger.
      // Missing cells must not shift another column into the closing balance.
      const balance=amounts.length===4?amounts[3]:null;
      fields.push({key:account.text.replace(/\D/g,'').slice(-4),label:'계좌 •••• '+account.text.replace(/\D/g,'').slice(-4),
        value:balance?.value??null,confidence:Math.min(account.confidence??0,balance?.confidence??0),confirmed:false});
    }
  }else{
    for(const spec of evidenceStockFields){
      if(spec.key==='deposit')continue;
      const line=lines.find(line=>line.some(w=>w.text.replace(/\D/g,'').padStart(6,'0')===spec.key));
      const code=line?.find(w=>w.text.replace(/\D/g,'').padStart(6,'0')===spec.key);
      const qty=code&&line.find(w=>w.bbox.x0>code.bbox.x1&&evidenceNumber(w.text)!==null);
      fields.push({...spec,value:qty?evidenceNumber(qty.text):null,confidence:qty?.confidence??0,confirmed:false});
    }
    // Read the first 예수금 field, never valuation, net assets, D+1 or D+2.
    let deposit=null;
    for(const line of lines){
      const label=line.find(w=>/^예수금$/.test(w.text.replace(/\s/g,''))&&w.bbox.x0<width*.3&&w.bbox.y0<height*.4);
      if(label){deposit=line.find(w=>w.bbox.x0>label.bbox.x1&&w.bbox.x0<width*.42&&evidenceNumber(w.text)!==null);if(deposit)break;}
    }
    let depositValue=deposit?evidenceNumber(deposit.text):null,depositConfidence=deposit?.confidence??0;
    // Some captures merge the won glyph into the final digit. Keep a positional
    // candidate only for explicit human confirmation; never mark it as a match.
    if(depositValue===null){
      const candidate=words.find(w=>w.bbox.x0>width*.20&&w.bbox.x0<width*.40&&
        w.bbox.y0>height*.22&&w.bbox.y0<height*.32&&/\d{1,3},\d{3}/.test(w.text));
      if(candidate){const strict=evidenceNumber(candidate.text),trailing=candidate.text.match(/^(\d{1,3}(?:,\d{3})+)\d$/);
        depositValue=strict??(trailing?evidenceNumber(trailing[1]):null);depositConfidence=0;}
    }
    fields.push({...evidenceStockFields[3],value:depositValue,confidence:depositConfidence,confirmed:false});
  }
  return {fields,date:dates.at(-1)||'',dateConfirmed:false};
}
export function compareEvidence(report,proof){
  const dateState=!proof.date?'unknown':proof.date===report.end?'match':'mismatch';
  const fields=proof.kind==='nh'?evidenceStockFields.map(spec=>({...spec,...proof.fields.find(f=>f.key===spec.key)})):proof.fields;
  const results=fields.map(field=>{
    let expected=null,reason='',target='';
    if(proof.kind==='bank'){
      const suffix=String(field.key).replace(/\D/g,'');
      const matches=report.rows.filter(row=>row.currency==='KRW'&&String(row.account).replace(/\D/g,'').endsWith(suffix)&&suffix.length===4);
      if(matches.length===1){expected=matches[0].current;target=matches[0].bank+' '+matches[0].type;}
      else reason=matches.length?'계좌 연결이 중복됩니다.':'보고서에서 해당 원화 계좌를 찾지 못했습니다.';
    }else if(field.key==='deposit'){
      const matches=report.stocks.filter(s=>/NH|엔에이치/i.test(s.broker+' '+s.name)&&s.quantity===null);
      if(matches.length===1){expected=matches[0].current;target='NH투자증권 예수금';}else reason='NH 예수금 항목을 하나로 연결할 수 없습니다.';
    }else{
      const names={'005380':'현대차','250060':'모비스','290270':'휴네시온'};
      const matches=report.stocks.filter(s=>s.name.replace(/\s/g,'')===names[field.key]&&s.quantity!==null);
      if(matches.length===1){expected=matches[0].quantity;target=names[field.key];}else reason='보고서에서 해당 보유 주식수를 찾지 못했습니다.';
    }
    const actual=evidenceNumber(field.value),readable=field.confirmed||field.confidence>=90;
    let state=actual===null||expected===null?'unknown':!readable?'review':Math.abs(actual-expected)<.005?'match':'mismatch';
    if(actual===null)reason='증빙에서 숫자를 읽지 못했습니다.';
    else if(!readable&&!reason)reason='읽은 숫자의 원본 확인이 필요합니다.';
    return{...field,actual,expected,target,state,reason,difference:actual===null||expected===null?null:actual-expected,unit:field.unit||'원'};
  });
  const counts={match:0,mismatch:0,review:0,unknown:0};results.forEach(r=>counts[r.state]++);
  const state=dateState==='mismatch'||counts.mismatch?'mismatch':dateState!=='match'||!results.length||counts.unknown||counts.review?'review':'match';
  return{dateState,results,counts,state};
}
