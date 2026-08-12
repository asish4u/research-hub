/**
 * Cloudflare Worker — Research Hub
 *  - Serves the static site (index.html) from the project directory
 *  - /api/news?category=world|tech|business|ai|india|us
 *      Fetches multiple reputed RSS feeds SERVER-SIDE (no CORS limits),
 *      merges, sorts by recency (highest impact first), returns JSON.
 */

const FEEDS = {
  world: [
    'https://feeds.bbci.co.uk/news/world/rss.xml',
    'https://www.aljazeera.com/xml/rss/all.xml',
    'https://rss.dw.com/rdf/rss-en-all',
    'https://www.theguardian.com/world/rss'
  ],
  tech: [
    'https://hnrss.org/frontpage',
    'https://www.theverge.com/rss/index.xml',
    'https://www.techmeme.com/feed.xml',
    'https://www.cnet.com/rss/news/'
  ],
  business: [
    'https://feeds.bbci.co.uk/news/business/rss.xml',
    'https://feeds.bloomberg.com/markets/news.rss',
    'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114',
    'https://feeds.content.dowjones.io/public/rss/mw_topstories'
  ],
  ai: [
    'https://www.technologyreview.com/feed/',
    'https://techcrunch.com/category/artificial-intelligence/feed/',
    'https://feeds.arstechnica.com/arstechnica/technology-lab',
    'https://www.wired.com/feed/rss'
  ],
  india: [
    'https://www.thehindu.com/feeder/default.rss',
    'https://www.indianexpress.com/feed/',
    'https://feeds.bbci.co.uk/news/world/asia/india/rss.xml'
  ],
  us: [
    'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml',
    'https://feeds.npr.org/1001/rss.xml',
    'https://rss.politico.com/politics-news.xml',
    'https://feeds.content.dowjones.io/public/rss/mw_topstories'
  ]
};

// GovTrack API — free, no key required. Returns individual bills.
// Enacted laws + in-progress bills (yet to be enacted) from the past 12 months.
const GOVTRACK_BASE = 'https://www.govtrack.us/api/v2/bill';
const LAWS_MONTHS = 12; // how far back to look

// Build GovTrack queries since `sinceDate` (YYYY-MM-DD).
// Enacted statuses: signed by the President, 10-day rule (unsigned), veto override.
// Pending statuses: bills that passed at least one chamber (closest to becoming law)
// plus the newest introductions for breadth.
function lawsQueries(sinceDate) {
  const enacted = [
    ['enacted_signed', 150],
    ['enacted_tendayrule', 40],
    ['enacted_veto_override', 40]
  ];
  const pending = [
    ['pass_over_senate', 80],
    ['pass_over_house', 80],
    ['pass_back_senate', 80],
    ['pass_back_house', 80],
    ['passed_bill', 80]
  ];
  return [
    ...enacted.map(([s, l]) => `${GOVTRACK_BASE}?congress=119&current_status=${s}&current_status_date__gte=${sinceDate}&order_by=-current_status_date&limit=${l}`),
    ...pending.map(([s, l]) => `${GOVTRACK_BASE}?congress=119&current_status=${s}&current_status_date__gte=${sinceDate}&order_by=-current_status_date&limit=${l}`),
    // Newest introductions within the window (breadth)
    `${GOVTRACK_BASE}?congress=119&introduced_date__gte=${sinceDate}&order_by=-introduced_date&limit=50`
  ];
}

const PER_FEED_LIMIT = 8;
const TOTAL_LIMIT = 40;
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map(); // category -> { ts, items }

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/news') {
      const category = url.searchParams.get('category') || 'world';
      return handleNews(category);
    }

    if (url.pathname === '/api/laws') {
      return safe(handleLaws());
    }

    if (url.pathname === '/api/laws/buzz') {
      return safe(handleLawsBuzz());
    }

    // Serve index.html for all other paths

    // Cloudflare returns 'text/html' without charset by default (assets 
    // binding). Without charset=utf-8, em-dash, curly quotes, arrows, and 
    // emoji (multi-byte UTF-8) render as mojibake “codes” in many 
    // readers. Re-wrap HTML responses to advertise charset=utf-8.
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    const ct = headers.get('content-type') || '';
    if (ct.startsWith('text/html')) {
      headers.set('Content-Type', 'text/html; charset=utf-8');
    }
    return new Response(response.body, {
      headers,
      status: response.status,
      statusText: response.statusText,
    });
  },

  // Cron warm-up: keep the laws + buzz caches fresh so user requests
  // hit the edge cache instead of waiting on GovTrack/Google upstream.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(Promise.allSettled([handleLaws(), handleLawsBuzz()]));
  }
};


