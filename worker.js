/**
 * Cloudflare Worker — Research Hub
 *  - Serves the static site (index.html) from the public/ directory
 *  - /api/news?category=world|tech|business|ai|us|india|all[&refresh=1]
 *      Fetches r/worldnews (Reddit .rss) + reputable RSS feeds SERVER-SIDE
 *      (no CORS limits), de-duplicates identical/near-identical stories
 *      across ALL feeds AND categories (so a story never repeats under a
 *      different tab), sorts by recency, returns JSON.
 *  - /api/laws — enacted laws + in-progress US bills (GovTrack, last 12 months)
 *  - /api/laws/buzz — public-attention (news coverage) counts for pending bills
 */

const FEEDS = {
  world: [
    { kind: 'reddit', url: 'https://www.reddit.com/r/worldnews/top/.rss?t=day' },
    { kind: 'reddit', url: 'https://www.reddit.com/r/worldnews/.rss' },
    { kind: 'rss', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
    { kind: 'rss', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
    { kind: 'rss', url: 'https://rss.dw.com/rdf/rss-en-all' },
    { kind: 'rss', url: 'https://www.theguardian.com/world/rss' }
  ],
  tech: [
    { kind: 'rss', url: 'https://hnrss.org/frontpage' },
    { kind: 'rss', url: 'https://www.theverge.com/rss/index.xml' },
    { kind: 'rss', url: 'https://www.techmeme.com/feed.xml' },
    { kind: 'rss', url: 'https://www.cnet.com/rss/news/' }
  ],
  business: [
    { kind: 'rss', url: 'https://feeds.bbci.co.uk/news/business/rss.xml' },
    { kind: 'rss', url: 'https://feeds.bloomberg.com/markets/news.rss' },
    { kind: 'rss', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114' },
    { kind: 'rss', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories' }
  ],
  ai: [
    { kind: 'rss', url: 'https://www.technologyreview.com/feed/' },
    { kind: 'rss', url: 'https://techcrunch.com/category/artificial-intelligence/feed/' },
    { kind: 'rss', url: 'https://feeds.arstechnica.com/arstechnica/technology-lab' },
    { kind: 'rss', url: 'https://www.wired.com/feed/rss' }
  ],
  us: [
    { kind: 'rss', url: 'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml' },
    { kind: 'rss', url: 'https://feeds.npr.org/1001/rss.xml' },
    { kind: 'rss', url: 'https://rss.politico.com/politics-news.xml' }
  ],
  india: [
    { kind: 'rss', url: 'https://www.thehindu.com/feeder/default.rss' },
    { kind: 'rss', url: 'https://www.indianexpress.com/feed/' },
    { kind: 'rss', url: 'https://feeds.bbci.co.uk/news/world/asia/india/rss.xml' }
  ]
};

const PER_FEED_LIMIT = 8;   // items kept per RSS feed
const REDDIT_LIMIT = 25;    // items kept per Reddit listing
const TOTAL_LIMIT = 40;     // items returned per category
const TOTAL_ALL_LIMIT = 100; // items returned for the combined "all" feed
const CACHE_TTL_MS = 5 * 60 * 1000;

// Everything is fetched in one pass and de-duplicated across all categories,
// so the same story only ever appears under a single tab.
const cache = { ts: 0, byCategory: {}, all: null };

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

// Public-attention proxy: count Google News articles mentioning a bill number in the last 7 days.
const NEWS_BASE = 'https://news.google.com/rss/search?hl=en-US&gl=US&ceid=US:en&q=';
const BING_NEWS_BASE = 'https://www.bing.com/news/search?setlang=en-US&format=rss&q=';
// Cloudflare caps subrequests at 50/invocation, so keep the total well under:
//   BUZZ_TOP_N bills × (2 Google attempts + 1 Bing fallback) + 9 GovTrack ≤ ~40
const BUZZ_TOP_N = 8;   // how many recent pending bills get a news-buzz check
const BUZZ_BATCH = 4;   // concurrent news fetches per wave (Google 503s on bursts)

// Browser-like headers — Google News intermittently 503s plain bot UAs.
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// ═══════════════════════════════════════════════════════════════════
// AUCTION FINDER — read-only proxy for auction.triangleliquidators.com
// (scraping + scoring logic ported from the Deal project's backend/app.py)
// ═══════════════════════════════════════════════════════════════════
const AUCTION_ORIGIN = 'https://auction.triangleliquidators.com';
const AUCTION_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const AUCTION_CACHE_TTL = 120 * 1000;    // auctions + lots (fresh scrapes)
const IMAGE_CACHE_TTL = 10 * 60 * 1000;  // lot image galleries
const LOT_PAGE_LIMIT = 500;

const auctionCache = new Map(); // key -> { ts, ttl, value }

function aCacheGet(key) {
  const hit = auctionCache.get(key);
  if (hit && Date.now() - hit.ts < hit.ttl) return hit.value;
  return undefined;
}
function aCacheSet(key, value, ttl) {
  auctionCache.set(key, { ts: Date.now(), ttl, value });
}

function auctionFetch(url) {
  return fetch(url, {
    headers: { 'User-Agent': AUCTION_UA },
    redirect: 'follow'
  });
}

function parseViewVars(html) {
  const m = /viewVars\s*=\s*(\{.*?\});/.exec(html);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch (e) { return null; }
}

// ── Auctions ───────────────────────────────────────────────────────
async function fetchAuctions() {
  const cached = aCacheGet('auctions');
  if (cached) return cached;

  const resp = await auctionFetch(AUCTION_ORIGIN + '/');
  if (!resp.ok) throw new Error(`Auction site HTTP ${resp.status}`);
  const html = await resp.text();
  const vv = parseViewVars(html);
  if (!vv) throw new Error('Could not parse auction homepage');

  let list = (vv.upcomingAuctions && vv.upcomingAuctions.result_page) ||
             (vv.auctions && vv.auctions.result_page) || [];
  const nowMs = Date.now();
  list = list
    .filter(a => a && a.row_id)
    .map(a => ({
      row_id: a.row_id,
      title: a.title || 'Unnamed Auction',
      effective_end_time: a.effective_end_time || '',
      lot_count: a.lot_count || 0,
      location_name: a.location_name || 'Unknown Location',
      cover_thumbnail: a.cover_thumbnail || ''
    }))
    .filter(a => {
      if (!a.effective_end_time) return true;
      const t = new Date(a.effective_end_time).getTime();
      return !isNaN(t) && t >= nowMs;
    })
    .sort((a, b) => (a.effective_end_time || '').localeCompare(b.effective_end_time || ''));

  aCacheSet('auctions', list, AUCTION_CACHE_TTL);
  return list;
}

// ── Lot parsing / scoring (ported 1:1 from backend/app.py) ─────────
const POPULAR_BRANDS_HIGH = ['ryobi', 'dewalt', 'ge', 'general electric', 'samsung', 'rheem', 'milwaukee', 'craftsman', 'makita', 'ridgid'];
const POPULAR_BRANDS_MED = ['style selections', 'kobalt', 'allen + roth', 'moen', 'kohler', 'delta', 'whirlpool', 'lg'];

const BABY_KEYWORDS = [
  /\bbaby\b/, /\binfant\b/, /\btoddler\b/, /\bnewborn\b/, /\bdiaper\b/,
  /\bcrib\b/, /\bstroller\b/, /\bcar\s+seat\b/, /\bpacifier\b/, /\bnursery\b/,
  /\bchild\b/, /\bkids?\b/, /\btoy\b/, /\bplaypen\b/, /\bswaddle\b/,
  /\bbouncer\b/, /\bfeeding\s+bottle\b/, /\bteething\b/
];
const BABY_RANGE_PATTERNS = [
  /(\d+)\s*(?:-|to)\s*(\d+)\s*(?:months?|weeks?|days?|yrs?|years?)/i,
  /(\d+)\s*(?:months?|yrs?|years?|weeks?|days?|[mM]|[tT])\s*(?:\+|plus|and\s+up)/i,
  /(?:ages?|ages)\s*(\d+)\s*(?:-|to)\s*(\d+)/i,
  /(?:ages?|ages)\s*(\d+)\s*(?:\+|plus|and\s+up)/i,
  /\b(\d+)[tT]\b/,
  /\b(\d+)[mM]\b/
];

function parseRetailPrice(title, desc) {
  const descMatch = /Retail\s+Price:\s*\$([\d,]+(?:\.\d{2})?)/i.exec(desc);
  if (descMatch) {
    const n = parseFloat(descMatch[1].replace(/,/g, ''));
    if (!isNaN(n)) return n;
  }
  const titleMatch = /^\$([\d,]+(?:\.\d{2})?)/.exec(title);
  if (titleMatch) {
    const n = parseFloat(titleMatch[1].replace(/,/g, ''));
    if (!isNaN(n)) return n;
  }
  return null;
}

function parseCondition(desc) {
  const match = /Condition:\s*([A-C])\s*-\s*([^<]+)/i.exec(desc);
  if (match) {
    let text = match[2].trim();
    if (text.endsWith('.')) text = text.slice(0, -1);
    return [match[1].toUpperCase(), text];
  }
  return ['C', 'Used/Untested/Damaged (Default)'];
}

function parseBabyAgeRange(title, desc) {
  const text = `${title} ${desc}`.toLowerCase();
  const isBaby = BABY_KEYWORDS.some(kw => kw.test(text));
  if (!isBaby) return null;

  for (const pattern of BABY_RANGE_PATTERNS) {
    const match = pattern.exec(text);
    if (!match) continue;
    const groups = match.slice(1).filter(g => g !== undefined && g !== '');
    const span = match[0].toLowerCase();
    if (groups.length === 2) {
      const unit = /yr|year|age/.test(span) ? 'years' : 'months';
      return `${groups[0]}-${groups[1]} ${unit}`;
    } else if (groups.length === 1) {
      if (span.includes('t')) return `${groups[0]}T (Toddler)`;
      if (span.includes('m')) return `${groups[0]} Months`;
      const unit = /yr|year|age/.test(span) ? 'years' : 'months';
      return `${groups[0]}+ ${unit}`;
    }
  }

  if (['newborn', 'infant'].some(k => text.includes(k))) return '0-12 months';
  if (text.includes('toddler')) return '1-3 years';
  if (['kids', 'child'].some(k => text.includes(k))) return '3-8 years';
  return '0-36 months (Toddler)';
}

function sumCharCodes(s) {
  let sum = 0;
  for (let i = 0; i < s.length; i++) sum += s.charCodeAt(i);
  return sum;
}

function parseLot(lot, locationFee) {
  const rowId = lot.row_id;
  if (!rowId) return null;

  const title = lot.title || '';
  const desc = lot.truncated_description || '';
  const retailPrice = parseRetailPrice(title, desc);
  const [condCode, condText] = parseCondition(desc);
  const babyAgeRange = parseBabyAgeRange(title, desc);

  let brand = '';
  const brandMatch = /Brand:\s*([^<]+)/i.exec(desc);
  if (brandMatch) brand = brandMatch[1].trim();

  let currentBid = 1.0;
  let bidCount = 0;
  const bidInfo = lot.timed_auction_bid;
  if (bidInfo) {
    if (bidInfo.amount) {
      const n = parseFloat(bidInfo.amount);
      if (!isNaN(n)) currentBid = n;
    }
    if (bidInfo.bid_count != null) {
      const c = parseInt(bidInfo.bid_count, 10);
      if (!isNaN(c)) bidCount = c;
    }
  } else {
    const sp = parseFloat(lot.starting_price);
    if (!isNaN(sp)) currentBid = sp;
  }

  const totalPrice = Math.round((currentBid * 1.2225 + locationFee) * 100) / 100;

  const brandLower = brand.toLowerCase();
  let brandPts = 5.0;
  if (POPULAR_BRANDS_HIGH.some(b => brandLower.includes(b))) brandPts = 40.0;
  else if (POPULAR_BRANDS_MED.some(b => brandLower.includes(b))) brandPts = 20.0;
  const popularityScore = Math.min(100, bidCount * 8 + brandPts);

  // Estimated retail (Amazon-style) price: retail * 0.95 + small per-lot
  // jitter. Declared early because resale scoring uses it.
  let amazonPrice = null;
  if (retailPrice != null) {
    const offsetPct = rowId ? -0.05 + (sumCharCodes(rowId) % 8) * 0.01 : 0;
    amazonPrice = Math.round(retailPrice * (0.95 + offsetPct) * 100) / 100;
  }

  let baseResale = 15.0;
  if (condCode === 'A') baseResale = 60.0;
  else if (condCode === 'B') baseResale = 40.0;

  let marginPts = 0.0;
  if (amazonPrice && amazonPrice > 0) {
    const marginPct = ((amazonPrice - totalPrice) / amazonPrice) * 100;
    if (marginPct > 60) marginPts = 40.0;
    else if (marginPct > 40) marginPts = 25.0;
    else if (marginPct > 20) marginPts = 10.0;
    else if (marginPct <= 0) marginPts = -20.0;
  }
  const resaleScore = Math.max(0, Math.min(100, baseResale + marginPts));

  // ── Recommended max bid ──
  // Start from the condition-based target % of retail, then raise it for
  // items that are popular (bid competition) or have strong resale value.
  const basePct = condCode === 'A' ? 50 : condCode === 'B' ? 35 : 15;
  let popularityAdj = 0;
  let resaleAdj = 0;
  if (retailPrice != null) {
    if (popularityScore >= 60) popularityAdj = 5;
    else if (popularityScore >= 30) popularityAdj = 2;
    if (resaleScore >= 60) resaleAdj = 5;
    else if (resaleScore >= 35) resaleAdj = 2;
  }
  const targetPct = Math.max(10, Math.min(70, basePct + popularityAdj + resaleAdj));

  let recommendedBid = null;
  let dealScore = 0.0;
  if (retailPrice != null) {
    recommendedBid = Math.max(0, Math.round(((retailPrice * (targetPct / 100) - locationFee) / 1.2225) * 100) / 100);
    if (amazonPrice > 0) {
      dealScore = Math.max(0, Math.round(((amazonPrice - totalPrice) / amazonPrice) * 100 * 10) / 10);
    }
  }

  return {
    row_id: rowId,
    auction_id: lot.auction_id || null,
    lot_number: lot.lot_number != null ? lot.lot_number : 0,
    title,
    condition_code: condCode,
    condition_text: condText,
    description: desc,
    image_url: lot.cover_thumbnail || '',
    retail_price: retailPrice,
    amazon_price: amazonPrice,
    current_bid: currentBid,
    recommended_bid: recommendedBid,
    deal_score: dealScore,
    time_left: lot.time_left || '',
    total_price: totalPrice,
    popularity_score: popularityScore,
    resale_score: resaleScore,
    baby_age_range: babyAgeRange,
    // Use the site's slug-based public lot URL (the short /lots/view/{id}
    // redirects to an auth-required page in browsers).
    detail_url: (typeof lot._detail_url === 'string' && lot._detail_url.startsWith('/'))
      ? AUCTION_ORIGIN + lot._detail_url
      : '',
    recommend: { base_pct: basePct, popularity_adj: popularityAdj, resale_adj: resaleAdj, target_pct: targetPct }
  };
}

async function scrapeAuctionLots(auctionId, locationName) {
  const cacheKey = `lots:${auctionId}`;
  const cached = aCacheGet(cacheKey);
  if (cached) return cached;

  const isAnderson = (locationName || '').toLowerCase().includes('anderson');
  const locationFee = isAnderson ? 5.0 : 0.0;

  const lots = [];
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const url = `${AUCTION_ORIGIN}/ajax/lots/${auctionId}?limit=${LOT_PAGE_LIMIT}&page=${page}`;
    let data;
    try {
      const resp = await auctionFetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      data = await resp.json();
    } catch (e) {
      console.log(`[Auction] error fetching lots page ${page} for ${auctionId}: ${e.message}`);
      break;
    }
    const pageLots = data.result_page || [];
    if (!pageLots.length) break;
    for (const lot of pageLots) {
      const parsed = parseLot(lot, locationFee);
      if (parsed) lots.push(parsed);
    }
    const nextPage = data.query_info && data.query_info.next_page;
    if (nextPage && pageLots.length === LOT_PAGE_LIMIT) page++;
    else hasMore = false;
  }

  aCacheSet(cacheKey, lots, AUCTION_CACHE_TTL);
  return lots;
}

// ── Filtering / sorting / stats ────────────────────────────────────
// Whole-word matching (with plural tolerance) so keyword filters don't
// match substrings like "Toyota" -> "toy" or boilerplate descriptions
// like "child lock" / "suitable for pets & kids".
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Builds a regex matching a whole word plus a trailing plural (s/es).
function wordPattern(word) {
  return new RegExp('\\b' + escapeRegExp(word) + '(?:s|es)?\\b', 'i');
}

// Deal profiles match the product TITLE only (titles are product names;
// descriptions carry generic retail boilerplate that causes false hits).
const PROFILE_TITLE_PATTERNS = {
  kids_gift: /\b(?:toy|game|kid|child(?:ren)?|lego|puzzle|doll|playset|board game|action figure|stuffed animal|bounce house)(?:s|es)?\b/i,
  adults_gift: /\b(?:watch|speaker|espresso|coffee|massager|perfume|cologne|headphone|gadget|wine|air fryer|smart ?watch|whiskey|bourbon|scotch)(?:s|es)?\b/i,
  home: /\b(?:vacuum|faucet|trash|detergent|organizer|storage|towel|cleaner|soap|light|pressure washer|dehumidifier|air conditioner|air purifier|curtain|basket|mat|shelf)(?:s|es)?\b|\btool(?:s|box)\b/i
};

function matchesSearch(l, q) {
  const range = (l.baby_age_range || '').toLowerCase();
  if (range.includes(q)) return true;
  // Strict: every query word must appear in the product TITLE as a whole
  // word (plural-tolerant). Descriptions carry retail boilerplate ("child
  // lock", "post-game", "photographing toys") that would cause junk hits.
  const title = (l.title || '').toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  return words.every(w => wordPattern(w).test(title));
}

function applyLotFilters(lots, search, condition, profile) {
  let list = lots;
  if (profile === 'baby') {
    list = list.filter(l => l.baby_age_range);
  } else if (profile === 'resell') {
    list = list.filter(l => l.condition_code === 'A' || l.condition_code === 'B');
  } else if (profile && PROFILE_TITLE_PATTERNS[profile]) {
    const re = PROFILE_TITLE_PATTERNS[profile];
    list = list.filter(l => re.test((l.title || '').toLowerCase()));
  }

  if (search) {
    const q = search.toLowerCase();
    if (q === 'baby') {
      list = list.filter(l => l.baby_age_range);
    } else {
      list = list.filter(l => matchesSearch(l, q));
    }
  }

  if (condition && condition !== 'all') {
    list = list.filter(l => l.condition_code === condition);
  }
  return list;
}

const VALID_SORTS = new Set(['lot_number', 'current_bid', 'retail_price', 'deal_score', 'popularity_score', 'resale_score']);

function sortLots(lots, sortBy, sortOrder) {
  const dir = sortOrder.toLowerCase() === 'asc' ? 1 : -1;
  const isScore = sortBy === 'deal_score' || sortBy === 'resale_score';
  lots.sort((a, b) => {
    if (isScore) {
      const an = a.retail_price == null ? 1 : 0;
      const bn = b.retail_price == null ? 1 : 0;
      if (an !== bn) return an - bn;
    }
    const av = a[sortBy] == null ? 0 : a[sortBy];
    const bv = b[sortBy] == null ? 0 : b[sortBy];
    if (av < bv) return -dir;
    if (av > bv) return dir;
    return 0;
  });
}

async function resolveAuctionsByIds(ids) {
  const auctions = await fetchAuctions();
  const byId = new Map(auctions.map(a => [a.row_id, a]));
  const groups = [];
  for (const id of ids) {
    const auc = byId.get(id);
    const lots = await scrapeAuctionLots(id, auc ? auc.location_name : '');
    groups.push({
      auction: auc || { row_id: id, title: id, location_name: '' },
      lots
    });
  }
  return groups;
}

async function handleAuctions() {
  try {
    const auctions = await fetchAuctions();
    return json({ status: 'ok', auctions });
  } catch (e) {
    return json({ error: e.message }, 502);
  }
}

async function handleLots(url) {
  const auctionId = url.searchParams.get('auction_id') || '';
  const auctionIds = url.searchParams.get('auction_ids') || '';
  const search = url.searchParams.get('search') || '';
  const condition = url.searchParams.get('condition') || 'all';
  let sortBy = url.searchParams.get('sort_by') || 'deal_score';
  const sortOrder = url.searchParams.get('sort_order') || 'desc';
  const profile = url.searchParams.get('profile') || '';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10) || 100, 200);
  const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0);

  const ids = [];
  if (auctionIds) ids.push(...auctionIds.split(',').map(s => s.trim()).filter(Boolean));
  else if (auctionId) ids.push(auctionId);
  if (!ids.length) return json({ status: 'ok', total: 0, lots: [] });

  try {
    const groups = await resolveAuctionsByIds(ids);
    let all = [];
    for (const g of groups) {
      const auc = g.auction;
      for (const l of g.lots) {
        all.push({ ...l, location_name: auc.location_name, auction_title: auc.title });
      }
    }

    if (profile === 'resell' && sortBy === 'deal_score') sortBy = 'resale_score';
    if (!VALID_SORTS.has(sortBy)) sortBy = 'deal_score';

    const filtered = applyLotFilters(all, search, condition, profile);
    const total = filtered.length;
    sortLots(filtered, sortBy, sortOrder);
    const lots = filtered.slice(offset, offset + limit);
    return json({ status: 'ok', total, lots });
  } catch (e) {
    return json({ error: e.message }, 502);
  }
}

