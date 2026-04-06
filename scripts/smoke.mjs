import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runCli } from "../src/cli.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skillsbase-smoke-"));
const repoRoot = path.join(tempRoot, "managed-repo");
const firstPartyRoot = path.join(tempRoot, "first-party");
const systemRoot = path.join(tempRoot, "system");

async function createSkill(rootPath, name) {
  const skillRoot = path.join(rootPath, name);
  await fs.mkdir(skillRoot, { recursive: true });
  await fs.writeFile(
    path.join(skillRoot, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${JSON.stringify(`${name} smoke skill`)}\n---\n\n# ${name}\n`,
    "utf8",
  );
}

await createSkill(firstPartyRoot, "alpha");
await createSkill(systemRoot, "beta");

const commands = [
  [
    "init",
    "--repo",
    repoRoot,
    "--first-party-root",
    firstPartyRoot,
    "--system-root",
    systemRoot,
    "--remote-repository",
    "example/skillsbase-smoke",
  ],
  ["sync", "--repo", repoRoot],
  ["sync", "--check", "--repo", repoRoot],
  ["github_action", "--kind", "all", "--repo", repoRoot],
];

for (const command of commands) {
  const exitCode = await runCli(command, { cwd: packageRoot });
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}