async function handleNews(category) {
  const feedUrls = FEEDS[category];
  if (!feedUrls) {
    return json({ error: 'Unknown category' }, 400);
  }

  // Cache hit?
  const cached = cache.get(category);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return json({ status: 'ok', items: cached.items, cached: true });
  }

  const results = await Promise.allSettled(
    feedUrls.map(async (feedUrl) => {
      const resp = await fetch(feedUrl, {
        headers: { 'User-Agent': 'ResearchHub/1.0' },
        redirect: 'follow'
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const xml = await resp.text();
      return parseRSS(xml).slice(0, PER_FEED_LIMIT);
    })
  );

  let items = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) items = items.concat(r.value);
  }

  // Sort newest first (highest impact)
  items.sort((a, b) => (b.pubDateMs || 0) - (a.pubDateMs || 0));
  items = items.slice(0, TOTAL_LIMIT);

  cache.set(category, { ts: Date.now(), items });
  return json({ status: 'ok', items, cached: false });
}

// ── helpers ──────────────────────────────────────────────────────────
async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'ResearchHub/1.0' },
      redirect: 'follow',
      signal: controller.signal
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp;
  } finally {
    clearTimeout(timer);
  }
}// Public-attention proxy: count Google News articles mentioning a bill number in the last 7 days.
const NEWS_BASE = 'https://news.google.com/rss/search?hl=en-US&gl=US&ceid=US:en&q=';
const BING_NEWS_BASE = 'https://www.bing.com/news/search?setlang=en-US&format=rss&q=';
// Cloudflare caps subrequests at 50/invocation, so keep the total well under:
//   BUZZ_TOP_N bills × (2 Google attempts + 1 Bing fallback) + 9 GovTrack ≤ ~40
const BUZZ_TOP_N = 8;   // how many recent pending bills get a news-buzz check
const BUZZ_BATCH = 4;   // concurrent news fetches per wave (Google 503s on bursts)

// Browser-like headers — Google News intermittently 503s plain bot UAs.
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function fetchRssCount(url, timeoutMs = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept': 'application/rss+xml, application/xml;q=0.9, */*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      redirect: 'follow',
      signal: controller.signal
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const xml = await resp.text();
    return (xml.match(/<item>/g) || []).length;
  } finally {
    clearTimeout(timer);
  }
}

// Google News primary (retries once — it intermittently 503s), then Bing News.
async function newsCount(number) {
  const variants = [number, number.replace(/\./g, '')];
  const query = encodeURIComponent(variants.map(v => `"${v}"`).join(' OR ') + ' when:7d');
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fetchRssCount(NEWS_BASE + query);
    } catch (e) {
      if (attempt === 0) await new Promise(r => setTimeout(r, 1200));
    }
  }
  try {
    return await fetchRssCount(BING_NEWS_BASE + encodeURIComponent(variants.map(v => `"${v}"`).join(' OR ')));
  } catch (e) {
    return 0;
  }
}

// Public-sentiment buzz for the most recent in-progress bills.
// Separate endpoint so the main list renders fast and each request
// stays well under Cloudflare's per-request execution limits.
async function handleLawsBuzz() {
  const cacheKey = 'https://api.local/laws-buzz/v3';
  const cacheApi = caches.default;
  const cachedRes = await cacheApi.match(cacheKey);
  if (cachedRes) return cachedRes;

  const base = await handleLaws(); // cached — cheap after first call
  const data = await base.json();
  const pending = (data.items || [])
    .filter(i => !i.statusKey.startsWith('enacted'))
    .slice(0, BUZZ_TOP_N);

  const buzz = new Map();
  for (let i = 0; i < pending.length; i += BUZZ_BATCH) {
    const batch = pending.slice(i, i + BUZZ_BATCH);
    const counts = await Promise.allSettled(batch.map(item => newsCount(item.number)));
    counts.forEach((r, j) => buzz.set(batch[j].number, r.status === 'fulfilled' ? r.value : 0));
    if (i + BUZZ_BATCH < pending.length) await new Promise(r => setTimeout(r, 1000)); // ease rate limits
  }

  const payload = JSON.stringify({
    status: 'ok',
    buzz: Object.fromEntries(buzz)
  });
  const resp = new Response(payload, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=600'
    }
  });
  await cacheApi.put(cacheKey, resp.clone());
  return resp;
}

async function handleLaws() {
  const cacheKey = 'https://api.local/laws/v4';

  // Edge cache (Cloudflare Cache API) — serves the payload without re-hitting GovTrack.
  const cacheApi = caches.default;
  const cachedRes = await cacheApi.match(cacheKey);
  if (cachedRes) return cachedRes;

  const since = new Date();
  since.setMonth(since.getMonth() - LAWS_MONTHS);
  const sinceDate = since.toISOString().slice(0, 10);

  const results = await Promise.allSettled(
    lawsQueries(sinceDate).map(url => fetchWithTimeout(url, 10000).then(r => r.json()).then(d => (d.objects || []).map(billToItem)))
  );

  const byNumber = new Map();
  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value) continue;
    for (const item of r.value) {
      if (!byNumber.has(item.number)) byNumber.set(item.number, item);
    }
  }

  let items = [...byNumber.values()];
  // Most recently acted-upon first
  items.sort((a, b) => (b.statusDateMs || 0) - (a.statusDateMs || 0));

  const payload = JSON.stringify({
    status: 'ok',
    items,
    months: LAWS_MONTHS,
    since: sinceDate,
    cached: false
  });
  const resp = new Response(payload, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=600'
    }
  });
  await cacheApi.put(cacheKey, resp.clone());
  return resp;
}

// Wrap handlers so upstream errors return clean JSON instead of Cloudflare 1101.
async function safe(promise) {
  try {
    return await promise;
  } catch (e) {
    return json({ status: 'error', error: String((e && e.message) || e) }, 500);
  }
}

function billToItem(b) {
  // Strip the "H.R. 12345: " / "H.J.Res. 213: " / "S. 998: " prefix for display
  const title = (b.title || '').replace(/^[A-Za-z.]+\s*\d+\s*:\s*/, '').trim() || b.title;
  // Public law number, e.g. "Public Law 119-102" for signed/veto-override enactments
  const lawNum = (b.sliplawpubpriv === 'PUB' && b.sliplawnum)
    ? `Public Law ${b.congress}-${b.sliplawnum}`
    : '';
  const statusKey = b.current_status || '';
  const statusDateMs = b.current_status_date ? Date.parse(b.current_status_date) || 0 : 0;
  // Attention flags:
  //  - 'new'   → enacted within the last 30 days (brand-new law)
  //  - 'close' → pending bill that already passed at least one chamber
  let attention = '';
  const enacted = statusKey.startsWith('enacted');
  const passedAChamber = statusKey.startsWith('pass_') || statusKey === 'passed_bill' || statusKey === 'passed_simpleres';
  if (enacted && statusDateMs && (Date.now() - statusDateMs) < 30 * 24 * 3600 * 1000) attention = 'new';
  else if (!enacted && passedAChamber) attention = 'close';

  return {
    number: b.display_number || '',
    title,
    link: b.link || '',
    status: b.current_status_label || b.current_status || '',
    statusKey,
    statusDate: b.current_status_date || '',
    statusDateMs,
    sponsor: (b.sponsor && b.sponsor.name) ? b.sponsor.name.replace(/^Rep\. |^Sen\. /, '') : '',
    chamber: b.bill_type_label || '',
    lawNum,
    attention,
    buzz: 0 // filled in by handleLaws from Google News attention
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300'
    }
  });
}

