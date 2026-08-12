#!/usr/bin/env python3
with open('public/index.html', 'r') as f:
    content = f.read()
    
# Find the archives section
import re
match = re.search(r'<div id="archivesSection".*?</div>\s*<!--.*?-->', content, re.DOTALL)
if match:
    print("Found archives section:")
    print(match.group(0)[:3000])