import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const name = "public-safety";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const ignoredDirectories = new Set([".git", ".next", "node_modules"]);
const ignoredFiles = new Set(["package-lock.json"]);
const scannableExtensions = new Set([
  ".css",
  ".json",
  ".mjs",
  ".md",
  ".ts",
  ".tsx",
  ".txt",
  ".yml",
  ".yaml"
]);

const bannedPathFragments = [
  "components/hypothesis",
  "lib/hypothesis",
  "app/mcp",
  "evals",
  "scripts/mcp",
  "docs/chatgpt-app-plan"
];

const bannedContentChecks: Array<{ label: string; pattern: RegExp }> = [
  { label: "hypothesis", pattern: /\bhypothesis\b/i },
  { label: "multiple sclerosis", pattern: /multiple sclerosis/i },
  { label: "mcp", pattern: /\bmcp\b/i },
  { label: "artifact store", pattern: /\bartifact\b/i },
  { label: "private env", pattern: /NEXT_PUBLIC_HYPOTHESIS/i },
  { label: "private env", pattern: /OPENAI_AGENT_MODEL/i },
  { label: "private env", pattern: /OPENAI_SUMMARY_MODEL/i },
  { label: "private env", pattern: /KV_REST_/i },
  { label: "private env", pattern: /POSTGRES_URL/i },
  { label: "private env", pattern: /SERPAPI/i },
  { label: "internal positioning", pattern: /\bfounder(s)?\b/i },
  { label: "internal positioning", pattern: /\bstartup\b/i },
  { label: "internal branding", pattern: /immiatrics/i }
];

export async function run() {
  const files = collectFiles(rootDir);

  const badPaths = files.filter((file) =>
    bannedPathFragments.some((fragment) => file.split(path.sep).join("/").includes(fragment))
  );
  assert.deepEqual(badPaths, [], `Found banned path fragments:\n${badPaths.join("\n")}`);

  const violations: string[] = [];

  for (const file of files) {
    if (ignoredFiles.has(path.basename(file))) continue;
    if (path.relative(rootDir, file) === "tests/public-safety.test.ts") continue;
    if (!shouldScanFile(file)) continue;

    const content = fs.readFileSync(file, "utf8");
    for (const check of bannedContentChecks) {
      if (check.pattern.test(content)) {
        violations.push(`${path.relative(rootDir, file)} -> ${check.label}`);
      }
    }
  }

  assert.deepEqual(violations, [], `Found banned public-repo content:\n${violations.join("\n")}`);
}

function collectFiles(directory: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (ignoredDirectories.has(entry.name)) continue;
      results.push(...collectFiles(path.join(directory, entry.name)));
      continue;
    }
    results.push(path.join(directory, entry.name));
  }
  return results;
}

function shouldScanFile(file: string): boolean {
  const baseName = path.basename(file);
  if (baseName.startsWith(".") && baseName !== ".env.example" && baseName !== ".gitignore") {
    return false;
  }
  const extension = path.extname(file);
  return scannableExtensions.has(extension) || baseName === ".env.example" || baseName === ".gitignore";
}
