/**
 * Cloudflare Pages Function — News proxy
 * Fetches multiple RSS feeds server-side, merges, sorts by recency.
 * Called as: /api/news?category=world
 */

const RSS_FEEDS = {
  world: [
    'https://feeds.bbci.co.uk/news/world/rss.xml',
    'https://www.aljazeera.com/xml/rss/all.xml',
    'https://rss.dw.com/rdf/rss-en-all',
    'https://www.theguardian.com/world/rss',
  ],
  tech: [
    'https://hnrss.org/frontpage',
    'https://www.theverge.com/rss/index.xml',
    'https://www.techmeme.com/feed.xml',
    'https://www.cnet.com/rss/news/',
  ],
  business: [
    'https://feeds.bbci.co.uk/news/business/rss.xml',
    'https://feeds.bloomberg.com/markets/news.rss',
    'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114',
    'https://feeds.content.dowjones.io/public/rss/mw_topstories',
  ],
  ai: [
    'https://www.technologyreview.com/feed/',
    'https://techcrunch.com/category/artificial-intelligence/feed/',
    'https://feeds.arstechnica.com/arstechnica/technology-lab',
    'https://www.wired.com/feed/rss',
  ],
  india: [
    'https://www.thehindu.com/feeder/default.rss',
    'https://www.indianexpress.com/feed/',
    'https://feeds.bbci.co.uk/news/world/asia/india/rss.xml',
  ],
  us: [
    'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml',
    'https://feeds.npr.org/1001/rss.xml',
    'https://rss.politico.com/politics-news.xml',
    'https://feeds.content.dowjones.io/public/rss/mw_topstories',
  ],
};

const FEED_LIMIT = 12;

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const category = url.searchParams.get('category') || 'world';

  const feedUrls = RSS_FEEDS[category];
  if (!feedUrls) {
    return jsonResponse({ error: 'Unknown category' }, 400);
  }

  // Fetch all feeds in parallel — direct XML fetch
  const results = await Promise.allSettled(
    feedUrls.map(async (feedUrl) => {
      const resp = await fetch(feedUrl, {
        headers: { 'User-Agent': 'ResearchHub/1.0 (news aggregator)' },
        redirect: 'follow',
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const xml = await resp.text();
      return parseRSS(xml);
    })
  );

  // Merge all items
  let allItems = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value && r.value.length > 0) {
      allItems = allItems.concat(r.value.slice(0, FEED_LIMIT));
    }
  });

  // Sort by pubDate descending (newest first = highest impact)
  allItems.sort((a, b) => {
    const aT = a.pubDateMs || 0;
    const bT = b.pubDateMs || 0;
    return bT - aT;
  });

  // Limit to 40 total
  allItems = allItems.slice(0, 40);

  return jsonResponse({ status: 'ok', items: allItems });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 's-maxage=300, stale-while-revalidate=600',
    },
  });
}

// RSS XML parser — handles RSS 2.0 and RDF/RSS 1.0
function parseRSS(xml) {
  const items = [];

  // RSS 2.0: <item>...</item>
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null && items.length < 20) {
    const block = match[1];
    const title = extractTag(block, 'title');
    const link = extractTag(block, 'link') || extractAttr(block, 'link', 'rdf:resource') || extractTag(block, 'guid');
    const pubDate = extractTag(block, 'pubDate') || extractTag(block, 'dc:date');
    const author = extractTag(block, 'author') || extractTag(block, 'dc:creator');

    if (title) {
      items.push({
        title: decodeHtml(title),
        link: link ? decodeHtml(link) : '',
        pubDate: pubDate || new Date().toUTCString(),
        pubDateMs: pubDate ? new Date(pubDate).getTime() : Date.now(),
        author: author || '',
      });
    }
  }

  // Fallback: try RDF items
  if (items.length === 0) {
    const rdfRegex = /<rdf:li[^>]*rdf:resource="([^"]*)"[^>]*\/>/gi;
    // Extract titles from content:encoded or rdf:Description
    const descRegex = /<rdf:Description[^>]*>([\s\S]*?)<\/rdf:Description>/gi;
    let dMatch;
    while ((dMatch = descRegex.exec(xml)) !== null && items.length < 20) {
      const block = dMatch[1];
      const title = extractTag(block, 'title');
      const link = extractTag(block, 'link') || extractAttr(block, 'link', 'rdf:resource');
      const date = extractTag(block, 'dc:date');
      if (title) {
        items.push({
          title: decodeHtml(title),
          link: link ? decodeHtml(link) : '',
          pubDate: date || new Date().toUTCString(),
          pubDateMs: date ? new Date(date).getTime() : Date.now(),
          author: '',
        });
      }
    }
  }

  return items;
}

function extractTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>|<${tag}[^>]*>\\s*([\\s\\S]*?)\\s*</${tag}>`);
  const m = re.exec(xml);
  return m ? (m[1] || m[2] || '').trim() : '';
}

function extractAttr(xml, tag, attr) {
  const re = new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`);
  const m = re.exec(xml);
  return m ? m[1].trim() : '';
}

function decodeHtml(text) {
  return text
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/'/g, "'");
}
