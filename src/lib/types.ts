export interface OutputWriter {
  write(chunk: string): unknown;
}

export interface IoStreams {
  stdout: OutputWriter;
  stderr: OutputWriter;
}

export type ParsedFlagValue = boolean | string;
export type ParsedFlags = Record<string, ParsedFlagValue>;

export interface ParsedArgv {
  command: string | null;
  args: string[];
  flags: ParsedFlags;
  help: boolean;
  version: boolean;
}

export interface CommandContext {
  cwd: string;
  env: NodeJS.ProcessEnv;
  io: IoStreams;
  command: string;
  args: string[];
  flags: ParsedFlags;
  rawArgv: string[];
}

export interface CommandResult {
  command: string;
  title?: string;
  repository: string;
  exitCode?: number;
  schema?: string;
  items?: string[];
  nextSteps?: string[];
}

export interface CliErrorOptions {
  exitCode?: number;
  details?: string[];
  nextSteps?: string[];
}

export interface SourceDefinition {
  key: string;
  label: string;
  kind: string;
  root: string;
  targetPrefix: string;
  include: string[];
}

export interface Manifest {
  version: number;
  skillsRoot: string;
  metadataFile: string;
  managedBy: string;
  remoteRepository: string;
  staleCleanup: boolean;
  skillsCliVersion: string;
  installAgent: string;
  sources: SourceDefinition[];
  manifestPath: string;
  repoPath: string;
  skillsRootPath?: string;
}

export interface ManifestEntry {
  sourceKey: string;
  sourceLabel: string;
  sourceKind: string;
  remoteSource: boolean;
  sourceRoot: string;
  sourcePath: string;
  resolvedSourceRoot: string;
  resolvedSourcePath: string;
  originalName: string;
  targetName: string;
  targetPath: string;
  targetPathRelative: string;
}

export interface InstallSnapshot {
  installPath: string;
  lockPath: string;
  installTree: Map<string, Buffer> | null;
  lockText: string | null;
  installReference: string;
}

export interface InstallState {
  installPath: string;
  lockPath: string;
  installReference: string;
  snapshot: InstallSnapshot;
}

export interface InstalledMetadata {
  [key: string]: unknown;
}

export interface InstallRecord {
  installReference: string;
  installedMetadata: InstalledMetadata;
  files: string[];
}

export interface SyncMetadata extends InstallRecord {
  schemaVersion: number;
  managed: boolean;
  managedBy: string;
  sourceKey: string;
  sourceKind: string;
  sourceLabel: string;
  sourceRoot: string;
  sourcePath: string;
  originalName: string;
  targetName: string;
  targetPath: string;
  remoteRepository: string;
  installAgent: string;
}

export interface ConvertedSkill extends InstallRecord {
  outputTree: Map<string, Buffer>;
  targetName: string;
  targetPath: string;
  targetPathRelative: string;
}

export type GithubActionKind = "workflow" | "action" | "all";
