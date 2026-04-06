import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runCli } from "../src/cli.js";

interface CreateSkillOptions {
  description?: string;
  extraFiles?: Record<string, string>;
  invalidFrontmatter?: boolean;
}

async function createTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "skillsbase-test-"));
}

async function createSkill(rootPath, name, options: CreateSkillOptions = {}) {
  const skillRoot = path.join(rootPath, name);
  await fs.mkdir(skillRoot, { recursive: true });
  await fs.writeFile(
    path.join(skillRoot, "SKILL.md"),
    options.invalidFrontmatter
      ? `# ${name}\n`
      : `---\nname: ${name}\ndescription: ${JSON.stringify(options.description ?? `${name} description`)}\n---\n\n# ${name}\n`,
    "utf8",
  );

  if (options.extraFiles) {
    for (const [relativePath, content] of Object.entries(options.extraFiles)) {
      const targetPath = path.join(skillRoot, relativePath);
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, content, "utf8");
    }
  }
}

async function createFakeNpx(binRoot) {
  const binDir = path.join(binRoot, "bin");
  const scriptPath = path.join(binDir, "npx");
  await fs.mkdir(binDir, { recursive: true });
  await fs.writeFile(
    scriptPath,
    `#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";

function parseFrontmatter(content) {
  const match = /^---\\n([\\s\\S]*?)\\n---/.exec(content);
  if (!match) {
    return {};
  }

  const lines = match[1].split(/\\n/);
  const data = {};
  for (const line of lines) {
    const [key, ...rest] = line.split(":");
    if (!key || rest.length === 0) {
      continue;
    }
    data[key.trim()] = rest.join(":").trim().replace(/^['"]|['"]$/g, "");
  }
  return data;
}

const args = process.argv.slice(2);
if (args[0] !== "--yes" || !String(args[1] ?? "").startsWith("skills@")) {
  console.error("unexpected fake npx args", args.join(" "));
  process.exit(2);
}

const command = args[2];
if (command === "add") {
  const sourcePath = path.resolve(args[3]);
  const skillText = await fs.readFile(path.join(sourcePath, "SKILL.md"), "utf8");
  const frontmatter = parseFrontmatter(skillText);
  const skillName = frontmatter.name ?? path.basename(sourcePath);
  const installRoot = path.join(process.cwd(), ".agents", "skills", skillName);

  await fs.rm(installRoot, { recursive: true, force: true });
  await fs.mkdir(path.dirname(installRoot), { recursive: true });
  if (process.env.FAKE_NPX_OMIT_SKILL_MD !== "1") {
    await fs.cp(sourcePath, installRoot, { recursive: true, force: true });
  } else {
    await fs.mkdir(installRoot, { recursive: true });
  }

  if (process.env.FAKE_NPX_OMIT_METADATA !== "1") {
    await fs.writeFile(
      path.join(installRoot, "hagicode-skill.json"),
      JSON.stringify(
        {
          schemaVersion: 1,
          skillSlug: skillName,
          installReference: sourcePath,
          source: sourcePath,
        },
        null,
        2,
      ) + "\\n",
      "utf8",
    );
  }

  const lockPath = path.join(process.cwd(), "skills-lock.json");
  let lock = { version: 1, skills: {} };
  try {
    lock = JSON.parse(await fs.readFile(lockPath, "utf8"));
  } catch {}
  lock.skills[skillName] = { source: sourcePath, sourceType: "local" };
  await fs.writeFile(lockPath, JSON.stringify(lock, null, 2) + "\\n", "utf8");
  process.exit(0);
}

if (command === "remove") {
  if (process.env.FAKE_NPX_REMOVE_FAIL === "1") {
    console.error("fake remove failure");
    process.exit(1);
  }

  const skillName = args[3];
  await fs.rm(path.join(process.cwd(), ".agents", "skills", skillName), {
    recursive: true,
    force: true,
  });
  process.exit(0);
}

console.error("unsupported fake npx command", command);
process.exit(2);
`,
    "utf8",
  );
  await fs.chmod(scriptPath, 0o755);
  return binDir;
}

async function runCommand({ cwd, args, env = {} }) {
  let stdout = "";
  let stderr = "";
  const exitCode = await runCli(args, {
    cwd,
    env,
    stdout: { write: (chunk) => (stdout += chunk) },
    stderr: { write: (chunk) => (stderr += chunk) },
  });

  return { exitCode, stdout, stderr };
}

async function read(relativePath, repoPath) {
  return fs.readFile(path.join(repoPath, relativePath), "utf8");
}

