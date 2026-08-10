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

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ');
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
