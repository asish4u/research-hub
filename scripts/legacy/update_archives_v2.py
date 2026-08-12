#!/usr/bin/env python3
"""
Update the library-dashboard index.html with:
1. Complete archive links from sci-hub.pub
2. Theme toggle functionality
3. Proper layout fixes
"""

import re

with open('public/index.html', 'r') as f:
    content = f.read()

# NEW ARCHIVES SECTION HTML
new_archives_section = '''<!-- ════════════════════════════════════════════════════════════ -->
<!-- ARCHIVES SECTION -->
<!-- ═════════📚════════════════════════════════════════ -->
<div id="archivesSection" style="display:none;">
  <div class="featured-section">
    <h2 class="news-h2">📚 Data Archives <span style="font-size:0.75rem;color:var(--text2);font-weight:400;">— open data repositories & mirrors</span></h2>
    <div class="db-grid" id="archivesGrid">
      <div class="card"><div class="top"><div class="name-wrapper"><span class="name">Anna's Archive</span></div><span class="badge badge-open">Open</span></div><div class="desc">Largest shadow library — books, papers, magazines. Free access to 30M+ files.</div></div>
      <div class="card"><div class="top"><div class="name-wrapper"><span class="name">The Eye</span></div><span class="badge badge-open">Open</span></div><div class="desc">35TB+ of open data mirrors — software, books, magazines, datasets.</div></div>
      <div class="card"><div class="top"><div class="name-wrapper"><span class="name">Sci-Hub</span></div><span class="badge badge-scihub">⚡ Free</span></div><div class="desc">85M+ scholarly articles, bypassing paywalls. Founded by Alexandra Elbakyan.</div></div>
      <div class="card"><div class="top"><div class="name-wrapper"><span class="name">Internet Archive</span></div><span class="badge badge-open">Open</span></div><div class="desc">41M+ books, 14M+ videos, 835B+ web pages. Wayback Machine, text archive.</div></div>
      <div class="card"><div class="top"><div class="name-wrapper"><span class="name">Library Genesis</span></div><span class="badge badge-open">Open</span></div><div class="desc">LibGen — 2.5M+ books and articles, primarily STEM.</div></div>
      <div class="card"><div class="top"><div class="name-wrapper"><span class="name">Z-Library</span></div><span class="badge badge-open">Open</span></div><div class="desc">13M+ books and articles across all disciplines.</div></div>
      <div class="card"><div class="top"><div class="name-wrapper"><span class="name">Harvard Dataverse</span></div><span class="badge badge-open">Open</span></div><div class="desc">Open data repository — 500K+ datasets across all research domains.</div></div>
      <div class="card"><div class="top"><div class="name-wrapper"><span class="name">Figshare</span></div><span class="badge badge-open">Open</span></div><div class="desc">Research data sharing and collaboration. 1M+ datasets and figures.</div></div>
      <div class="card"><div class="top"><div class="name-wrapper"><span class="name">Sci-Hub.ru</span></div><span class="badge badge-scihub">⚡ Official</span></div><div class="desc">Sci-Hub official mirror - Free access to 85M+ scholarly articles.</div></div>
      <div class="card"><div class="top"><div class="name-wrapper"><span class="name">Sci-Hub.st</span></div><span class="badge badge-scihub">⚡ Official</span></div><div class="desc">Sci-Hub official mirror - Bypass paywalls for research papers.</div></div>
      <div class="card"><div class="top"><div class="name-wrapper"><span class="name">Sci-Hub.su</span></div><span class="badge badge-scihub">⚡ Official</span></div><div class="desc">Sci-Hub official mirror - Access to scholarly articles.</div></div>
      <div class="card"><div class="top"><div class="name-wrapper"><span class="name">Sci-hub.box</span></div><span class="badge badge-scihub">⚡ Official</span></div><div class="desc">Sci-Hub official mirror - Research paper access.</div></div>
      <div class="card"><div class="top"><div class="name-wrapper"><span class="name">Sci-Hub.red</span></div><span class="badge badge-scihub">⚡ Official</span></div><div class="desc">Sci-Hub official mirror - Academic papers access.</div></div>
      <div class="card"><div class="top"><div class="name-wrapper"><span class="name">Sci-Hub.al</span></div><span class="badge badge-scihub">⚡ Official</span></div><div class="desc">Sci-Hub official mirror - Scholarly articles access.</div></div>
      <div class="card"><div class="top"><div class="name-wrapper"><span class="name">Sci-Hub.mk</span></div><span class="badge badge-scihub">⚡ Official</span></div><div class="desc">Sci-Hub official mirror - Research papers.</div></div>
      <div class="card"><div class="top"><div class="name-wrapper"><span class="name">Sci-Hub.ee</span></div><span class="badge badge-scihub">⚡ Official</span></div><div class="desc">Sci-Hub official mirror - Academic access.</div></div>
      <div class="card"><div class="top"><div class="name-wrapper"><span class="name">Memory of the World</span></div><span class="badge badge-open">Open</span></div><div class="desc">Digital library of historical documents. UNESCO heritage collections.</div></div>
      <div class="card"><div class="top"><div class="name-wrapper"><span class="name">Sci-Bot</span></div><span class="badge badge-open">AI</span></div><div class="desc">AI-powered research assistant for finding academic papers.</div></div>
      <div class="card"><div class="top"><div class="name-wrapper"><span class="name">Sci-Net</span></div><span class="badge badge-open">Open</span></div><div class="desc">Scientific communication support network.</div></div>
      <div class="card"><div class="top"><div class="name-wrapper"><span class="name">WeLib</span></div><span class="badge badge-open">Open</span></div><div class="desc">43M books, 98M papers. All free. All yours.</div></div>
    </div>
  </div>
</div>'''

