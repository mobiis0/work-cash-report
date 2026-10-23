import {evidenceStockFields,evidenceNumber,parseEvidenceOCR,compareEvidence} from './evidence-data.js?v=20261023-2';
const evEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const evFormat=value=>value===null||value===undefined?'—':Number(value).toLocaleString('ko-KR',{maximumFractionDigits:2});
const evLabels={match:'일치',mismatch:'불일치',review:'확인 필요',unknown:'미확인'};
function safeEvidenceImage(value){return /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value||'')?value:'';}
export function evidencePageHTML(report){
  const proofs=report.evidence?.proofs||[];
  const summary=proofs.map(proof=>compareEvidence(report,proof));
  return `<section class="evidence-page"><header class="evidence-page-heading"><div><p>SUPPORTING DOCUMENTS</p><h1>증빙 대조</h1><span>${evEscape(report.start)} ~ ${evEscape(report.end)}</span></div><a href="#report" class="evidence-back">자금일보로 돌아가기</a></header>
    ${!proofs.length?'<div class="evidence-empty">이 보고서에 첨부된 증빙이 없습니다. 보고서 생성 화면에서 증빙을 첨부한 뒤 다시 생성·게시하면 여기에 표시됩니다.</div>':`<p class="evidence-intro">증빙 원본과 보고서의 금주 값을 대조합니다. 은행은 잔액, NH투자증권은 3종목 보유 주식수와 예수금만 확인합니다.</p>`}
    ${proofs.map((proof,i)=>{const check=summary[i],src=safeEvidenceImage(proof.image);return `<article class="evidence-card"><div class="evidence-card-heading"><h2>${proof.kind==='nh'?'NH투자증권':'은행 잔액'} 증빙</h2><span class="ev-state ev-${check.state}">${evLabels[check.state]}</span></div><div class="evidence-comparison"><div class="evidence-original"><p>증빙 원본 · ${evEscape(proof.fileName)}</p>${src?`<button type="button" class="ev-image-open" aria-label="증빙 이미지 확대"><img src="${src}" alt="${proof.kind==='nh'?'NH투자증권 잔고':'은행 잔액'} 증빙 원본"></button><small>이미지를 클릭하면 확대할 수 있습니다.</small>`:'<p>이미지 형식을 확인할 수 없습니다.</p>'}</div><div class="evidence-checks"><p class="evidence-date ev-date-${check.dateState}">증빙 기준일: ${evEscape(proof.date||'미입력')} · 보고서 기준일: ${evEscape(report.end)}${check.dateState==='match'?' · 기준일 일치':check.dateState==='mismatch'?' · 기준일 불일치':' · 기준일 확인 필요'}</p><div class="evidence-table-scroll"><table class="evidence-table"><thead><tr><th>대조 항목</th><th>증빙</th><th>보고서</th><th>결과</th></tr></thead><tbody>${check.results.map(row=>`<tr><th>${evEscape(row.target||row.label)}${proof.kind==='bank'?`<small>•••• ${evEscape(row.key)}</small>`:''}</th><td>${evFormat(row.actual)}<small>${evEscape(row.unit)}</small></td><td>${evFormat(row.expected)}<small>${evEscape(row.unit)}</small></td><td><span class="ev-state ev-${row.state}">${evLabels[row.state]}</span>${row.state==='mismatch'?`<small>차이 ${evFormat(row.difference)}${evEscape(row.unit)}</small>`:row.reason?`<small>${evEscape(row.reason)}</small>`:''}</td></tr>`).join('')||'<tr><td colspan="4">대조할 숫자를 읽지 못했습니다. 생성 화면에서 확인해 주세요.</td></tr>'}</tbody></table></div><p class="evidence-check-summary">일치 ${check.counts.match} · 불일치 ${check.counts.mismatch} · 확인 필요 ${check.counts.review+check.counts.unknown}</p>${proof.kind==='bank'?'<p class="evidence-note">증빙에 표시된 계좌만 대조합니다. 누적 입출금액과 주간 입출금액은 기간이 달라 비교하지 않습니다.</p>':'<p class="evidence-note">주가·평가금액·순자산·채권은 대조 대상에 포함하지 않습니다.</p>'}</div></div></article>`;}).join('')}
  </section>`;
}
export function installEvidenceView(root,report){
  const page=document.createElement('div');page.id='evidence';page.innerHTML=evidencePageHTML(report);root.append(page);
  const documentView=root.querySelector('.cash-document'),toolbar=root.querySelector('.treasury-toolbar');
  const update=()=>{const show=location.hash==='#evidence';page.hidden=!show;documentView.hidden=show;if(toolbar)toolbar.hidden=show;if(show)page.scrollIntoView({block:'start'});};
  const dialog=document.createElement('dialog');dialog.className='ev-image-dialog';
  dialog.innerHTML='<button type="button">닫기</button><img alt="확대한 증빙 원본">';root.append(dialog);
  dialog.querySelector('button').addEventListener('click',()=>dialog.close());
  page.addEventListener('click',event=>{const button=event.target.closest('.ev-image-open');if(button){dialog.querySelector('img').src=button.querySelector('img').src;dialog.showModal();}});
  window.addEventListener('hashchange',update);update();
  return()=>{window.removeEventListener('hashchange',update);page.remove();dialog.remove();};
}
let evOCRScript=null,evOCRQueue=Promise.resolve();
async function readEvidenceImage(image,onProgress){
  onProgress('숫자 읽기 도구를 준비하는 중입니다.');
  evOCRScript??=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
    const failed=()=>{evOCRScript=null;script.remove();reject(Error('숫자 읽기 도구를 불러오지 못했습니다. 아래에 직접 입력할 수 있습니다.'));};
    const timeout=setTimeout(failed,25000);
    script.onload=()=>{clearTimeout(timeout);resolve();};script.onerror=()=>{clearTimeout(timeout);failed();};document.head.append(script);
  });
  await evOCRScript;
  const job=evOCRQueue.then(async()=>{
    const loading=Tesseract.createWorker('kor+eng',1,{
      workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
      corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.0',
      langPath:'https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main',gzip:false,cachePath:'mobiis-tessdata-fast-v1',
      logger:message=>onProgress(message.status==='recognizing text'?`숫자를 읽는 중 ${Math.round(message.progress*100)}%`:'숫자 읽기 도구를 준비하는 중입니다.')
    });
    let worker,timer;
    try{worker=await Promise.race([loading,new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('숫자 읽기 준비가 지연되고 있습니다. 아래에서 직접 입력할 수 있습니다.')),60000);})]);}
    catch(error){loading.then(lateWorker=>lateWorker.terminate()).catch(()=>{});throw error;}
    finally{clearTimeout(timer);}
    try{await worker.setParameters({tessedit_pageseg_mode:'6'});return(await worker.recognize(image)).data;}finally{await worker.terminate();}
  });
  evOCRQueue=job.catch(()=>{});return job;
}
async function prepareEvidenceFile(file){
  if(!/^image\/(png|jpeg|webp)$/.test(file.type))throw Error('PNG, JPG 또는 WebP 이미지를 첨부해 주세요.');
  if(file.size>12*1024*1024)throw Error('증빙 이미지는 한 장당 12MB 이하로 첨부해 주세요.');
  const bitmap=await createImageBitmap(file);
  if(bitmap.width*bitmap.height>40000000){bitmap.close();throw Error('이미지가 너무 큽니다. 필요한 화면만 캡처해 주세요.');}
  const canvas=document.createElement('canvas'),scale=Math.min(1,2400/bitmap.width,3200/bitmap.height);
  canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  const image=canvas.toDataURL('image/png');
  if(image.length>5500000)throw Error('보고서 용량이 커집니다. 증빙 화면을 필요한 부분만 잘라 첨부해 주세요.');
  const ocr=document.createElement('canvas'),upscale=Math.min(3,4800/canvas.width);
  ocr.width=Math.round(canvas.width*upscale);ocr.height=Math.round(canvas.height*upscale);ocr.getContext('2d').drawImage(canvas,0,0,ocr.width,ocr.height);
  return{image,ocr:ocr.toDataURL('image/png'),width:ocr.width,height:ocr.height};
}
export function mountEvidenceAttachments(host,onChange){
  const state={bank:null,nh:null},tokens={bank:0,nh:0},pending=new Set();let locked=false;
  host.innerHTML=`<div class="evidence-upload-heading"><h2>증빙 첨부 <small>선택 사항 · 이미지 2개</small></h2><p>은행 잔액 화면과 NH투자증권 잔고 화면을 함께 첨부하면 증빙 대조 페이지가 생성됩니다.</p></div>${['bank','nh'].map(kind=>`<section class="evidence-upload-slot" data-kind="${kind}"><div class="evidence-upload-label"><strong>${kind==='bank'?'은행 잔액 증빙':'NH투자증권 증빙'}</strong><button type="button" class="ev-remove" hidden>첨부 삭제</button></div><input type="file" accept="image/png,image/jpeg,image/webp" aria-label="${kind==='bank'?'은행 잔액':'NH투자증권'} 증빙 이미지"><p class="ev-upload-status" role="status">${kind==='bank'?'계좌별 잔액을 대조합니다.':'현대차·모비스·휴네시온 보유 주식수와 예수금만 대조합니다.'}</p><div class="ev-review"></div></section>`).join('')}<p class="evidence-note">처음 첨부할 때 숫자 인식 도구를 내려받습니다. 이미지는 브라우저에서 처리합니다. 기준일과 읽은 숫자를 확인한 뒤 보고서를 생성해 주세요.</p>`;
  function editor(kind){
    const slot=host.querySelector(`[data-kind="${kind}"]`),proof=state[kind],area=slot.querySelector('.ev-review');
    slot.querySelector('.ev-remove').hidden=!proof;
    if(!proof){area.replaceChildren();return;}
    area.innerHTML=`<div class="ev-review-grid"><img class="ev-thumbnail" src="${proof.image}" alt="첨부 증빙 미리보기"><div><label>증빙 기준일 <input class="ev-date-input" type="date" value="${evEscape(proof.date)}"></label><p class="evidence-note">증빙에 날짜가 없으면 실제 조회한 기준일을 입력해 주세요.</p></div></div><div class="evidence-table-scroll"><table class="ev-input-table"><thead><tr><th>${kind==='bank'?'계좌 끝 4자리':'대조 항목'}</th><th>증빙에서 읽은 값</th><th>원본 확인</th></tr></thead><tbody>${proof.fields.map((field,i)=>`<tr data-field="${i}"><td>${kind==='bank'?`<input class="ev-key" inputmode="numeric" maxlength="4" aria-label="계좌 끝 4자리" value="${evEscape(field.key)}">`:evEscape(field.label)}</td><td><input class="ev-value" inputmode="decimal" aria-label="${evEscape(field.label||'잔액')} 증빙 값" value="${field.value===null?'':evFormat(field.value)}" placeholder="읽지 못함 · 직접 입력"><small>${field.confirmed?'직접 확인한 값':field.confidence>=90?'자동 인식':field.value===null?'숫자 확인 필요':'원본 확인 필요'}</small></td><td><input class="ev-confirm" type="checkbox" aria-label="${evEscape(field.label||'잔액')} 원본 확인" ${field.confirmed?'checked':''}></td></tr>`).join('')}</tbody></table></div>${kind==='bank'?'<button type="button" class="ev-add">계좌 행 추가</button>':''}`;
  }
  for(const kind of ['bank','nh']){
    const slot=host.querySelector(`[data-kind="${kind}"]`),input=slot.querySelector('input[type="file"]'),message=slot.querySelector('.ev-upload-status');
    input.addEventListener('change',async()=>{
      if(locked||!input.files[0])return;const file=input.files[0],token=++tokens[kind];onChange();
      const job=(async()=>{
        try{
          message.textContent='이미지를 준비하는 중입니다.';const prepared=await prepareEvidenceFile(file);if(token!==tokens[kind])return;
          const blank=kind==='nh'?evidenceStockFields.map(f=>({...f,value:null,confidence:0,confirmed:false})):[];
          state[kind]={kind,fileName:file.name,image:prepared.image,fields:blank,date:''};editor(kind);
          try{const data=await readEvidenceImage(prepared.ocr,text=>{if(token===tokens[kind])message.textContent=text;});if(token!==tokens[kind])return;
            Object.assign(state[kind],parseEvidenceOCR(kind,data,prepared.width,prepared.height));message.textContent='숫자 읽기가 끝났습니다. 기준일과 읽은 값을 확인해 주세요.';
          }catch(error){if(token!==tokens[kind])return;message.textContent=error.message||'숫자를 읽지 못했습니다. 아래에 직접 입력해 주세요.';}
          editor(kind);onChange();
        }catch(error){if(token===tokens[kind]){state[kind]=null;editor(kind);message.textContent=error.message;onChange();}}
      })();pending.add(job);try{await job;}finally{pending.delete(job);}
    });
    slot.querySelector('.ev-remove').addEventListener('click',()=>{if(locked)return;tokens[kind]++;state[kind]=null;input.value='';editor(kind);message.textContent='증빙을 삭제했습니다.';onChange();});
    slot.addEventListener('change',event=>{
      if(locked||!state[kind])return;const proof=state[kind],target=event.target;
      if(target.matches('.ev-date-input')){proof.date=target.value;onChange();return;}
      const row=target.closest('[data-field]');if(!row)return;const field=proof.fields[Number(row.dataset.field)];
      if(target.matches('.ev-key'))field.key=target.value.replace(/\D/g,'');
      if(target.matches('.ev-value')){field.value=evidenceNumber(target.value);field.confirmed=false;field.confidence=0;row.querySelector('.ev-confirm').checked=false;}
      if(target.matches('.ev-confirm'))field.confirmed=target.checked;
      row.querySelector('small').textContent=field.confirmed?'직접 확인한 값':field.confidence>=90?'자동 인식':field.value===null?'숫자 확인 필요':'원본 확인 필요';
      onChange();
    });
    slot.addEventListener('click',event=>{if(!locked&&event.target.matches('.ev-add')&&state[kind]){state[kind].fields.push({key:'',label:'추가 계좌',value:null,confidence:0,confirmed:false});editor(kind);onChange();}});
  }
  return{
    getProofs:()=>structuredClone(Object.values(state).filter(Boolean)),
    isPending:()=>pending.size>0,
    setLocked:value=>{locked=value;host.querySelectorAll('input,button').forEach(el=>el.disabled=value);}
  };
}
