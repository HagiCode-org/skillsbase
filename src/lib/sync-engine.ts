import { promises as fs } from "node:fs";
import path from "node:path";

import { buildManifestEntries, buildMetadata } from "./manifest.js";
import {
  collectRelativeFiles,
  ensureDirectory,
  listDirectories,
  pathExists,
  readTree,
  stableJson,
  writeTree,
} from "./files.js";
import { cleanupInstalledSkill, installIntoCurrentRepository } from "./installer.js";
import { CliError } from "./output.js";
import { convertInstalledSkill } from "./skill-converter.js";
import type { CommandResult, Manifest, ManifestEntry, SyncMetadata } from "./types.js";

type DirectorySnapshot = { path: string; tree: Map<string, Buffer> };

interface ExecuteSyncOptions {
  repoPath: string;
  manifest: Manifest;
  check: boolean;
  allowMissingSources: boolean;
  env: NodeJS.ProcessEnv;
}

async function assertSourceState(
  entry: ManifestEntry,
  allowMissingSources: boolean,
): Promise<{ skip: false } | { skip: true; reason: string }> {
  if (entry.remoteSource) {
    return { skip: false };
  }

  const sourceRootExists = await pathExists(entry.resolvedSourceRoot);
  if (!sourceRootExists) {
    if (allowMissingSources) {
      return { skip: true, reason: `missing source root: ${entry.resolvedSourceRoot}` };
    }

    throw new CliError(`Managed source root does not exist: ${entry.resolvedSourceRoot}`, {
      details: ["Use `skillsbase sync --allow-missing-sources` to skip missing roots."],
    });
  }

  if (!(await pathExists(entry.resolvedSourcePath))) {
    throw new CliError(`Managed skill is missing from source root: ${entry.resolvedSourcePath}`, {
      details: [`source: ${entry.sourceKey}`, `skill: ${entry.originalName}`],
    });
  }

  return { skip: false };
}

async function assertManagedTargetWritable(manifest: Manifest, entry: ManifestEntry): Promise<void> {
  if (!(await pathExists(entry.targetPath))) {
    return;
  }

  const metadataPath = path.join(entry.targetPath, manifest.metadataFile);
  if (!(await pathExists(metadataPath))) {
    throw new CliError(`Refusing to overwrite unmanaged directory: ${entry.targetPathRelative}`, {
      details: ["Add metadata manually or remove the conflicting directory first."],
    });
  }

  const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8")) as {
    managed?: boolean;
    managedBy?: string;
  };
  if (!metadata.managed || metadata.managedBy !== manifest.managedBy) {
    throw new CliError(`Refusing to overwrite unmanaged directory: ${entry.targetPathRelative}`, {
      details: [`Found metadata managedBy=${JSON.stringify(metadata.managedBy)}`],
    });
  }
}

async function snapshotTargetDirectory(targetPath: string): Promise<DirectorySnapshot | null> {
  if (!(await pathExists(targetPath))) {
    return null;
  }

  return {
    path: targetPath,
    tree: await readTree(targetPath),
  };
}

async function restoreTargetDirectory(snapshot: DirectorySnapshot | null): Promise<void> {
  if (snapshot == null) {
    return;
  }

  await writeTree(snapshot.path, snapshot.tree);
}

async function compareTarget(
  manifest: Manifest,
  entry: ManifestEntry,
  desiredTree: Map<string, Buffer>,
  desiredMetadata: SyncMetadata,
): Promise<string[]> {
  if (!(await pathExists(entry.targetPath))) {
    return [`missing target directory: ${entry.targetPathRelative}`];
  }

  const actualFiles = (await collectRelativeFiles(entry.targetPath)).sort((left, right) => left.localeCompare(right));
  const desiredFiles = [...desiredTree.keys(), manifest.metadataFile].sort((left, right) => left.localeCompare(right));

  if (JSON.stringify(actualFiles) !== JSON.stringify(desiredFiles)) {
    return [`file set drift: ${entry.targetPathRelative}`];
  }

  const actualTree = await readTree(entry.targetPath);
  for (const [relativePath, buffer] of desiredTree.entries()) {
    const actual = actualTree.get(relativePath);
    if (!actual || !actual.equals(buffer)) {
      return [`file content drift: ${entry.targetPathRelative}/${relativePath}`];
    }
  }

  const metadataPath = path.join(entry.targetPath, manifest.metadataFile);
  const actualMetadata = await fs.readFile(metadataPath, "utf8");
  if (actualMetadata !== stableJson(desiredMetadata)) {
    return [`metadata drift: ${entry.targetPathRelative}/${manifest.metadataFile}`];
  }

  return [];
}

