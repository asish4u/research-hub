#!/usr/bin/env python3
"""
Comprehensive fix for library-dashboard issues:
1. Remove duplicate links in archives/ai/deals tabs
2. Remove 'nearby' tab (Local Libraries)
3. Add WorldCat to NC section
4. Ensure all sections use same layout
"""
import re

with open('public/index.html', 'r') as f:
    c = f.read()

print("=== Starting fixes ===")

# ── 1. Remove 'nearby' tab from section toggle ──
old_btn = '''    <button class="section-btn" data-section="nearby">🏠 Local Libraries</button>'''
if old_btn in c:
    c = c.replace(old_btn, '\n')
    print("✓ Removed 'nearby' tab from section toggle")
else:
    print("✗ 'nearby' tab not found in expected format")

# ── 2. Remove nearbySection HTML block ──
nearby_pattern = r'<!-- LOCAL LIBRARIES SECTION -->.*?<!--\s*┄┄┄\s*-->'
if re.search(nearby_pattern, c, re.DOTALL):
    c = re.sub(nearby_pattern, '\n', c, flags=re.DOTALL)
    print("✓ Removed nearbySection HTML block")
else:
    print("✓ nearbySection already removed or not present")

# ── 3. Remove nearbySection from DOM management arrays ──
old_array = "['newsSection', 'dbSection', 'archivesSection', 'aiSection', 'dealsSection', 'nearbySection']"
new_array = "['newsSection', 'dbSection', 'archivesSection', 'aiSection', 'dealsSection']"
if old_array in c:
    c = c.replace(old_array, new_array)
    print("✓ Removed nearbySection from DOM management array")
else:
    print("✓ DOM array already correct")

# ── 4. Remove nearbySection handler from section switching ──
nearby_handler_pattern = r'\s*\}\s*else if \(section === \'nearby\'\)\s*\{[^}]+setupNewSectionHandlers\(\);'
if re.search(nearby_handler_pattern, c):
    c = re.sub(nearby_handler_pattern, '', c)
    print("✓ Removed nearbySection handler")
else:
    print("✓ nearbySection handler already removed")

# ── 5. Add WorldCat to NC section in databases array ──
# Find the intl section databases array and add WorldCat before it
worldcat_entry = '''  { name: 'WorldCat', desc: 'Find books in 10,000+ libraries worldwide. Enter your location to see nearby copies.', cat: 'General', access: 'open', section: 'nc', popular: true, url: 'https://www.worldcat.org/' },
'''

# Check if WorldCat already exists
if "'WorldCat'" in c or '"WorldCat"' in c:
    print("✓ WorldCat already in databases")
else:
    # Find the intl section entry and add WorldCat before it
    intl_pattern = r"(section: 'intl'"
    if re.search(intl_pattern, c):
        c = re.sub(intl_pattern, worldcat_entry + "section: 'intl'", c, count=1)
        print("✓ Added WorldCat to NC section")
    else:
        print("✗ Could not find intl section to insert WorldCat")

# ── 6. Clean up duplicate Sci-Hub entries in archives section ──
# Find archivesGrid and remove duplicate card entries
archives_pattern = r'(<div class="db-grid" id="archivesGrid">.*?)</div>\s*<!-- AI SPACES'
match = re.search(archives_pattern, c, re.DOTALL)
if match:
    archives_html = match.group(1)
    # Check for duplicate Sci-Hub entries
    scihub_count = archives_html.count('<span class="name">Sci-Hub')
    if scihub_count > 1:
        # Keep only unique entries
        lines = archives_html.split('\n')
        seen_names = set()
        unique_lines = []
        for line in lines:
            if '<span class="name">' in line:
                name_match = re.search(r'<span class="name">([^<]+)</span>', line)
                if name_match:
                    name = name_match.group(1)
                    if name not in seen_names:
                        seen_names.add(name)
                        unique_lines.append(line)
                    else:
                        continue  # Skip duplicate
                else:
                    unique_lines.append(line)
            else:
                unique_lines.append(line)
        new_archives = '\n'.join(unique_lines)
        c = c.replace(archives_html, new_archives)
        print(f"✓ Cleaned up {scihub_count - 1} duplicate entries in archives")
    else:
        print(f"✓ Archives already clean ({scihub_count} Sci-Hub entry)")
else:
    print("✓ Archives section pattern not found or already clean")

# ── 7. Ensure consistent CSS class for all grid sections ──
# Make sure all grids use the same featured-grid class
c = c.replace('id="archivesGrid"', 'class="featured-grid" id="archivesGrid"')
c = c.replace('id="aiGrid"', 'class="featured-grid" id="aiGrid"')
c = c.replace('id="dealsGrid"', 'class="featured-grid" id="dealsGrid"')
print("✓ Ensured consistent grid classes")

# ── 8. Fix any duplicate URLs in setupNewSectionHandlers ──
# Find the urls object and de-duplicate
urls_pattern = r'const urls = \{([^}]+)\};'
match = re.search(urls_pattern, c, re.DOTALL)
if match:
    urls_content = match.group(1)
    lines = urls_content.split('\n')
    seen = {}
    unique_lines = []
    for line in lines:
        if line.strip().startswith('"'):
            # Extract key
            key_match = re.match(r'\s*"([^"]+)"\s*:', line)
            if key_match:
                key = key_match.group(1)
                if key not in seen:
                    seen[key] = True
                    unique_lines.append(line)
                else:
                    print(f"✓ Removed duplicate URL key: {key}")
            else:
                unique_lines.append(line)
        else:
            unique_lines.append(line)
    new_urls_content = '\n'.join(unique_lines)
    c = c.replace(urls_content, new_urls_content)
else:
    print("✓ Could not find urls object for deduplication")

with open('public/index.html', 'w') as f:
    f.write(c)

print("\n=== All fixes applied ===")