import { z } from "astro/zod";
import Builder from "fast-xml-builder";
import { atomSchema } from "./schema.js";
import { createCanonicalURL, isValidURL } from "./util.js";

export { atomSchema };

export type AtomOptions = {
	/** Title of the Atom feed. */
	title: z.infer<typeof atomOptionsValidator>["title"];
	/** Subtitle / description of the feed. */
	description?: z.infer<typeof atomOptionsValidator>["description"];
	/**
	 * Specify the base URL to use for Atom feed links.
	 * We recommend using the [endpoint context object](https://docs.astro.build/en/reference/api-reference/#site),
	 * which includes the `site` configured in your project's `astro.config.*`
	 */
	site: z.infer<typeof atomOptionsValidator>["site"] | URL;
	/** List of Atom feed entries to render. */
	items: AtomFeedItem[];
	/** URL used for the feed's `<link rel="self">`. */
	linkRoot?: z.infer<typeof atomOptionsValidator>["linkRoot"];
	/** Permanent unique ID for the feed. Defaults to the canonical site URL. */
	id?: z.infer<typeof atomOptionsValidator>["id"];
	/** Last-modified date for the feed. Defaults to the most recent entry's date. */
	updatedDate?: z.infer<typeof atomOptionsValidator>["updatedDate"];
	/** Default author applied to every entry that doesn't supply its own. */
	author?: z.infer<typeof atomOptionsValidator>["author"];
	/** URL of an icon for the feed. */
	icon?: z.infer<typeof atomOptionsValidator>["icon"];
	/** URL of a logo for the feed. */
	logo?: z.infer<typeof atomOptionsValidator>["logo"];
	/** Software agent used to generate the feed (RFC 4287 §4.2.4). */
	generator?: z.infer<typeof atomOptionsValidator>["generator"];
	/** Whether to include trailing slashes on canonical URLs. */
	trailingSlash?: z.infer<typeof atomOptionsValidator>["trailingSlash"];
};

export type AtomFeedItem = {
	/** Title of the entry. */
	title?: z.infer<typeof atomSchema>["title"];
	/** Brief summary or description of the entry. */
	description?: z.infer<typeof atomSchema>["description"];
	/** Publication date of the entry. */
	pubDate?: z.infer<typeof atomSchema>["pubDate"];
	/** Last-modified date of the entry. Falls back to `pubDate`. */
	updatedDate?: z.infer<typeof atomSchema>["updatedDate"];
	/** Full content of the entry. Should be valid HTML. */
	content?: z.infer<typeof atomSchema>["content"];
	/** Permalink for the entry (absolute URL or relative path). */
	link?: z.infer<typeof atomSchema>["link"];
	/** Permanent unique ID for the entry (required per RFC 4287 §4.2.6). */
	id: z.infer<typeof atomSchema>["id"];
	/** Author of this entry (overrides the feed-level author). */
	author?: z.infer<typeof atomSchema>["author"];
	/** Categories or tags related to this entry. */
	categories?: z.infer<typeof atomSchema>["categories"];
};

type ValidatedAtomOptions = z.infer<typeof atomOptionsValidator>;

const atomOptionsValidator = z.object({
	title: z.string(),
	description: z.string().optional(),
	site: z.preprocess(
		(url) => (url instanceof URL ? url.href : url),
		z.url(),
	),
	items: z.array(atomSchema),
	linkRoot: z.string().optional(),
	id: z.string().optional(),
	updatedDate: z
		.union([z.string(), z.number(), z.date()])
		.transform((value) => new Date(value))
		.refine((value) => !isNaN(value.getTime()))
		.optional(),
	author: z
		.union([
			z.string(),
			z.object({
				name: z.string().optional(),
				email: z.string().optional(),
				uri: z.string().optional(),
			}),
		])
		.optional(),
	icon: z.string().optional(),
	logo: z.string().optional(),
	// TODO: When published as a package, default generator to the package ID.
	generator: z
		.union([
			z.string(),
			z.object({
				name: z.string(),
				uri: z.string().optional(),
				version: z.string().optional(),
			}),
		])
		.optional(),
	trailingSlash: z.boolean().default(true),
});

