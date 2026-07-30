#!/usr/bin/env python3
"""Fix broken links, unify layout widths, rename AI Spaces -> AI Resources,
and repopulate AI Resources with popular working AI demo sites."""
import re

P = '/Users/nayak/projects/library-dashboard/public/index.html'
with open(P) as f:
    c = f.read()

# ── 1. Unify grid column widths (db-grid 300px -> 280px to match featured-grid) ──
c = c.replace(
    ".db-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 0.75rem; }",
    ".db-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 0.75rem; }")

# ── 2. Fix ARCHIVES broken links ──
# LibGen: .is was unreachable -> use stable .rs mirror
c = c.replace('href="https://libgen.is"', 'href="https://libgen.rs"')
c = c.replace('>Library Genesis<', '>Library Genesis (libgen.rs)<')
# Z-Library: z-lib.is reported broken -> official z-library.se
c = c.replace('href="https://z-lib.is"', 'href="https://z-library.se"')
c = c.replace('>Z-Library<', '>Z-Library (z-library.se)<')

# ── 3. Fix DEALS broken link: Amazon Warehouse 404 -> correct path ──
c = c.replace('href="https://www.amazon.com/warehouse-deals"',
              'href="https://www.amazon.com/gp/warehouse-details"')

# ── 4. Rename AI Spaces tab -> AI Resources (button + heading + comment) ──
c = c.replace('<button class="section-btn" data-section="ai">🤖 AI Spaces</button>',
              '<button class="section-btn" data-section="ai">🤖 AI Resources</button>')
c = c.replace('<!-- AI SPACES SECTION -->', '<!-- AI RESOURCES SECTION -->')
c = c.replace(
    '<h2 class="news-h2">🤖 AI Spaces <span style="font-size:0.75rem;color:var(--text2);font-weight:400;">— try AI demos & models interactively</span></h2>',
    '<h2 class="news-h2">🤖 AI Resources <span style="font-size:0.75rem;color:var(--text2);font-weight:400;">— popular AI apps & websites to demo</span></h2>')

# ── 5. Replace AI grid content with curated popular working AI sites ──
ai_items = [
    ("ChatGPT", "https://chat.openai.com", "Free", "OpenAI's conversational AI. Chat, write, code, analyze."),
    ("Claude", "https://claude.ai", "Free", "Anthropic's AI assistant. Long-context chat, writing, coding."),
    ("Gemini", "https://gemini.google.com", "Free", "Google's multimodal AI for text, image, and code."),
    ("Perplexity", "https://www.perplexity.ai", "Free", "AI search engine with cited, sourced answers."),
    ("Poe", "https://poe.com", "Free", "One app for many bots: ChatGPT, Claude, Gemini, Llama."),
    ("Hugging Face", "https://huggingface.co", "Free", "Hub for open models, datasets, and demos."),
    ("Hugging Face Spaces", "https://huggingface.co/spaces", "Free", "400K+ interactive ML demos runnable in-browser."),
    ("Replicate", "https://replicate.com/explore", "Freemium", "Run open-source models via API. Image, audio, text."),
    ("Midjourney", "https://www.midjourney.com", "Freemium", "Leading AI image generator (web + Discord)."),
    ("Runway", "https://runwayml.com", "Freemium", "AI video generation and editing tools."),
    ("ElevenLabs", "https://elevenlabs.io", "Freemium", "Realistic AI voice synthesis and dubbing."),
    ("Suno", "https://suno.com", "Free", "Generate full songs from text prompts."),
    ("Cursor", "https://cursor.com", "Freemium", "AI-first code editor powered by LLMs."),
    ("Ollama", "https://ollama.com", "Free", "Run open-source LLMs locally on your machine."),
    ("Krea", "https://www.krea.ai", "Freemium", "Real-time AI image generation and upscaling."),
]

def ai_cards(items):
    out = []
    for name, url, badge, desc in items:
        out.append(
            f'      <a href="{url}" target="_blank" rel="noopener" class="card">'
            f'<div class="top"><div class="name-wrapper"><span class="name">{name}</span></div>'
            f'<span class="badge badge-open">{badge}</span></div>'
            f'<div class="desc">{desc}</div></a>'
        )
    return "\n".join(out)

# Replace from '<div class="featured-grid" id="aiGrid">' through its closing '</div>'
pat = re.compile(r'        <div class="featured-grid" id="aiGrid">.*?\n    </div>', re.DOTALL)
m = pat.search(c)
if not m:
    raise SystemExit("aiGrid block not found")
new_block = '        <div class="featured-grid" id="aiGrid">\n' + ai_cards(ai_items) + '\n    </div>'
c = c[:m.start()] + new_block + c[m.end():]

with open(P, 'w') as f:
    f.write(c)
print("done; ai items:", len(ai_items))
