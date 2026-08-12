#!/usr/bin/env python3
import re

P = 'public/index.html'
with open(P) as f:
    c = f.read()

# ── 1. Data for each section (name -> url) ──
archives = [
    ("Anna's Archive", "https://annas-archive.org", "Open", "Largest shadow library — books, papers, magazines. Free access to 30M+ files."),
    ("The Eye", "https://the-eye.eu", "Open", "35TB+ of open data mirrors — software, books, magazines, datasets."),
    ("Sci-Hub", "https://sci-hub.ru", "Free", "85M+ scholarly articles, bypassing paywalls. Founded by Alexandra Elbakyan."),
    ("Internet Archive", "https://archive.org", "Open", "41M+ books, 14M+ videos, 835B+ web pages. Wayback Machine, text archive."),
    ("Library Genesis", "https://libgen.is", "Open", "LibGen — 2.5M+ books and articles, primarily STEM."),
    ("Z-Library", "https://z-lib.is", "Open", "13M+ books and articles across all disciplines."),
    ("Harvard Dataverse", "https://dataverse.harvard.edu", "Open", "Open data repository — 500K+ datasets across all research domains."),
    ("Figshare", "https://figshare.com", "Open", "Research data sharing and collaboration. 1M+ datasets and figures."),
]
ai = [
    ("Hugging Face Spaces", "https://huggingface.co/spaces", "Free", "400K+ ML demos. Run any model in-browser with Gradio/Streamlit."),
    ("Replicate", "https://replicate.com/explore", "Freemium", "Run open-source models via API. Pay per inference. Image, audio, text models."),
    ("Modal", "https://modal.com/explore", "Freemium", "Serverless GPU compute. Deploy AI models as functions. $30/mo free credits."),
    ("Gradio", "https://gradio.app", "Free", "Build ML demo apps in Python. Open source, easy deploy to HF Spaces."),
    ("Streamlit", "https://streamlit.io/gallery", "Free", "Data apps framework. Python, no frontend needed. Gallery showcases apps."),
    ("Replicate Spaces", "https://replicate.com/spaces", "Freemium", "Hosted AI demos curated by Replicate. Community contributed."),
    ("AI Compass", "https://ai-compass.in", "Free", "Aggregator of AI tools. Discover models, prompts, and workflows."),
]
deals = [
    ("Slickdeals", "https://slickdeals.net", "Free", "Community-curated deals. User-voted, real-time. Best tech deal aggregator."),
    ("TechBargains", "https://www.techbargains.com", "Free", "Curated tech deals and coupons. Editors select best daily deals."),
    ("Deals of America", "https://www.dealsofamerica.com", "Free", "Aggregated best deals on electronics, gadgets, and tools."),
    ("Offers.com", "https://www.offers.com", "Free", "Coupons and promo codes. Updated daily. Retail and tech deals."),
    ("Amazon Warehouse", "https://www.amazon.com/warehouse-deals", "Free", "Amazon's returned and open-box items at discounted prices."),
    ("eBay Deals", "https://www.ebay.com/deals", "Free", "Daily deals and top picks on eBay — new and refurbished tech."),
    ("Newegg Daily Deals", "https://www.newegg.com/DailyDeal", "Free", "Daily deals on PC parts, electronics, gaming, and networking gear."),
]

def cards(items):
    out = []
    for name, url, badge, desc in items:
        bcls = {
            "Open": "badge-open", "Free": "badge-open", "Freemium": "badge-open",
        }.get(badge, "badge-open")
        out.append(
            f'      <a href="{url}" target="_blank" rel="noopener" class="card">'
            f'<div class="top"><div class="name-wrapper"><span class="name">{name}</span></div>'
            f'<span class="badge {bcls}">{badge}</span></div>'
            f'<div class="desc">{desc}</div></a>'
        )
    return "\n".join(out)

# ── 2. Replace each grid block with <a>-based cards + featured-grid ──
for grid_id, items, heading in [
    ("archivesGrid", archives, "📚 Data Archives"),
    ("aiGrid", ai, "🤖 AI Spaces"),
    ("dealsGrid", deals, "💰 Tech Deals"),
]:
    # capture existing wrapper: <div class="db-grid" id="GRID"> ... </div>  up to the closing of that div
    pat = re.compile(r'<div class="db-grid" id="' + re.escape(grid_id) + r'">.*?</div>\s*</div>\s*</div>', re.DOTALL)
    m = pat.search(c)
    if not m:
        raise SystemExit(f"could not find grid {grid_id}")
    new_block = f'    <div class="featured-grid" id="{grid_id}">\n{cards(items)}\n    </div>'
    c = c[:m.start()] + new_block + c[m.end():]

# ── 3. Remove Local Libraries tab button ──
c = c.replace(
    '    <button class="section-btn" data-section="nearby">🏠 Local Libraries</button>\n', '')

# ── 4. Remove nearbySection HTML block entirely ──
c = re.sub(r'\n<!-- ═+ -->\n<!-- LOCAL LIBRARIES SECTION -->.*?<div id="nearbySection" style="display:none;">.*?</div>\n</div>\n',
           '\n', c, flags=re.DOTALL)

# ── 5. Remove 'nearbySection' from hide-all list ──
c = c.replace(
    "['newsSection', 'dbSection', 'archivesSection', 'aiSection', 'dealsSection', 'nearbySection']",
    "['newsSection', 'dbSection', 'archivesSection', 'aiSection', 'dealsSection']")

# ── 6. Remove the nearby else-if branch in toggle handler ──
c = re.sub(r"\n\s*\} else if \(section === 'nearby'\) \{\n\s*document.getElementById\('nearbySection'\)\.style\.display = 'block';\n\s*setupNewSectionHandlers\(\);\n\s*\}",
           '', c)

# ── 7. Remove setupNewSectionHandlers() calls in toggle ──
c = c.replace("    setupNewSectionHandlers();\n", "")
# remove the now-possibly-empty lines left by the three calls
# (each call was on its own indented line; the regex above removes exactly that line)

# ── 8. Delete the setupNewSectionHandlers function definition ──
c = re.sub(r"\nfunction setupNewSectionHandlers\(\) \{.*?\n\}\n", "\n", c, flags=re.DOTALL)

# ── 9. Remove the init call setupNewSectionHandlers(); ──
c = c.replace("render();\nsetupNewSectionHandlers();\n", "render();\n")

# ── 10. Add WorldCat to NC popular in databases array ──
wc = ("  { name: 'WorldCat', desc: 'Find books in 10,000+ libraries worldwide. Enter your location to see nearby copies.', cat: 'General', access: 'open', section: 'nc', popular: true, url: 'https://www.worldcat.org/' },\n")
c = c.replace("  { name: 'NC LIVE', desc:", wc + "  { name: 'NC LIVE', desc:", 1)

# ── 11. Fix main Sci-Hub url (line 745) to working .ru ──
c = c.replace("url: 'https://sci-hub.se/'", "url: 'https://sci-hub.ru/'")

# ── 12. Remove orphan trailing <style> light-theme block (it overrides the real theme
#        and was never wired to a toggle; this restores consistent dark rendering) ──
c = re.sub(r'\n<style>\n\s*/\* ── IMPROVED READABILITY.*?</style>\n', '\n', c, flags=re.DOTALL)

with open(P, 'w') as f:
    f.write(c)

print("done")
