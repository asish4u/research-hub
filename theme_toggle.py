#!/usr/bin/env python3
"""Add theme toggle, clean up orphaned CSS"""
import re

with open('public/index.html', 'r') as f:
    c = f.read()

# ── 1. Add theme toggle button in header ──
# Replace the login bar area with login + theme toggle
old_header = '''            <!-- LOGIN BAR -->
            <div style="margin-top: 1.2rem; font-size: 0.85rem; color: var(--text2);">
                <a href="https://nafhub.com" target="_blank" rel="noopener" style="color:var(--accent);">NAF Hub</a>
                <span style="margin:0 0.5rem;color:var(--border);">·</span>
                <a href="https://signin.ollama.com" target="_blank" rel="noopener" style="color:var(--accent);">Ollama</a>
                <span style="margin:0 0.5rem;color:var(--border);">·</span>
                <a href="https://dash.cloudflare.com" target="_blank" rel="noopener" style="color:var(--accent);">Cloudflare</a>
            </div>'''

new_header = '''            <!-- LOGIN BAR + THEME TOGGLE -->
            <div style="margin-top: 1.2rem; font-size: 0.85rem; color: var(--text2); display: flex; align-items: center; justify-content: center; gap: 0.5rem; flex-wrap: wrap;">
                <a href="https://nafhub.com" target="_blank" rel="noopener" style="color:var(--accent);">NAF Hub</a>
                <span style="color:var(--border);">·</span>
                <a href="https://signin.ollama.com" target="_blank" rel="noopener" style="color:var(--accent);">Ollama</a>
                <span style="color:var(--border);">·</span>
                <a href="https://dash.cloudflare.com" target="_blank" rel="noopener" style="color:var(--accent);">Cloudflare</a>
                <span style="color:var(--border);">·</span>
                <button id="themeToggle" style="background:var(--surface2);border:1px solid var(--border);border-radius:20px;color:var(--text2);cursor:pointer;font-size:0.8rem;padding:0.3rem 0.8rem;transition:all 0.15s;display:flex;align-items:center;gap:4px;"
                  title="Toggle dark/light theme">🌙 Dark</button>
            </div>'''

if old_header in c:
    c = c.replace(old_header, new_header)
    print("1. Theme toggle button added in header")
else:
    print("1. Header not found, checking alternative...")
    # Try to find login bar area
    idx = c.find('LOGIN BAR')
    if idx != -1:
        print(f"   Found 'LOGIN BAR' at {idx}")
        print(f"   Context: {c[idx:idx+300]}")

# ── 2. Replace the orphaned light-theme <style> block with a .light-theme class ──
# First, extract the light theme CSS vars
light_css = '''/* ── LIGHT THEME OVERRIDE ── */
.light-theme {
  --bg: #f8f9fa;
  --surface: #ffffff;
  --surface2: #f1f3f4;
  --border: #e0e0e0;
  --text: #202124;
  --text2: #5f6368;
  --accent: #1a73e8;
  --green: #188038;
  --orange: #d58512;
  --pink: #d01884;
  --purple: #8e24aa;
  --red: #d93025;
  --india-saffron: #ff9933;
  --india-green: #138808;
}
.light-theme body {
  font-family: 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
  background: var(--bg);
  color: var(--text);
}
.light-theme .header {
  background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%);
  border-bottom: 1px solid var(--border);
}
.light-theme .card,
.light-theme .news-item {
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}
.light-theme .card:hover,
.light-theme .news-item:hover {
  box-shadow: 0 2px 6px rgba(0,0,0,0.1);
}
.light-theme .name,
.light-theme .news-title {
  color: var(--text);
  font-weight: 500;
}
.light-theme .desc,
.light-theme .news-meta {
  color: var(--text2);
}
.light-theme .section-toggle {
  background: var(--surface);
  border: 1px solid var(--border);
}
.light-theme .section-btn {
  background: var(--surface2);
  border: 1px solid var(--border);
  color: var(--text2);
}
.light-theme .section-btn:hover {
  background: var(--surface);
  border-color: var(--accent);
  color: var(--accent);
}
.light-theme .section-btn.active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
  box-shadow: 0 1px 3px rgba(26,115,232,0.2);
}
.light-theme .filter-bar {
  background: var(--surface);
  border: 1px solid var(--border);
}
.light-theme .filter-btn {
  background: var(--surface2);
  border: 1px solid var(--border);
  color: var(--text2);
}
.light-theme .filter-btn:hover {
  background: var(--surface);
  border-color: var(--accent);
  color: var(--accent);
}
.light-theme .filter-btn.active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
.light-theme .search-bar {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
}
.light-theme .search-bar:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(26,115,232,0.12);
}
.light-theme .badge-open,
.light-theme .badge-scihub {
  color: var(--green);
}
.light-theme .news-tab {
  background: var(--surface2);
  border: 1px solid var(--border);
  color: var(--text2);
}
.light-theme .news-tab:hover {
  background: var(--surface);
  border-color: var(--accent);
  color: var(--accent);
}
.light-theme .news-tab.active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
.light-theme .news-error {
  background: var(--surface);
  border: 1px solid var(--border);
}
.light-theme a {
  color: var(--accent);
}'''

