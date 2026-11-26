import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * Cross-platform (Windows + Linux/macOS, Node 20+) test runner.
 * Recursively discovers *.test.ts files under src/ without shell globs.
 */
function findTestFiles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      findTestFiles(full, acc);
    } else if (entry.endsWith('.test.ts')) {
      acc.push(full);
    }
  }
  return acc.sort();
}

const srcDir = resolve(process.cwd(), 'src');
const testFiles = findTestFiles(srcDir);

if (testFiles.length === 0) {
  console.error('No *.test.ts files found under src/.');
  process.exit(1);
}

const tsxCli = resolve(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
const result = spawnSync(process.execPath, [tsxCli, '--test', ...testFiles], {
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 1);
