import { closeSync, openSync, readSync } from 'fs';

export interface IdCollision {
  id: string;
  file: string;
  otherFiles: string[];
}

const CHUNK = 8 * 1024;
const MAX_HEAD = 256 * 1024;

type RootScan = { tag: string; localName: string } | 'incomplete' | null;

function findRootOpenTag(buffer: string): RootScan {
  let i = 0;
  if (buffer.charCodeAt(0) === 0xfeff) i++;
  while (i < buffer.length) {
    while (i < buffer.length && /\s/.test(buffer[i])) i++;
    if (i >= buffer.length) return 'incomplete';
    if (buffer[i] !== '<') return null;
    if (buffer.startsWith('<?', i)) {
      const end = buffer.indexOf('?>', i + 2);
      if (end === -1) return 'incomplete';
      i = end + 2;
    } else if (buffer.startsWith('<!--', i)) {
      const end = buffer.indexOf('-->', i + 4);
      if (end === -1) return 'incomplete';
      i = end + 3;
    } else if (buffer.startsWith('<!', i)) {
      // DOCTYPE may contain an internal subset [ ... ] with '>' inside.
      let depth = 0;
      let j = i + 2;
      while (j < buffer.length) {
        const c = buffer[j];
        if (c === '[') depth++;
        else if (c === ']') depth--;
        else if (c === '>' && depth === 0) break;
        j++;
      }
      if (j >= buffer.length) return 'incomplete';
      i = j + 1;
    } else {
      let j = i + 1;
      let inQuote: string | null = null;
      while (j < buffer.length) {
        const c = buffer[j];
        if (inQuote) {
          if (c === inQuote) inQuote = null;
        } else if (c === '"' || c === "'") {
          inQuote = c;
        } else if (c === '>') {
          break;
        }
        j++;
      }
      if (j >= buffer.length) return 'incomplete';
      const tag = buffer.substring(i, j + 1);
      const nameMatch = tag.match(/^<([A-Za-z_][\w.\-:]*)/);
      if (!nameMatch) return null;
      const qname = nameMatch[1];
      const localName = qname.includes(':') ? qname.split(':')[1] : qname;
      return { tag, localName };
    }
  }
  return 'incomplete';
}

function extractXmlIdAttr(tag: string): string | null {
  const m = tag.match(/\sxml:id\s*=\s*(?:"([^"]*)"|'([^']*)')/);
  if (!m) return null;
  return m[1] ?? m[2];
}

/**
 * Read only enough of `file` to locate its root element and, if that element
 * is `TEI`, return its `xml:id`. Returns `null` when the root is missing,
 * is not `TEI`, or has no `xml:id`. Intentionally avoids a full DOM parse
 * so it stays cheap on large corpora.
 */
export function extractRootId(file: string): string | null {
  const fd = openSync(file, 'r');
  try {
    let buffer = '';
    let offset = 0;
    const chunk = Buffer.alloc(CHUNK);
    while (buffer.length < MAX_HEAD) {
      const bytes = readSync(fd, chunk, 0, CHUNK, offset);
      if (bytes === 0) {
        return null;
      }
      buffer += chunk.subarray(0, bytes).toString('utf8');
      offset += bytes;
      const result = findRootOpenTag(buffer);
      if (result === 'incomplete') continue;
      if (result === null) return null;
      if (result.localName !== 'TEI') return null;
      return extractXmlIdAttr(result.tag);
    }
    return null;
  } finally {
    closeSync(fd);
  }
}

/**
 * Find files that share the same root TEI @xml:id.
 *
 * For an id appearing in N files, the first (sorted) occurrence is treated
 * as the incumbent and N-1 collision rows are returned — one per duplicate.
 * Each row lists the other files carrying the same id.
 */
export async function findRootIdCollisions(
  files: string[]
): Promise<IdCollision[]> {
  const buckets = new Map<string, string[]>();
  const sorted = [...files].sort();
  for (const file of sorted) {
    const id = extractRootId(file);
    if (!id) continue;
    const list = buckets.get(id) ?? [];
    list.push(file);
    buckets.set(id, list);
  }
  const collisions: IdCollision[] = [];
  for (const [id, list] of buckets) {
    if (list.length < 2) continue;
    for (let i = 1; i < list.length; i++) {
      const dup = list[i];
      const others = list.filter((_, j) => j !== i);
      collisions.push({ id, file: dup, otherFiles: others });
    }
  }
  return collisions;
}
