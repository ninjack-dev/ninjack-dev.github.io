import type { Data, Literal, Parent, RootContent } from "mdast";

/**
 * The mdast-util-to-hast directive fields a node may carry on `data` to steer the
 * default MDAST→HAST conversion. `@types/mdast`'s base `Data` doesn't declare
 * these (they live in `mdast-util-to-hast`'s own augmentation, which isn't a
 * direct dependency here), so we model the subset we use locally.
 */
export interface HastDirectiveData extends Data {
  hName?: string;
  hProperties?: Record<string, unknown>;
  hChildren?: Array<{ type: "text"; value: string }>;
}

export interface ObsidianWikiLink extends Literal {
  type: "obsidianWikiLink";
  /** Raw target text (may include `.md` and a path prefix); resolved downstream. */
  target: string;
  alias?: string;
  heading?: string;
  blockId?: string;
  data?: HastDirectiveData;
}

export interface ObsidianEmbed extends Literal {
  type: "obsidianEmbed";
  src: string;
  width?: number;
  height?: number;
  data?: HastDirectiveData;
}

export interface ObsidianCallout extends Parent {
  type: "obsidianCallout";
  calloutType: string;
  title: string;
  foldable: boolean;
  defaultOpen: boolean;
  children: RootContent[];
  data?: HastDirectiveData;
}

declare module "mdast" {
  interface RootContentMap {
    obsidianCallout: ObsidianCallout;
  }
  interface PhrasingContentMap {
    obsidianWikiLink: ObsidianWikiLink;
    obsidianEmbed: ObsidianEmbed;
  }
}
