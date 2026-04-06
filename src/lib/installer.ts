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

  try {
    await execFile(
      "npx",
      buildNpxArgs(manifest, "add", [installReference, "--agent", manifest.installAgent, "--copy", "-y"]),
      {
        cwd: repoPath,
        env: options.env,
        maxBuffer: 16 * 1024 * 1024,
        timeout: 60_000,
      },
    );
  } catch (error) {
    throw new CliError(`skills install failed for ${entry.originalName}.`, {
      details: [renderExecFailure(error)],
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
  manifest: Manifest,
  entry: ManifestEntry,
  installState: InstallState,
  options: InstallOptions = {},
): Promise<void> {
  let removeError: ExecFileFailure | null = null;

  try {
    await execFile("npx", buildNpxArgs(manifest, "remove", [entry.originalName, "-y"]), {
      cwd: repoPath,
      env: options.env,
      maxBuffer: 16 * 1024 * 1024,
      timeout: 60_000,
    });
  } catch (error) {
    removeError = error as ExecFileFailure;
  }

  try {
    await restoreSnapshot(installState.snapshot);
    await removeIfEmptyUpward(path.join(repoPath, ".agents", "skills"), repoPath);
  } catch (restoreError) {
    const restoreMessage = restoreError instanceof Error ? restoreError.message : String(restoreError);
    throw new CliError(`Cleanup failed for ${entry.originalName}.`, {
      details: [restoreMessage, removeError ? renderExecFailure(removeError) : null].filter(
        (value): value is string => Boolean(value),
      ),
    });
  }

  if (removeError) {
    throw new CliError(`skills uninstall failed for ${entry.originalName}.`, {
      details: [renderExecFailure(removeError)],
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
