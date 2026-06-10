import type { Root, Paragraph, Image, PhrasingContent, Text } from "mdast";
import { visit } from "unist-util-visit";

const EMBED = /!\[\[([^\]|\n]+?)(?:\|(\d+)(?:x(\d+))?)?\]\]/g;
const IMAGE_EXT = /\.(png|jpe?g|gif|svg|webp|avif)$/i;

function splitOnEmbeds(children: PhrasingContent[]): PhrasingContent[] {
  const result: PhrasingContent[] = [];
  for (const child of children) {
    if (child.type !== "text") {
      result.push(child);
      continue;
    }
    const { value } = child as Text;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    EMBED.lastIndex = 0;
    while ((match = EMBED.exec(value)) !== null) {
      if (match.index > lastIndex) {
        result.push({ type: "text", value: value.slice(lastIndex, match.index) });
      }
      const [, src, widthStr, heightStr] = match;
      if (!IMAGE_EXT.test(src)) {
        result.push({ type: "text", value: `[embed: ${src}]` });
      } else {
        const width = widthStr ? parseInt(widthStr, 10) : undefined;
        const height = heightStr ? parseInt(heightStr, 10) : undefined;
        // Stamp a `wiki-embed` class (plus optional W×H) via `hProperties` so the
        // embed `<img>` is distinguishable from a plain Markdown image in HAST,
        // and so Astro's image collection still sees a relative `image` node.
        const hProperties: Record<string, unknown> = { className: ["wiki-embed"] };
        if (width !== undefined) hProperties.width = width;
        if (height !== undefined) hProperties.height = height;
        const img: Image = {
          type: "image",
          url: `./attachments/${src}`,
          alt: src,
          data: { hProperties },
        };
        result.push(img);
      }
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < value.length) {
      result.push({ type: "text", value: value.slice(lastIndex) });
    } else if (lastIndex === 0) {
      result.push(child);
    }
  }
  return result;
}

export function transformWikiEmbeds(tree: Root): void {
  visit(tree, "paragraph", (node: Paragraph) => {
    node.children = splitOnEmbeds(node.children) as Paragraph["children"];
  });
}