/** Create an HTTP Response with the Atom feed as the body. */
export default async function getAtomResponse(
	atomOptions: AtomOptions,
): Promise<Response> {
	const atomString = await getAtomString(atomOptions);
	return new Response(atomString, {
		headers: {
			"Content-Type": "application/atom+xml; charset=utf-8",
		},
	});
}

/** Build an Atom 1.0 feed string from options. */
export async function getAtomString(
	atomOptions: AtomOptions,
): Promise<string> {
	const validatedOptions = await validateAtomOptions(atomOptions);
	checkAuthorPresence(validatedOptions);
	return generateAtom(validatedOptions);
}

async function validateAtomOptions(
	atomOptions: AtomOptions,
): Promise<ValidatedAtomOptions> {
	const parsedResult =
		await atomOptionsValidator.safeParseAsync(atomOptions);
	if (parsedResult.success) {
		return parsedResult.data;
	}

	const formattedError = new Error(
		[
			`[Atom] Invalid or missing options:`,
			...parsedResult.error.issues.map((zodError) => {
				const path = zodError.path.join(".");
				const message = `${zodError.message} (${path})`;
				const code = zodError.code;

				if (code === "invalid_type" && path === "items") {
					return [
						message,
						`The \`items\` option must be an array of Atom feed entries.`,
					].join("\n");
				}

				if (code === "custom" && path.startsWith("items.")) {
					return [
						message,
						`Each entry requires at least a \`title\`, \`description\`, or \`content\` field.`,
					].join("\n");
				}

				if (path === "site" && code === "invalid_format") {
					return [
						message,
						`The \`site\` option must be a valid URL. Did you pass the endpoint's \`context.site\`?`,
					].join("\n");
				}

				return message;
			}),
		].join("\n"),
	);
	throw formattedError;
}

function formatAuthor(
	author: NonNullable<ValidatedAtomOptions["author"]>,
): Record<string, string> {
	if (typeof author === "string") {
		return { name: author };
	}

	const result: Record<string, string> = {};
	if (author.name) result.name = author.name;
	if (author.email) result.email = author.email;
	if (author.uri) result.uri = author.uri;
	return result;
}

type EntryElement = {
	id: string;
	title?: string;
	updated: string;
	published?: string;
	summary?: string;
	content?: { "@_type": string; "#text": string };
	link?: { "@_href": string; "@_rel": string };
	author?: Record<string, string>;
	category?: { "@_term": string }[];
};

function formatEntry(
	item: z.infer<typeof atomSchema>,
	site: string,
	trailingSlash: boolean,
	feedAuthor?: Record<string, string>,
): EntryElement {
	const entry: EntryElement = {
		id: item.id,
		updated: (item.updatedDate ?? item.pubDate ?? new Date()).toISOString(),
	};

	if (item.title) {
		entry.title = item.title;
	}

	// RFC 4287 advises a <summary> when <content> is absent.
	if (item.description) {
		entry.summary = item.description;
	} else if (!item.content && item.title) {
		entry.summary = item.title;
	}

	const itemLink = item.link
		? isValidURL(item.link)
			? item.link
			: createCanonicalURL(item.link, trailingSlash, site)
		: undefined;

	if (itemLink) {
		entry.link = { "@_href": itemLink, "@_rel": "alternate" };
	}

	if (item.pubDate) {
		entry.published = item.pubDate.toISOString();
	}

	if (typeof item.content === "string") {
		entry.content = { "@_type": "html", "#text": item.content };
	}

	// Per RFC 4287 §4.1.2, every entry must have an author.
	// Feed-level author cascades as entry-level fallback.
	if (item.author) {
		entry.author = formatAuthor(item.author);
	} else if (feedAuthor) {
		entry.author = feedAuthor;
	}

	if (item.categories && item.categories.length > 0) {
		entry.category = item.categories.map((c) => ({ "@_term": c }));
	}

	return entry;
}

function checkAuthorPresence(options: ValidatedAtomOptions): void {
	if (options.author) return;

	for (const item of options.items) {
		if (item.author) return;
	}

	console.warn(
		"[Atom] No authors found on the feed or any entry. Atom feeds SHOULD include at least one author (RFC 4287 §4.1.1).",
	);
}