// Decode HTML entities in RSS titles/descriptions. Must handle &apos; (which
// BBC/Guardian feeds use for apostrophes) and numeric entities, and decode
// &amp; LAST so double-escaped text like "&amp;apos;" stays literal "&apos;"
// instead of becoming an apostrophe.
function decodeEntities(s) {
  if (!s) return s;
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => safeChar(parseInt(n, 10)))
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function safeChar(code) {
  return (code >= 0 && code <= 0x10ffff) ? String.fromCodePoint(code) : '';
}

function textOf(block, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = re.exec(block);
  if (!m) return '';
  let v = m[1].trim();
  if (v.startsWith('<![CDATA[')) v = v.slice(9, v.lastIndexOf(']]>')).trim();
  return decodeEntities(v);
}

function attrOf(block, tag, attr) {
  const re = new RegExp(`<${tag}[^>]*\\b${attr}="([^"]*)"`, 'i');
  const m = re.exec(block);
  return m ? m[1].trim() : '';
}

function parseRSS(xml) {
  const items = [];
  const itemRe = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xml)) !== null && items.length < 30) {
    const block = m[1];
    const title = textOf(block, 'title');
    let link = textOf(block, 'link') || attrOf(block, 'link', 'href');
    const pubDate = textOf(block, 'pubDate') || textOf(block, 'dc:date') || '';
    if (title) {
      items.push({
        title,
        link,
        pubDate,
        pubDateMs: pubDate ? Date.parse(pubDate) || 0 : 0
      });
    }
  }

  // Atom fallback (<entry>)
  if (items.length === 0) {
    const entryRe = /<entry[\s>]([\s\S]*?)<\/entry>/gi;
    let e;
    while ((e = entryRe.exec(xml)) !== null && items.length < 30) {
      const block = e[1];
      const title = textOf(block, 'title');
      let link = attrOf(block, 'link', 'href') || textOf(block, 'link');
      const pubDate = textOf(block, 'updated') || textOf(block, 'published') || '';
      if (title) {
        items.push({
          title,
          link,
          pubDate,
          pubDateMs: pubDate ? Date.parse(pubDate) || 0 : 0
        });
      }
    }
  }

  return items;
}
