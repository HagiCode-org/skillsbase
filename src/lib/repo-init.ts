import os from "node:os";
import path from "node:path";

import { ensureDirectory, listDirectories, pathExists } from "./files.js";
import { createManifest, saveManifest } from "./manifest.js";
import { renderTemplate, writeGithubActions, writeManagedFile } from "./templates.js";
import type { CommandResult, SourceDefinition } from "./types.js";

interface InitOptions {
  firstPartyRoot?: string;
  systemRoot?: string;
  remoteRepository?: string;
  force?: boolean;
}

function defaultRoots(options: InitOptions = {}): { firstPartyRoot: string; systemRoot: string } {
  const home = os.homedir();
  return {
    firstPartyRoot: path.resolve(options.firstPartyRoot ?? path.join(home, ".agents", "skills")),
    systemRoot: path.resolve(options.systemRoot ?? path.join(home, ".codex", "skills", ".system")),
  };
}

async function createDefaultSource(
  key: string,
  label: string,
  kind: string,
  root: string,
  targetPrefix: string,
): Promise<SourceDefinition> {
  const include = (await pathExists(root)) ? await listDirectories(root) : [];
  return {
    key,
    label,
    kind,
    root,
    targetPrefix,
    include,
  };
}

export async function initialiseRepository(repoPath: string, options: InitOptions = {}): Promise<CommandResult> {
  await ensureDirectory(repoPath);

  const roots = defaultRoots(options);
  const manifestPath = path.join(repoPath, "sources.yaml");
  const createdItems: string[] = [];
  const preservedItems: string[] = [];

  if (!(await pathExists(manifestPath))) {
    const sources = [
      await createDefaultSource("first-party", "First-party local skills", "first-party", roots.firstPartyRoot, ""),
      await createDefaultSource("system", "Mirrored system skills", "mirrored-system", roots.systemRoot, "system-"),
    ];

    const manifest = createManifest(repoPath, {
      remoteRepository: options.remoteRepository ?? path.basename(repoPath),
      sources,
    });
    await saveManifest(manifest);
    createdItems.push("sources.yaml");
  } else {
    preservedItems.push("sources.yaml");
  }

  await ensureDirectory(path.join(repoPath, "skills"));
  await ensureDirectory(path.join(repoPath, "docs"));
  await ensureDirectory(path.join(repoPath, ".github", "actions", "skillsbase-sync"));
  await ensureDirectory(path.join(repoPath, ".github", "workflows"));

  const writeStatuses: string[] = [];
  for (const file of [
    {
      relativePath: path.join("skills", "README.md"),
      template: "skills/README.md",
      variables: {},
    },
    {
      relativePath: path.join("docs", "maintainer-workflow.md"),
      template: "docs/maintainer-workflow.md",
      variables: {},
    },
  ]) {
    const content = await renderTemplate(file.template, file.variables);
    const status = await writeManagedFile(path.join(repoPath, file.relativePath), content, {
      force: Boolean(options.force),
    });
    writeStatuses.push(`${status.status}: ${file.relativePath}`);
  }

  const actionResult = await writeGithubActions(repoPath, {
    kind: "all",
    force: Boolean(options.force),
  });

  return {
    command: "init",
    title: "skillsbase init",
    repository: repoPath,
    exitCode: 0,
    schema: "spec-driven",
    items: [
      ...createdItems.map((item) => `created: ${item}`),
      ...preservedItems.map((item) => `preserved: ${item}`),
      ...writeStatuses,
      ...(actionResult.items ?? []),
    ],
    nextSteps: ["skillsbase sync"],
  };
}
