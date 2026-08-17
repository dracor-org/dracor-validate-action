import { describe, expect, it } from 'vitest';
import { formatTextSummary } from '../src/textSummary.js';

describe('formatTextSummary', () => {
  it('renders title, underlined heading, indented stats and no table when there are no issues', () => {
    const out = formatTextSummary(
      'TEI-All 4.12.0',
      ['Total files validated: 1', 'Files with issues: 0'],
      []
    );
    expect(out).toBe(
      [
        'TEI-All 4.12.0',
        '==============',
        '',
        '  Total files validated: 1',
        '  Files with issues: 0',
        '',
      ].join('\n')
    );
  });

  it('renders an aligned table when there are issues and strips HTML markup', () => {
    const out = formatTextSummary(
      'DraCor Schema 1.6.0',
      ['Total files validated: 1', 'Errors: 1'],
      [
        {
          file: 'valid.xml',
          lineNumber: 19,
          columnNumber: 7,
          type: 'warning',
          message:
            'Nesting <code>digital</code> and original source is &lt;deprecated&gt;.',
        },
        {
          file: 'valid.xml',
          lineNumber: 20,
          columnNumber: 9,
          type: 'error',
          message:
            '<small>The digital source should use a &lt;ref&gt;.</small>',
        },
      ]
    );

    const lines = out.split('\n');

    // Title + underline
    expect(lines[0]).toBe('DraCor Schema 1.6.0');
    expect(lines[1]).toBe('==='.repeat(19 / 3 + 1).slice(0, 19));

    // Header row present with the four expected columns.
    const header = lines.find((l) => l.startsWith('File'));
    expect(header).toMatch(/^File\s+Line:Col\s+Type\s+Message$/);

    // Both issue rows present, HTML stripped, entities decoded.
    expect(out).toContain(
      'Nesting digital and original source is <deprecated>.'
    );
    expect(out).toContain('The digital source should use a <ref>.');
    expect(out).not.toContain('<code>');
    expect(out).not.toContain('<small>');
    expect(out).not.toContain('&lt;');

    // Line:Col column is aligned to the widest value ("Line:Col" = 8 chars).
    // Both entries "19:7" and "20:9" are shorter, so they must be padded.
    const dataRows = lines.filter((l) => l.startsWith('valid.xml'));
    expect(dataRows).toHaveLength(2);
    for (const row of dataRows) {
      // File column is padded to the width of "valid.xml" (9) — no extra pad needed here.
      // Assert the separator between columns is exactly two spaces.
      expect(row).toMatch(/^valid\.xml {2}\d+:\d+\s+(warning|error)\s+.+$/);
    }
  });

  it('falls back to "error" when the issue type is empty', () => {
    const out = formatTextSummary(
      'DraCor Schema 1.6.0',
      ['Errors: 1'],
      [
        {
          file: 'a.xml',
          lineNumber: 1,
          columnNumber: 1,
          type: '',
          message: 'boom',
        },
      ]
    );
    expect(out).toMatch(/a\.xml\s+1:1\s+error\s+boom/);
  });
});
