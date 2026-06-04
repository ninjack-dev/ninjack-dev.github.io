import type {
  AstroConfig,
  AstroIntegrationLogger,
  ContentEntryType,
} from "astro";
import { glob  } from "astro/loaders";
import type { DataStore } from "astro/loaders";

// The proper data-store `DataEntry` which `glob` uses, *not* the
// minimal stub `astro:content` re-exports from `astro/content/config`.
// TODO: Replace with the full type directly once Astro exports it.
export type DataEntry = Parameters<DataStore["set"]>[0];
export type RenderedContent = NonNullable<DataEntry["rendered"]>;

// `DataStore.addAssetImports` and `LoaderContext.entryTypes` exist at runtime (glob
// uses them) but aren't in Astro's published types. Augment the real interfaces
// rather than recreate them.
declare module "astro/loaders" {
  interface DataStore {
    addAssetImports(assets: string[], fileName: string): void;
  }
  interface LoaderContext {
    entryTypes: Map<string, ContentEntryType>;
  }
}

/**
 * A node in the directory tree built from the globbed file set. Mirrors the
 * on-disk layout so hooks can reason about Entry relationships
 */
export interface DirNode {
  /** Directory URL (ends with a trailing slash). */
  dir: URL;
  /** Path relative to the loader base, POSIX-separated. `""` for the root. */
  relativeDir: string;
  /** The parent directory node, if any. The root has none. */
  parent?: DirNode;
  /** Child directories, keyed by their final path segment. */
  dirs: Map<string, DirNode>;
  /** Matched files directly inside this directory. */
  files: FileNode[];
}

/**
 * A matched file in the directory tree. Carries the loader-computed entry id
 * once `syncData` has resolved it, and a back-link to its containing directory
 * so hooks can navigate to siblings / parents from the changed entry.
 */
export interface FileNode {
  /** Absolute URL of the matched file. */
  url: URL;
  /** Loader-computed entry id (post `gp:entry:resolveId`). Empty until syncData resolves it. */
  id: string;
  /** The directory node this file sits in. */
  parent: DirNode;
}

type GlobOptions = Parameters<typeof glob>[0]

export type GenerateIdOptions = Parameters<NonNullable<GlobOptions["generateId"]>>[0]

/**
 * Options accepted by {@link globplus}. Mirrors glob's parity surface plus the
 * integrations registry.
 */
export type GlobPlusOptions = GlobOptions & {
  integrations?: GlobPlusIntegration[];
}

/**
 * The resolved, normalised form of {@link GlobPlusOptions}, exposed read-only to
 * `gp:config:setup` hooks.
 */
export interface ResolvedGlobPlusOptions {
  pattern: string | string[];
  base: string | URL | undefined;
  retainBody: boolean;
}

export interface GlobPlusIntegration {
  /** Unique name, used for logging and to fork a per-integration logger. */
  name: string;
  /** The hook handlers this integration provides. */
  hooks: Partial<GlobPlus.IntegrationHooks>;
}

/**
 * Input to `addEntry`. The digest is derived from {@link AddEntryInput.digestInput}
 * rather than the rendered output, so derived entries invalidate when their
 * inputs (child id set, sibling content hash, …) change.
 *
 * `addEntry` is reachable from two hooks. `gp:load:done` runs every load against
 * the live store — the intended path for derived/aggregate entries; R7 digest
 * invalidation holds since `digestInput` is recomputed each load. `gp:config:setup`
 * is memoized (runs once), so entries emitted there are computed a single time and
 * will NOT re-invalidate when their `digestInput` sources change. Prefer
 * `gp:load:done` for anything reacting to content changes.
 */
export interface AddEntryInput {
  entry: DataEntry;
  /** The value(s) the entry is derived from; hashed via `generateDigest`. */
  digestInput: Record<string, unknown> | string;
}

