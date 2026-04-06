import path from "node:path";

import { runAddCommand } from "./commands/add.js";
import { runGithubActionCommand } from "./commands/github-action.js";
import { runInitCommand } from "./commands/init.js";
import { runRemoveCommand } from "./commands/remove.js";
import { runSyncCommand } from "./commands/sync.js";
import { CliError, printCommandResult, printCommandUsage } from "./lib/output.js";
import { parseArgv } from "./lib/parse-argv.js";
import type { CommandContext, CommandResult, IoStreams } from "./lib/types.js";

interface CliEnvironment {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdout?: IoStreams["stdout"];
  stderr?: IoStreams["stderr"];
}

type CommandHandler = (context: CommandContext) => Promise<CommandResult>;

const commandMap = new Map<string, CommandHandler>([
  ["init", runInitCommand],
  ["sync", runSyncCommand],
  ["add", runAddCommand],
  ["remove", runRemoveCommand],
  ["github_action", runGithubActionCommand],
  ["github-action", runGithubActionCommand],
]);

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export async function runCli(argv: string[], environment: CliEnvironment = {}): Promise<number> {
  const io = {
    stdout: environment.stdout ?? process.stdout,
    stderr: environment.stderr ?? process.stderr,
  };
  const cwd = path.resolve(environment.cwd ?? process.cwd());
  const env = { ...process.env, ...(environment.env ?? {}) };

  try {
    const parsed = parseArgv(argv);
    if (parsed.help || !parsed.command) {
      printCommandUsage(io.stdout);
      return 0;
    }

    if (parsed.version) {
      io.stdout.write("skillsbase 0.1.0\n");
      return 0;
    }

    const command = commandMap.get(parsed.command);
    if (!command) {
      throw new CliError(`Unknown command: ${parsed.command}`, {
        exitCode: 1,
        details: ["Use `skillsbase --help` to view supported commands."],
      });
    }

    const result = await command({
      cwd,
      env,
      io,
      command: parsed.command,
      args: parsed.args,
      flags: parsed.flags,
      rawArgv: argv,
    });

    printCommandResult(result, io.stdout);
    return result.exitCode ?? 0;
  } catch (error) {
    if (error instanceof CliError) {
      printCommandResult(
        {
          command: "error",
          title: error.message,
          repository: cwd,
          exitCode: error.exitCode ?? 1,
          items: error.details ?? [],
          nextSteps: error.nextSteps ?? [],
        },
        io.stderr,
      );
      return error.exitCode ?? 1;
    }

    printCommandResult({ command: "error", title: getErrorMessage(error), repository: cwd, exitCode: 1 }, io.stderr);
    return 1;
  }
}
