#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseBaseVersion, readPackageVersion } from "./resolve-dev-version.mjs";

export const STABLE_TAG_PATTERN = /^v(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)$/;

export function parseStableTag(tagName) {
  const match = String(tagName ?? "").match(STABLE_TAG_PATTERN);

  if (!match?.groups) {
    throw new Error(`Release tags must use the stable vX.Y.Z format. Received: ${tagName}`);
  }

  return `${match.groups.major}.${match.groups.minor}.${match.groups.patch}`;
}

export function readReleaseTagFromEvent(eventPath = process.env.GITHUB_EVENT_PATH) {
  if (!eventPath || !fs.existsSync(eventPath)) {
    return undefined;
  }

  try {
    const eventPayload = JSON.parse(fs.readFileSync(eventPath, "utf8"));
    return eventPayload?.release?.tag_name;
  } catch {
    return undefined;
  }
}

export function resolveReleaseTag({
  cliTag = process.argv[2],
  env = process.env,
  eventPath = env.GITHUB_EVENT_PATH,
} = {}) {
  return cliTag ?? env.RELEASE_TAG_NAME ?? env.GITHUB_REF_NAME ?? readReleaseTagFromEvent(eventPath);
}

export function verifyReleaseVersion({
  tagName = resolveReleaseTag(),
  packageJsonPath = process.argv[3] ?? "package.json",
} = {}) {
  if (!tagName) {
    throw new Error("Missing release tag. Pass a tag name or set GITHUB_REF_NAME.");
  }

  const expectedVersion = parseStableTag(tagName);
  const resolvedPackageJsonPath = path.resolve(packageJsonPath);
  const packageVersion = readPackageVersion(resolvedPackageJsonPath);
  const packageBaseVersion = parseBaseVersion(packageVersion);

  return {
    packageJsonPath: resolvedPackageJsonPath,
    packageVersion,
    packageBaseVersion,
    tagName,
    version: expectedVersion,
  };
}

async function main() {
  const { version } = verifyReleaseVersion();
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