export interface BaseIntegrationHooks {
  /**
   * Runs once, before walking files.
   */
  "gp:config:setup": (params: {
    /**
     * A per-collection, mutable copy of the Astro config. Setup hooks may mutate
     * it directly. It is a shallow clone of the shared global config, so reassign
     * branches rather than deep-mutating shared sub-objects to avoid leaking
     * into other collections.
     */
    config: AstroConfig;
    options: ResolvedGlobPlusOptions;
    collection: string;
    logger: AstroIntegrationLogger;
    integrations: GlobPlusIntegration[];
    /**
     * Emit a synthetic / derived entry. The caller must supply the digest inputs
     * so incremental builds invalidate correctly (R7).
     */
    addEntry: (entry: AddEntryInput) => void; // Is this really where we want this?
  }) => void | Promise<void>;

  /** Runs once, after globbing, before per-file work. Whole-tree view. */
  "gp:files:resolved": (params: {
    logger: AstroIntegrationLogger;
    /** The resolved base directory URL. */
    base: URL;
    /** Matched files, relative to `base`. */
    files: string[];
  }) => void | Promise<void>;

  /** Runs per file, after default id generation. Return a string to override. */
  "gp:entry:resolveId": (params: {
    logger: AstroIntegrationLogger;
    /** The entry path relative to the base. */
    entry: string;
    base: URL;
    data: Record<string, unknown>;
    /** The id globplus computed by default. */
    defaultId: string;
  }) => string | void | Promise<string | void>;

  /** Runs per file, before `parseData`. Mutate the raw frontmatter in place. */
  "gp:entry:data": (params: {
    logger: AstroIntegrationLogger;
    id: string;
    filePath: string;
    fileURL: URL;
    body: string | undefined;
    /** Mutable raw frontmatter, before schema validation. */
    data: Record<string, unknown>;
  }) => void | Promise<void>;

  /** Runs per file, after render. Mutate the rendered content in place. */
  "gp:entry:rendered": (params: {
    logger: AstroIntegrationLogger;
    id: string;
    /** Mutable rendered content. */
    rendered: RenderedContent;
  }) => void | Promise<void>;

  /** Runs per file, before `store.set`. Final mutation, or skip storing. */
  "gp:entry:store": (params: {
    logger: AstroIntegrationLogger;
    /** Mutable entry about to be stored. */
    entry: DataEntry;
    /** Call to skip storing this entry. */
    skip: () => void;
  }) => void | Promise<void>;

  /**
   * Runs after an entry is ADDED to the live set: at startup as a post-loop
   * batch (store fully populated) for every file-backed entry, and on each watch
   * `add`. `tree` is the complete, current directory tree; `node` is this entry's
   * FileNode. Walk the tree to derive adjacency (siblings/parents/nephews) and
   * mutate affected neighbor entries via `store`. Idempotent: re-derive from the
   * tree rather than tracking deltas.
   */
  "gp:entry:added": (params: {
    logger: AstroIntegrationLogger;
    id: string;
    node: FileNode;
    tree: DirNode;
    store: DataStore;
  }) => void | Promise<void>;

  /**
   * Runs after an entry is REMOVED from the live set, on each watch `unlink`. The
   * FileNode is already pruned from `tree` (and its directory may have been pruned
   * if it went empty), but `parent` and its `.parent` chain remain navigable for
   * neighbor lookup.
   */
  "gp:entry:removed": (params: {
    logger: AstroIntegrationLogger;
    id: string;
    parent: DirNode;
    tree: DirNode;
    store: DataStore;
  }) => void | Promise<void>;

  /** Runs once, after the loop, before pruning untouched entries. */
  "gp:load:done": (params: {
    logger: AstroIntegrationLogger;
    store: DataStore;
    entries: DataEntry[];
    /** Emit derived/aggregate entries (R7 digest rules apply). */
    addEntry: (entry: AddEntryInput) => void;
  }) => void | Promise<void>;
}

declare global {
  namespace GlobPlus {
    /**
     * Augment this interface to add a custom hook set, then wire up your custom hooks in `gp:config:setup`.
     *
     * The `gp:` prefix is reserved for first-party hook sets.
     */
    export interface IntegrationHooks extends BaseIntegrationHooks {}
  }
}
