// Quick sanity check for the dashboard: validates the inline <script> blocks
// in public/index.html so a bad edit is caught before deploy.
// Usage: node scripts/check.mjs  (or npm run check)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const htmlPath = path.join(root, 'public', 'index.html');
const html = readFileSync(htmlPath, 'utf8');

const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
if (!blocks.length) {
  console.error('✗ No <script> blocks found in public/index.html');
  process.exit(1);
}

let failed = false;
blocks.forEach((code, i) => {
  try {
    new Function(code); // compile-only: catches syntax errors without running
    console.log(`✓ script block ${i + 1}/${blocks.length} syntax OK`);
  } catch (e) {
    failed = true;
    console.error(`✗ script block ${i + 1} has a syntax error: ${e.message}`);
  }
});

// Quick reference sanity: make sure the laws + news API helpers exist.
for (const needle of ['/api/news', '/api/laws', 'apiFetch', 'research-hub.pintun8.workers.dev']) {
  if (!html.includes(needle)) console.warn(`⚠ public/index.html does not reference "${needle}" — expected`);
}

process.exit(failed ? 1 : 0);
