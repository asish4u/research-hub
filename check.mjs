import fs from 'fs';
const html = fs.readFileSync('public/index.html', 'utf8');
const start = html.indexOf('<script>') + 8;
const end = html.indexOf('</script>', start);
const code = html.substring(start, end);

// Write it to a temp file and use node --check
fs.writeFileSync('/tmp/test_script.mjs', code);
import { execSync } from 'child_process';
try {
  execSync('node --check /tmp/test_script.mjs', {encoding: 'utf8', stdio: 'pipe'});
  console.log('JS IS VALID');
} catch(e) {
  console.log('JS ERROR:');
  console.log(e.stderr || e.stdout || e.message);
}
