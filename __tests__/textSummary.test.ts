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

  it('renders separate Errors and Warnings tables, strips HTML markup', () => {
    const out = formatTextSummary(
      'DraCor Schema 1.6.0',
      ['Total files validated: 1', 'Errors: 1', 'Warnings: 1'],
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

    // Both section headings emitted, Errors before Warnings.
    const errorHeadingIdx = lines.indexOf('Errors');
    const warningHeadingIdx = lines.indexOf('Warnings');
    expect(errorHeadingIdx).toBeGreaterThan(-1);
    expect(warningHeadingIdx).toBeGreaterThan(errorHeadingIdx);

    // Header row present, no Type column.
    const headerRows = lines.filter((l) =>
      /^File\s+Line:Col\s+Message$/.test(l)
    );
    expect(headerRows).toHaveLength(2);

    // Both issue rows present, HTML stripped, entities decoded.
    expect(out).toContain(
      'Nesting digital and original source is <deprecated>.'
    );
    expect(out).toContain('The digital source should use a <ref>.');
    expect(out).not.toContain('<code>');
    expect(out).not.toContain('<small>');
    expect(out).not.toContain('&lt;');

    // Data rows: three-column layout without a type cell.
    const dataRows = lines.filter((l) => l.startsWith('valid.xml'));
    expect(dataRows).toHaveLength(2);
    for (const row of dataRows) {
      expect(row).toMatch(/^valid\.xml {2}\d+:\d+\s+.+$/);
    }

    // Error row lands under the Errors heading, warning under Warnings.
    const errorRowIdx = lines.findIndex((l) =>
      l.includes('should use a <ref>')
    );
    const warningRowIdx = lines.findIndex((l) => l.includes('is <deprecated>'));
    expect(errorRowIdx).toBeGreaterThan(errorHeadingIdx);
    expect(errorRowIdx).toBeLessThan(warningHeadingIdx);
    expect(warningRowIdx).toBeGreaterThan(warningHeadingIdx);
  });

  it('treats an empty issue type as an error', () => {
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
    expect(out).toContain('Errors');
    expect(out).not.toContain('Warnings');
    expect(out).toMatch(/a\.xml\s+1:1\s+boom/);
  });
});
