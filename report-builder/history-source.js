import {historyForPeriod} from './print-report.js?v=20261002-8';

const keys = ['cash', 'foreign', 'stocks', 'assets'];
const dated = point => point && /^\d{4}-\d{2}-\d{2}$/.test(point.date);
const validPoint = point => dated(point) && keys.every(key => Number.isFinite(point[key])) &&
  Math.abs(point.cash + point.foreign + point.stocks - point.assets) <= 1;

// Published reports are durable history; browser storage is never required.
export async function loadPublishedReports(end, read = async url => {
  const response = await fetch(url, {cache: 'no-store'});
  if (!response.ok) throw new Error('게시된 그래프 기록을 불러오지 못했습니다. 잠시 후 다시 생성하세요.');
  return response.json();
}) {
  const base = location.hostname === 'mobiis0.github.io'
    ? new URL('https://raw.githubusercontent.com/mobiis0/work-cash-report/main/reports/')
    : new URL('../reports/', import.meta.url);
  const index = await read(new URL('history.json', base));
  if (!Array.isArray(index.reports)) throw new Error('게시된 보고서 목록을 확인할 수 없습니다.');
  const cutoff = historyForPeriod([{date: end}], end, 3); // Validate the report end.
  if (!cutoff.length) throw new Error('보고기간을 확인하세요.');
  const start = new Date(end + 'T00:00:00Z');
  start.setUTCFullYear(start.getUTCFullYear() - 3);
  const entries = index.reports.filter(entry => entry && entry.end <= end &&
    entry.end >= start.toISOString().slice(0, 10));
  for (const entry of entries) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.start) || !/^\d{4}-\d{2}-\d{2}$/.test(entry.end) ||
      entry.id !== `${entry.start}_${entry.end}` || entry.path !== `archive/${entry.id}.json`)
      throw new Error('게시된 보고서 목록의 형식을 확인하세요.');
  }
  // Bound simultaneous downloads as the archive grows.
  const reports = [];
  for (let offset = 0; offset < entries.length; offset += 6) {
    reports.push(...await Promise.all(entries.slice(offset, offset + 6).map(async entry => {
      const report = await read(new URL(entry.path, base));
      if (report.start !== entry.start || report.end !== entry.end ||
          !Array.isArray(report.history) || !Array.isArray(report.summary))
        throw new Error('게시된 그래프 기록의 보고기간을 확인하세요.');
      return report;
    })));
  }
  return reports;
}

export function mergePublishedHistory(report, published) {
  const series = new Map((report.history || []).filter(validPoint).map(point => [point.date, point]));
  // Undated original total columns retain their source identity and order.
  const totals = new Map();
  const addTotal = point => {
    if (!dated(point) || !Number.isFinite(point.assets)) return;
    totals.set(point.exactDate === false ? `source:${point.source || point.date + ':' + point.label}` : point.date, point);
  };
  (report.totalHistory || []).forEach(addTotal);
  const ordered = [...published].filter(previous => previous.end <= report.end)
    .sort((a, b) => a.end.localeCompare(b.end) || String(a.updatedAt).localeCompare(String(b.updatedAt)));
  for (const previous of ordered) {
    for (const point of previous.history || []) if (validPoint(point)) series.set(point.date, point);
    for (const point of previous.totalHistory || []) addTotal(point);
  }
  // Authoritative weekly summaries override stale graph cells and inherited points.
  for (const previous of ordered) {
    const point = {date: previous.end, ...Object.fromEntries(previous.summary.map(sum => [sum.key, sum.current])),
      source: `게시된 보고서 ${previous.start} ~ ${previous.end}`};
    if (!validPoint(point)) throw new Error('게시된 보고서의 자금 총계를 확인하세요.');
    series.set(point.date, point);
    addTotal({...point, label: point.date, exactDate: true});
  }
  const previousDate = new Date(Date.parse(report.start + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
  if (!series.has(previousDate)) {
    const opening = {date: previousDate, ...Object.fromEntries(report.summary.map(sum => [sum.key, sum.previous])), source: `${report.sheet}!E45:E48`};
    if (validPoint(opening)) series.set(previousDate, opening);
  }
  const current = {date: report.end, ...Object.fromEntries(report.summary.map(sum => [sum.key, sum.current])), source: `${report.sheet}!F45:F48`};
  if (!validPoint(current)) throw new Error('금주 자금 총계를 확인하세요.');
  series.set(current.date, current);
  addTotal({...current, label: current.date, exactDate: true});
  report.history = historyForPeriod([...series.values()], report.end, 3);
  // Fill exact totals from the detailed series when no separate totals exist.
  for (const point of report.history) if (!totals.has(point.date)) addTotal({...point, exactDate: true, label: point.date});
  report.totalHistory = historyForPeriod([...totals.values()], report.end, 3);
  report.historySource = {publishedPeriods: ordered.length, latestPublishedEnd: ordered.at(-1)?.end || null};
  if (ordered.length) report.warnings = report.warnings.filter(message => !message.startsWith('그래프 시트가 없어'));
  return report;
}
