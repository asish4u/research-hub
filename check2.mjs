import fs from 'fs';
const html = fs.readFileSync('index.html', 'utf8');
const start = html.indexOf('<script>') + 8;
const end = html.indexOf('</script>', start);
const code = html.substring(start, end);
const lines = code.split('\n');
let braceCount = 0;
let parenCount = 0;
let bracketCount = 0;
let inTemplate = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    if (char === '`') inTemplate = !inTemplate;
    if (!inTemplate) {
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;
      if (char === '(') parenCount++;
      if (char === ')') parenCount--;
      if (char === '[') bracketCount++;
      if (char === ']') bracketCount--;
    }
  }
  if (braceCount < 0 || parenCount < 0 || bracketCount < 0) {
    console.log('UNMATCHED AT LINE', i + 1, ':', line.substring(0, 150));
    console.log('  BRACES:', braceCount, 'PARENS:', parenCount, 'BRACKETS:', bracketCount);
    break;
  }
}

console.log('FINAL COUNTS - BRACES:', braceCount, 'PARENS:', parenCount, 'BRACKETS:', bracketCount);
