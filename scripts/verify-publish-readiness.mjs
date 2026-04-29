#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const MIN_TRUSTED_PUBLISH_NODE_VERSION = "22.14.0";
const MIN_TRUSTED_PUBLISH_NPM_VERSION = "11.5.1";

function getNpmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

export function compareVersions(left, right) {
  const parse = (value) =>
    String(value ?? "")
      .trim()
      .replace(/^v/i, "")
      .split(".")
      .map(part => {
        const numeric = Number.parseInt(part, 10);
        return Number.isFinite(numeric) ? numeric : 0;
      });

  const leftParts = parse(left);
  const rightParts = parse(right);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (diff !== 0) {
      return diff > 0 ? 1 : -1;
    }
  }

  return 0;
}

export function readPackagePublishMetadata(packageJsonPath = "package.json") {
  const resolvedPackageJsonPath = path.resolve(packageJsonPath);
  const packageJson = JSON.parse(fs.readFileSync(resolvedPackageJsonPath, "utf8"));
  const packageName = String(packageJson.name ?? "").trim();
  const registry = String(packageJson.publishConfig?.registry ?? "").trim();
  const access = String(packageJson.publishConfig?.access ?? "").trim();
  const provenance = packageJson.publishConfig?.provenance;

  if (packageName.length === 0) {
    throw new Error(`package.json is missing a publishable name: ${resolvedPackageJsonPath}`);
  }

  if (registry.length === 0) {
    throw new Error(`package.json is missing publishConfig.registry: ${resolvedPackageJsonPath}`);
  }

  if (access !== "public") {
    throw new Error(`publishConfig.access must be public. Received: ${access || "<empty>"}`);
  }

  if (provenance !== true) {
    throw new Error("publishConfig.provenance must be true.");
  }

  return {
    packageJsonPath: resolvedPackageJsonPath,
    packageName,
    registry,
  };
}

export function resolveAuthMode({ env = process.env } = {}) {
  return String(env.NODE_AUTH_TOKEN ?? env.NPM_TOKEN ?? "").trim().length > 0 ? "token" : "trusted-publisher";
}

export function readNpmVersion({ cwd = process.cwd() } = {}) {
  return execFileSync(getNpmCommand(), ["--version"], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export function lookupPublishedPackageVersion({ packageName, registry, cwd = process.cwd() }) {
  try {
    return execFileSync(getNpmCommand(), ["view", packageName, "version", "--registry", registry], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    const stdout = typeof error?.stdout === "string" ? error.stdout : "";
    const stderr = typeof error?.stderr === "string" ? error.stderr : "";
    const output = `${stdout}\n${stderr}`;

    if (/E404|404 Not Found|is not in this registry/i.test(output)) {
      return undefined;
    }

    throw error;
  }
}

export function verifyTrustedPublishingToolchain({
  nodeVersion = process.versions.node,
  npmVersion = readNpmVersion(),
} = {}) {
  if (compareVersions(nodeVersion, MIN_TRUSTED_PUBLISH_NODE_VERSION) < 0) {
    throw new Error(
      `Trusted publishing requires Node ${MIN_TRUSTED_PUBLISH_NODE_VERSION}+ but found ${nodeVersion}.`,
    );
  }

  if (compareVersions(npmVersion, MIN_TRUSTED_PUBLISH_NPM_VERSION) < 0) {
    throw new Error(`Trusted publishing requires npm ${MIN_TRUSTED_PUBLISH_NPM_VERSION}+ but found ${npmVersion}.`);
  }

  return { nodeVersion, npmVersion };
}

export function verifyPublishReadiness({
  packageJsonPath = "package.json",
  env = process.env,
  nodeVersion = process.versions.node,
  npmVersion = readNpmVersion(),
  lookupPublishedVersion = lookupPublishedPackageVersion,
} = {}) {
  const metadata = readPackagePublishMetadata(packageJsonPath);
  const authMode = resolveAuthMode({ env });
  const publishedVersion = lookupPublishedVersion({
    packageName: metadata.packageName,
    registry: metadata.registry,
    cwd: path.dirname(metadata.packageJsonPath),
  });
  const warnings = [];

  if (authMode === "trusted-publisher") {
    verifyTrustedPublishingToolchain({ nodeVersion, npmVersion });
    warnings.push(
      [
        `Trusted publishing selected for ${metadata.packageName}.`,
        `Ensure npm package settings trust GitHub repository ${env.GITHUB_REPOSITORY ?? "<owner/repo>"}.`,
      ].join(" "),
    );
  }

  if (!publishedVersion && authMode === "trusted-publisher") {
    warnings.push(
      [
        `Package ${metadata.packageName} is not visible in ${metadata.registry}.`,
        "This can be normal before the first successful publish.",
        "Confirm the npm scope exists, the publishing identity can create or update the package, and the trusted publisher entry points to workflow filename npm-publish.yml.",
      ].join(" "),
    );
  }

  return {
    ...metadata,
    authMode,
    nodeVersion,
    npmVersion,
    publishedVersion,
    warnings,
  };
}

async function main() {
  const result = verifyPublishReadiness();
  process.stdout.write(
    [
      `Publish readiness verified for ${result.packageName}.`,
      `Auth mode: ${result.authMode}.`,
      `Registry: ${result.registry}.`,
      `Published version: ${result.publishedVersion ?? "none"}.`,
      ...result.warnings,
    ].join("\n") + "\n",
  );
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : undefined;

if (entryPath === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
