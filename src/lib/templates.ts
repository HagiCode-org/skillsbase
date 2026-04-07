import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_NODE_VERSION, MANAGED_SIGNATURE } from "./constants.js";
import { pathExists } from "./files.js";
import { CliError } from "./output.js";
import type { CommandResult, GithubActionKind } from "./types.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const templateRootCandidates = [
  path.resolve(moduleDir, "..", "..", "templates"),
  path.resolve(moduleDir, "..", "templates"),
];

interface WriteManagedFileOptions {
  force?: boolean;
}

interface ManagedFileWriteStatus {
  status: "created" | "updated" | "unchanged";
  path: string;
}

interface WriteGithubActionsOptions extends WriteManagedFileOptions {
  kind?: GithubActionKind;
}

interface GithubActionTemplateTarget {
  relativePath: string;
  template: string;
}

async function resolveTemplateRoot(): Promise<string> {
  for (const candidate of templateRootCandidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  throw new CliError("Unable to locate the bundled templates directory.");
}

export async function renderTemplate(relativePath: string, variables: Record<string, string>): Promise<string> {
  const templateRoot = await resolveTemplateRoot();
  const templatePath = path.join(templateRoot, relativePath);
  let content = await fs.readFile(templatePath, "utf8");

  for (const [key, value] of Object.entries(variables)) {
    content = content.replaceAll(`{{${key}}}`, value);
  }

  return content;
}

function managedMarkerFor(targetPath: string): string {
  if (targetPath.endsWith(".md")) {
    return `<!-- ${MANAGED_SIGNATURE}. -->`;
  }

  return `# ${MANAGED_SIGNATURE}.`;
}

function isManagedContent(targetPath: string, content: string): boolean {
  return content.includes(managedMarkerFor(targetPath));
}

export async function writeManagedFile(
  targetPath: string,
  content: string,
  options: WriteManagedFileOptions = {},
): Promise<ManagedFileWriteStatus> {
  const marker = managedMarkerFor(targetPath);
  if (!content.includes(marker)) {
    throw new CliError(`Managed template is missing its marker: ${targetPath}`);
  }

  const current = (await pathExists(targetPath)) ? await fs.readFile(targetPath, "utf8") : null;
  if (current === content) {
    return { status: "unchanged", path: targetPath };
  }

  if (current != null && !isManagedContent(targetPath, current) && !options.force) {
    throw new CliError(`Refusing to overwrite unmanaged file: ${targetPath}`, {
      details: ["Use `--force` to replace the conflicting file."],
    });
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, content, "utf8");
  return {
    status: current == null ? "created" : "updated",
    path: targetPath,
  };
}

export async function writeGithubActions(
  repoPath: string,
  options: WriteGithubActionsOptions = {},
): Promise<CommandResult> {
  const kind = options.kind ?? "workflow";
  const variables = {
    NODE_VERSION: DEFAULT_NODE_VERSION,
  };

  const targets: GithubActionTemplateTarget[] = [];
  if (kind === "workflow" || kind === "all") {
    targets.push(
      {
        relativePath: path.join(".github", "workflows", "skills-sync.yml"),
        template: path.join("workflows", "skills-sync.yml"),
      },
      {
        relativePath: path.join(".github", "workflows", "skills-manage.yml"),
        template: path.join("workflows", "skills-manage.yml"),
      },
    );
  }

  if (kind === "workflow" || kind === "action" || kind === "all") {
    targets.push(
      {
        relativePath: path.join(".github", "actions", "skillsbase-sync", "action.yml"),
        template: path.join("actions", "skillsbase-sync", "action.yml"),
      },
      {
        relativePath: path.join(".github", "actions", "skillsbase-manage", "action.yml"),
        template: path.join("actions", "skillsbase-manage", "action.yml"),
      },
    );
  }

  if (targets.length === 0) {
    throw new CliError(`Unsupported github_action kind: ${kind}`, {
      details: ["Supported values: workflow, action, all."],
    });
  }

  const items: string[] = [];
  for (const target of targets) {
    const content = await renderTemplate(target.template, variables);
    const status = await writeManagedFile(path.join(repoPath, target.relativePath), content, {
      force: Boolean(options.force),
    });
    items.push(`${status.status}: ${target.relativePath}`);
  }

  return {
    command: "github_action",
    title: `skillsbase github_action --kind ${kind}`,
    repository: repoPath,
    exitCode: 0,
    items,
    nextSteps: [],
  };
}
