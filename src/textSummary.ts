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

  const header = ['File', 'Line:Col', 'Type', 'Message'];
  const rows = issues.map((i) => [
    i.file,
    `${i.lineNumber}:${i.columnNumber}`,
    i.type || 'error',
    stripHtml(i.message),
  ]);

  const widths = [0, 1, 2].map((c) =>
    Math.max(header[c].length, ...rows.map((r) => r[c].length))
  );

  const pad = (s: string, w: number) => s + ' '.repeat(w - s.length);
  const fmt = (row: string[]) =>
    [
      pad(row[0], widths[0]),
      pad(row[1], widths[1]),
      pad(row[2], widths[2]),
      row[3],
    ].join('  ');

  lines.push('');
  lines.push(fmt(header));
  lines.push(fmt(widths.map((w) => '-'.repeat(w)).concat('-'.repeat(20))));
  for (const row of rows) {
    lines.push(fmt(row));
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
