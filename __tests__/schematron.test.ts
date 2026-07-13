import { jest } from '@jest/globals';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import * as exec from '../__fixtures__/exec.js';

jest.unstable_mockModule('@actions/exec', () => exec);

const { validate, runSchxslt, parseSVRL } =
  await import('../src/schematron.js');

const svrlTemplate = readFileSync('__fixtures__/svrl/report.xml', 'utf8');
const samplePath = resolve('__fixtures__/svrl/sample.xml');

function writeSvrlFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'svrl-test-'));
  const file = join(dir, 'report.xml');
  writeFileSync(file, svrlTemplate.replaceAll('{{DOCUMENT_PATH}}', samplePath));
  return file;
}

describe('schematron.ts', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('parseSVRL', () => {
    it('extracts asserts with location, role and pattern info', () => {
      const results = parseSVRL(writeSvrlFixture());

      expect(results).toHaveLength(2);

      const [first, second] = results;
      expect(first.role).toBe('warning');
      expect(first.patternName).toBe('dracor-checks');
      expect(first.context).toBe('tei:teiHeader');
      expect(first.location).toBe('/tei:TEI/tei:teiHeader');
      expect(first.document).toBe(samplePath);
      expect(first.fileName).toBe('sample.xml');
      expect(typeof first.lineNumber).toBe('number');
      expect(typeof first.columnNumber).toBe('number');

      expect(second.role).toBe('');
      expect(second.location).toBe(
        '/tei:TEI/tei:teiHeader/tei:fileDesc/tei:titleStmt/tei:title'
      );
    });

    it('escapes < and wraps @attributes in code tags', () => {
      const [first] = parseSVRL(writeSvrlFixture());
      expect(first.text).toContain('&lt;teiHeader');
      expect(first.text).not.toContain('<teiHeader');
      expect(first.text).toContain('<code>@xml:id</code>');
    });

    it('caches parsed TEI documents across asserts', () => {
      const results = parseSVRL(writeSvrlFixture());
      expect(results).toHaveLength(2);
      expect(results[0].document).toBe(results[1].document);
    });
  });

  describe('runSchxslt', () => {
    it('invokes java with expected arguments and returns a report path', async () => {
      exec.exec.mockImplementation(async () => 0);
      const reportFile = await runSchxslt('in.xml', 'schema.sch', 'my-jar.jar');

      expect(exec.exec).toHaveBeenCalledTimes(1);
      const [cmd, args] = exec.exec.mock.calls[0];
      expect(cmd).toBe('java');
      expect(args).toEqual([
        '-jar',
        'my-jar.jar',
        '-d',
        'in.xml',
        '-s',
        'schema.sch',
        '-o',
        reportFile,
      ]);
      expect(reportFile).toMatch(/svrl\.xml$/);
    });

    it('swallows exec failures and still resolves with a report path', async () => {
      exec.exec.mockImplementation(async () => {
        throw new Error('boom');
      });
      const reportFile = await runSchxslt('in.xml', 'schema.sch');
      expect(reportFile).toMatch(/svrl\.xml$/);
    });
  });

  describe('validate', () => {
    it('runs schxslt and returns parsed asserts', async () => {
      exec.exec.mockImplementation(async (_cmd, args) => {
        const outIdx = (args as string[]).indexOf('-o');
        const outFile = (args as string[])[outIdx + 1];
        writeFileSync(
          outFile,
          svrlTemplate.replaceAll('{{DOCUMENT_PATH}}', samplePath)
        );
        return 0;
      });

      const results = await validate('in.xml', 'schema.sch', 'jar.jar');
      expect(results).toHaveLength(2);
      expect(results[0].fileName).toBe('sample.xml');
    });
  });
});
