const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const scripts = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
const code = scripts[0].replace(/<\/?script[^>]*>/g, '');
try { new Function(code); console.log('JS is valid!'); }
catch(e) { console.log('ERROR: ' + e.message); }