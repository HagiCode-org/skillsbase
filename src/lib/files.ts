import { promises as fs } from "node:fs";
import path from "node:path";

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function readFileIfExists(targetPath: string, encoding: BufferEncoding = "utf8"): Promise<string | null> {
  if (!(await pathExists(targetPath))) {
    return null;
  }

  return fs.readFile(targetPath, encoding);
}

export async function ensureDirectory(targetPath: string): Promise<void> {
  await fs.mkdir(targetPath, { recursive: true });
}

export async function listDirectories(rootPath: string): Promise<string[]> {
  if (!(await pathExists(rootPath))) {
    return [];
  }

  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

export async function collectRelativeFiles(rootPath: string, basePath: string = rootPath): Promise<string[]> {
  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of [...entries].sort((left, right) => left.name.localeCompare(right.name))) {
    const absolutePath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectRelativeFiles(absolutePath, basePath)));
      continue;
    }

    if (entry.isFile()) {
      files.push(toPosix(path.relative(basePath, absolutePath)));
    }
  }

  return files;
}

export async function readTree(rootPath: string): Promise<Map<string, Buffer>> {
  const files = await collectRelativeFiles(rootPath);
  const tree = new Map<string, Buffer>();

  for (const relativePath of files) {
    tree.set(relativePath, await fs.readFile(path.join(rootPath, relativePath)));
  }

  return tree;
}

export async function writeTree(rootPath: string, tree: Map<string, Buffer>): Promise<void> {
  await fs.rm(rootPath, { recursive: true, force: true });
  await fs.mkdir(rootPath, { recursive: true });

  for (const [relativePath, content] of [...tree.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const targetPath = path.join(rootPath, relativePath);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, content);
  }
}

export async function removeIfEmptyUpward(startPath: string, stopPath: string): Promise<void> {
  let currentPath = startPath;
  const normalizedStop = path.resolve(stopPath);

  while (currentPath.startsWith(normalizedStop) && currentPath !== normalizedStop) {
    if (!(await pathExists(currentPath))) {
      currentPath = path.dirname(currentPath);
      continue;
    }

    const entries = await fs.readdir(currentPath);
    if (entries.length > 0) {
      return;
    }

    await fs.rmdir(currentPath);
    currentPath = path.dirname(currentPath);
  }
}

export function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function toPosix(filePath: string): string {
  return filePath.split(path.sep).join(path.posix.sep);
}

export function fromPosix(filePath: string): string {
  return filePath.split(path.posix.sep).join(path.sep);
}
