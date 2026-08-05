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

/* ---- [v1.3] ステータスバー/ナビゲーションバーに隠れない（セーフエリア対応） ----
   targetSdk36(Android15+)はエッジtoエッジ強制で、WebViewが端末のステータスバー(上)と
   ナビゲーションバー(下)の下まで描画される。viewport-fit=cover があるので
   env(safe-area-inset-*) でその分を内側に空ける。下タブの高さは文字サイズ・言語で
   変わるためJSで実測し --tabbar-h に入れる。 */
let ok = 0, ng = 0;
function check(name, cond) {
  if (cond) { ok++; console.log('  OK  ' + name); }
  else { ng++; console.log('  NG  ' + name); }
}
console.log('');
console.log('[セーフエリア] 上下のバーに隠れない');
const css = fs.readFileSync('./style.css', 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, '');
const app = fs.readFileSync('./app.js', 'utf8');

check('viewportに viewport-fit=cover', /viewport-fit=cover/.test(html));
check('--tabbar-h のフォールバックに env(safe-area-inset-bottom)',
  /--tabbar-h:calc\(var\(--nav-h\)\+env\(safe-area-inset-bottom\)\)/.test(css));
check('画面の上余白に env(safe-area-inset-top)(時計・電池と重ならない)',
  /\.screen\{[^}]*padding:calc\(10px\+env\(safe-area-inset-top\)\)/.test(css));
check('画面の下余白が max(CSS下限, 下タブ実測+10px)',
  /\.screen\{[^}]*max\(calc\(var\(--nav-h\)\+16px\+env\(safe-area-inset-bottom\)\),calc\(var\(--tabbar-h\)\+10px\)\)/.test(css));
check('画面の左右余白に env(safe-area-inset-left/right)',
  /\.screen\{[^}]*max\(10px,env\(safe-area-inset-right\)\)/.test(css) &&
  /\.screen\{[^}]*max\(10px,env\(safe-area-inset-left\)\)/.test(css));
check('はなす画面は上余白を二重に取らない', /#scr-talk\{padding-top:10px;?\}/.test(css));
check('固定ヘッダーの上余白に env(safe-area-inset-top)',
  /#talk-head\{[^}]*padding-top:env\(safe-area-inset-top\)/.test(css));
check('下タブが高さ固定でない(ナビバーぶんでボタンが潰れない)',
  /#tabs\{[^}]*min-height:calc\(var\(--nav-h\)\+env\(safe-area-inset-bottom\)\)/.test(css) &&
  !/#tabs\{[^}]*height:var\(--nav-h\);/.test(css));
check('下タブに下/左右のインセット',
  /#tabs\{[^}]*padding-bottom:env\(safe-area-inset-bottom\)/.test(css) &&
  /#tabs\{[^}]*padding-left:env\(safe-area-inset-left\)/.test(css) &&
  /#tabs\{[^}]*padding-right:env\(safe-area-inset-right\)/.test(css));
check('でか文字(全画面)の内側にインセット',
  /#bigview\{[^}]*padding:env\(safe-area-inset-top\)env\(safe-area-inset-right\)env\(safe-area-inset-bottom\)env\(safe-area-inset-left\)/.test(css));
check('でか文字の幅がビューポート基準でない(96vw→96%)',
  /#bigtext\{[^}]*width:96%/.test(css) && !/#bigtext\{[^}]*96vw/.test(css));
check('じぶんカードのダイアログにもインセット',
  /#mydlg\{[^}]*padding:max\(16px,env\(safe-area-inset-top\)\)/.test(css));

check('applyBarSpace が下タブの実寸を測って --tabbar-h に入れる',
  /function applyBarSpace\(\)/.test(app) &&
  /\$\('#tabs'\)/.test(app) &&
  /setProperty\('--tabbar-h', h \+ 'px'\)/.test(app));
check('疑似DOMで落ちないガード(setProperty/getBoundingClientRect)',
  /if \(!st \|\| !st\.setProperty\) return;/.test(app) &&
  /if \(!tb \|\| !tb\.getBoundingClientRect\) return;/.test(app));
check('ResizeObserver で下タブを見張っている',
  /function watchBarSpace\(\)/.test(app) && /new ResizeObserver\(applyBarSpace\)/.test(app));
check('起動時に測る + 保険の load/resize/orientationchange',
  /applyBarSpace\(\);\s*\n\s*watchBarSpace\(\);/.test(app) &&
  /addEventListener\('resize', applyBarSpace\)/.test(app) &&
  /addEventListener\('orientationchange', applyBarSpace\)/.test(app));
check('文字サイズ・言語を変えた時も測り直す',
  /applyDir\(\);\s*\n\s*applyBarSpace\(\);/.test(app) &&
  /document\.title = t\.appName;\s*\n\s*applyBarSpace\(\);/.test(app));
check('でか文字は #bigview の内側実寸に収める',
  /function bigFitBox\(\)/.test(app) &&
  /const box = bigFitBox\(\);/.test(app) &&
  !/window\.innerHeight \* 0\.94/.test(app));

/* ---- バージョン表記の食い違いが無いか（AAB側のみ・Web版にはandroid/が無い） ---- */
console.log('');
console.log('[バージョン] 表記が揃っている');
const gradlePath = './android/app/build.gradle';
if (fs.existsSync(gradlePath)) {
  const g = fs.readFileSync(gradlePath, 'utf8');
  const vn = (/versionName\s+"([^"]+)"/.exec(g) || [])[1];
  const vc = (/versionCode\s+(\d+)/.exec(g) || [])[1];
  const shown = [...html.matchAll(/class="ver">v([0-9.]+)</g)].map(m => m[1]);
  check('build.gradle の versionName を取得できる', !!vn);
  check('アプリ内表示 v' + shown.join(',') + ' が versionName ' + vn + ' と一致',
    shown.length > 0 && shown.every(v => v === vn));
  console.log('  versionCode ' + vc + ' / versionName ' + vn);
} else {
  console.log('  (Web版のためスキップ)');
}
const cacheName = (/const CACHE = '([^']+)'/.exec(fs.readFileSync('./sw.js', 'utf8')) || [])[1];
check('sw.js の CACHE 名がある', !!cacheName);
console.log('  sw.js CACHE = ' + cacheName);

console.log('');
if (ng) { console.error('SMOKE NG: ' + ng + '件 失敗 / OK ' + ok + '件'); process.exit(1); }
console.log('SMOKE OK: セーフエリア/バージョン 全' + ok + '件 合格');
