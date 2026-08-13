# 📚 Research Hub

A single-page dashboard that brings together **120+ research databases**, **live multi-source news with media-bias ratings**, and **personalized USA legislation tracking**.

- **📍 NC Libraries** — Wake Tech, Wake County Public Libraries, and NC LIVE resources
- **🌐 International** — Open-access publishers, preprint servers, and academic search engines
- **🇮🇳 India** — Indian theses repositories, journals, legal databases, government data, and more
- **⚡ Sci-Hub** — 85M+ free scholarly articles
- **📰 News** — All World / Tech / Business / AI / US / India news in one feed, each article bias-rated (AllSides), sourced from **r/worldnews (Reddit)** + RSS
- **⚖️ Laws** — All laws and bills from the last 12 months (via [GovTrack](https://www.govtrack.us/)): enacted laws **and** bills still in progress. Real-time, tagged by relevance to your profile (immigration, family, housing, investing), with filters to show only enacted / only in-progress / only items needing attention, and auto-refresh

## Features

- 🔍 **Search** across all databases by name, keyword, or subject
- 🏷️ **Filter** databases by access type (NC LIVE / Wake Tech / Wake County / Open Access / India) and subject
- 📰 **Live news** — aggregated from **r/worldnews (Reddit)** plus RSS from BBC, Al Jazeera, DW, The Guardian, NPR, Politico, Bloomberg, CNBC, Hacker News, The Verge, TechCrunch, MIT Tech Review, The Hindu, Indian Express — loaded in one request and filtered by flair client-side (instant tab switches). Every story is de-duplicated across all feeds and tabs, so no headline repeats under a different flair. Click a flair pill to jump straight to that category
- ⚖️ **Laws** — enacted laws + in-progress bills from the last 12 months, sorted newest-first, auto-refreshing every 10 min. Status filters: all / ✅ enacted / ⏳ in progress / ⚠️ needs attention. Each item shows relevance badges (🛂 Immigration / 👨👩👧 Family / 🏠 Housing / 📈 Investing), status, public law number (when enacted), sponsor, chamber, and date
- 🌟 **Popular Picks** — hand-picked recommendations at the top
- 🔴 **Impact badges** — Breaking (< 2h) / Today, sorted by recency

## Project structure

```
research-hub/
├── public/
│   └── index.html      # THE dashboard UI (single source of truth — edit this)
├── worker.js           # Cloudflare Worker: serves assets + /api/news + /api/laws
├── wrangler.toml       # Cloudflare config (main = worker.js, assets = public/)
├── scripts/
│   ├── check.mjs       # validates inline JS in public/index.html (npm run check)
│   ├── README.md
│   └── legacy/         # historical one-off HTML-patch scripts (reference only)
├── .github/workflows/
│   └── pages.yml       # GitHub Actions → GitHub Pages (deploys public/)
├── package.json        # dev / deploy / check scripts
└── README.md
```

> **Only one `index.html` exists** — `public/index.html`. It is served by the Cloudflare
> Worker *and* deployed to GitHub Pages. Edit that file.

## Architecture

- **`public/index.html`** — the entire dashboard UI (pure HTML/CSS/JS, zero build step)
- **`worker.js`** — Cloudflare Worker that:
  1. serves the static site from `public/`, and
  2. exposes JSON APIs:
     - `/api/news?category=world|tech|business|ai|us|india|all` — r/worldnews + multi-source RSS fetched **server-side** (no CORS limits), de-duplicated across all feeds and categories so a story never repeats under a different tab, merged + sorted by recency
     - `/api/laws` — every law enacted in the past 12 months (signed / 10-day rule / veto override) plus bills still in progress that have passed at least one chamber, deduped and sorted by latest action
- **Resilient front-end:** news/laws API calls try the same origin first, then fall back to the
  deployed Worker's absolute URL (`Access-Control-Allow-Origin: *`), and finally to BBC RSS via a
  chain of CORS-friendly public proxies — so the site stays fully functional on any static host,
  including GitHub Pages

## Development

```bash
npm install          # install wrangler
npm run check        # validate inline JS in public/index.html (run after edits)
npm run dev          # serve locally at http://localhost:8787 (worker + assets)
```

Open `public/index.html` directly in a browser for a static-only preview (news/laws
will hit the deployed Worker via the fallback).

## Deploy

### Cloudflare Worker (primary)

```bash
npm run deploy       # = npx wrangler deploy
# → https://research-hub.pintun8.workers.dev
```

### GitHub Pages (mirror)

Push to `master` and the [GitHub Actions workflow](.github/workflows/pages.yml)
deploys `public/` automatically:

```
https://<owner>.github.io/research-hub/
```

To deploy manually from your machine: `npx http-server public -p 8080` to preview,
then push (the workflow handles Pages).

## Data sources

- [Wake Tech A-Z Databases](https://researchguides.waketech.edu/az/databases)
- [NC LIVE](https://www.nclive.org/)
- [Wake County Public Libraries](https://www.wake.gov/departments-government/libraries)
- [Shodhganga / INFLIBNET](https://shodhganga.inflibnet.ac.in/)
- [National Digital Library of India](https://ndl.iitkgp.ac.in/)
- [AllSides Media Bias Ratings](https://www.allsides.com/media-bias/media-bias-ratings)
- [GovTrack](https://www.govtrack.us/) — US legislation API (free, no key)

## License

MIT
