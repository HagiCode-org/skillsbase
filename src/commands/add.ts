import path from "node:path";

import { CliError } from "../lib/output.js";
import { addSkillToManifest, loadManifest, saveManifest } from "../lib/manifest.js";
import { executeSync } from "../lib/sync-engine.js";
import type { CommandContext, CommandResult } from "../lib/types.js";

export async function runAddCommand(context: CommandContext): Promise<CommandResult> {
  const repoFlag = typeof context.flags.repo === "string" ? context.flags.repo : undefined;
  const sourceFlag = typeof context.flags.source === "string" ? context.flags.source : undefined;
  const repoPath = path.resolve(repoFlag ?? context.cwd);
  const skillName = context.args[0];

  if (!skillName) {
    throw new CliError("`skillsbase add` requires a skill name.", {
      details: ["Usage: `skillsbase add <skill-name> [--source <key>]`."],
    });
  }

  const manifest = await loadManifest(repoPath);
  const nextManifest = addSkillToManifest(manifest, skillName, {
    sourceKey: sourceFlag,
  });

  await saveManifest(nextManifest);

  const result = await executeSync({
    repoPath,
    manifest: nextManifest,
    env: context.env,
    check: false,
    allowMissingSources: context.flags["allow-missing-sources"] === true,
  });

  return {
    ...result,
    title: `skillsbase add ${skillName}`,
    items: [
      `manifest updated: ${path.relative(repoPath, nextManifest.manifestPath) || "sources.yaml"}`,
      ...result.items,
    ],
  };
}
