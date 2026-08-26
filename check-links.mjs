#!/usr/bin/env node
/**
 * check-links.mjs — verify every outbound link in public/index.html
 *
 * Scans:
 *  1. href="..." attributes in the HTML
 *  2. url: '...' entries in the inline JS databases array (opened via window.open)
 *
 * Usage:
 *   node check-links.mjs            # check all links, exit 1 if any dead
 *   node check-links.mjs --json     # machine-readable output
 *
 * Exit codes: 0 = all OK, 1 = dead links found, 2 = script error.
 */
import { readFile } from 'node:fs/promises';

const FILE = 'public/index.html';
const CONCURRENCY = 8;
const TIMEOUT_MS = 20000;

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

// Some sites reject HEAD; fall back to GET. Some bot-block with 403/429 — retry once.

// Statuses that usually mean bot-blocking (may work in a real browser).
const BLOCKED_STATUS = new Set([400, 401, 403, 412, 429]);

// Known-good sites that block non-browser clients (Amazon, Google) or use
// self-signed certs (Sci-Hub) — they work in a real browser, so don't fail
// the run on them. Keep this list short; add only hosts you've verified.
const ALLOW_HOSTS = new Set([
  'www.amazon.com',
  'gemini.google.com',
  'sci-hub.ru',
  'www.ias.ac.in',
  'www.indiancitationindex.com',
  'shodhganga.inflibnet.ac.in'
]);


async function extractLinks(html) {
  const links = new Map(); // url -> { label }

  // 1. href attributes (skip anchors, mailto, javascript, data)
  for (const m of html.matchAll(/href="([^"]+)"/g)) {
    const url = m[1].trim();
    if (!/^https?:\/\//i.test(url)) continue;
    if (!links.has(url)) links.set(url, {});
  }

  // 2. url: '...' in the inline JS databases array
  for (const m of html.matchAll(/url:\s*'([^']+)'/g)) {
    const url = m[1].trim();
    if (!/^https?:\/\//i.test(url)) continue;
    if (!links.has(url)) links.set(url, {});
  }

  return [...links.keys()];
}

async function checkUrl(url) {
  const attempt = async (method) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const resp = await fetch(url, {
        method,
        redirect: 'follow',
        signal: ctrl.signal,
        headers: { 'User-Agent': UA, 'Accept': '*/*' }
      });
      return { ok: resp.ok, status: resp.status };
    } catch (err) {
      return { ok: false, error: err.cause?.code || err.name };
    } finally {
      clearTimeout(timer);
    }
  };

  // HEAD first, GET fallback (some servers reject HEAD)
  let res = await attempt('HEAD');
  if (!res.ok && res.error === undefined) {
    res = await attempt('GET');
  }
  // One retry for transient network failures (timeouts, resets) and rate-limits
  const TRANSIENT = ['UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'AbortError', 'TypeError'];
  if (!res.ok && (res.status === 429 || TRANSIENT.includes(res.error))) {
    await new Promise(r => setTimeout(r, 1500));
    res = await attempt('GET');
  }
  return res;
}

const html = await readFile(FILE, 'utf8');
const urls = await extractLinks(html);

const results = [];
let next = 0;
async function worker() {
  while (next < urls.length) {
    const url = urls[next++];
    const res = await checkUrl(url);
    results.push({ url, ...res });
  }
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker));

// Dead = network failure (NXDOMAIN, refused, cert error, timeout) or a hard
// HTTP error (404/410/5xx), excluding allowlisted hosts and bot-block statuses.
// 400/401/403/412/429 usually mean bot-blocking, which may still work in a real
// browser — report as blocked, don't fail.
const dead = results.filter(r => {
  if (r.ok || ALLOW_HOSTS.has(new URL(r.url).hostname)) return false;
  return r.status === undefined || (r.status >= 400 && !BLOCKED_STATUS.has(r.status));
});
const blocked = results.filter(r => !r.ok && !dead.includes(r));
const okCount = results.length - dead.length - blocked.length;

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ total: results.length, ok: okCount, blocked: blocked.map(b => b.url), dead }, null, 2));
} else {
  console.log(`Checked ${results.length} outbound links in ${FILE}`);
  if (blocked.length) console.log(`\n⚠ ${blocked.length} blocked by bot-protection (likely fine in a browser):`);
  for (const r of blocked) {
    console.log(`    ${r.status ? `HTTP ${r.status}` : `ERR ${r.error || 'unknown'}`}  ${r.url}`);
  }
  if (dead.length) console.log(`\n❌ ${dead.length} DEAD:`);
  for (const r of dead) {
    console.log(`    ${r.status ? `HTTP ${r.status}` : `ERR ${r.error || 'unknown'}`}  ${r.url}`);
  }
  console.log(`\n${okCount} OK, ${blocked.length} blocked, ${dead.length} dead`);
}

process.exit(dead.length > 0 ? 1 : 0);
