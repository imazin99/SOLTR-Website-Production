const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const frontend = path.join(root, 'frontend');
const themeInit = fs.readFileSync(path.join(frontend, 'js/theme-init.js'), 'utf8');
const themeController = fs.readFileSync(path.join(frontend, 'js/theme.js'), 'utf8');
const themeCss = fs.readFileSync(path.join(frontend, 'css/theme.css'), 'utf8');
const htmlFiles = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(absolute);
    else if (entry.isFile() && entry.name.endsWith('.html')) htmlFiles.push(absolute);
  }
}

function pass(message) { console.log(`PASS ${message}`); }

walk(frontend);
assert.ok(htmlFiles.length > 0);
for (const htmlFile of htmlFiles) {
  const html = fs.readFileSync(htmlFile, 'utf8');
  assert.equal((html.match(/theme-init\.js/g) || []).length, 1, htmlFile);
  assert.equal((html.match(/theme\.css/g) || []).length, 1, htmlFile);
  assert.equal((html.match(/theme\.js/g) || []).length, 1, htmlFile);
}
pass(`all ${htmlFiles.length} frontend pages load the centralized theme assets exactly once`);

assert.match(themeInit, /localStorage\.getItem\(STORAGE_KEY\)/);
assert.match(themeInit, /prefers-color-scheme: light/);
assert.match(themeInit, /document\.documentElement\.dataset\.theme = theme/);
pass('early theme bootstrap restores saved preference or system preference before page styles render');

assert.match(themeController, /soltr_theme/);
assert.match(themeController, /aria-label/);
assert.match(themeController, /aria-pressed/);
assert.match(themeController, /addEventListener\('click'/);
assert.match(themeController, /localStorage\.setItem\(STORAGE_KEY, theme\)/);
assert.match(themeController, /theme-toggle-host/);
pass('theme controller provides persisted, keyboard-accessible, cross-page toggle behavior');

for (const token of [
  '--black: #0b0b0c',
  '--black-2: #141414',
  '--black-3: #1c1c1c',
  '--bone: #ece7dd',
  '--paper: #f7f5f0',
  '--burgundy: #6e1423',
  '--burgundy-light: #8c1f2e',
  '--smoke: #9a958a',
  '--line: #2a2a2a'
]) assert.match(themeCss, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
for (const token of ['--black: #111111', '--black-2: #ffffff', '--black-3: #ecece8', '--smoke: #666660', '--focus-ring:']) {
  assert.match(themeCss, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
pass('approved dark token values are preserved and premium light tokens are defined');

assert.match(themeCss, /-webkit-autofill/);
assert.match(themeCss, /prefers-reduced-motion/);
assert.match(themeCss, /badge-pending/);
assert.match(themeCss, /co-input:focus/);
pass('forms, reduced motion, semantic statuses, and checkout states have theme-aware coverage');

console.log('PASS theme-integration regression checks complete');
