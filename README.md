# 📚 Research Hub

A single-page dashboard that brings together **120+ research databases** from:

- **📍 NC Libraries** — Wake Tech, Wake County Public Libraries, and NC LIVE resources
- **🌐 International** — Open-access publishers, preprint servers, and academic search engines
- **🇮🇳 India** — Indian theses repositories, journals, legal databases, government data, and more
- **⚡ Sci-Hub** — 85M+ free scholarly articles
- **📰 News** — Live multi-source news with media bias ratings (World, Tech, Business, AI, US, India)

### Features

- 🔍 **Search** across all databases by name, keyword, or subject
- 🏷️ **Filter** by access type (NC LIVE Shared / Wake Tech / Wake County / Open Access / India)
- 📂 **Section toggle** — view NC, International, or India resources independently
- 📊 **Subject pills** — narrow by 14+ categories
- 🌟 **Popular Picks** — hand-picked recommendations at the top
- 📰 **Live news** — aggregated RSS from BBC, Al Jazeera, DW, The Guardian, NPR, Politico, Bloomberg, CNBC, Hacker News, The Verge, TechCrunch, MIT Tech Review, The Hindu, Indian Express — each article bias-rated via AllSides
- 🔴 **Impact badges** — Breaking (< 2h) / Today, sorted by recency

### Architecture

- **`index.html`** — the dashboard UI (pure HTML/CSS/JS, served as a static asset)
- **`worker.js`** — a Cloudflare Worker that:
  1. serves the static site, and
  2. exposes `/api/news?category=world|tech|business|ai|india|us` — fetching multiple RSS feeds **server-side** (no CORS limits), merging + sorting by recency
- **Fallback:** if `/api/news` isn't available, the page automatically falls back to a direct BBC RSS fetch (CORS-enabled) so news never breaks

### Deploy (Cloudflare Worker)

```bash
# 1. One-time: authorize wrangler with your Cloudflare account
npx wrangler login

# 2. Serve locally to test (http://localhost:8787)
npm run dev

# 3. Publish to your Worker (research-hub.pintun8.workers.dev)
npm run deploy
# = npx wrangler deploy
```

After deploy, visit `https://research-hub.pintun8.workers.dev` — the news section will use the
multi-source `/api/news` route automatically.

### Alternative: static-only hosting

If you prefer plain static hosting (Cloudflare Pages / Netlify / Vercel / local), just upload
`index.html`. News will fall back to direct BBC RSS (CORS-enabled) — single source, but no server needed.

### Data Sources

- [Wake Tech A-Z Databases](https://researchguides.waketech.edu/az/databases)
- [NC LIVE](https://www.nclive.org/)
- [Wake County Public Libraries](https://www.wake.gov/departments-government/libraries)
- [Shodhganga / INFLIBNET](https://shodhganga.inflibnet.ac.in/)
- [National Digital Library of India](https://ndl.iitkgp.ac.in/)
- [AllSides Media Bias Ratings](https://www.allsides.com/media-bias/media-bias-ratings)

### License

MIT
