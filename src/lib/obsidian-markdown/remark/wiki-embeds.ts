import type { Plugin } from 'unified';
import type { Root } from 'mdast';

export const wikiEmbeds: Plugin<[], Root> = () => (_tree) => {
  // TODO: transform ![[image.jpg]] into MDAST image nodes (./attachments/image.jpg)
  //       transform ![[Page Title]] into inline content transcluded from another entry
};
