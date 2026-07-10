'use strict';
// 起動スモークテスト: 実在idだけ返す疑似DOMでapp.jsを起動し、参照切れを検出
// 使い方: node _smoke.js
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('./index.html', 'utf8');
const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));

function makeEl(tag) {
  return {
    tagName: (tag || 'div').toUpperCase(),
    children: [], style: {}, dataset: {},
    textContent: '', value: '', placeholder: '', src: '', href: '',
    disabled: false, selectedIndex: 0, title: '',
    scrollWidth: 0, clientWidth: 100, scrollHeight: 0, scrollLeft: 0,
    offsetParent: {},
    classList: {
      _s: new Set(),
      add(...c) { c.forEach(x => this._s.add(x)); },
      remove(...c) { c.forEach(x => this._s.delete(x)); },
      toggle(c, f) { if (f === undefined) f = !this._s.has(c); if (f) this._s.add(c); else this._s.delete(c); return f; },
      contains(c) { return this._s.has(c); }
    },
    appendChild(c) { this.children.push(c); return c; },
    setAttribute() {}, getAttribute() { return null; },
    addEventListener() {}, removeEventListener() {},
    focus() {}, click() { if (typeof this.onclick === 'function') this.onclick({ target: this }); },
    scrollIntoView() {}, scrollTo() {}, remove() {},
    getBoundingClientRect() { return { top: 0, left: 0, width: 100, height: 50, bottom: 50, right: 100 }; },
    querySelector() { return makeEl(); },
    querySelectorAll() { return []; }
  };
}

const created = {};
function byId(id) {
  if (!ids.has(id)) return null; // 実在しないid＝本物のブラウザ同様nullを返す→参照切れが例外になる
  if (!created[id]) created[id] = makeEl();
  return created[id];
}

const documentStub = {
  documentElement: Object.assign(makeEl('html'), { lang: '', dir: '' }),
  head: makeEl('head'),
  body: makeEl('body'),
  title: '',
  createElement: (t) => makeEl(t),
  addEventListener() {},
  querySelector(sel) {
    sel = String(sel).trim();
    const m = /^#([A-Za-z0-9_-]+)$/.exec(sel);
    if (m) return byId(m[1]);
    if (sel.startsWith('#')) {
      const id = sel.slice(1).split(/[\s.:\[]/)[0];
      return byId(id) ? makeEl() : null;
    }
    return makeEl();
  },
  querySelectorAll() { return []; }
};

const sandbox = {
  console,
  document: documentStub,
  navigator: {},
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  location: { hostname: 'smoke.test', protocol: 'https:' },
  addEventListener() {},
  setTimeout: () => 0, setInterval: () => 0, clearInterval() {}, clearTimeout() {},
  URL: { createObjectURL: () => 'blob:', revokeObjectURL() {} },
  Image: function () { return {}; },
  FileReader: function () { return { readAsText() {}, onload: null }; },
  Blob: function () { return {}; }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

const src = ['./i18n.js', './data/cards.js', './app.js']
  .map(f => fs.readFileSync(f, 'utf8')).join('\n');
vm.createContext(sandbox);
try {
  vm.runInContext(src, sandbox, { filename: 'app-bundle.js' });
  console.log('SMOKE OK: 起動時に例外なし');
} catch (e) {
  console.log('SMOKE NG:');
  console.log(e.stack.split('\n').slice(0, 5).join('\n'));
  process.exit(1);
}
