import type { Plugin } from 'unified';
import type { Root } from 'mdast';

export const wikiLinks: Plugin<[], Root> = () => (_tree) => {
  // TODO: transform [[Page Title]] and [[Page Title|Alias]] nodes
};
