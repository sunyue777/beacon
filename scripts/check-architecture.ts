import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type ShellRule = {
  label: string;
  path: string;
};

type Violation = {
  file: string;
  importPath: string;
  rule: ShellRule;
};

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const coreRoots = [
  "lib/domain",
  "lib/copilot",
  "lib/repo",
  "components/copilot",
  "components/ai"
];

const shellRules: ShellRule[] = [
  { label: "demo seed data", path: "data/asia-wealth" },
  { label: "demo scripts", path: "scripts" },
  { label: "access gate", path: "lib/auth/access-gate" },
  { label: "demo accounts", path: "lib/auth/accounts" },
  { label: "access pages", path: "app/access" },
  { label: "market widget", path: "components/market" },
  { label: "promo shell", path: "promo" }
];

const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx"]);
const importPatterns = [
  /(?:import|export)\s+(?:type\s+)?[^'";]*?\s+from\s*["']([^"']+)["']/g,
  /import\s+(?:type\s+)?["']([^"']+)["']/g,
  /import\s*\(\s*["']([^"']+)["']\s*\)/g,
  /require\s*\(\s*["']([^"']+)["']\s*\)/g
];

const files = coreRoots.flatMap((root) => listSourceFiles(path.join(repoRoot, root))).sort();
const violations = files.flatMap(scanFile);

if (violations.length > 0) {
  console.error("Architecture boundary check failed.");
  console.error("Product core may not import demo-shell paths.\n");
  for (const violation of violations) {
    console.error(
      `- ${violation.file} imports ${violation.importPath} (${violation.rule.label}: ${violation.rule.path})`
    );
  }
  console.error("\nMove the dependency behind a core interface or reverse the dependency direction.");
  process.exit(1);
}

console.log(`Architecture boundary check passed (${files.length} core files scanned).`);

function listSourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(absolute));
      continue;
    }
    if (entry.isFile() && sourceExtensions.has(path.extname(entry.name))) {
      files.push(absolute);
    }
  }
  return files;
}

function scanFile(file: string): Violation[] {
  const source = stripComments(readFileSync(file, "utf8"));
  const found: Violation[] = [];
  for (const pattern of importPatterns) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source))) {
      const importPath = match[1];
      const resolved = resolveImportPath(importPath, file);
      if (!resolved) continue;
      const rule = shellRules.find((candidate) => matchesShellRule(resolved, candidate));
      if (rule) {
        found.push({
          file: toRepoPath(file),
          importPath,
          rule
        });
      }
    }
  }
  return found;
}

function resolveImportPath(importPath: string, fromFile: string): string | undefined {
  if (importPath.startsWith("@/")) {
    return path.resolve(repoRoot, importPath.slice(2));
  }
  if (importPath.startsWith(".")) {
    return path.resolve(path.dirname(fromFile), importPath);
  }
  return undefined;
}

function matchesShellRule(resolvedPath: string, rule: ShellRule) {
  const relative = stripKnownExtension(toRepoPath(resolvedPath));
  return relative === rule.path || relative.startsWith(`${rule.path}/`);
}

function stripComments(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1");
}

function stripKnownExtension(value: string) {
  return value.replace(/(\.d)?\.(tsx?|jsx?|json)$/i, "");
}

function toRepoPath(absolutePath: string) {
  return path.relative(repoRoot, absolutePath).split(path.sep).join("/");
}
