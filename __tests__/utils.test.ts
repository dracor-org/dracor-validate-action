import { resolveFiles } from '../src/utils';

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
});
