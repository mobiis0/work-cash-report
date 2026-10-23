export async function reportRuntimeHash(script){
  const match=/\bconst\s+reportData\s*=\s*(?=\{)/.exec(script);
  if(!match||!globalThis.crypto?.subtle)return '';
  const bytes=new TextEncoder().encode(script.slice(0,match.index));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
}
export function reportRendererURL(remoteHash,localHash,href){
  if(!/^[a-f0-9]{64}$/.test(remoteHash||'')||!localHash||remoteHash===localHash)return null;
  const url=new URL(href);
  if(url.hostname!=='mobiis0.github.io'||!url.pathname.endsWith('/reports/latest/'))return null;
  if(url.searchParams.get('renderer')===remoteHash)return null;
  url.searchParams.set('renderer',remoteHash);
  return url.href;
}
export function mountReportHistory(root, latestReport, render) {
  const localRuntimeHash=reportRuntimeHash(document.currentScript?.textContent||'');
  const idOf = data => `${data.start}_${data.end}`;
  const period = data => `${data.start.replaceAll('-', '.')} ~ ${data.end.replaceAll('-', '.')}`;
  const validEntry = entry => entry && /^\d{4}-\d{2}-\d{2}$/.test(entry.start) &&
    /^\d{4}-\d{2}-\d{2}$/.test(entry.end) && entry.start <= entry.end &&
    entry.id === idOf(entry) && entry.path === `archive/${entry.id}.json`;
  let currentId = idOf(latestReport), selectedId = currentId;
  let entries = [{id: currentId, start: latestReport.start, end: latestReport.end,
    updatedAt: latestReport.updatedAt, path: `archive/${currentId}.json`}];
  const cache = new Map([[currentId, latestReport]]);
  let cleanup, selection = 0, refreshing = false, disposed = false, verified = false;
  const menu = document.createElement('details');
  menu.className = 'report-history';
  const heading = document.createElement('summary');
  heading.setAttribute('aria-label', '보고기간 선택 · 이전 보고서 보기');
  const title = document.createElement('span');
  const badge = document.createElement('span');
  badge.className = 'report-history-badge';
  const arrow = document.createElement('span');
  arrow.className = 'report-history-arrow';
  arrow.textContent = '▾';
  arrow.setAttribute('aria-hidden', 'true');
  heading.append(title, badge, arrow);
  const list = document.createElement('div');
  list.className = 'report-history-list';
  list.setAttribute('aria-label', '게시된 보고서 목록');
  const message = document.createElement('p');
  message.className = 'report-history-status';
  message.setAttribute('role', 'status');
  menu.append(heading, list);
  const localBase = new URL('../', location.href);
  const remoteBase = new URL('https://raw.githubusercontent.com/mobiis0/work-cash-report/main/reports/');
  const base = location.hostname === 'mobiis0.github.io' ? remoteBase : localBase;
  const requestedPeriod = () => new URL(location.href).searchParams.get('period');
  function updateBadge() {
    badge.textContent = !verified ? '최신 확인 중' : selectedId === currentId ? '최신' : '이전 보고서';
  }
  function refreshList() {
    list.replaceChildren();
    for (const entry of entries) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'report-history-option';
      button.dataset.period = entry.id;
      button.setAttribute('aria-current', entry.id === selectedId ? 'true' : 'false');
      const name = document.createElement('span');
      name.textContent = period(entry);
      const tag = document.createElement('small');
      tag.textContent = entry.id === currentId ? '최신' : '이전 보고서';
      button.append(name, tag);
      button.addEventListener('click', () => select(entry));
      list.append(button);
    }
    list.append(message);
  }
  function show(data) {
    cleanup?.();
    cleanup = render(root, data);
    selectedId = idOf(data);
    title.textContent = period(data);
    updateBadge();
    document.title = `모비스 주간자금현황 ${data.end}`;
    const oldPeriod = root.querySelector('.report-heading > div > p');
    if (oldPeriod) oldPeriod.replaceWith(menu);
    else root.querySelector('.report-heading > div')?.append(menu);
    refreshList();
  }
  async function readJSON(path) {
    const url = new URL(path, base);
    // no-store bypasses browser storage; a unique URL also avoids stale CDN responses.
    url.searchParams.set('_fresh', `${Date.now()}-${++readJSON.sequence}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(url, {cache: 'no-store', signal: controller.signal});
      if (!response.ok) throw new Error('보고서를 불러오지 못했습니다.');
      return await response.json();
    } finally { clearTimeout(timeout); }
  }
  readJSON.sequence = 0;
  async function select(entry, updateURL = true, force = false) {
    const request = ++selection;
    message.textContent = '보고서를 불러오는 중입니다.';
    try {
      const cached = cache.get(entry.id);
      const data = !force && cached && cached.updatedAt === entry.updatedAt ? cached : await readJSON(entry.path);
      if (disposed || request !== selection) return false;
      if (idOf(data) !== entry.id || !Array.isArray(data.rows) || !Array.isArray(data.summary))
        throw new Error('보고기간을 확인할 수 없습니다.');
      cache.set(entry.id, data);
      show(data);
      message.textContent = '';
      menu.open = false;
      if (updateURL) {
        const url = new URL(location.href);
        if (entry.id === currentId) url.searchParams.delete('period');
        else url.searchParams.set('period', entry.id);
        history.pushState(null, '', url);
        heading.focus();
      }
      return true;
    } catch {
      if (!disposed && request === selection) {
        message.textContent = '보고서를 불러오지 못했습니다. 연결이 복구되면 자동으로 다시 확인합니다.';
        badge.textContent = '갱신 확인 필요';
      }
      return false;
    }
  }
  async function refreshLatest() {
    if (disposed || refreshing || document.visibilityState === 'hidden') return;
    refreshing = true;
    const selectionAtStart = selection;
    try {
      const index = await readJSON('history.json');
      if (disposed) return;
      if (!Array.isArray(index.reports) || !index.reports.length || !index.reports.every(validEntry))
        throw new Error('목록이 없습니다.');
      const rendererURL=reportRendererURL(index.rendererHash,await localRuntimeHash,location.href);
      if(rendererURL){location.replace(rendererURL);return;}
      const unique = new Map(index.reports.map(entry => [entry.id, entry]));
      // The new HTML can arrive just before the archive workflow completes.
      if (!unique.has(idOf(latestReport))) unique.set(idOf(latestReport), {
        id: idOf(latestReport), start: latestReport.start, end: latestReport.end,
        updatedAt: latestReport.updatedAt, path: `archive/${idOf(latestReport)}.json`
      });
      entries = [...unique.values()].sort((a, b) => b.end.localeCompare(a.end) || b.start.localeCompare(a.start));
      currentId = entries[0].id;
      refreshList();
      // A manual period choice made during the request takes precedence.
      if (selection !== selectionAtStart) return;
      const requested = requestedPeriod();
      const target = entries.find(entry => entry.id === requested) || entries[0];
      const cached = cache.get(target.id);
      const changed = !verified || target.id !== selectedId || cached?.updatedAt !== target.updatedAt;
      // An embedded report not yet archived is already newer than the archive index.
      const awaitingArchive = target.id === idOf(latestReport) && !index.reports.some(entry => entry.id === target.id);
      if (changed && !awaitingArchive) {
        if (!await select(target, false, !verified)) return;
      }
      verified = true;
      updateBadge();
      message.textContent = requested && !entries.some(entry => entry.id === requested)
        ? '해당 보고기간이 없어 최신 보고서를 표시합니다.' : '';
    } catch {
      if (!disposed) {
        message.textContent = '최신 보고서 확인에 실패했습니다. 연결이 복구되면 자동으로 다시 확인합니다.';
        badge.textContent = '갱신 확인 필요';
      }
    } finally { refreshing = false; }
  }
  show(latestReport);
  if (location.protocol === 'file:') {
    verified = true;
    updateBadge();
    message.textContent = '이전 보고서는 게시된 사이트에서 확인할 수 있습니다.';
    return () => { disposed = true; cleanup?.(); };
  }
  const outside = event => { if (!menu.contains(event.target)) menu.open = false; };
  const escape = event => { if (event.key === 'Escape') { menu.open = false; heading.focus(); } };
  const popstate = () => {
    const entry = entries.find(entry => entry.id === (requestedPeriod() || currentId));
    if (entry) select(entry, false);
  };
  const visible = () => { if (document.visibilityState === 'visible') refreshLatest(); };
  document.addEventListener('click', outside);
  menu.addEventListener('keydown', escape);
  document.addEventListener('visibilitychange', visible);
  window.addEventListener('focus', refreshLatest);
  window.addEventListener('pageshow', refreshLatest);
  window.addEventListener('online', refreshLatest);
  window.addEventListener('popstate', popstate);
  const interval = setInterval(refreshLatest, 60000);
  refreshLatest();
  return () => {
    disposed = true;
    selection++;
    clearInterval(interval);
    document.removeEventListener('click', outside);
    menu.removeEventListener('keydown', escape);
    document.removeEventListener('visibilitychange', visible);
    window.removeEventListener('focus', refreshLatest);
    window.removeEventListener('pageshow', refreshLatest);
    window.removeEventListener('online', refreshLatest);
    window.removeEventListener('popstate', popstate);
    cleanup?.();
  };
}
