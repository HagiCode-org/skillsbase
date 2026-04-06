import path from "node:path";

import { initialiseRepository } from "../lib/repo-init.js";
import type { CommandContext, CommandResult } from "../lib/types.js";

export async function runInitCommand(context: CommandContext): Promise<CommandResult> {
  const repoFlag = typeof context.flags.repo === "string" ? context.flags.repo : undefined;
  const repoPath = path.resolve(repoFlag ?? context.cwd);

  return initialiseRepository(repoPath, {
    firstPartyRoot:
      typeof context.flags["first-party-root"] === "string" ? context.flags["first-party-root"] : undefined,
    systemRoot: typeof context.flags["system-root"] === "string" ? context.flags["system-root"] : undefined,
    remoteRepository:
      typeof context.flags["remote-repository"] === "string" ? context.flags["remote-repository"] : undefined,
    force: context.flags.force === true,
  });
}
