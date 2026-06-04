import type { Plugin } from 'unified';
import type { Root, Paragraph, PhrasingContent, Text } from 'mdast';
import { visit } from 'unist-util-visit';
import type { ObsidianWikiLink } from '../types.ts';
import { generateId } from '../../generate-id.ts';

// Matches [[target]], [[target#fragment]], [[target|alias]] — but NOT ![[...]]
const WIKI_LINK = /(?<!\!)\[\[([^\]|#\n]+?)(?:#([^\]|\n]+))?(?:\|([^\]\n]+))?\]\]/g;

function slugifyFragment(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
}

function resolveTarget(rawTarget: string, index?: Map<string, string>): string {
  const clean = rawTarget.replace(/\.md$/, '').trim();
  if (clean.includes('/')) {
    // Full path provided — slugify each segment directly
    return generateId(clean);
  }
  // Short name — look up in the filename→ID index built at config time
  return index?.get(clean.toLowerCase()) ?? generateId(clean);
}

function splitOnWikiLinks(children: PhrasingContent[], index?: Map<string, string>): PhrasingContent[] {
  const result: PhrasingContent[] = [];
  for (const child of children) {
    if (child.type !== 'text') {
      result.push(child);
      continue;
    }
    const { value } = child as Text;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    WIKI_LINK.lastIndex = 0;
    while ((match = WIKI_LINK.exec(value)) !== null) {
      if (match.index > lastIndex) {
        result.push({ type: 'text', value: value.slice(lastIndex, match.index) });
      }
      const [, rawTarget, fragment, alias] = match;
      const cleanTarget = rawTarget.replace(/\.md$/, '').trim();
      const resolved = resolveTarget(rawTarget, index);
      let href = '/writings/' + resolved;
      let heading: string | undefined;
      let blockId: string | undefined;
      if (fragment) {
        if (fragment.startsWith('^')) {
          blockId = fragment.slice(1);
          href += '#' + blockId;
        } else {
          heading = fragment;
          href += '#' + slugifyFragment(fragment);
        }
      }
      const label = alias?.trim() ?? cleanTarget.split('/').at(-1)!;
      const node: ObsidianWikiLink = {
        type: 'obsidianWikiLink',
        value: label,
        target: cleanTarget,
        ...(alias !== undefined ? { alias } : {}),
        ...(heading !== undefined ? { heading } : {}),
        ...(blockId !== undefined ? { blockId } : {}),
        data: {
          hName: 'a',
          hProperties: { href, className: ['wiki-link'] },
          hChildren: [{ type: 'text', value: label }],
        },
      };
      result.push(node);
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < value.length) {
      result.push({ type: 'text', value: value.slice(lastIndex) });
    } else if (lastIndex === 0) {
      result.push(child);
    }
  }
  return result;
}

export function transformWikiLinks(tree: Root, index?: Map<string, string>): void {
  visit(tree, 'paragraph', (node: Paragraph) => {
    node.children = splitOnWikiLinks(node.children, index) as Paragraph['children'];
  });
}

export const wikiLinks: Plugin<[], Root> = () => transformWikiLinks;
