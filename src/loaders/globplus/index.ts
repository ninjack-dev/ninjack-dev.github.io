import { existsSync, promises as fs } from "node:fs";
import { relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { AstroIntegrationLogger, ContentEntryType } from "astro";
import type { Loader, LoaderContext } from "astro/loaders";
import pLimit from "p-limit";
import picomatch from "picomatch";
import { glob as tinyglobby } from "tinyglobby";
import { runHook } from "./run-hook.ts";
import { runSetup, type SetupContributions } from "./setup.ts";
import type {
  DataEntry,
  DirNode,
  FileNode,
  GlobPlusIntegration,
  GlobPlusOptions,
  RenderedContent,
  ResolvedGlobPlusOptions,
} from "./types.ts";
import {
  buildDirTree,
  findFile,
  generateIdDefault,
  insertFile,
  removeFile,
} from "./utils.ts";

// Re-export the public types and the first-party markdown hook set.
export type {
  DirNode,
  FileNode,
  GlobPlusIntegration,
  GlobPlusOptions,
} from "./types.ts";
export { markdownHooks } from "./integrations/markdown/index.ts";

// The render function `ContentEntryType.getRenderFunction` resolves to.
type RenderFn = Awaited<
  ReturnType<NonNullable<ContentEntryType["getRenderFunction"]>>
>;

// Matches function used by glob
function posixRelative(from: string, to: string): string {
  return relative(from, to).split(/[/\\]/).join("/");
}

// Matches function used by glob
function checkPrefix(pattern: string | Array<string>, prefix: string) {
  if (Array.isArray(pattern)) {
    return pattern.some((p) => p.startsWith(prefix));
  }
  return pattern.startsWith(prefix);
}

/**
 * `globplus` — a glob-compatible content loader with an integration-style
 * extensibility layer. See the loader README for the hook reference.
 */
export function globplus(options: GlobPlusOptions): Loader {
  if (checkPrefix(options.pattern, "../")) {
    throw new Error(
      "Glob patterns cannot start with `../`. Set the `base` option to a parent directory instead.",
    );
  }
  if (checkPrefix(options.pattern, "/")) {
    throw new Error(
      "Glob patterns cannot start with `/`. Set the `base` option to a parent directory or use a relative path instead.",
    );
  }

  const integrations: GlobPlusIntegration[] = options.integrations ?? [];
  const generateId = options.generateId ?? generateIdDefault;
  const resolvedOptions: ResolvedGlobPlusOptions = {
    pattern: options.pattern,
    base: options.base,
    retainBody: options.retainBody !== false,
  };

  const fileToIdMap = new Map<string, string>();

  // Persistent loader state, held across the closure so the watcher can patch
  // the same references the load built. `treeRef.current` is rebuilt at the top
  // of each `load()` (the watcher reads `.current` so it always sees the live
  // tree). `byId` maps a resolved entry id to its FileNode and is kept in sync
  // wherever `node.id` is set.
  const treeRef: { current: DirNode } = {
    current: {
      dir: new URL("file:///"),
      relativeDir: "",
      dirs: new Map(),
      files: [],
    },
  };
  const byId = new Map<string, FileNode>();

  // Memoized setup contributions, keyed nothing — rebuilt across watch reloads
  // but reused within a single process lifetime once computed.
  let setupPromise: Promise<SetupContributions> | undefined;

  return {
    name: "globplus-loader",
    load: async (context: LoaderContext) => {
      const {
        collection,
        logger,
        watcher,
        parseData,
        store,
        generateDigest,
        entryTypes,
      } = context;

      // `runSetup` clones `context.config` (the shared global) and returns the
      // clone after `gp:config:setup` hooks have mutated it. The clone is
      // returned from the memoized promise — not rebuilt per load — so config
      // mutations survive watch reloads. Everything below uses this `config`,
      // never `context.config`, so per-collection config edits (e.g. a bridged
      // markdown processor) take effect without leaking into the global config.
      if (!setupPromise) {
        setupPromise = runSetup({
          config: context.config,
          options: resolvedOptions,
          collection,
          logger,
          integrations,
        });
      }
      const contributions = await setupPromise;
      const config = contributions.config;

      const renderFunctionByContentType = new WeakMap<
        ContentEntryType,
        RenderFn
      >();

      const untouchedEntries = new Set(store.keys());

      // Process an `addEntry` contribution: digest from the supplied inputs (R7).
      const storeDerivedEntry = (input: {
        entry: DataEntry;
        digestInput: Record<string, unknown> | string;
      }) => {
        const digest = generateDigest(input.digestInput);
        const id = input.entry.id;
        untouchedEntries.delete(id);
        store.set({ ...input.entry, digest });
        if (input.entry.filePath) {
          fileToIdMap.set(
            fileURLToPath(new URL(input.entry.filePath, config.root)),
            id,
          );
        }
      };

      async function syncData(
        entry: string,
        base: URL,
        entryType?: ContentEntryType,
        oldId?: string,
      ) {
        if (!entryType) {
          logger.warn(`No entry type found for ${entry}`);
          return;
        }
        const fileUrl = new URL(encodeURI(entry), base);
        const contents = await fs.readFile(fileUrl, "utf-8").catch((err) => {
          logger.error(`Error reading ${entry}: ${err.message}`);
          return undefined;
        });

        if (!contents && contents !== "") {
          logger.warn(`No contents found for ${entry}`);
          return;
        }

        const { body, data } = await entryType.getEntryInfo({
          contents,
          fileUrl,
        });

        const defaultId = generateId({ entry, base, data });

        const overrides = await runHook({
          integrations,
          hookName: "gp:entry:resolveId",
          logger,
          params: () => ({ entry, base, data, defaultId }),
        });
        const id = overrides.findLast((v) => typeof v === "string") ??
          defaultId;

        if (oldId && oldId !== id) {
          store.delete(oldId);
          byId.delete(oldId);
        }

        // Resolve this file's FileNode and bind its id. A digest-unchanged file
        // is still live and must stay in the tree / byId, so this runs before
        // the digest-skip early return below. Watcher syncData for a brand-new
        // file not yet in the tree inserts it here first.
        const fileNode = findFile(treeRef.current, entry) ??
          insertFile(treeRef.current, entry, fileUrl);
        fileNode.id = id;
        byId.set(id, fileNode);

        untouchedEntries.delete(id);

        const existingEntry = store.get(id);

        const digest = generateDigest(contents);
        const filePath = fileURLToPath(fileUrl);

        if (
          existingEntry &&
          existingEntry.digest === digest &&
          existingEntry.filePath
        ) {
          if (existingEntry.deferredRender) {
            store.addModuleImport(existingEntry.filePath);
          }
          if (existingEntry.assetImports?.length) {
            store.addAssetImports(
              existingEntry.assetImports,
              existingEntry.filePath,
            );
          }
          fileToIdMap.set(filePath, id);
          return;
        }

        const relativePath = posixRelative(
          fileURLToPath(config.root),
          filePath,
        );

        await runHook({
          integrations,
          hookName: "gp:entry:data",
          logger,
          params: () => ({
            id,
            filePath: relativePath,
            fileURL: fileUrl,
            body,
            data,
          }),
        });

        const parsedData = await parseData({ id, data, filePath });

        if (
          existingEntry &&
          existingEntry.filePath &&
          existingEntry.filePath !== relativePath
        ) {
          const oldFilePath = new URL(existingEntry.filePath, config.root);
          if (existsSync(oldFilePath)) {
            logger.warn(
              `Duplicate id "${id}" found in ${filePath}. Later items with the same id will overwrite earlier ones.`,
            );
          }
        }

        let entryToStore: DataEntry;

        const getRenderFunction = entryType.getRenderFunction;
        if (getRenderFunction) {
          let render = renderFunctionByContentType.get(entryType);
          if (!render) {
            render = await getRenderFunction(config);
            renderFunctionByContentType.set(entryType, render);
          }

          let rendered: RenderedContent | undefined;
          try {
            rendered = await render?.({ id, data, body, filePath, digest });
          } catch (error) {
            logger.error(
              `Error rendering ${entry}: ${(error as Error).message}`,
            );
          }

          if (rendered) {
            await runHook({
              integrations,
              hookName: "gp:entry:rendered",
              logger,
              params: () => ({ id, rendered }),
            });
          }

          entryToStore = {
            id,
            data: parsedData,
            body: resolvedOptions.retainBody ? body : undefined,
            filePath: relativePath,
            digest,
            rendered,
            assetImports: rendered?.metadata?.imagePaths,
          };
        } else if ("contentModuleTypes" in entryType) {
          // MDX / Markdoc: deferred render through Vite (glob parity).
          entryToStore = {
            id,
            data: parsedData,
            body: resolvedOptions.retainBody ? body : undefined,
            filePath: relativePath,
            digest,
            deferredRender: true,
          };
        } else {
          entryToStore = {
            id,
            data: parsedData,
            body: resolvedOptions.retainBody ? body : undefined,
            filePath: relativePath,
            digest,
          };
        }

        let skipped = false;
        await runHook({
          integrations,
          hookName: "gp:entry:store",
          logger,
          params: () => ({
            entry: entryToStore,
            skip: () => {
              skipped = true;
            },
          }),
        });

        if (skipped) {
          untouchedEntries.delete(id);
          fileToIdMap.set(filePath, id);
          return;
        }

        store.set(entryToStore);
        fileToIdMap.set(filePath, id);
      }

      const baseDir = options.base
        ? new URL(options.base, config.root)
        : config.root;
      if (!baseDir.pathname.endsWith("/")) {
        baseDir.pathname = `${baseDir.pathname}/`;
      }

      const baseFsPath = fileURLToPath(baseDir);
      const relativeBase = relative(fileURLToPath(config.root), baseFsPath);
      const exists = existsSync(baseDir);

      if (!exists) {
        logger.warn(`The base directory "${baseFsPath}" does not exist.`);
      }

      const files = await tinyglobby(options.pattern, {
        cwd: baseFsPath,
        expandDirectories: false,
      });

      const contentDir = new URL("content/", config.srcDir);
      const configFiles = new Set(
        ["config.js", "config.ts", "config.mjs"].map(
          (file) => new URL(file, contentDir).href,
        ),
      );
      const isConfigFile = (file: string) =>
        configFiles.has(new URL(file, baseDir).href);

      function configForFile(file: string): ContentEntryType | undefined {
        const ext = file.split(".").at(-1);
        if (!ext) {
          logger.warn(`No extension found for ${file}`);
          return undefined;
        }
        return entryTypes.get(`.${ext}`);
      }

      const entryFiles = files.filter((file) => !isConfigFile(file));

      // Rebuild the persistent tree from this load's file set (FileNode ids are
      // empty until `syncData` resolves them). The watcher reads `treeRef.current`,
      // so reassigning it here keeps watch patching pointed at the live tree.
      treeRef.current = buildDirTree(baseDir, entryFiles);
      byId.clear();

      await runHook({
        integrations,
        hookName: "gp:files:resolved",
        logger,
        params: () => ({
          base: baseDir,
          files: entryFiles,
          tree: treeRef.current,
        }),
      });

      if (exists && entryFiles.length === 0) {
        logger.warn(
          `No files found matching "${options.pattern}" in directory "${relativeBase}"`,
        );
      }

      const limit = pLimit(10);
      await Promise.all(
        entryFiles.map((entry) =>
          limit(async () => {
            const entryType = configForFile(entry);
            await syncData(entry, baseDir, entryType);
          })
        ),
      );

      // Store synthetic entries contributed during setup (R7 digests).
      for (const input of contributions.entries) {
        storeDerivedEntry(input);
      }

      // Startup `added` batch: the store is fully populated, so handlers may
      // read/mutate sibling entries. Fire once per file-backed entry; synthetic
      // / derived entries (no FileNode) do not get `added`.
      for (const [id, node] of byId) {
        if (!store.has(id)) continue;
        await runHook({
          integrations,
          hookName: "gp:entry:added",
          logger,
          params: () => ({ id, node, tree: treeRef.current, store }),
        });
      }

      await runHook({
        integrations,
        hookName: "gp:load:done",
        logger,
        params: () => ({
          store,
          entries: store.values(),
          addEntry: storeDerivedEntry,
        }),
      });

      // Remove entries that were not found this time.
      untouchedEntries.forEach((id) => store.delete(id));

      if (!watcher) {
        return;
      }

      setupWatcher({
        watcher,
        baseDir,
        pattern: options.pattern,
        configForFile,
        syncData,
        store,
        logger,
        integrations,
        fileToIdMap,
        treeRef,
        byId,
      });
    },
  };
}

function setupWatcher({
  watcher,
  baseDir,
  pattern,
  configForFile,
  syncData,
  store,
  logger,
  integrations,
  fileToIdMap,
  treeRef,
  byId,
}: {
  watcher: NonNullable<LoaderContext["watcher"]>;
  baseDir: URL;
  pattern: string | string[];
  configForFile: (file: string) => ContentEntryType | undefined;
  syncData: (
    entry: string,
    base: URL,
    entryType?: ContentEntryType,
    oldId?: string,
  ) => Promise<void>;
  store: LoaderContext["store"];
  logger: AstroIntegrationLogger;
  integrations: GlobPlusIntegration[];
  fileToIdMap: Map<string, string>;
  // Holder for the persistent tree (`load()` reassigns `.current` each run).
  treeRef: { current: DirNode };
  byId: Map<string, FileNode>;
}) {
  const basePath = fileURLToPath(baseDir);
  watcher.add(basePath);

  const matchesGlob = (entry: string) =>
    !entry.startsWith("../") && picomatch.isMatch(entry, pattern);

  async function onChange(changedPath: string) {
    const entry = posixRelative(basePath, changedPath);
    if (!matchesGlob(entry)) return;
    const entryType = configForFile(changedPath);
    const baseUrl = pathToFileURL(basePath + "/");
    const oldId = fileToIdMap.get(changedPath);

    const isNew = !findFile(treeRef.current, entry);

    try {
      await syncData(entry, baseUrl, entryType, oldId);
      logger.info(`Reloaded data from ${entry}`);
    } catch (e) {
      logger.error(`Failed to reload ${entry}: ${(e as Error).message}`);
      return;
    }

    if (!isNew) return;
    const node = findFile(treeRef.current, entry);
    if (!node || !node.id) return;
    const id = node.id;
    await runHook({
      integrations,
      hookName: "gp:entry:added",
      logger,
      params: () => ({ id, node, tree: treeRef.current, store }),
    });
  }

  watcher.on("change", onChange);
  watcher.on("add", onChange);
  watcher.on("unlink", async (deletedPath: string) => {
    const entry = posixRelative(basePath, deletedPath);
    if (!matchesGlob(entry)) return;
    const id = fileToIdMap.get(deletedPath);
    const node = findFile(treeRef.current, entry);
    const parent = node?.parent;
    removeFile(treeRef.current, entry);
    if (id) {
      store.delete(id);
      fileToIdMap.delete(deletedPath);
      byId.delete(id);
    }
    if (id && parent) {
      await runHook({
        integrations,
        hookName: "gp:entry:removed",
        logger,
        params: () => ({ id, parent, tree: treeRef.current, store }),
      });
    }
  });
}
