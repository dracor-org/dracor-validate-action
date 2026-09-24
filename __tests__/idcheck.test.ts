import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const { extractRootId, findRootIdCollisions } =
  await import('../src/idcheck.js');

let dir: string;

function write(name: string, contents: string): string {
  const file = join(dir, name);
  writeFileSync(file, contents);
  return file;
}

const teiNs = 'http://www.tei-c.org/ns/1.0';

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'idcheck-test-'));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('idcheck.ts', () => {
  describe('extractRootId', () => {
    it('returns the root xml:id for a plain TEI document', () => {
      const f = write(
        'plain.xml',
        `<?xml version="1.0"?>\n<TEI xmlns="${teiNs}" xml:id="root-1"><teiHeader/></TEI>\n`
      );
      expect(extractRootId(f)).toBe('root-1');
    });

    it('handles single-quoted xml:id', () => {
      const f = write('squote.xml', `<TEI xmlns='${teiNs}' xml:id='root-2'/>`);
      expect(extractRootId(f)).toBe('root-2');
    });

    it('handles xml:id not being the first attribute', () => {
      const f = write(
        'attr-order.xml',
        `<TEI xmlns="${teiNs}" xml:lang="en" xml:id="root-3"/>`
      );
      expect(extractRootId(f)).toBe('root-3');
    });

    it('skips XML declaration, DOCTYPE, comments and PIs before the root', () => {
      const f = write(
        'prologue.xml',
        [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<!DOCTYPE TEI SYSTEM "tei.dtd" [<!ENTITY foo "bar">]>',
          '<!-- a stray > inside a comment -->',
          '<?xml-stylesheet href="x.xsl" type="text/xsl"?>',
          `<TEI xmlns="${teiNs}" xml:id="root-4"/>`,
          '',
        ].join('\n')
      );
      expect(extractRootId(f)).toBe('root-4');
    });

    it('accepts a namespace prefix on the root as long as the local name is TEI', () => {
      const f = write(
        'prefixed.xml',
        `<t:TEI xmlns:t="${teiNs}" xml:id="root-5"/>`
      );
      expect(extractRootId(f)).toBe('root-5');
    });

    it('returns null when the root element is not TEI', () => {
      const f = write(
        'not-tei.xml',
        `<html xmlns="http://www.w3.org/1999/xhtml" xml:id="root-6"/>`
      );
      expect(extractRootId(f)).toBeNull();
    });

    it('returns null when TEI has no xml:id', () => {
      const f = write('no-id.xml', `<TEI xmlns="${teiNs}"/>`);
      expect(extractRootId(f)).toBeNull();
    });

    it('ignores xml:id on nested elements', () => {
      const f = write(
        'nested.xml',
        `<TEI xmlns="${teiNs}">\n  <teiHeader xml:id="nested"/>\n</TEI>`
      );
      expect(extractRootId(f)).toBeNull();
    });
  });

  describe('findRootIdCollisions', () => {
    it('returns an empty list when all ids are unique', async () => {
      const a = write('a.xml', `<TEI xmlns="${teiNs}" xml:id="unique-a"/>`);
      const b = write('b.xml', `<TEI xmlns="${teiNs}" xml:id="unique-b"/>`);
      const collisions = await findRootIdCollisions([a, b]);
      expect(collisions).toEqual([]);
    });

    it('reports one row for a two-way collision, listing the incumbent as other', async () => {
      const a = write('dup-a.xml', `<TEI xmlns="${teiNs}" xml:id="dup"/>`);
      const b = write('dup-b.xml', `<TEI xmlns="${teiNs}" xml:id="dup"/>`);
      const collisions = await findRootIdCollisions([b, a]);
      expect(collisions).toHaveLength(1);
      expect(collisions[0].id).toBe('dup');
      // Sorted ordering: dup-a.xml comes first (incumbent), dup-b.xml is dup.
      expect(collisions[0].file).toBe(b);
      expect(collisions[0].otherFiles).toEqual([a]);
    });

    it('reports N-1 rows for an N-way collision', async () => {
      const a = write('tri-a.xml', `<TEI xmlns="${teiNs}" xml:id="tri"/>`);
      const b = write('tri-b.xml', `<TEI xmlns="${teiNs}" xml:id="tri"/>`);
      const c = write('tri-c.xml', `<TEI xmlns="${teiNs}" xml:id="tri"/>`);
      const collisions = await findRootIdCollisions([c, b, a]);
      expect(collisions).toHaveLength(2);
      const files = collisions.map((c) => c.file).sort();
      expect(files).toEqual([b, c].sort());
      for (const row of collisions) {
        expect(row.otherFiles).toContain(a);
      }
    });

    it('skips files without a root xml:id', async () => {
      const a = write('has-id.xml', `<TEI xmlns="${teiNs}" xml:id="only"/>`);
      const b = write('no-id-2.xml', `<TEI xmlns="${teiNs}"/>`);
      const collisions = await findRootIdCollisions([a, b]);
      expect(collisions).toEqual([]);
    });

    it('is deterministic across runs regardless of input order', async () => {
      const a = write('det-a.xml', `<TEI xmlns="${teiNs}" xml:id="det"/>`);
      const b = write('det-b.xml', `<TEI xmlns="${teiNs}" xml:id="det"/>`);
      const first = await findRootIdCollisions([a, b]);
      const second = await findRootIdCollisions([b, a]);
      expect(first).toEqual(second);
    });
  });
});
