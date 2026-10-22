const fs = require('node:fs');
const path = require('node:path');
const output = path.join(__dirname, 'dist');
fs.mkdirSync(output, { recursive: true });
for (const name of ['index.html', 'style.css', 'levels.js', 'script.js']) {
  fs.copyFileSync(path.join(__dirname, name), path.join(output, name));
}
console.log('Built game into dist/');
