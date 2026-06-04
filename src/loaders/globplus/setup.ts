import type { AstroConfig, AstroIntegrationLogger } from "astro";
import { runHook } from "./run-hook.ts";
import type {
  AddEntryInput,
  GlobPlusIntegration,
  ResolvedGlobPlusOptions,
} from "./types.ts";

/**
 * The contributions collected from every integration's `gp:config:setup`,
 * alongside the per-collection config the hooks mutated.
 *
 * Built once per collection and memoized across watch reloads (§3.2). The
 * memoization is why the cloned, mutated `config` is returned here rather than
 * rebuilt at load time: a later load must reuse this exact object, or any
 * config mutations a setup hook made (e.g. the markdown integration swapping in
 * a bridged processor) would be silently lost.
 */
export interface SetupContributions {
  /** The per-collection, mutable config clone after `gp:config:setup` ran. */
  config: AstroConfig;
  /** Synthetic entries emitted during setup. */
  entries: AddEntryInput[];
}

/**
 * Run `gp:config:setup` across the registry and collect contributions.
 *
 * The loader's `context.config` is the SHARED global `AstroConfig`, not a
 * per-loader copy. So we clone it here (a shallow per-collection copy) and run
 * setup against the clone: hooks mutate `config` directly, reassigning whole
 * branches (e.g. `config.markdown = { ... }`) rather than deep-mutating shared
 * sub-objects, so the global config — and the other collections that share it —
 * stay untouched.
 */
export async function runSetup({
  config: inputConfig,
  options,
  collection,
  logger,
  integrations,
}: {
  config: AstroConfig;
  options: ResolvedGlobPlusOptions;
  collection: string;
  logger: AstroIntegrationLogger;
  integrations: GlobPlusIntegration[];
}): Promise<SetupContributions> {
  const config: AstroConfig = { ...inputConfig };
  const entries: AddEntryInput[] = [];

  await runHook({
    integrations,
    hookName: "gp:config:setup",
    logger,
    params: () => ({
      config,
      options,
      collection,
      integrations,
      // Loader-derived field validation belongs on Astro's `Loader.createSchema()`,
      // not a load-time schema merge (parseData validates the collection's own schema).
      addEntry: (entry: AddEntryInput) => {
        entries.push(entry);
      },
    }),
  });

  return { config, entries };
}
