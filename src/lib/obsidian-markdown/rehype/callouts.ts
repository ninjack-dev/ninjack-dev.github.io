import type { Handle } from 'mdast-util-to-hast';
import type { Element } from 'hast';
import type { ObsidianCallout } from '../types.ts';

export const calloutHandler: Handle = (state, node) => {
  const n = node as unknown as ObsidianCallout;
  const titleEl: Element = {
    type: 'element',
    tagName: 'div',
    properties: { className: ['callout-title'] },
    children: [{ type: 'text', value: n.title }],
  };
  const bodyEl: Element = {
    type: 'element',
    tagName: 'div',
    properties: { className: ['callout-body'] },
    children: state.all(node),
  };
  return {
    type: 'element',
    tagName: 'div',
    properties: {
      className: ['callout'],
      dataCallout: n.calloutType,
      ...(n.foldable ? { dataFoldable: String(n.defaultOpen) } : {}),
    },
    children: [titleEl, bodyEl],
  };
};
