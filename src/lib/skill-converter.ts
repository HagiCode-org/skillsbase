import { promises as fs } from "node:fs";
import path from "node:path";

import { DEFAULT_METADATA_FILE } from "./constants.js";
import { collectRelativeFiles } from "./files.js";
import { CliError } from "./output.js";
import type { ConvertedSkill, InstalledMetadata, InstallState, Manifest, ManifestEntry } from "./types.js";

function rewriteSkillName(content: string, targetName: string): string {
  const frontmatterMatch = /^---\n([\s\S]*?)\n---/.exec(content);
  if (!frontmatterMatch) {
    throw new CliError("Installed SKILL.md is missing YAML frontmatter.", {
      details: ["The upstream skill must contain a valid `name` field."],
    });
  }

  if (!/^name:\s*.+$/m.test(frontmatterMatch[1])) {
    throw new CliError("Installed SKILL.md frontmatter is missing a `name` field.");
  }

  const updatedFrontmatter = frontmatterMatch[1].replace(/^name:\s*.+$/m, `name: ${targetName}`);
  return content.replace(frontmatterMatch[0], `---\n${updatedFrontmatter}\n---`);
}

export async function convertInstalledSkill(
  _manifest: Manifest,
  entry: ManifestEntry,
  installState: InstallState,
): Promise<ConvertedSkill> {
  const installedPath = installState.installPath;
  const skillPath = path.join(installedPath, "SKILL.md");

  try {
    await fs.access(skillPath);
  } catch {
    throw new CliError(`Installed skill is missing SKILL.md: ${entry.originalName}`);
  }

  const filePaths = await collectRelativeFiles(installedPath);
  const outputTree = new Map<string, Buffer>();

  for (const relativePath of filePaths) {
    if (relativePath === "hagicode-skill.json" || relativePath === DEFAULT_METADATA_FILE) {
      continue;
    }

    const absolutePath = path.join(installedPath, relativePath);
    if (relativePath === "SKILL.md") {
      const content = await fs.readFile(absolutePath, "utf8");
      outputTree.set(relativePath, Buffer.from(rewriteSkillName(content, entry.targetName), "utf8"));
      continue;
    }

    outputTree.set(relativePath, await fs.readFile(absolutePath));
  }

  const installedMetadataPath = path.join(installedPath, "hagicode-skill.json");
  let installedMetadata: InstalledMetadata;
  try {
    installedMetadata = JSON.parse(await fs.readFile(installedMetadataPath, "utf8")) as InstalledMetadata;
  } catch {
    installedMetadata = {
      schemaVersion: 1,
      source: entry.sourceRoot,
      skillSlug: entry.originalName,
      installReference: installState.installReference,
      synthesizedBy: "skillsbase",
    };
  }

  return {
    files: [...outputTree.keys()].sort((left, right) => left.localeCompare(right)),
    outputTree,
    installedMetadata,
    installReference: installState.installReference,
    targetName: entry.targetName,
    targetPath: entry.targetPath,
    targetPathRelative: entry.targetPathRelative,
  };
}
