import path from "node:path";

import { writeGithubActions } from "../lib/templates.js";
import type { CommandContext, CommandResult, GithubActionKind } from "../lib/types.js";

export async function runGithubActionCommand(context: CommandContext): Promise<CommandResult> {
  const repoFlag = typeof context.flags.repo === "string" ? context.flags.repo : undefined;
  const kindFlag = typeof context.flags.kind === "string" ? context.flags.kind : undefined;
  const repoPath = path.resolve(repoFlag ?? context.cwd);

  return writeGithubActions(repoPath, {
    kind: (kindFlag ?? "workflow") as GithubActionKind,
    force: context.flags.force === true,
  });
}