async function handleStats(url) {
  const auctionId = url.searchParams.get('auction_id') || '';
  const auctionIds = url.searchParams.get('auction_ids') || '';
  const profile = url.searchParams.get('profile') || '';

  const ids = [];
  if (auctionIds) ids.push(...auctionIds.split(',').map(s => s.trim()).filter(Boolean));
  else if (auctionId) ids.push(auctionId);

  const emptyStats = { status: 'ok', total_lots: 0, with_price_count: 0, steals_count: 0, average_discount: 0, avg_retail_price: 0, avg_current_bid: 0, avg_total_price: 0 };
  if (!ids.length) return json(emptyStats);

  try {
    const groups = await resolveAuctionsByIds(ids);
    let all = [];
    for (const g of groups) all.push(...g.lots);
    const list = applyLotFilters(all, '', 'all', profile);
    if (!list.length) return json(emptyStats);

    const withPrice = list.filter(l => l.retail_price != null);
    const avg = (arr, key) => arr.length ? Math.round((arr.reduce((s, l) => s + (l[key] || 0), 0) / arr.length) * 100) / 100 : 0;

    const steals = list.filter(l => l.retail_price != null && l.current_bid <= (l.recommended_bid == null ? Infinity : l.recommended_bid)).length;
    const discount = avg(list.filter(l => l.retail_price != null), 'deal_score');

    return json({
      status: 'ok',
      total_lots: list.length,
      with_price_count: withPrice.length,
      steals_count: steals,
      average_discount: Math.round(discount * 10) / 10,
      avg_retail_price: avg(withPrice, 'retail_price'),
      avg_current_bid: avg(withPrice, 'current_bid'),
      avg_total_price: avg(withPrice, 'total_price')
    });
  } catch (e) {
    return json({ error: e.message }, 502);
  }
}

