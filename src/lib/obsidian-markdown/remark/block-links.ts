import type { Plugin } from 'unified';
import type { Root } from 'mdast';

export const blockLinks: Plugin<[], Root> = () => (_tree) => {
  // TODO: assign id attributes to block-annotated nodes (^block-id suffix)
  //       transform [[Page Title#^block-id]] links to anchored hrefs
};