test("init creates the managed repository baseline", async () => {
  const tempRoot = await createTempDir();
  const repoPath = path.join(tempRoot, "repo");
  const firstPartyRoot = path.join(tempRoot, "first-party");
  const systemRoot = path.join(tempRoot, "system");

  await createSkill(firstPartyRoot, "alpha");
  await createSkill(systemRoot, "beta");

  const result = await runCommand({
    cwd: repoPath,
    args: [
      "init",
      "--repo",
      repoPath,
      "--first-party-root",
      firstPartyRoot,
      "--system-root",
      systemRoot,
      "--remote-repository",
      "example/skillsbase",
    ],
  });

  assert.equal(result.exitCode, 0);
  await fs.access(path.join(repoPath, "sources.yaml"));
  await fs.access(path.join(repoPath, "skills", "README.md"));
  await fs.access(path.join(repoPath, "docs", "maintainer-workflow.md"));
  await fs.access(path.join(repoPath, ".github", "workflows", "skills-sync.yml"));
  await fs.access(path.join(repoPath, ".github", "actions", "skillsbase-sync", "action.yml"));
  assert.match(await read("sources.yaml", repoPath), /remoteRepository: example\/skillsbase/);
});

test("sync converts installed output into managed skills and cleans temporary install artifacts", async () => {
  const tempRoot = await createTempDir();
  const repoPath = path.join(tempRoot, "repo");
  const firstPartyRoot = path.join(tempRoot, "first-party");
  const systemRoot = path.join(tempRoot, "system");
  const fakeBin = await createFakeNpx(tempRoot);
  const env = { PATH: `${fakeBin}:${process.env.PATH}` };

  await createSkill(firstPartyRoot, "documentation-writer");
  await createSkill(systemRoot, "openai-docs", {
    extraFiles: {
      "references/latest-model.md": "latest",
    },
  });

  await runCommand({
    cwd: repoPath,
    env,
    args: ["init", "--repo", repoPath, "--first-party-root", firstPartyRoot, "--system-root", systemRoot],
  });

  const result = await runCommand({ cwd: repoPath, env, args: ["sync", "--repo", repoPath] });
  assert.equal(result.exitCode, 0);

  const systemSkill = await read("skills/system-openai-docs/SKILL.md", repoPath);
  assert.match(systemSkill, /name: system-openai-docs/);
  assert.match(await read("skills/documentation-writer/.skill-source.json", repoPath), /"managed": true/);
  assert.equal(
    await fs
      .access(path.join(repoPath, ".agents"))
      .then(() => true)
      .catch(() => false),
    false,
  );
  assert.equal(
    await fs
      .access(path.join(repoPath, "skills-lock.json"))
      .then(() => true)
      .catch(() => false),
    false,
  );
});

test("sync --check is non-destructive and fails on drift", async () => {
  const tempRoot = await createTempDir();
  const repoPath = path.join(tempRoot, "repo");
  const firstPartyRoot = path.join(tempRoot, "first-party");
  const systemRoot = path.join(tempRoot, "system");
  const fakeBin = await createFakeNpx(tempRoot);
  const env = { PATH: `${fakeBin}:${process.env.PATH}` };

  await createSkill(firstPartyRoot, "alpha");
  await createSkill(systemRoot, "beta");
  await runCommand({
    cwd: repoPath,
    env,
    args: ["init", "--repo", repoPath, "--first-party-root", firstPartyRoot, "--system-root", systemRoot],
  });
  await runCommand({ cwd: repoPath, env, args: ["sync", "--repo", repoPath] });

  const before = await read("skills/alpha/SKILL.md", repoPath);
  const okResult = await runCommand({ cwd: repoPath, env, args: ["sync", "--check", "--repo", repoPath] });
  assert.equal(okResult.exitCode, 0);
  assert.equal(await read("skills/alpha/SKILL.md", repoPath), before);

  await fs.writeFile(path.join(repoPath, "skills", "alpha", "SKILL.md"), "drift\n", "utf8");
  const driftResult = await runCommand({ cwd: repoPath, env, args: ["sync", "--check", "--repo", repoPath] });
  assert.equal(driftResult.exitCode, 1);
  assert.match(driftResult.stdout, /file content drift/);
});

test("add updates the manifest and reuses the sync pipeline", async () => {
  const tempRoot = await createTempDir();
  const repoPath = path.join(tempRoot, "repo");
  const firstPartyRoot = path.join(tempRoot, "first-party");
  const systemRoot = path.join(tempRoot, "system");
  const fakeBin = await createFakeNpx(tempRoot);
  const env = { PATH: `${fakeBin}:${process.env.PATH}` };

  await createSkill(firstPartyRoot, "alpha");
  await runCommand({
    cwd: repoPath,
    env,
    args: ["init", "--repo", repoPath, "--first-party-root", firstPartyRoot, "--system-root", systemRoot],
  });

  await createSkill(firstPartyRoot, "beta");
  const result = await runCommand({
    cwd: repoPath,
    env,
    args: ["add", "--repo", repoPath, "beta"],
  });

  assert.equal(result.exitCode, 0);
  assert.match(await read("sources.yaml", repoPath), /- beta/);
  await fs.access(path.join(repoPath, "skills", "beta", "SKILL.md"));
});

