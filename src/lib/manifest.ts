import { promises as fs } from "node:fs";
import path from "node:path";

import {
  DEFAULT_INSTALL_AGENT,
  DEFAULT_MANAGED_BY,
  DEFAULT_METADATA_FILE,
  DEFAULT_SKILLS_CLI_VERSION,
  DEFAULT_SKILLS_ROOT,
} from "./constants.js";
import { pathExists, toPosix } from "./files.js";
import { CliError } from "./output.js";
import type { InstallRecord, Manifest, ManifestEntry, SourceDefinition, SyncMetadata } from "./types.js";

type ManifestScalar = boolean | number | string;
type MutableSource = Partial<SourceDefinition> & Record<string, unknown>;
type MutableManifest = Record<string, unknown> & { sources: MutableSource[] };

interface CreateManifestOptions {
  remoteRepository?: string;
  sources?: SourceDefinition[];
}

interface AddSkillOptions {
  sourceKey?: string;
}

function parseScalar(rawValue: string): ManifestScalar {
  const value = rawValue.trim();
  if (value.length === 0) {
    return "";
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  if (/^-?\d+$/.test(value)) {
    return Number(value);
  }

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function quoteYamlString(value: string): string {
  if (value === "") {
    return '""';
  }

  if (/^[A-Za-z0-9._/@:+-]+$/.test(value)) {
    return value;
  }

  return JSON.stringify(value);
}

function validateSource(source: MutableSource): SourceDefinition {
  const requiredKeys = ["key", "label", "kind", "root", "targetPrefix", "include"];
  for (const key of requiredKeys) {
    if (!(key in source)) {
      throw new CliError(`Source "${source.key ?? "<unknown>"}" is missing key "${key}".`, {
        details: ["Repair `sources.yaml` or rerun `skillsbase init`."],
      });
    }
  }

  if (!Array.isArray(source.include) || source.include.some((value) => typeof value !== "string")) {
    throw new CliError(`Source "${source.key}" must define an include list.`, {
      details: ["Use `include: []` only via the CLI serializer; do not change its type."],
    });
  }

  return {
    key: String(source.key),
    label: String(source.label),
    kind: String(source.kind),
    root: String(source.root),
    targetPrefix: String(source.targetPrefix),
    include: [...source.include],
  };
}

function isRemoteRepositorySource(source: Pick<SourceDefinition, "kind">): boolean {
  return source.kind === "github-repository";
}

function buildSourcePath(source: SourceDefinition, originalName: string): string {
  if (isRemoteRepositorySource(source)) {
    return `${source.root}@${originalName}`;
  }

  return path.join(source.root, originalName);
}

function resolveSourceRoot(repoPath: string, source: SourceDefinition): string {
  if (isRemoteRepositorySource(source) || path.isAbsolute(source.root)) {
    return source.root;
  }

  return path.resolve(repoPath, source.root);
}

function resolveSourcePath(repoPath: string, source: SourceDefinition, originalName: string): string {
  if (isRemoteRepositorySource(source)) {
    return buildSourcePath(source, originalName);
  }

  return path.join(resolveSourceRoot(repoPath, source), originalName);
}

export function createManifest(repoPath: string, options: CreateManifestOptions = {}): Manifest {
  const remoteRepository = options.remoteRepository ?? path.basename(repoPath);

  return {
    version: 1,
    skillsRoot: DEFAULT_SKILLS_ROOT,
    metadataFile: DEFAULT_METADATA_FILE,
    managedBy: DEFAULT_MANAGED_BY,
    remoteRepository,
    staleCleanup: true,
    skillsCliVersion: DEFAULT_SKILLS_CLI_VERSION,
    installAgent: DEFAULT_INSTALL_AGENT,
    sources: options.sources ?? [],
    manifestPath: path.join(repoPath, "sources.yaml"),
    repoPath,
  };
}

export function serialiseManifest(manifest: Manifest): string {
  const lines = [
    "# Managed by skillsbase CLI.",
    "# Edit source entries to add or remove managed skills.",
    `version: ${manifest.version}`,
    `skillsRoot: ${quoteYamlString(manifest.skillsRoot)}`,
    `metadataFile: ${quoteYamlString(manifest.metadataFile)}`,
    `managedBy: ${quoteYamlString(manifest.managedBy)}`,
    `remoteRepository: ${quoteYamlString(manifest.remoteRepository)}`,
    `staleCleanup: ${manifest.staleCleanup ? "true" : "false"}`,
    `skillsCliVersion: ${quoteYamlString(manifest.skillsCliVersion ?? DEFAULT_SKILLS_CLI_VERSION)}`,
    `installAgent: ${quoteYamlString(manifest.installAgent ?? DEFAULT_INSTALL_AGENT)}`,
    "sources:",
  ];

  for (const source of manifest.sources) {
    lines.push(`  - key: ${quoteYamlString(source.key)}`);
    lines.push(`    label: ${quoteYamlString(source.label)}`);
    lines.push(`    kind: ${quoteYamlString(source.kind)}`);
    lines.push(`    root: ${quoteYamlString(source.root)}`);
    lines.push(`    targetPrefix: ${quoteYamlString(source.targetPrefix ?? "")}`);
    lines.push("    include:");

    for (const skillName of source.include ?? []) {
      lines.push(`      - ${quoteYamlString(skillName)}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

export function validateManifest(manifest: MutableManifest): Manifest {
  const requiredKeys = [
    "version",
    "skillsRoot",
    "metadataFile",
    "managedBy",
    "remoteRepository",
    "staleCleanup",
    "sources",
  ];

  for (const key of requiredKeys) {
    if (!(key in manifest)) {
      throw new CliError(`Missing required manifest key: ${key}`, {
        details: ["Run `skillsbase init` to recreate the baseline contract."],
      });
    }
  }

  if (
    !Array.isArray(manifest.sources) ||
    typeof manifest.version !== "number" ||
    typeof manifest.skillsRoot !== "string" ||
    typeof manifest.metadataFile !== "string" ||
    typeof manifest.managedBy !== "string" ||
    typeof manifest.remoteRepository !== "string" ||
    typeof manifest.staleCleanup !== "boolean"
  ) {
    throw new CliError("Manifest `sources` must be a list.", {
      details: ["Repair `sources.yaml` and try again."],
    });
  }

  return {
    version: manifest.version,
    skillsRoot: manifest.skillsRoot,
    metadataFile: manifest.metadataFile,
    managedBy: manifest.managedBy,
    remoteRepository: manifest.remoteRepository,
    staleCleanup: manifest.staleCleanup,
    skillsCliVersion:
      typeof manifest.skillsCliVersion === "string" ? manifest.skillsCliVersion : DEFAULT_SKILLS_CLI_VERSION,
    installAgent: typeof manifest.installAgent === "string" ? manifest.installAgent : DEFAULT_INSTALL_AGENT,
    sources: manifest.sources.map(validateSource),
    manifestPath: typeof manifest.manifestPath === "string" ? manifest.manifestPath : "",
    repoPath: typeof manifest.repoPath === "string" ? manifest.repoPath : "",
    skillsRootPath: typeof manifest.skillsRootPath === "string" ? manifest.skillsRootPath : undefined,
  };
}

export async function loadManifest(repoPath: string): Promise<Manifest> {
  const manifestPath = path.join(repoPath, "sources.yaml");
  if (!(await pathExists(manifestPath))) {
    throw new CliError("Missing `sources.yaml`.", {
      details: [`Repository: ${repoPath}`, "Run `skillsbase init` first, then retry the command."],
    });
  }

  const text = await fs.readFile(manifestPath, "utf8");
  const manifest: MutableManifest = { sources: [] };
  const lines = text.split(/\r?\n/);
  let currentSource: MutableSource | null = null;
  let currentListKey: string | null = null;

  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.replace(/\s+$/, "");
    const lineNumber = index + 1;

    if (line.length === 0 || line.trimStart().startsWith("#")) {
      continue;
    }

    const topLevelMatch = /^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/.exec(line);
    if (topLevelMatch && !line.startsWith(" ")) {
      const [, key, value] = topLevelMatch;
      if (key === "sources") {
        currentSource = null;
        currentListKey = null;
      } else {
        manifest[key] = parseScalar(value);
      }
      continue;
    }

    const sourceStartMatch = /^  - key:\s*(.+)$/.exec(line);
    if (sourceStartMatch) {
      currentSource = { key: String(parseScalar(sourceStartMatch[1])), include: [] };
      manifest.sources.push(currentSource);
      currentListKey = null;
      continue;
    }

    const sourcePropertyMatch = /^    ([A-Za-z][A-Za-z0-9]*):\s*(.*)$/.exec(line);
    if (sourcePropertyMatch && currentSource) {
      const [, key, value] = sourcePropertyMatch;
      if (value.length === 0) {
        currentSource[key] = [];
        currentListKey = key;
      } else {
        currentSource[key] = parseScalar(value);
        currentListKey = null;
      }
      continue;
    }

    const listItemMatch = /^      - (.+)$/.exec(line);
    if (listItemMatch && currentSource && currentListKey) {
      const listValue = currentSource[currentListKey];
      if (!Array.isArray(listValue)) {
        throw new CliError(`Invalid list state for "${currentListKey}" at line ${lineNumber}.`);
      }

      listValue.push(parseScalar(listItemMatch[1]));
      continue;
    }

    throw new CliError(`Unsupported sources.yaml syntax at line ${lineNumber}.`, {
      details: [rawLine],
    });
  }

  const validated = validateManifest(manifest);
  return {
    ...validated,
    manifestPath,
    repoPath,
    skillsRootPath: path.join(repoPath, validated.skillsRoot),
  };
}

export async function saveManifest(manifest: Manifest): Promise<void> {
  const nextText = serialiseManifest(manifest);
  await fs.writeFile(manifest.manifestPath, nextText, "utf8");
}

export function buildManifestEntries(manifest: Manifest, repoPath: string = manifest.repoPath): ManifestEntry[] {
  const entries: ManifestEntry[] = [];

  for (const source of manifest.sources) {
    const resolvedSourceRoot = resolveSourceRoot(repoPath, source);

    for (const originalName of source.include ?? []) {
      const targetName = `${source.targetPrefix ?? ""}${originalName}`;
      entries.push({
        sourceKey: source.key,
        sourceLabel: source.label,
        sourceKind: source.kind,
        remoteSource: isRemoteRepositorySource(source),
        sourceRoot: source.root,
        sourcePath: buildSourcePath(source, originalName),
        resolvedSourceRoot,
        resolvedSourcePath: resolveSourcePath(repoPath, source, originalName),
        originalName,
        targetName,
        targetPath: path.join(repoPath, manifest.skillsRoot, targetName),
        targetPathRelative: toPosix(path.join(manifest.skillsRoot, targetName)),
      });
    }
  }

  const collisions = new Map<string, string[]>();
  for (const entry of entries) {
    const keys = collisions.get(entry.targetName) ?? [];
    keys.push(entry.sourceKey);
    collisions.set(entry.targetName, keys);
  }

  const duplicateTargets = [...collisions.entries()].filter(([, keys]) => keys.length > 1);
  if (duplicateTargets.length > 0) {
    const rendered = duplicateTargets
      .map(([targetName, keys]) => `${targetName} (${keys.join(", ")})`)
      .join(", ");
    throw new CliError(`Manifest target-name collision detected: ${rendered}`, {
      details: ["Adjust `targetPrefix` or `include` entries in `sources.yaml`."],
    });
  }

  return entries.sort((left, right) => left.targetName.localeCompare(right.targetName));
}

export function addSkillToManifest(manifest: Manifest, skillName: string, options: AddSkillOptions = {}): Manifest {
  if (manifest.sources.length === 0) {
    throw new CliError("Manifest does not declare any source blocks.", {
      details: ["Run `skillsbase init` first or add a source block to `sources.yaml`."],
    });
  }

  const selectedSource =
    options.sourceKey == null
      ? manifest.sources[0]
      : manifest.sources.find((source) => source.key === options.sourceKey);

  if (!selectedSource) {
    throw new CliError(`Unknown source key: ${options.sourceKey}`, {
      details: [`Declared sources: ${manifest.sources.map((source) => source.key).join(", ")}`],
    });
  }

  const include = new Set(selectedSource.include ?? []);
  include.add(skillName);
  selectedSource.include = [...include].sort((left, right) => left.localeCompare(right));

  return {
    ...manifest,
    sources: manifest.sources.map((source) =>
      source.key === selectedSource.key ? { ...selectedSource } : { ...source, include: [...source.include] },
    ),
  };
}

export function buildMetadata(manifest: Manifest, entry: ManifestEntry, installRecord: InstallRecord): SyncMetadata {
  return {
    schemaVersion: 1,
    managed: true,
    managedBy: manifest.managedBy,
    sourceKey: entry.sourceKey,
    sourceKind: entry.sourceKind,
    sourceLabel: entry.sourceLabel,
    sourceRoot: entry.sourceRoot,
    sourcePath: entry.sourcePath,
    originalName: entry.originalName,
    targetName: entry.targetName,
    targetPath: entry.targetPathRelative,
    remoteRepository: manifest.remoteRepository,
    installAgent: manifest.installAgent,
    installReference: installRecord.installReference,
    installedMetadata: installRecord.installedMetadata,
    files: [...installRecord.files].sort((left, right) => left.localeCompare(right)),
  };
}