async function handleLotImages(url) {
  const rowId = url.searchParams.get('row_id') || '';
  if (!rowId) return json({ error: 'row_id required' }, 400);

  const key = `images:${rowId}`;
  const cached = aCacheGet(key);
  if (cached) return json({ status: 'ok', images: cached });

  let images = [];
  try {
    const resp = await auctionFetch(`${AUCTION_ORIGIN}/lots/view/${rowId}`);
    if (resp.ok) {
      const html = await resp.text();
      const vv = parseViewVars(html);
      const lot = vv && vv.lot;
      if (lot && Array.isArray(lot.images)) {
        images = lot.images.map(i => i.detail_url).filter(Boolean);
      }
    }
  } catch (e) {
    console.log(`[Auction] error fetching images for ${rowId}: ${e.message}`);
  }

  aCacheSet(key, images, IMAGE_CACHE_TTL);
  return json({ status: 'ok', images });
}

// ── Watchlist (KV-persisted + live-synced to the auction account) ──
// Ported from the Deal project's LiveAuctionSessionManager: POST the
// credentials to /login, keep the PHPSESSID cookie, then hit
// /ajax/{watch-lot|unwatch-lot}/{id}. Credentials live in Worker
// secrets (AUCTION_USERNAME / AUCTION_PASSWORD) — never in code.
const WATCHLIST_KEY = 'watchlist';

