// ---------------------------------------------------------------------------
// v1 References Audit
// ---------------------------------------------------------------------------
//
// Scans the codebase for references to the v1 ad-creatives pipeline so that
// Slice 4 (v1 deletion) has a clear punch list. Does NOT delete anything.
//
// Usage:
//   npx tsx scripts/v1-references-audit.ts
//
// Uses execFileSync (no shell) for each grep call — no user input flows
// through shell interpretation.

import { execFileSync } from "node:child_process";

const ROOT = process.cwd();

const PATTERNS: Array<{ label: string; pattern: string; extensions: string[] }> = [
  {
    label: "Imports from @/lib/ad-creatives (v1)",
    pattern: "from '@/lib/ad-creatives/",
    extensions: ["ts", "tsx"],
  },
  {
    label: "Imports from @/lib/ad-creatives (double-quoted)",
    pattern: 'from "@/lib/ad-creatives/',
    extensions: ["ts", "tsx"],
  },
  {
    label: "Fetches to /api/ad-creatives (v1, not v2)",
    pattern: "/api/ad-creatives/",
    extensions: ["ts", "tsx"],
  },
  {
    label: "Nano Banana catalog references",
    pattern: "nano-banana",
    extensions: ["ts", "tsx", "sql"],
  },
  {
    label: "ad_prompt_templates table references",
    pattern: "ad_prompt_templates",
    extensions: ["ts", "tsx", "sql"],
  },
];

const EXCLUDED_DIRS = [
  "node_modules",
  ".next",
  "lib/ad-creatives-v2",
  "app/api/ad-creatives-v2",
  "app/admin/ad-creatives-v2",
  "components/ad-creatives-v2",
  "OpenCassava",
];

function runGrep(pattern: string, extensions: string[]): string[] {
  const args: string[] = ["-r", "-l"];
  for (const dir of EXCLUDED_DIRS) args.push(`--exclude-dir=${dir}`);
  for (const ext of extensions) args.push(`--include=*.${ext}`);
  args.push(pattern, ROOT);
  try {
    const out = execFileSync("grep", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((p) => p.replace(`${ROOT}/`, ""));
  } catch (err) {
    // grep exits non-zero when no matches found — that's expected
    if ((err as { status?: number }).status === 1) return [];
    throw err;
  }
}

function main(): void {
  console.log("v1 References Audit");
  console.log("=".repeat(60));
  console.log(`Scanning: ${ROOT}\n`);

  for (const p of PATTERNS) {
    const matches = runGrep(p.pattern, p.extensions);
    console.log(
      `${p.label}: ${matches.length} file${matches.length === 1 ? "" : "s"}`,
    );
    for (const file of matches.slice(0, 10)) {
      console.log(`    ${file}`);
    }
    if (matches.length > 10) {
      console.log(`    … and ${matches.length - 10} more`);
    }
    if (matches.length > 0) console.log();
  }

  console.log("=".repeat(60));
  console.log(
    "Use this as the Slice 4 punch list. Each file needs to migrate to",
  );
  console.log(
    "v2 references OR be deleted before the v1 pipeline can be removed.",
  );
}

main();
