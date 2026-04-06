#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const SEMVER_PATTERN =
  /^(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export function parseBaseVersion(version) {
  const normalizedVersion = String(version ?? "").trim();
  const match = normalizedVersion.match(SEMVER_PATTERN);

  if (!match?.groups) {
    throw new Error(`package.json version must be valid semver. Received: ${version}`);
  }

  return `${match.groups.major}.${match.groups.minor}.${match.groups.patch}`;
}

export function readPackageVersion(packageJsonPath = "package.json") {
  const resolvedPackageJsonPath = path.resolve(packageJsonPath);
  const packageJson = JSON.parse(fs.readFileSync(resolvedPackageJsonPath, "utf8"));

  if (typeof packageJson.version !== "string" || packageJson.version.length === 0) {
    throw new Error(`package.json is missing a usable version field: ${resolvedPackageJsonPath}`);
  }

  return packageJson.version;
}

export function resolveDevelopmentVersion({
  packageVersion = readPackageVersion(),
  runNumber = process.env.GITHUB_RUN_NUMBER ?? "0",
  runAttempt = process.env.GITHUB_RUN_ATTEMPT ?? "1",
  sha = process.env.GITHUB_SHA ?? "local",
} = {}) {
  const baseVersion = parseBaseVersion(packageVersion);
  const normalizedRunNumber = String(runNumber).trim();
  const normalizedRunAttempt = String(runAttempt).trim();
  const normalizedSha = String(sha).trim().toLowerCase().replace(/[^0-9a-z]+/g, "").slice(0, 7);

  if (!/^\d+$/.test(normalizedRunNumber)) {
    throw new Error(`GITHUB_RUN_NUMBER must be numeric. Received: ${runNumber}`);
  }

  if (!/^\d+$/.test(normalizedRunAttempt)) {
    throw new Error(`GITHUB_RUN_ATTEMPT must be numeric. Received: ${runAttempt}`);
  }

  if (normalizedSha.length === 0) {
    throw new Error(`GITHUB_SHA must contain at least one alphanumeric character. Received: ${sha}`);
  }

  return `${baseVersion}-dev.${normalizedRunNumber}.${normalizedRunAttempt}.${normalizedSha}`;
}

async function main() {
  const version = resolveDevelopmentVersion({
    packageVersion: process.argv[2] ?? readPackageVersion(process.argv[3]),
  });

  process.stdout.write(version);
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : undefined;

if (entryPath === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