async function watchlistGet(env) {
  try {
    const v = await env.DEAL_KV.get(WATCHLIST_KEY, 'json');
    return Array.isArray(v) ? v : [];
  } catch (e) {
    return [];
  }
}

async function watchlistSet(env, list) {
  try {
    await env.DEAL_KV.put(WATCHLIST_KEY, JSON.stringify(list));
  } catch (e) {
    console.log(`[Watchlist] KV write failed: ${e.message}`);
  }
}

async function liveLogin(env) {
  const username = env.AUCTION_USERNAME;
  const password = env.AUCTION_PASSWORD;
  if (!username || !password) return null;
  try {
    const resp = await fetch(AUCTION_ORIGIN + '/login', {
      method: 'POST',
      headers: {
        'User-Agent': AUCTION_UA,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ username, password }).toString(),
      redirect: 'manual'
    });
    const setCookies = resp.headers.getSetCookie ? resp.headers.getSetCookie() : [];
    const cookie = setCookies.map(c => c.split(';')[0]).join('; ');
    return cookie || null;
  } catch (e) {
    console.log(`[Watchlist] login error: ${e.message}`);
    return null;
  }
}

async function liveToggleWatch(env, rowId, watch) {
  const cookie = await liveLogin(env);
  if (!cookie) return { ok: false, error: 'Could not authenticate with auction platform (secrets missing?)' };
  try {
    const action = watch ? 'watch-lot' : 'unwatch-lot';
    const resp = await fetch(`${AUCTION_ORIGIN}/ajax/${action}/${rowId}`, {
      headers: { 'User-Agent': AUCTION_UA, 'Cookie': cookie },
      redirect: 'follow'
    });
    if (!resp.ok) return { ok: false, error: `HTTP ${resp.status}` };
    const data = await resp.json().catch(() => null);
    const code = data && data.responseCode;
    if (code === 200) return { ok: true };
    return { ok: false, error: (data && (data.message || data.error)) || `responseCode ${code}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function handleWatchlistGet(env) {
  const list = await watchlistGet(env);
  return json({ status: 'ok', lots: list });
}

async function handleWatchlistToggle(request, env) {
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'Invalid JSON body' }, 400); }
  const rowId = (body.row_id || '').toString();
  if (!rowId) return json({ error: 'row_id required' }, 400);

  const list = await watchlistGet(env);
  const idx = list.findIndex(l => l.row_id === rowId);
  const watched = body.watched != null ? !!body.watched : idx === -1;

  if (watched) {
    if (idx === -1) {
      list.push(body.lot ? { ...body.lot, added_at: new Date().toISOString() } : { row_id: rowId, added_at: new Date().toISOString() });
    }
  } else if (idx !== -1) {
    list.splice(idx, 1);
  }
  await watchlistSet(env, list);

  // Best-effort live sync to the account on the auction platform.
  const sync = await liveToggleWatch(env, rowId, watched);
  return json({
    status: 'ok',
    watched,
    synced: !!(sync && sync.ok),
    sync_error: sync && !sync.ok ? sync.error : null
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/news') {
      const category = url.searchParams.get('category') || 'world';
      return handleNews(category, url.searchParams.has('refresh'));
    }

    if (url.pathname === '/api/laws') {
      return safe(handleLaws());
    }

    if (url.pathname === '/api/laws/buzz') {
      return safe(handleLawsBuzz());
    }

    if (url.pathname === '/api/auctions') return handleAuctions();
    if (url.pathname === '/api/lots') return handleLots(url);
    if (url.pathname === '/api/stats') return handleStats(url);
    if (url.pathname === '/api/lot/images') return handleLotImages(url);
    if (url.pathname === '/api/watchlist') {
      if (request.method === 'GET') return handleWatchlistGet(env);
      if (request.method === 'POST') return handleWatchlistToggle(request, env);
      return json({ error: 'Method not allowed' }, 405);
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
      // Always revalidate the HTML so a freshly deployed dashboard shows up
      // immediately (avoids browsers/CDNs serving a stale page).
      headers.set('Cache-Control', 'no-cache');
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

// ── News ──────────────────────────────────────────────────────────────
async function handleNews(category, refresh) {
  if (category !== 'all' && !FEEDS[category]) {
    return json({ error: 'Unknown category' }, 400);
  }

  const now = Date.now();
  const fresh = now - cache.ts < CACHE_TTL_MS;

  // Cache hit (unless the client explicitly asked to refresh)?
  if (!refresh && fresh && cache.all) {
    return json({ status: 'ok', items: itemsFor(category), cached: true });
  }

  try {
    const { byCategory, all } = await fetchAllNews();
    cache.ts = now;
    cache.byCategory = byCategory;
    cache.all = all;
    return json({ status: 'ok', items: itemsFor(category), cached: false });
  } catch (err) {
    // Never break the UI on a transient failure — serve stale if we have it.
    if (cache.all) {
      return json({ status: 'ok', items: itemsFor(category), cached: true, stale: true });
    }
    return json({ status: 'error', message: String(err && err.message || err) }, 502);
  }
}

function itemsFor(category) {
  return category === 'all' ? (cache.all || []) : (cache.byCategory[category] || []);
}

async function fetchAllNews() {
  // Fetch every category's feeds in parallel, tagging each item with the
  // category it came from so de-duplication can claim it for exactly one tab.
  const perCategory = await Promise.all(
    Object.keys(FEEDS).map(async (category) => {
      const feeds = FEEDS[category];
      const results = await Promise.allSettled(
        feeds.map((feed) =>
          fetchFeed(feed).then((items) =>
            items.map((it) => ({ ...it, sourceCategory: category }))
          )
        )
      );
      return results
        .filter((r) => r.status === 'fulfilled')
        .flatMap((r) => r.value);
    })
  );

  const unique = dedupe(perCategory.flat());

  const byCategory = {};
  for (const cat of Object.keys(FEEDS)) byCategory[cat] = [];

  for (const item of unique) {
    item.category = item.sourceCategory; // keep the flair on the item
    delete item.sourceCategory;
    byCategory[item.category].push(item);
  }

  for (const cat of Object.keys(FEEDS)) {
    byCategory[cat].sort((a, b) => (b.pubDateMs || 0) - (a.pubDateMs || 0));
    byCategory[cat] = byCategory[cat].slice(0, TOTAL_LIMIT);
  }

  const all = unique
    .slice()
    .sort((a, b) => (b.pubDateMs || 0) - (a.pubDateMs || 0))
    .slice(0, TOTAL_ALL_LIMIT);

  return { byCategory, all };
}

async function fetchFeed(feed) {
  const resp = await fetch(feed.url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ResearchHub/1.0; +news aggregator)' },
    redirect: 'follow'
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const text = await resp.text();
  const items = feed.kind === 'reddit' ? parseRedditAtom(text) : parseRSS(text);
  const limit = feed.kind === 'reddit' ? REDDIT_LIMIT : PER_FEED_LIMIT;
  return items.slice(0, limit);
}

// ── De-duplication ────────────────────────────────────────────────────
// (1) Exact match on a normalized title (catches identical syndicated
//     headlines appearing in multiple feeds).
// (2) Near-duplicate: two titles whose significant words overlap heavily
//     are treated as the same story (catches re-worded headlines).
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'else', 'of', 'to', 'in',
  'on', 'at', 'by', 'for', 'with', 'about', 'against', 'between', 'into',
  'through', 'during', 'before', 'after', 'above', 'below', 'from', 'up',
  'down', 'out', 'off', 'over', 'under', 'again', 'further', 'once', 'here',
  'there', 'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few',
  'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
  'same', 'so', 'than', 'too', 'very', 'can', 'will', 'just', 'should', 'now',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'it', 'its', 'this', 'that', 'these', 'those', 'am',
  'they', 'them', 'their', 'what', 'which', 'who', 'whom', 'his', 'her', 'he',
  'she', 'we', 'our', 'you', 'your', 'us', 'as', 'i', 'me', 'my', 's', 't',
  'vs', 'amid', 'new', 'says', 'say', 'said', 'report', 'reports', 'reported',
  'first', 'last', 'one', 'two', 'after', 'year', 'years', 'day', 'days',
  'week', 'weekend', 'official', 'officials', 'watch', 'video', 'live',
  'update', 'updates', 'latest', 'breaking', 'exclusive', 'story'
]);

function normalizeTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/[^a-z0-9']+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w && (w.length >= 2 || w === 'a' || w === 'i'))
    .join(' ');
}

function titleTokens(title) {
  return new Set(
    String(title || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
  );
}

function isNearDuplicate(a, b) {
  if (a.size < 4 || b.size < 4) return false;
  const smaller = a.size <= b.size ? a : b;
  const larger = a.size <= b.size ? b : a;
  let inter = 0;
  for (const w of smaller) if (larger.has(w)) inter++;
  return inter / smaller.size >= 0.7;
}

function dedupe(items) {
  const seenKeys = new Set();
  const seen = []; // { key, tokens }
  const out = [];

  for (const item of items) {
    const key = normalizeTitle(item.title);
    if (!key || seenKeys.has(key)) continue;

    const tokens = titleTokens(item.title);
    let dup = false;
    for (const s of seen) {
      if (isNearDuplicate(tokens, s.tokens)) { dup = true; break; }
    }
    if (dup) continue;

    seenKeys.add(key);
    seen.push({ key, tokens });
    out.push(item);
  }

  return out;
}

// ── Parsers ───────────────────────────────────────────────────────────
// Reddit's public .json API is deprecated/blocked (403) as of mid-2026,
// but the .rss Atom feed still works unauthenticated. It embeds the
// article URL as the "[link]" anchor inside its HTML-escaped <content>.
function parseRedditAtom(text) {
  const items = [];
  const entryRe = /<entry[\s>]([\s\S]*?)<\/entry>/gi;
  let m;
  while ((m = entryRe.exec(text)) !== null && items.length < 30) {
    const block = m[1];
    const title = textOf(block, 'title');
    const comments = attrOf(block, 'link', 'href');
    const content = decodeEntities(textOf(block, 'content'));
    const lm = /href="([^"]+)"[^>]*>\[link\]/i.exec(content);
    const article = lm ? decodeEntities(lm[1]) : '';
    if (!title || !article) continue;

    // Drop sticky/meta posts: self posts, live threads, mod announcements.
    const host = hostOf(article);
    if (host === 'reddit.com') continue;
    if (/moderator/i.test(title)) continue;

    const pubDate = textOf(block, 'updated') || textOf(block, 'published') || '';
    items.push({
      title,
      link: article,
      pubDate,
      pubDateMs: pubDate ? Date.parse(pubDate) || 0 : 0,
      domain: host,
      subreddit: 'worldnews',
      comments
    });
  }

  return items;
}

// Common HTML named entities (the numeric forms are handled generically below).
const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '\u2014', ndash: '\u2013', hellip: '\u2026',
  lsquo: '\u2018', rsquo: '\u2019', sbquo: '\u201A',
  ldquo: '\u201C', rdquo: '\u201D', bdquo: '\u201E',
  laquo: '\u00AB', raquo: '\u00BB', bull: '\u2022', middot: '\u00B7',
  eacute: '\u00E9', egrave: '\u00E8', ecirc: '\u00EA', euml: '\u00EB',
  aacute: '\u00E1', agrave: '\u00E0', acirc: '\u00E2', auml: '\u00E4', aring: '\u00E5', aelig: '\u00E6',
  iacute: '\u00ED', igrave: '\u00EC', icirc: '\u00EE', iuml: '\u00EF',
  oacute: '\u00F3', ograve: '\u00F2', ocirc: '\u00F4', ouml: '\u00F6', oslash: '\u00F8',
  uacute: '\u00FA', ugrave: '\u00F9', ucirc: '\u00FB', uuml: '\u00FC',
  yacute: '\u00FD', yuml: '\u00FF', ntilde: '\u00F1', ccedil: '\u00E7',
  szlig: '\u00DF', eth: '\u00F0', thorn: '\u00FE',
  Eacute: '\u00C9', Egrave: '\u00C8', Ecirc: '\u00CA', Euml: '\u00CB',
  Aacute: '\u00C1', Agrave: '\u00C0', Acirc: '\u00C2', Auml: '\u00C4', Aring: '\u00C5', AElig: '\u00C6',
  Iacute: '\u00CD', Igrave: '\u00CC', Icirc: '\u00CE', Iuml: '\u00CF',
  Oacute: '\u00D3', Ograve: '\u00D2', Ocirc: '\u00D4', Ouml: '\u00D6', Oslash: '\u00D8',
  Uacute: '\u00DA', Ugrave: '\u00D9', Ucirc: '\u00DB', Uuml: '\u00DC',
  Yacute: '\u00DD', Ntilde: '\u00D1', Ccedil: '\u00C7', THORN: '\u00DE'
};

// Decode HTML entities in RSS titles/descriptions. Handles numeric forms
// (&#8217;, &#x2019;), the common named forms (&apos;, &quot;, &nbsp;), the
// wider named set feeds actually emit (&rsquo;, &mdash;, &hellip;, accented
// letters via NAMED_ENTITIES), and double-escaped forms ("&amp;#8217;"). The
// loop re-scans until nothing decodable remains, so every level of escaping
// resolves to the final character.
function decodeEntities(s) {
  if (!s) return s;
  for (let i = 0; i < 4; i++) {
    const out = s
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&nbsp;/g, ' ')
      .replace(/&#x([0-9a-f]+);/gi, (m, h) => fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (m, d) => fromCodePoint(parseInt(d, 10)))
      .replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (m, name) => NAMED_ENTITIES[name] || m);
    if (out === s || !/[&]/.test(out)) return out;
    s = out;
  }
  return s;
}

function fromCodePoint(n) {
  try { return String.fromCodePoint(n); } catch (e) { return ''; }
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
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
        pubDateMs: pubDate ? Date.parse(pubDate) || 0 : 0,
        domain: hostOf(link)
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
          pubDateMs: pubDate ? Date.parse(pubDate) || 0 : 0,
          domain: hostOf(link)
        });
      }
    }
  }

  return items;
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

// ── Laws ──────────────────────────────────────────────────────────────
// Fetch with a hard timeout so a slow upstream can't stall a request.
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
}

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
