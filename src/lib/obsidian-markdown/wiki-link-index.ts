import { join } from '@std/path';
import { generateId } from '../generate-id.ts';

async function walk(dir: string, base: string, index: Map<string, string>): Promise<void> {
  let entries;
  try {
    entries = Deno.readDir(dir);
  } catch {
    return;
  }
  for await (const entry of entries) {
    if (entry.name === 'attachments') continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory) {
      await walk(fullPath, base, index);
    } else if (entry.isFile && entry.name.endsWith('.md') && entry.name !== 'About.md') {
      const rel = fullPath.slice(base.length + 1).replace(/\\/g, '/');
      const key = entry.name.replace(/\.md$/, '').toLowerCase();
      if (!index.has(key)) {
        index.set(key, generateId(rel));
      }
    }
  }
}

export async function buildWikiLinkIndex(writingsDir: string): Promise<Map<string, string>> {
  const index = new Map<string, string>();
  await walk(writingsDir, writingsDir, index);
  return index;
}
