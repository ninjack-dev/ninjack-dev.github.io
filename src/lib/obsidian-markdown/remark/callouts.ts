import type { Plugin } from 'unified';
import type { Root } from 'mdast';

export const callouts: Plugin<[], Root> = () => (_tree) => {
  // TODO: detect blockquote nodes whose first child matches /^\[!(\w+)\]/
  //       replace with a custom ObsidianCallout node for the rehype handler
};
