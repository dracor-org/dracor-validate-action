import { jest } from '@jest/globals';
import { join } from 'path';
import * as core from '../__fixtures__/core.js';

jest.unstable_mockModule('@actions/core', () => core);

const {
  defaultVersion,
  getParams,
  makeLink,
  makeUrl,
  resolveFiles,
  trimFilePath,
  truncateJingMessage,
} = await import('../src/utils.js');
const { DRACOR_VERSION, TEI_VERSION } = await import('../src/config.js');

describe('utils.ts', () => {
  describe('resolveFiles', () => {
    it('splits verbatim file paths', async () => {
      const paths = await resolveFiles('a.xml b.xml');
      expect(paths).toEqual(['a.xml', 'b.xml']);
    });

    it('handles empty input', async () => {
      const paths = await resolveFiles('');
      expect(paths).toEqual([]);
    });

    it('handles space-only input', async () => {
      const paths = await resolveFiles('  ');
      expect(paths).toEqual([]);
    });

    it('handles input with trailing spaces', async () => {
      const paths = await resolveFiles('a.xml ');
      expect(paths).toEqual(['a.xml']);
    });

    it('handles glob pattern', async () => {
      const paths = await resolveFiles('README.md tei/*.xml');
      expect(paths).toEqual(['README.md', 'tei/invalid.xml', 'tei/valid.xml']);
    });
  });

  describe('defaultVersion', () => {
    it('returns DRACOR_VERSION for dracor', () => {
      expect(defaultVersion('dracor')).toBe(DRACOR_VERSION);
    });

    it('returns TEI_VERSION for tei and anything else', () => {
      expect(defaultVersion('tei')).toBe(TEI_VERSION);
      expect(defaultVersion('unknown')).toBe(TEI_VERSION);
    });
  });

  describe('trimFilePath', () => {
    it('makes an absolute path under cwd relative', () => {
      const absolute = join(process.cwd(), 'src', 'utils.ts');
      expect(trimFilePath(absolute)).toBe(join('src', 'utils.ts'));
    });
  });

  describe('truncateJingMessage', () => {
    it('keeps messages without a semicolon separator intact', () => {
      expect(truncateJingMessage('attribute "foo" not allowed')).toBe(
        'attribute "foo" not allowed'
      );
    });

    it('drops everything after the first "; "', () => {
      expect(
        truncateJingMessage('element "x" not allowed; expected element "y"')
      ).toBe('element "x" not allowed');
    });
  });

  describe('getParams', () => {
    afterEach(() => {
      jest.resetAllMocks();
    });

    it('returns defaults when no inputs are provided', () => {
      core.getInput.mockImplementation(() => '');
      expect(getParams()).toEqual({
        schema: 'tei',
        version: TEI_VERSION,
        files: '',
        warnOnly: false,
      });
    });

    it('honours provided inputs', () => {
      core.getInput.mockImplementation((name: string) => {
        return (
          (
            {
              schema: 'dracor',
              version: '1.2.3',
              files: 'a.xml',
              'warn-only': 'true',
            } as Record<string, string>
          )[name] || ''
        );
      });
      expect(getParams()).toEqual({
        schema: 'dracor',
        version: '1.2.3',
        files: 'a.xml',
        warnOnly: true,
      });
    });

    it.each(['yes', 'YES', 'true', 'True'])(
      'treats warn-only=%s as true',
      (val) => {
        core.getInput.mockImplementation((name: string) =>
          name === 'warn-only' ? val : ''
        );
        expect(getParams().warnOnly).toBe(true);
      }
    );

    it.each(['no', '0', 'false', ''])('treats warn-only=%s as false', (val) => {
      core.getInput.mockImplementation((name: string) =>
        name === 'warn-only' ? val : ''
      );
      expect(getParams().warnOnly).toBe(false);
    });
  });

  describe('makeUrl / makeLink', () => {
    const original = {
      repo: process.env.GITHUB_REPOSITORY,
      sha: process.env.GITHUB_SHA,
    };

    afterEach(() => {
      if (original.repo === undefined) delete process.env.GITHUB_REPOSITORY;
      else process.env.GITHUB_REPOSITORY = original.repo;
      if (original.sha === undefined) delete process.env.GITHUB_SHA;
      else process.env.GITHUB_SHA = original.sha;
    });

    it('returns an empty URL and plain text when GITHUB_REPOSITORY is unset', () => {
      delete process.env.GITHUB_REPOSITORY;
      expect(makeUrl('a.xml', 5)).toBe('');
      expect(makeLink('a.xml', 5)).toBe('a.xml');
    });

    it('builds a github blob URL and anchor tag when env is set', () => {
      process.env.GITHUB_REPOSITORY = 'owner/repo';
      process.env.GITHUB_SHA = 'abc123';
      expect(makeUrl('a.xml', 5)).toBe(
        'https://github.com/owner/repo/blob/abc123/a.xml#L5'
      );
      expect(makeLink('a.xml', 5, 'label')).toBe(
        '<a href="https://github.com/owner/repo/blob/abc123/a.xml#L5">label</a>'
      );
    });
  });
});
