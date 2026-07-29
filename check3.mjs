import fs from 'fs';
const html = fs.readFileSync('index.html', 'utf8');
const start = html.indexOf('<script>') + 8;
const end = html.indexOf('</script>', start);
const code = html.substring(start, end);
const lines = code.split('\n');

// Look for unclosed template literals in the render() function
let inTemplate = false;
let depth = 0; // brace depth
let lineWithUnclosedTemplate = 0;

console.log('Searching for unclosed template literals in render() function (starts line 538)');
for (let i = 537; i < lines.length; i++) {
  const line = lines[i];
  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    if (char === '`') {
      if (inTemplate && line.substring(j-10, j).includes('}')) {
        // Check if it's actually closing
        console.log('Line', i+1, ': potential closing backtick at pos', j);
      }
      inTemplate = !inTemplate;
      if (inTemplate) {
        console.log('Line', i+1, ': OPENED backtick at pos', j, '- starts template literal');
        lineWithUnclosedTemplate = i+1;
      } else {
        console.log('Line', i+1, ': CLOSED backtick at pos', j, '- ends template literal');
      }
    }
  }
}

console.log('Last unclosed template:', lineWithUnclosedTemplate, 'line maybe incomplete');