function generateAtom(options: ValidatedAtomOptions): string {
	const { items, site } = options;
	const canonicalSite = createCanonicalURL(site, options.trailingSlash);
	const feedId = options.id ?? canonicalSite;

	let feedUpdated = options.updatedDate;
	if (feedUpdated === undefined && items.length > 0) {
		feedUpdated = items.reduce<Date | undefined>((latest, item) => {
			const d = item.updatedDate ?? item.pubDate;
			if (!d) return latest;
			return latest === undefined || d > latest ? d : latest;
		}, undefined);
	}

	const links: Record<string, string>[] = [
		{ "@_href": canonicalSite, "@_rel": "alternate" },
	];
	if (options.linkRoot) {
		const selfLink = isValidURL(options.linkRoot)
			? options.linkRoot
			: createCanonicalURL(
					options.linkRoot,
					options.trailingSlash,
					canonicalSite,
				);
		links.push({ "@_href": selfLink, "@_rel": "self" });
	}

	// Pre-compute feed-level author so it isn't re-formatted per entry.
	const feedAuthor = options.author
		? formatAuthor(options.author)
		: undefined;

	const entries = items.map((item) =>
		formatEntry(item, canonicalSite, options.trailingSlash, feedAuthor),
	);

	// Ensure unique entry IDs per RFC 4287 §4.2.6
	const seenIds = new Set<string>();
	for (const entry of entries) {
		let dedupedId = entry.id;
		let counter = 0;
		while (seenIds.has(dedupedId)) {
			counter++;
			dedupedId = `${entry.id}-${counter}`;
		}
		if (counter > 0) {
			console.warn(
				`[Atom] Duplicate entry ID "${entry.id}" resolved to "${dedupedId}".`,
			);
			entry.id = dedupedId;
		}
		seenIds.add(entry.id);
	}

	// Disambiguate entries whose updated timestamps collide.
	// Some feed readers rely on <updated> for ordering;
	// identical values can cause nondeterministic sort.
	const seenUpdated = new Set<string>();
	for (const entry of entries) {
		let dedupedUpdated = entry.updated;
		let counter = 0;
		while (seenUpdated.has(dedupedUpdated)) {
			counter++;
			const base = new Date(entry.updated);
			base.setMilliseconds(base.getMilliseconds() + counter);
			dedupedUpdated = base.toISOString();
		}
		if (counter > 0) {
			console.warn(
				`[Atom] Duplicate entry updated "${entry.updated}" resolved to "${dedupedUpdated}".`,
			);
			entry.updated = dedupedUpdated;
		}
		seenUpdated.add(entry.updated);
	}

	// Build feed metadata first, then append entries at the end.
	// Atom convention places all metadata before the first <entry>.
	const feed: Record<string, unknown> = {
		"@_xmlns": "http://www.w3.org/2005/Atom",
		id: feedId,
		title: options.title,
		updated: (feedUpdated ?? new Date()).toISOString(),
		link: links.length === 1 ? links[0] : links,
	};

	if (options.author) {
		feed.author = formatAuthor(options.author);
	}

	if (options.description) {
		feed.subtitle = options.description;
	}

	if (options.icon) {
		feed.icon = options.icon;
	}

	if (options.logo) {
		feed.logo = options.logo;
	}

	if (options.generator) {
		if (typeof options.generator === "string") {
			feed.generator = options.generator;
		} else {
			const gen: Record<string, string> = {
				"#text": options.generator.name,
			};
			if (options.generator.uri) gen["@_uri"] = options.generator.uri;
			if (options.generator.version)
				gen["@_version"] = options.generator.version;
			feed.generator = gen;
		}
	}

	// Entries come last
	feed.entry = entries;

	const xmlOptions = {
		ignoreAttributes: false,
		// Avoid self-closing tags for empty elements, which fast-xml-builder sometimes emits incorrectly
		// https://github.com/withastro/astro/issues/5794
		suppressEmptyNode: true,
		suppressBooleanAttributes: false,
	};

	const root: Record<string, unknown> = {
		"?xml": { "@_version": "1.0", "@_encoding": "UTF-8" },
		feed,
	};

	return new Builder(xmlOptions).build(root);
}
