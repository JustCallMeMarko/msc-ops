import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const result = spawnSync("npm", ["ls", "--omit=dev", "--all", "--json"], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 20 * 1024 * 1024,
});

if (result.error || (result.status !== 0 && !result.stdout)) {
  console.error(result.stderr || result.error?.message || "Could not inspect production dependencies.");
  process.exit(1);
}

let tree;
try {
  tree = JSON.parse(result.stdout);
} catch {
  console.error("npm ls did not return valid dependency-tree JSON.");
  process.exit(1);
}

const offenders = new Set();
const visited = new Set();

function scanDirectory(directory, packageName) {
  if (!existsSync(directory)) return;
  let metadata;
  try {
    metadata = JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8"));
  } catch {
    return;
  }
  if (metadata.gypfile === true || existsSync(path.join(directory, "binding.gyp"))) offenders.add(`${packageName}: binding.gyp`);
  const stack = [directory];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== "node_modules") stack.push(path.join(current, entry.name));
      else if (entry.isFile() && entry.name.endsWith(".node")) offenders.add(`${packageName}: ${path.relative(directory, path.join(current, entry.name))}`);
    }
  }
}

function walk(dependencies, parentDirectory = path.join(root, "node_modules"), skip = false) {
  for (const [name, dependency] of Object.entries(dependencies ?? {})) {
    if (!dependency || dependency.optional && (name === "sharp" || name.startsWith("@img/"))) continue;
    const underNext = skip || name === "next";
    const packagePath = dependency.path || path.join(parentDirectory, "node_modules", name);
    if (!underNext && !visited.has(packagePath)) {
      visited.add(packagePath);
      scanDirectory(packagePath, name);
    }
    if (!underNext) walk(dependency.dependencies, packagePath);
  }
}

walk(tree.dependencies);

if (offenders.size) {
  console.error("Native Node modules found in production dependencies:");
  for (const offender of offenders) console.error(`- ${offender}`);
  process.exit(1);
}
console.log("No native Node modules found outside Next.js and optional image packages.");
