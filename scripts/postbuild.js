const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');

// 1. Ensure icons are generated
require('./generate-icons.js');

// 2. Run metadata generation if n8n-core generate-metadata is present
const n8nCoreMetadataBin = 'C:/Users/Pranavesh/AppData/Roaming/npm/node_modules/n8n/node_modules/n8n-core/bin/generate-metadata';
if (fs.existsSync(n8nCoreMetadataBin)) {
  try {
    console.log('Generating n8n metadata...');
    execSync(`node "${n8nCoreMetadataBin}"`, { cwd: root, stdio: 'inherit' });
  } catch (err) {
    console.warn('Metadata generation warning:', err.message);
  }
}

// 3. Fix icon URLs in dist/types/nodes.json and dist/types/credentials.json
// n8n's editor evaluates: p = e => /^(https?:)?\/\//.test(e) ? e : baseUrl + e
// When iconUrl starts with leading slash ('/icons/...'), baseUrl ('/') + e results in '//icons/...'
// which the browser interprets as a protocol-relative domain request (http://icons/...), causing failure.
// Removing the leading slash ('icons/...') results in '/icons/...' which properly resolves on localhost:5678.
const fixIconsInJson = (filePath) => {
  if (!fs.existsSync(filePath)) return;
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const fixObj = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    if (obj.iconUrl) {
      if (typeof obj.iconUrl === 'string') {
        obj.iconUrl = obj.iconUrl.replace(/^\/+/, '');
      } else if (typeof obj.iconUrl === 'object') {
        if (typeof obj.iconUrl.light === 'string') {
          obj.iconUrl.light = obj.iconUrl.light.replace(/^\/+/, '');
        }
        if (typeof obj.iconUrl.dark === 'string') {
          obj.iconUrl.dark = obj.iconUrl.dark.replace(/^\/+/, '');
        }
      }
    }
  };

  if (Array.isArray(data)) {
    data.forEach(fixObj);
  } else {
    fixObj(data);
  }

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  console.log(`Normalized icon URLs in ${path.relative(root, filePath)}`);
};

fixIconsInJson(path.join(root, 'dist/types/nodes.json'));
fixIconsInJson(path.join(root, 'dist/types/credentials.json'));

console.log('Postbuild completed successfully.');
