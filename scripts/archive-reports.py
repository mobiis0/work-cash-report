#!/usr/bin/env python3
"""Keep the last published data for every reporting period, including Git history."""
import datetime
import json
import re
import subprocess
from pathlib import Path

SOURCE = 'reports/latest/index.html'


def extract_report(html):
    match = re.search(r'\bconst\s+reportData\s*=\s*(?=\{)', html)
    if not match:
        return None
    try:
        data, _ = json.JSONDecoder().raw_decode(html[match.end():])
        for key in ('start', 'end'):
            datetime.date.fromisoformat(data[key])
            if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', data[key]):
                return None
        if data['start'] > data['end']:
            return None
        for key in ('rows', 'summary', 'subtotal', 'stocks'):
            if not isinstance(data[key], list):
                return None
        return data
    except (ValueError, KeyError, TypeError):
        return None


def archive(root):
    root = Path(root)
    archive_dir = root / 'reports/archive'
    current = extract_report((root / SOURCE).read_text(encoding='utf-8'))
    if current is None:
        raise ValueError('Latest report does not contain valid report data; archive left unchanged.')
    reports = {}
    # Preserve already archived periods even if old repository history is pruned.
    for path in sorted(archive_dir.glob('*.json')):
        data = json.loads(path.read_text(encoding='utf-8'))
        reports[(data['start'], data['end'])] = data
    revisions = subprocess.check_output(
        ['git', 'log', '--format=%H', '--', SOURCE], cwd=root, text=True
    ).splitlines()
    from_history = {}
    for revision in revisions:
        result = subprocess.run(['git', 'show', f'{revision}:{SOURCE}'], cwd=root,
                                text=True, capture_output=True)
        if result.returncode:
            continue
        data = extract_report(result.stdout)
        if data is not None:
            from_history.setdefault((data['start'], data['end']), data)
    reports.update(from_history)
    reports[(current['start'], current['end'])] = current
    archive_dir.mkdir(parents=True, exist_ok=True)
    entries = []
    for (start, end), data in sorted(reports.items(), key=lambda item: (item[0][1], item[0][0]), reverse=True):
        report_id = f'{start}_{end}'
        (archive_dir / f'{report_id}.json').write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
        )
        entries.append({'id': report_id, 'start': start, 'end': end,
                        'path': f'archive/{report_id}.json', 'updatedAt': data.get('updatedAt', '')})
    index = {'version': 1, 'reports': entries}
    (root / 'reports/history.json').write_text(
        json.dumps(index, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
    )
    print(f'Archived {len(entries)} reporting period(s).')


if __name__ == '__main__':
    archive(Path.cwd())
