import { promises as fs } from "node:fs";
import { execFile as execFileCallback } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { pathExists, readFileIfExists, removeIfEmptyUpward } from "./files.js";
import { CliError } from "./output.js";
import type {
  InstallRecord,
  InstalledMetadata,
  InstallSnapshot,
  InstallState,
  Manifest,
  ManifestEntry,
} from "./types.js";

const execFile = promisify(execFileCallback);

type ExecFileFailure = Error & { stderr?: string; stdout?: string };

interface InstallOptions {
  env?: NodeJS.ProcessEnv;
}

const INSTALL_TIMEOUT_MS = 180_000;
const REMOTE_INSTALL_RETRIES = 3;
const NPM_ENV_KEYS_TO_UNSET = [
  "INIT_CWD",
  "npm_command",
  "npm_config_local_prefix",
  "npm_config_prefix",
  "npm_execpath",
  "npm_lifecycle_event",
  "npm_lifecycle_script",
  "npm_package_json",
  "npm_prefix",
];

function toInstallReference(entry: ManifestEntry): string {
  if (entry.remoteSource) {
    return entry.sourcePath;
  }

  if (path.isAbsolute(entry.sourcePath) || entry.sourcePath.startsWith(`.${path.sep}`) || entry.sourcePath === ".") {
    return entry.sourcePath;
  }

  return `.${path.sep}${entry.sourcePath}`;
}

function buildNpxArgs(manifest: Manifest, subcommand: string, extraArgs: string[]): string[] {
  return ["--yes", `skills@${manifest.skillsCliVersion}`, subcommand, ...extraArgs];
}

function renderExecFailure(error: unknown): string {
  if (error instanceof Error) {
    const execError = error as ExecFileFailure;
    return execError.stderr ?? execError.stdout ?? execError.message;
  }

  return String(error);
}

async function execSkillsAdd(
  repoPath: string,
  manifest: Manifest,
  installReference: string,
  options: InstallOptions,
): Promise<void> {
  const childEnv = { ...(options.env ?? process.env) };
  for (const key of NPM_ENV_KEYS_TO_UNSET) {
    delete childEnv[key];
  }
  childEnv.INIT_CWD = repoPath;

  await execFile(
    "npx",
    buildNpxArgs(manifest, "add", [installReference, "--agent", manifest.installAgent, "--copy", "-y"]),
      {
        cwd: repoPath,
        env: childEnv,
        maxBuffer: 16 * 1024 * 1024,
        timeout: INSTALL_TIMEOUT_MS,
      },
    );
}

export async function installIntoCurrentRepository(
  repoPath: string,
  manifest: Manifest,
  entry: ManifestEntry,
  options: InstallOptions = {},
): Promise<InstallState> {
  const installReference = toInstallReference(entry);
  const installPath = path.join(repoPath, ".agents", "skills", entry.originalName);
  const lockPath = path.join(repoPath, "skills-lock.json");
  const snapshot: InstallSnapshot = {
    installPath,
    lockPath,
    installTree: await snapshotTree(installPath),
    lockText: await readFileIfExists(lockPath),
    installReference,
  };

  const attempts = entry.remoteSource ? REMOTE_INSTALL_RETRIES : 1;
  const failures: string[] = [];

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await execSkillsAdd(repoPath, manifest, installReference, options);
      failures.length = 0;
      break;
    } catch (error) {
      failures.push(`attempt ${attempt}/${attempts}: ${renderExecFailure(error)}`);

      await restoreSnapshot(snapshot);

      if (attempt === attempts) {
        break;
      }
    }
  }

  if (failures.length > 0) {
    throw new CliError(`skills install failed for ${entry.originalName}.`, {
      details: failures,
    });
  }

  if (!(await pathExists(installPath))) {
    throw new CliError(`skills install did not create ${path.relative(repoPath, installPath)}.`, {
      details: ["The `npx skills` install output was not in the expected current-repository shape."],
    });
  }

  return {
    installPath,
    lockPath,
    installReference,
    snapshot,
  };
}

export async function cleanupInstalledSkill(
  repoPath: string,
  _manifest: Manifest,
  entry: ManifestEntry,
  installState: InstallState,
  _options: InstallOptions = {},
): Promise<void> {
  try {
    await restoreSnapshot(installState.snapshot);
    await removeIfEmptyUpward(path.join(repoPath, ".agents", "skills"), repoPath);
  } catch (restoreError) {
    const restoreMessage = restoreError instanceof Error ? restoreError.message : String(restoreError);
    throw new CliError(`Cleanup failed for ${entry.originalName}.`, {
      details: [restoreMessage],
    });
  }
}

async function snapshotTree(rootPath: string): Promise<Map<string, Buffer> | null> {
  if (!(await pathExists(rootPath))) {
    return null;
  }

  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  const tree = new Map<string, Buffer>();

  for (const entry of entries) {
    const absolutePath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      const nested = await snapshotTree(absolutePath);
      if (!nested) {
        continue;
      }

      for (const [relativePath, content] of nested.entries()) {
        tree.set(path.join(entry.name, relativePath), content);
      }
      continue;
    }

    if (entry.isFile()) {
      tree.set(entry.name, await fs.readFile(absolutePath));
    }
  }

  return tree;
}

async function restoreSnapshot(snapshot: InstallSnapshot): Promise<void> {
  if (snapshot.installTree == null) {
    await fs.rm(snapshot.installPath, { recursive: true, force: true });
  } else {
    await fs.rm(snapshot.installPath, { recursive: true, force: true });
    await fs.mkdir(snapshot.installPath, { recursive: true });

    for (const [relativePath, content] of snapshot.installTree.entries()) {
      const targetPath = path.join(snapshot.installPath, relativePath);
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, content);
    }
  }

  if (snapshot.lockText == null) {
    await fs.rm(snapshot.lockPath, { force: true });
  } else {
    await fs.writeFile(snapshot.lockPath, snapshot.lockText, "utf8");
  }

  await removeIfEmptyUpward(path.dirname(snapshot.installPath), path.dirname(snapshot.lockPath));
}

export function createInstalledMetadata(
  _entry: ManifestEntry,
  installState: InstallState,
  installedMetadata: InstalledMetadata,
  files: string[],
): InstallRecord {
  return {
    installReference: installState.installReference,
    installedMetadata,
    files,
  };
}
