import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  compareVersions,
  resolveAuthMode,
  verifyPublishReadiness,
  verifyTrustedPublishingToolchain,
} from "../scripts/verify-publish-readiness.mjs";
import {
  parseBaseVersion,
  readPackageVersion,
  resolveDevelopmentVersion,
} from "../scripts/resolve-dev-version.mjs";
import {
  parseStableTag,
  resolveReleaseTag,
  verifyReleaseVersion,
} from "../scripts/verify-release-version.mjs";

const tempDirs = [];

function createPackageJson(version) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "skillsbase-release-test-"));
  tempDirs.push(tempDir);
  const packageJsonPath = path.join(tempDir, "package.json");

  fs.writeFileSync(
    packageJsonPath,
    `${JSON.stringify(
      {
        name: "@hagicode/skillsbase",
        version,
        publishConfig: {
          access: "public",
          provenance: true,
          registry: "https://registry.npmjs.org/",
        },
      },
      null,
      2,
    )}\n`,
  );

  return packageJsonPath;
}

test.after(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("resolve-dev-version reduces package versions to their stable base", () => {
  assert.equal(parseBaseVersion("1.2.3"), "1.2.3");
  assert.equal(parseBaseVersion("1.2.3-beta.4+build.9"), "1.2.3");
  assert.throws(() => parseBaseVersion("next"), /valid semver/);
});

test("resolve-dev-version reads package.json and derives a GitHub-based prerelease", () => {
  const packageJsonPath = createPackageJson("2.4.6");

  assert.equal(readPackageVersion(packageJsonPath), "2.4.6");
  assert.equal(
    resolveDevelopmentVersion({
      packageVersion: "0.1.0",
      runNumber: "42",
      runAttempt: "3",
      sha: "ABCDEF1234567890",
    }),
    "0.1.0-dev.42.3.abcdef1",
  );
  assert.throws(
    () =>
      resolveDevelopmentVersion({
        packageVersion: "0.1.0",
        runNumber: "forty-two",
        runAttempt: "1",
        sha: "abcdef1",
      }),
    /GITHUB_RUN_NUMBER must be numeric/,
  );
});

test("verify-release-version parses stable tags and keeps package base version metadata", () => {
  const packageJsonPath = createPackageJson("1.2.3-dev.7");

  assert.equal(parseStableTag("v1.2.3"), "1.2.3");
  assert.throws(() => parseStableTag("v1.2.3-beta.1"), /stable vX.Y.Z format/);
  assert.equal(resolveReleaseTag({ cliTag: "v3.0.0", env: {} }), "v3.0.0");
  assert.deepEqual(
    verifyReleaseVersion({
      tagName: "v1.2.3",
      packageJsonPath,
    }),
    {
      packageJsonPath,
      packageVersion: "1.2.3-dev.7",
      packageBaseVersion: "1.2.3",
      tagName: "v1.2.3",
      version: "1.2.3",
    },
  );
});

test("verify-publish-readiness validates trusted publisher toolchain and auth mode", () => {
  const packageJsonPath = createPackageJson("0.1.0");

  assert.equal(compareVersions("24.0.0", "22.14.0"), 1);
  assert.equal(compareVersions("11.5.1", "11.5.1"), 0);
  assert.equal(resolveAuthMode({ env: { NODE_AUTH_TOKEN: "token" } }), "token");
  assert.equal(resolveAuthMode({ env: {} }), "trusted-publisher");
  assert.deepEqual(
    verifyTrustedPublishingToolchain({
      nodeVersion: "24.1.0",
      npmVersion: "11.6.0",
    }),
    {
      nodeVersion: "24.1.0",
      npmVersion: "11.6.0",
    },
  );
  assert.throws(
    () =>
      verifyTrustedPublishingToolchain({
        nodeVersion: "22.12.0",
        npmVersion: "10.9.2",
      }),
    /Trusted publishing requires Node 22.14.0\+/,
  );
  assert.match(
    verifyPublishReadiness({
      packageJsonPath,
      env: {
        GITHUB_REPOSITORY: "HagiCode-org/skillsbase",
      },
      nodeVersion: "24.1.0",
      npmVersion: "11.6.0",
      lookupPublishedVersion: () => "0.1.0-dev.1.1.abcdef1",
    }).warnings[0],
    /Ensure npm package settings trust GitHub repository HagiCode-org\/skillsbase/,
  );
});
