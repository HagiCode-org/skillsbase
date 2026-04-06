#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import { access } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const bundledEntry = path.resolve(moduleDir, "..", "dist", "cli.mjs");
const sourceEntry = path.resolve(moduleDir, "..", "src", "cli-entry.ts");

async function canAccess(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

if (await canAccess(bundledEntry)) {
  await import(pathToFileURL(bundledEntry).href);
} else if (await canAccess(sourceEntry)) {
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", sourceEntry, ...process.argv.slice(2)], {
      stdio: "inherit",
      env: process.env,
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`skillsbase CLI terminated with signal ${signal}.`));
        return;
      }

      resolve(code ?? 1);
    });
  });

  process.exitCode = exitCode;
} else {
  throw new Error("Unable to locate the skillsbase CLI entrypoint.");
}
