/**
 * Zip a pipeline run folder (JSON + generated-png) to the Desktop.
 *
 *   npx tsx scripts/zip-goldback-run-folder.ts ~/Desktop/Goldback-Idaho-GTM-200-run-2026-03-24-14-16-07
 *
 * Or: GOLDBACK_ZIP_RUN_DIR=... npx tsx scripts/zip-goldback-run-folder.ts
 */
import { existsSync, readdirSync } from 'fs';
import { basename, join, resolve } from 'path';
import { homedir } from 'os';
import { spawnSync } from 'child_process';

function expand(p: string): string {
  if (p.startsWith('~/')) return join(homedir(), p.slice(2));
  return resolve(p);
}

function main(): void {
  const raw = process.argv[2]?.trim() || process.env.GOLDBACK_ZIP_RUN_DIR?.trim();
  if (!raw) {
    console.error('Usage: npx tsx scripts/zip-goldback-run-folder.ts <path-to-run-folder>');
    process.exit(1);
  }
  const runDir = expand(raw);
  if (!existsSync(runDir)) {
    console.error('Folder not found:', runDir);
    process.exit(1);
  }
  const pngDir = join(runDir, 'generated-png');
  const pngCount = existsSync(pngDir)
    ? readdirSync(pngDir).filter((n) => n.endsWith('.png')).length
    : 0;
  console.log(`PNG count in generated-png/: ${pngCount}`);

  const name = basename(runDir);
  const zipName = `${name}.zip`;
  const zipPath = join(homedir(), 'Desktop', zipName);
  const parent = join(runDir, '..');
  const r = spawnSync('zip', ['-r', '-q', zipPath, name], {
    cwd: parent,
    stdio: 'inherit',
  });
  if (r.status !== 0) {
    console.error('zip failed (install zip CLI or run manually)');
    process.exit(1);
  }
  console.log('Wrote', zipPath);
}

main();