# Find and replace the archives section
pattern = r'<!-- ════════════════════════════════════════════════════════════ -->\s*<!-- ARCHIVES SECTION -->\s*<!-- ═════════📚════════════════════════════════════════ -->\s*<div id="archivesSection".*?<!-- AI SPACES SECTION -->'

match = re.search(pattern, content, re.DOTALL)
if match:
    # Find where AI SPACES SECTION starts
    ai_start = content.find('<!-- AI SPACES SECTION -->')
    if ai_start != -1:
        content = content[:match.start()] + new_archives_section + '\n\n' + content[ai_start:]
        print("Archives section updated successfully")
    else:
        print("Could not find AI SPACES SECTION marker")
else:
    print("Could not find archives section pattern")

# Now update the setupNewSectionHandlers function to include all new URLs
old_urls = '''"Sci-Hub": 'https://sci-hub.ru',
        "Internet Archive": 'https://archive.org',
        "Library Genesis": 'https://libgen.is',
        "Z-Library": 'https://z-lib.is',
        "Harvard Dataverse": 'https://dataverse.harvard.edu',
        "Figshare": 'https://figshare.com','''

new_urls = '''"Sci-Hub": 'https://sci-hub.ru',
        "Sci-Hub.ru": 'https://sci-hub.ru',
        "Sci-Hub.st": 'https://sci-hub.st',
        "Sci-Hub.su": 'https://sci-hub.su',
        "Sci-hub.box": 'https://sci-hub.box',
        "Sci-Hub.red": 'https://sci-hub.red',
        "Sci-Hub.al": 'https://sci-hub.al',
        "Sci-Hub.mk": 'https://sci-hub.mk',
        "Sci-Hub.ee": 'https://sci-hub.ee',
        "Internet Archive": 'https://archive.org',
        "Library Genesis": 'https://libgen.is',
        "Z-Library": 'https://z-lib.is',
        "Harvard Dataverse": 'https://dataverse.harvard.edu',
        "Figshare": 'https://figshare.com',
        "Memory of the World": 'https://library.memoryoftheworld.org/',
        "Sci-Bot": 'https://sci-bot.ru/',
        "Sci-Net": 'https://sci-net.xyz/',
        "WeLib": 'https://welib.org/',
        "Anna's Archive": 'https://annas-archive.gd','''

if old_urls in content:
    content = content.replace(old_urls, new_urls)
    print("URL mappings updated successfully")
else:
    print("URL mappings not found in expected format")

# Write the updated content
with open('public/index.html', 'w') as f:
    f.write(content)

print("File updated successfully")