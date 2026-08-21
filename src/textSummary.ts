export interface TextSummaryIssue {
  file: string;
  lineNumber: number;
  columnNumber: number;
  type: string;
  message: string;
}

/**
 * Render the validation summary as plain text for local `docker run` /
 * `./validate` usage where `GITHUB_STEP_SUMMARY` isn't set and the HTML
 * summary would only be noise.
 */
export function formatTextSummary(
  title: string,
  stats: string[],
  issues: TextSummaryIssue[]
): string {
  const lines: string[] = [];
  lines.push(title);
  lines.push('='.repeat(title.length));
  lines.push('');

  for (const s of stats) {
    lines.push(`  ${s}`);
  }

  if (issues.length === 0) {
    return lines.join('\n') + '\n';
  }

  const errors = issues.filter(
    (i) => i.type === 'error' || i.type === 'fatal' || i.type === ''
  );
  const warnings = issues.filter((i) => i.type === 'warning');

  const toRow = (i: TextSummaryIssue) => [
    i.file,
    `${i.lineNumber}:${i.columnNumber}`,
    stripHtml(i.message),
  ];

  const renderTable = (heading: string, rows: string[][]) => {
    const header = ['File', 'Line:Col', 'Message'];
    const widths = [0, 1].map((c) =>
      Math.max(header[c].length, ...rows.map((r) => r[c].length))
    );
    const pad = (s: string, w: number) => s + ' '.repeat(w - s.length);
    const fmt = (row: string[]) =>
      [pad(row[0], widths[0]), pad(row[1], widths[1]), row[2]].join('  ');

    lines.push('');
    lines.push(heading);
    lines.push('-'.repeat(heading.length));
    lines.push(fmt(header));
    lines.push(fmt(widths.map((w) => '-'.repeat(w)).concat('-'.repeat(20))));
    for (const row of rows) {
      lines.push(fmt(row));
    }
  };

  if (errors.length) {
    renderTable('Errors', errors.map(toRow));
  }
  if (warnings.length) {
    renderTable('Warnings', warnings.map(toRow));
  }

  return lines.join('\n') + '\n';
}

/**
 * Strip the small subset of HTML markup that main.ts / parseSVRL leave in
 * the message strings (`<code>`, `<small>`, and HTML entities). Not a
 * general-purpose HTML sanitizer.
 */
function stripHtml(s: string): string {
  return s
    .replace(/<\/?(code|small|a[^>]*)>/g, '')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}
