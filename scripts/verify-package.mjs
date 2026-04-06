#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const repoRoot = path.resolve(process.argv[2] ?? ".");
const packageJsonPath = path.join(repoRoot, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const binPath = packageJson.bin?.skillsbase;
const normalizedBinPath = String(binPath ?? "").replace(/^[.][/\\]/, "");
const distPath = "dist/cli.mjs";

if (!binPath) {
  throw new Error("package.json must define bin.skillsbase before publishing.");
}

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const output = execFileSync(npmCommand, ["pack", "--dry-run", "--json"], {
  cwd: repoRoot,
  encoding: "utf8",
});
const [packSummary] = JSON.parse(output);
const packedFiles = new Set((packSummary?.files ?? []).map((file) => file.path));
const requiredFiles = [
  "README.md",
  normalizedBinPath,
  distPath,
  "templates/workflows/skills-sync.yml",
  "templates/actions/skillsbase-sync/action.yml",
];
const missingFiles = requiredFiles.filter((file) => !packedFiles.has(file));

if (missingFiles.length > 0) {
  throw new Error(`npm pack is missing required publish files: ${missingFiles.join(", ")}`);
}

const forbiddenPrefixes = [
  ".github/",
  "docs/",
  "skills/",
  "src/",
  "tests/",
  "scripts/",
  "sources.yaml",
];
const forbiddenFiles = [...packedFiles].filter((file) =>
  forbiddenPrefixes.some((prefix) => file === prefix || file.startsWith(prefix)),
);

if (forbiddenFiles.length > 0) {
  throw new Error(`npm pack contains repository-only files: ${forbiddenFiles.join(", ")}`);
}

process.stdout.write(
  `Verified ${packSummary.name}@${packSummary.version} with ${packSummary.files.length} packed files.\n`,
);
