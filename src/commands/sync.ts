import path from "node:path";

import { loadManifest } from "../lib/manifest.js";
import { executeSync } from "../lib/sync-engine.js";
import type { CommandContext, CommandResult } from "../lib/types.js";

export async function runSyncCommand(context: CommandContext): Promise<CommandResult> {
  const repoFlag = typeof context.flags.repo === "string" ? context.flags.repo : undefined;
  const repoPath = path.resolve(repoFlag ?? context.cwd);
  const manifest = await loadManifest(repoPath);

  return executeSync({
    repoPath,
    manifest,
    check: context.flags.check === true,
    allowMissingSources: context.flags["allow-missing-sources"] === true,
    env: context.env,
  });
}
