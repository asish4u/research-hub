#!/usr/bin/env python3
import re

with open('public/index.html') as f:
    c = f.read()

# Find the archives section - need to be more flexible with whitespace
# Use regex to find and replace
pattern = r'(<div id="archivesSection" style="display:none;">\s*<div class="featured-section">\s*<h2 class="news-h2">📚 Data Archives.*?<div class="db-grid" id="archivesGrid">.*?</div>\s*</div>\s*</div>)'

new_archives_html = '''<div id="archivesSection" style="display:none;">
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
    </div>
  </div>
</div>'''

match = re.search(pattern, c, re.DOTALL)
if match:
    c = c[:match.start()] + new_archives_html + c[match.end():]
    with open('public/index.html', 'w') as f:
        f.write(c)
    print("Archives section updated successfully")
else:
    print("Pattern not found, trying alternative approach...")
    # Find the section boundaries
    start = c.find('<div id="archivesSection"')
    end = c.find('<!-- AI SPACES SECTION -->')
    if start != -1 and end != -1:
        c = c[:start] + '<!-- ════════════════════════════════════════════════════════════ -->\n<!-- ARCHIVES SECTION -->\n<!-- ═════════📚════════════════════════════════════════ -->\n' + new_archives_html + '\n\n' + c[end:]
        with open('public/index.html', 'w') as f:
            f.write(c)
        print("Archives section updated (alternative method)")
    else:
        print(f"Could not find section: start={start}, end={end}")