async function reconcileStaleTargets(
  repoPath: string,
  manifest: Manifest,
  declaredTargets: Set<string>,
  check: boolean,
): Promise<string[]> {
  const changes: string[] = [];
  const skillsRootPath = path.join(repoPath, manifest.skillsRoot);
  const existingDirectories = await listDirectories(skillsRootPath);

  for (const directoryName of existingDirectories) {
    if (declaredTargets.has(directoryName)) {
      continue;
    }

    const candidatePath = path.join(skillsRootPath, directoryName);
    const metadataPath = path.join(candidatePath, manifest.metadataFile);
    if (!(await pathExists(metadataPath))) {
      continue;
    }

    const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8")) as {
      managed?: boolean;
      managedBy?: string;
    };
    if (!metadata.managed || metadata.managedBy !== manifest.managedBy) {
      continue;
    }

    if (check) {
      changes.push(`stale managed directory: ${path.posix.join(manifest.skillsRoot, directoryName)}`);
      continue;
    }

    await fs.rm(candidatePath, { recursive: true, force: true });
    changes.push(`removed stale: ${path.posix.join(manifest.skillsRoot, directoryName)}`);
  }

  return changes;
}

export async function executeSync(options: ExecuteSyncOptions): Promise<CommandResult> {
  const { repoPath, manifest, check, allowMissingSources, env } = options;
  const entries = buildManifestEntries(manifest, repoPath);
  const items: string[] = [];
  const skipped: string[] = [];
  const declaredTargets = new Set(entries.map((entry) => entry.targetName));
  const preparedEntries: Array<{
    entry: ManifestEntry;
    converted: Awaited<ReturnType<typeof convertInstalledSkill>>;
    metadata: SyncMetadata;
  }> = [];
  const checkSnapshots = new Map<string, DirectorySnapshot | null>();

  await ensureDirectory(path.join(repoPath, manifest.skillsRoot));

  if (check) {
    for (const entry of entries) {
      checkSnapshots.set(entry.targetPath, await snapshotTargetDirectory(entry.targetPath));
    }
  }

  for (const entry of entries) {
    const sourceState = await assertSourceState(entry, allowMissingSources);
    if (sourceState.skip) {
      skipped.push(`${entry.sourceKey}: ${entry.originalName}`);
      continue;
    }

    const installState = await installIntoCurrentRepository(repoPath, manifest, entry, { env });

    try {
      const converted = await convertInstalledSkill(manifest, entry, installState);
      const metadata = buildMetadata(manifest, entry, {
        installReference: converted.installReference,
        installedMetadata: converted.installedMetadata,
        files: converted.files,
      });
      preparedEntries.push({
        entry,
        converted,
        metadata,
      });
    } finally {
      await cleanupInstalledSkill(repoPath, manifest, entry, installState, { env });
    }
  }

  if (check) {
    for (const prepared of preparedEntries) {
      await restoreTargetDirectory(checkSnapshots.get(prepared.entry.targetPath) ?? null);

      items.push(
        ...(await compareTarget(
          manifest,
          prepared.entry,
          prepared.converted.outputTree,
          prepared.metadata,
        )),
      );
    }
  } else {
    for (const prepared of preparedEntries) {
      await assertManagedTargetWritable(manifest, prepared.entry);
      const nextTree = new Map(prepared.converted.outputTree);
      nextTree.set(manifest.metadataFile, Buffer.from(stableJson(prepared.metadata), "utf8"));
      await writeTree(prepared.entry.targetPath, nextTree);
      items.push(`synced: ${prepared.entry.targetPathRelative}`);
    }
  }

  items.push(...(await reconcileStaleTargets(repoPath, manifest, declaredTargets, check)));

  if (skipped.length > 0) {
    items.push(`skipped missing sources: ${skipped.join(", ")}`);
  }

  const driftDetected = check && items.some((item) => !item.startsWith("skipped "));
  return {
    command: "sync",
    title: check ? "skillsbase sync --check" : "skillsbase sync",
    repository: repoPath,
    exitCode: driftDetected ? 1 : 0,
    schema: "spec-driven",
    items: items.length > 0 ? items : [check ? "no drift detected" : "nothing to sync"],
    nextSteps: driftDetected ? ["skillsbase sync"] : [],
  };
}
