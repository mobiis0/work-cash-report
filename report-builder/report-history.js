export function mountReportHistory(root, latestReport, render) {
  const idOf = data => `${data.start}_${data.end}`;
  const period = data => `${data.start.replaceAll('-', '.')} ~ ${data.end.replaceAll('-', '.')}`;
  let currentId = idOf(latestReport);
  const cache = new Map([[currentId, latestReport]]);
  let entries = [], cleanup, selectedId = currentId, selection = 0;
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
  // Workflow commits do not trigger another Pages build. Read the small archive
  // index from the repository so a new publication is listed immediately.
  const remoteBase = new URL('https://raw.githubusercontent.com/mobiis0/work-cash-report/main/reports/');
  const base = location.hostname === 'mobiis0.github.io' ? remoteBase : localBase;
  const requested = new URL(location.href).searchParams.get('period');

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
    badge.textContent = selectedId === currentId ? '최신' : '이전 보고서';
    document.title = `모비스 주간자금현황 ${data.end}`;
    const oldPeriod = root.querySelector('.report-heading > div > p');
    if (oldPeriod) oldPeriod.replaceWith(menu);
    else root.querySelector('.report-heading > div')?.append(menu);
    refreshList();
  }
  async function readJSON(path) {
    const response = await fetch(new URL(path, base), {cache: 'no-store'});
    if (!response.ok) throw new Error('보고서를 불러오지 못했습니다.');
    return response.json();
  }
  function validEntry(entry) {
    return entry && /^\d{4}-\d{2}-\d{2}$/.test(entry.start) &&
      /^\d{4}-\d{2}-\d{2}$/.test(entry.end) && entry.id === idOf(entry) &&
      entry.path === `archive/${entry.id}.json`;
  }
  async function select(entry, updateURL = true) {
    const request = ++selection;
    message.textContent = '보고서를 불러오는 중입니다.';
    try {
      const data = cache.get(entry.id) || await readJSON(entry.path);
      if (request !== selection) return;
      if (idOf(data) !== entry.id || !Array.isArray(data.rows) || !Array.isArray(data.summary)) throw new Error('보고기간을 확인할 수 없습니다.');
      cache.set(entry.id, data);
      show(data);
      message.textContent = '';
      menu.open = false;
      if (updateURL) {
        const url = new URL(location.href);
        if (entry.id === currentId) url.searchParams.delete('period');
        else url.searchParams.set('period', entry.id);
        history.pushState(null, '', url);
      }
      heading.focus();
    } catch {
      if (request === selection) message.textContent = '이전 보고서를 불러오지 못했습니다. 다시 선택해 주세요.';
    }
  }
  entries = [{id: currentId, start: latestReport.start, end: latestReport.end}];
  show(latestReport);
  message.textContent = '이전 보고서 목록을 불러오는 중입니다.';
  if (location.protocol === 'file:') {
    message.textContent = '이전 보고서는 게시된 사이트에서 확인할 수 있습니다.';
    return cleanup;
  }
  readJSON('history.json').then(index => {
    if (!Array.isArray(index.reports)) throw new Error('목록이 없습니다.');
    const unique = new Map(entries.map(entry => [entry.id, entry]));
    for (const entry of index.reports) if (validEntry(entry) && !unique.has(entry.id)) unique.set(entry.id, entry);
    entries = [...unique.values()].sort((a, b) => b.end.localeCompare(a.end) || b.start.localeCompare(a.start));
    currentId = entries[0].id;
    badge.textContent = selectedId === currentId ? '최신' : '이전 보고서';
    refreshList();
    message.textContent = entries.length === 1 ? '이전 보고서는 다음 보고서 게시 후 여기에 쌓입니다.' : '';
    const target = entries.find(entry => entry.id === requested) || entries[0];
    if (selection === 0 && target.id !== selectedId) select(target, false);
    else if (requested && !entries.some(entry => entry.id === requested)) message.textContent = '해당 보고기간이 없어 최신 보고서를 표시합니다.';
  }).catch(() => {
    message.textContent = '이전 보고서 목록을 불러오지 못했습니다. 최신 보고서는 그대로 확인할 수 있습니다.';
  });
  document.addEventListener('click', event => {if (!menu.contains(event.target)) menu.open = false;});
  menu.addEventListener('keydown', event => {if (event.key === 'Escape') {menu.open = false; heading.focus();}});
  window.addEventListener('popstate', () => {
    const id = new URL(location.href).searchParams.get('period') || currentId;
    const entry = entries.find(entry => entry.id === id);
    if (entry) select(entry, false);
  });
  return () => cleanup?.();
}

