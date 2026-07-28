/**
 * Cloudflare Pages Function — News proxy
 * Fetches RSS feeds on the server side (no CORS, no rate-limit issues)
 * Called as: /api/news?category=world
 */

const RSS_FEEDS = {
  world:    'https://feeds.bbci.co.uk/news/rss.xml',
  tech:     'https://hnrss.org/frontpage',
  business: 'https://feeds.bloomberg.com/markets/news.rss',
  ai:       'https://www.technologyreview.com/feed/',
  india:    'https://www.thehindu.com/feeder/default.rss',
  us:       'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml'
};

const RSS2JSON = 'https://api.rss2json.com/v1/api.json?rss_url=';

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const category = url.searchParams.get('category') || 'world';

  const feedUrl = RSS_FEEDS[category];
  if (!feedUrl) {
    return new Response(JSON.stringify({ error: 'Unknown category' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }

  const apiUrl = RSS2JSON + encodeURIComponent(feedUrl);

  try {
    const resp = await fetch(apiUrl, {
      headers: { 'User-Agent': 'ResearchHub/1.0' }
    });
    const data = await resp.json();

    if (data.status !== 'ok') {
      // Fallback: try direct fetch and basic XML parse
      const xmlResp = await fetch(feedUrl);
      const xml = await xmlResp.text();
      return new Response(JSON.stringify({ status: 'ok', items: parseRSS(xml) }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (err) {
    // Final fallback: try direct fetch
    try {
      const xmlResp = await fetch(feedUrl);
      const xml = await xmlResp.text();
      return new Response(JSON.stringify({ status: 'ok', items: parseRSS(xml) }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    } catch (err2) {
      return new Response(JSON.stringify({ error: err2.message }), {
        status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
  }
}

// Basic RSS XML parser (no dependencies — works with standard RSS 2.0)
function parseRSS(xml) {
  const items = [];
  // Extract <item> elements
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null && items.length < 20) {
    const block = match[1];
    const title = extractTag(block, 'title');
    const link = extractTag(block, 'link');
    const pubDate = extractTag(block, 'pubDate');
    const description = extractTag(block, 'description');
    const author = extractTag(block, 'author') || extractTag(block, 'dc:creator');

    if (title && link) {
      items.push({
        title: decodeHtml(title),
        link: link,
        pubDate: pubDate || new Date().toUTCString(),
        description: description ? decodeHtml(description.substring(0, 300)) : '',
        author: author || ''
      });
    }
  }
  return items;
}

function extractTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`);
  const m = re.exec(xml);
  return m ? (m[1] || m[2] || '').trim() : '';
}

function decodeHtml(text) {
  return text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");
}
