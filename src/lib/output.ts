import type { CliErrorOptions, CommandResult, OutputWriter } from "./types.js";

export class CliError extends Error {
  readonly exitCode: number;
  readonly details: string[];
  readonly nextSteps: string[];

  constructor(message: string, options: CliErrorOptions = {}) {
    super(message);
    this.name = "CliError";
    this.exitCode = options.exitCode ?? 1;
    this.details = options.details ?? [];
    this.nextSteps = options.nextSteps ?? [];
  }
}

export function printCommandUsage(stdout: OutputWriter): void {
  stdout.write(
    [
      "Usage: skillsbase <command> [options]",
      "",
      "Commands:",
      "  init            Create the managed repository baseline",
      "  sync            Reconcile managed skills from sources.yaml",
      "  add             Add a skill to a source block and sync",
      "  github_action   Generate managed GitHub Actions assets",
      "",
      "Global Options:",
      "  --repo <path>   Target repository path (default: current directory)",
      "  --help, -h      Show help",
      "  --version, -v   Show version",
      "",
    ].join("\n"),
  );
}

export function printCommandResult(result: CommandResult, output: OutputWriter): void {
  const lines = [
    `## ${result.title ?? result.command}`,
    "",
    `repository: ${result.repository}`,
    `exit_code: ${result.exitCode ?? 0}`,
  ];

  if (result.schema) {
    lines.push(`schema: ${result.schema}`);
  }

  if (result.items?.length) {
    lines.push("", "items:");
    for (const item of result.items) {
      lines.push(`- ${item}`);
    }
  }

  if (result.nextSteps?.length) {
    lines.push("", "next:");
    for (const nextStep of result.nextSteps) {
      lines.push(`- ${nextStep}`);
    }
  }

  lines.push("");
  output.write(`${lines.join("\n")}\n`);
}