test("github_action writes managed workflow and action assets", async () => {
  const tempRoot = await createTempDir();
  const repoPath = path.join(tempRoot, "repo");
  await fs.mkdir(repoPath, { recursive: true });

  const result = await runCommand({
    cwd: repoPath,
    args: ["github_action", "--repo", repoPath, "--kind", "all"],
  });

  assert.equal(result.exitCode, 0);
  assert.match(await read(".github/workflows/skills-sync.yml", repoPath), /Managed by skillsbase CLI/);
  assert.match(
    await read(".github/actions/skillsbase-sync/action.yml", repoPath),
    /node \.\/bin\/skillsbase\.mjs sync --check/,
  );
});

test("sync fails with actionable diagnostics when the manifest is missing", async () => {
  const tempRoot = await createTempDir();
  const repoPath = path.join(tempRoot, "repo");
  await fs.mkdir(repoPath, { recursive: true });

  const result = await runCommand({ cwd: repoPath, args: ["sync", "--repo", repoPath] });
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /Missing `sources\.yaml`/);
});

test("github_action refuses to overwrite unmanaged files without force", async () => {
  const tempRoot = await createTempDir();
  const repoPath = path.join(tempRoot, "repo");
  const workflowPath = path.join(repoPath, ".github", "workflows", "skills-sync.yml");
  await fs.mkdir(path.dirname(workflowPath), { recursive: true });
  await fs.writeFile(workflowPath, "name: custom\n", "utf8");

  const result = await runCommand({
    cwd: repoPath,
    args: ["github_action", "--repo", repoPath, "--kind", "workflow"],
  });

  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /Refusing to overwrite unmanaged file/);
});

test("sync reports missing sources unless allow-missing-sources is enabled", async () => {
  const tempRoot = await createTempDir();
  const repoPath = path.join(tempRoot, "repo");
  const missingFirstParty = path.join(tempRoot, "missing-first-party");
  const missingSystem = path.join(tempRoot, "missing-system");
  const fakeBin = await createFakeNpx(tempRoot);
  const env = { PATH: `${fakeBin}:${process.env.PATH}` };

  await runCommand({
    cwd: repoPath,
    env,
    args: [
      "init",
      "--repo",
      repoPath,
      "--first-party-root",
      missingFirstParty,
      "--system-root",
      missingSystem,
    ],
  });

  await fs.writeFile(
    path.join(repoPath, "sources.yaml"),
    `# Managed by skillsbase CLI.
# Edit source entries to add or remove managed skills.
version: 1
skillsRoot: skills
metadataFile: .skill-source.json
managedBy: skillsbase
remoteRepository: repo
staleCleanup: true
skillsCliVersion: 1.4.8
installAgent: codex
sources:
  - key: first-party
    label: "First-party local skills"
    kind: first-party
    root: ${missingFirstParty}
    targetPrefix: ""
    include:
      - alpha
`,
    "utf8",
  );

  const failing = await runCommand({ cwd: repoPath, env, args: ["sync", "--repo", repoPath] });
  assert.equal(failing.exitCode, 1);
  assert.match(failing.stderr, /Managed source root does not exist/);

  const passing = await runCommand({
    cwd: repoPath,
    env,
    args: ["sync", "--repo", repoPath, "--allow-missing-sources"],
  });
  assert.equal(passing.exitCode, 0);
  assert.match(passing.stdout, /no drift detected|nothing to sync|skipped missing sources/);
});

test("sync fails when installed output is invalid", async () => {
  const tempRoot = await createTempDir();
  const repoPath = path.join(tempRoot, "repo");
  const firstPartyRoot = path.join(tempRoot, "first-party");
  const systemRoot = path.join(tempRoot, "system");
  const fakeBin = await createFakeNpx(tempRoot);
  const env = { PATH: `${fakeBin}:${process.env.PATH}` };

  await createSkill(firstPartyRoot, "broken-skill", { invalidFrontmatter: true });
  await runCommand({
    cwd: repoPath,
    env,
    args: ["init", "--repo", repoPath, "--first-party-root", firstPartyRoot, "--system-root", systemRoot],
  });

  const result = await runCommand({ cwd: repoPath, env, args: ["sync", "--repo", repoPath] });
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /frontmatter/);
});

test("sync surfaces uninstall cleanup failures", async () => {
  const tempRoot = await createTempDir();
  const repoPath = path.join(tempRoot, "repo");
  const firstPartyRoot = path.join(tempRoot, "first-party");
  const systemRoot = path.join(tempRoot, "system");
  const fakeBin = await createFakeNpx(tempRoot);
  const env = {
    PATH: `${fakeBin}:${process.env.PATH}`,
    FAKE_NPX_REMOVE_FAIL: "1",
  };

  await createSkill(firstPartyRoot, "alpha");
  await runCommand({
    cwd: repoPath,
    env,
    args: ["init", "--repo", repoPath, "--first-party-root", firstPartyRoot, "--system-root", systemRoot],
  });

  const result = await runCommand({ cwd: repoPath, env, args: ["sync", "--repo", repoPath] });
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /skills uninstall failed/);
});