# Find and replace the orphaned <style>...</style> block
old_orphan = r'<style>\n /\* ── IMPROVED READABILITY ── \*/.*?</style>'
match = re.search(old_orphan, c, re.DOTALL)
if match:
    c = c[:match.start()] + '<style id="theme-style">\n' + light_css + '\n</style>' + c[match.end():]
    print("2. Orphaned light CSS replaced with .light-theme class style block")
else:
    print("2. Orphaned CSS block not found, checking for alternative pattern...")
    # Try to find it by looking for the unique comment
    idx = c.find('/* ── IMPROVED READABILITY ── */')
    if idx != -1:
        # Found the comment but couldn't match the pattern
        style_start = c.rfind('<style>', 0, idx)
        style_end = c.find('</style>', idx) + 8
        old_content = c[style_start:style_end]
        new_content = '<style id="theme-style">\n' + light_css + '\n</style>'
        c = c.replace(old_content, new_content)
        print("   Replaced via direct string match")
    else:
        print("   Light theme CSS not found at all — may have been removed already")
        # Check if there's a theme-style already
        if 'id="theme-style"' in c:
            print("   Already has theme-style, skipping")

# ── 3. Add the localStorage toggle JavaScript at the end ──
theme_js = '''
// ═════════════════════════════════════════════════════
// THEME TOGGLE
// ═════════════════════════════════════════════════════
(function() {
  const btn = document.getElementById('themeToggle');
  const html = document.documentElement;
  const saved = localStorage.getItem('research-hub-theme');

  // Apply saved theme
  if (saved === 'light') {
    html.classList.add('light-theme');
    if (btn) btn.innerHTML = '☀️ Light';
  }

  if (btn) {
    btn.addEventListener('click', function() {
      html.classList.toggle('light-theme');
      const isLight = html.classList.contains('light-theme');
      this.innerHTML = isLight ? '☀️ Light' : '🌙 Dark';
      localStorage.setItem('research-hub-theme', isLight ? 'light' : 'dark');
    });
  }
})();
'''

# Find the last </script> tag before </body> and insert theme_js before it
last_script_end = c.rfind('</script>')
if last_script_end != -1:
    c = c[:last_script_end] + theme_js + '\n' + c[last_script_end:]
    print("3. Theme toggle JS added")
else:
    print("3. Could not find last </script> tag")

# ── 4. Add small CSS for the toggle button hover in main stylesheet ──
# Add after the badge-open style around line 100
toggle_btn_css = '''
.theme-toggle-btn:hover { opacity: 0.8; }'''

# Insert after the search-bar :focus styles
idx_search_focus = c.find('.search-bar:focus')
if idx_search_focus != -1:
    # Find the end of that rule block
    end_of_block = c.find('\n}\n', idx_search_focus) + 3
    c = c[:end_of_block] + toggle_btn_css + c[end_of_block:]
    print("4. Theme toggle hover CSS added")
else:
    print("4. Could not add toggle hover CSS")

# Write updated content
with open('public/index.html', 'w') as f:
    f.write(c)

print("\nAll theme toggle changes applied!")
print(f"File now {len(c)} chars, ~{c.count(chr(10))} lines")