import { CliError } from "./output.js";
import type { ParsedArgv, ParsedFlagValue } from "./types.js";

const booleanFlags = new Set([
  "help",
  "version",
  "check",
  "allow-missing-sources",
  "force",
]);

export function parseArgv(argv: string[]): ParsedArgv {
  const result: ParsedArgv = {
    command: null,
    args: [],
    flags: {},
    help: false,
    version: false,
  };

  let index = 0;
  while (index < argv.length) {
    const token = argv[index];

    if (result.command == null && !token.startsWith("-")) {
      result.command = token;
      index += 1;
      continue;
    }

    if (token === "--help" || token === "-h") {
      result.help = true;
      index += 1;
      continue;
    }

    if (token === "--version" || token === "-v") {
      result.version = true;
      index += 1;
      continue;
    }

    if (token.startsWith("--")) {
      const [flagName, inlineValue] = token.slice(2).split("=", 2);
      if (booleanFlags.has(flagName)) {
        result.flags[flagName] = inlineValue == null ? true : inlineValue !== "false";
        index += 1;
        continue;
      }

      const nextValue: ParsedFlagValue | undefined = inlineValue ?? argv[index + 1];
      if (nextValue == null) {
        throw new CliError(`Missing value for --${flagName}.`);
      }

      result.flags[flagName] = nextValue;
      index += inlineValue == null ? 2 : 1;
      continue;
    }

    if (token.startsWith("-")) {
      throw new CliError(`Unsupported short option: ${token}`, {
        details: ["Use long-form flags for command options."],
      });
    }

    if (result.command != null) {
      result.args.push(token);
    }
    index += 1;
  }

  return result;
}
