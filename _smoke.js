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
  // はじめての つかいかた(2026-09-30)は「読んだ」扱いで起動する(今までの検査を そのまま通す)。案内そのものは下の [つかいかた] で見る
  localStorage: { getItem: (k) => (k === 'soyogi_aac.guide.v1' ? 'true' : null), setItem() {}, removeItem() {} },
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

/* ---- [v1.5] よくつかう9枚・ちいさく みせる・ほぞんした文の即よみ ----
   起動済みの疑似DOMの中で実際に関数を動かして確かめる。
   読み上げは speak() を数える関数に差し替えて、呼ばれた回数で判定する。 */
console.log('');
console.log('[v1.5] よくつかう9枚 / ちいさく みせる / ほぞんの即よみ');
const OLD_CORE = ['yes', 'noans', 'dontknow', 'want', 'no', 'more', 'bit', 'very', 'done', 'help',
  'wait', 'look', 'come', 'go', 'this', 'notthis', 'what', 'where', 'who', 'when', 'ok',
  'thanks', 'sorry', 'please'];
const NEW_CORE = ['slowagain', 'writeit', 'whattodo', 'bywhen', 'howmuch', 'slowly',
  'noscold', 'cantmove', 'nospeak'];
let v15;
try {
  v15 = vm.runInContext(`(function () {
    const r = {};
    const grid = document.querySelector('#grid');
    const spoken = [];
    const realSpeak = speak;
    speak = function (t) { spoken.push(t); return true; };
    try {
      // 1) よくつかう の並び(画面に出る順)
      S.lang = 'ja'; curCat = 'core'; editMine = false;
      grid.children.length = 0;
      renderGrid();
      r.coreIds = CARDS.filter(c => c.cat === 'core').map(c => c.id);
      r.coreShown = grid.children.map(b => (b.children[1] || {}).textContent);
      r.coreJa = r.coreIds.map(id => LBL.ja[id]);

      // 2) ちいさく みせる(疑似DOMは class を読まないので、HTMLと同じく隠した状態から始める)
      const sv = document.querySelector('#smallview');
      const btn = document.querySelector('#btn-show-small');
      const ta = document.querySelector('#show-text');
      sv.classList.add('hidden');
      document.querySelector('#bigview').classList.add('hidden');
      document.querySelector('#mydlg').classList.add('hidden');
      ta.value = ''; bar = [];
      btn.onclick();
      r.emptyStaysHidden = sv.classList.contains('hidden');
      bar = [{ e: '💧', t: 'みず' }, { e: '🙏', t: 'ほしい' }];
      btn.onclick();
      r.barShown = !sv.classList.contains('hidden') && sv.textContent === 'みず、ほしい' && btn.classList.contains('on');
      r.scanHasSmall = (scanTargets() || []).indexOf(sv) >= 0;
      btn.onclick();
      r.secondPressHides = sv.classList.contains('hidden') && !btn.classList.contains('on');
      r.scanNoSmallWhenHidden = (scanTargets() || []).indexOf(sv) < 0;
      ta.value = 'もじで かいてください';
      btn.onclick();
      r.showTextWins = !sv.classList.contains('hidden') && sv.textContent === 'もじで かいてください';
      sv.onclick();
      r.tapSmallHides = sv.classList.contains('hidden') && !btn.classList.contains('on');
      r.smallSpoken = spoken.length;

      // 3) ほぞんした文: 即よみ OFF なら読まずに文バーへ戻すだけ / ON なら読む
      spoken.length = 0;
      phrases = [{ id: 'p1', text: 'みず、ほしい', chips: [{ e: '💧', t: 'みず' }, { e: '🙏', t: 'ほしい' }] }];
      curCat = 'saved'; editMine = false;
      grid.children.length = 0;
      renderGrid();
      S.instant = false; bar = [];
      grid.children[0].onclick();
      r.offSpoken = spoken.length;
      r.offBar = bar.map(c => c.t).join('|');
      S.instant = true; bar = [];
      grid.children[0].onclick();
      r.onSpoken = spoken.slice();
      r.onBar = bar.map(c => c.t).join('|');
    } finally {
      speak = realSpeak;
    }
    return r;
  })()`, sandbox, { filename: 'v15-checks.js' });
} catch (e) {
  console.log('  NG  v1.5 の検査コードが例外で止まった: ' + e.message);
  ng++;
  v15 = null;
}
if (v15) {
  const coreLen = v15.coreIds.length;
  check('よくつかう の先頭24枚は前と同じ並び(場所で覚えている)',
    JSON.stringify(v15.coreIds.slice(0, OLD_CORE.length)) === JSON.stringify(OLD_CORE));
  check('新しい9枚が よくつかう の最後に決まった順で並ぶ',
    coreLen === OLD_CORE.length + NEW_CORE.length &&
    JSON.stringify(v15.coreIds.slice(-NEW_CORE.length)) === JSON.stringify(NEW_CORE));
  check('画面にも同じ順で出る(最後の9枚の文言がLBL.jaと一致)',
    v15.coreShown.length === coreLen &&
    JSON.stringify(v15.coreShown.slice(-NEW_CORE.length)) === JSON.stringify(v15.coreJa.slice(-NEW_CORE.length)));
  console.log('  よくつかう ' + coreLen + '枚 / 最後の9枚: ' + v15.coreShown.slice(-NEW_CORE.length).join(' / '));
  check('ちいさく みせる: 文が空なら何も出さない', v15.emptyStaysHidden);
  check('ちいさく みせる: みせるが空なら文バーの文を小さく出す(ボタンは押された状態)', v15.barShown);
  check('ちいさく みせる: もう1回押すと消える', v15.secondPressHides);
  check('ちいさく みせる: みせるに書いた文があればそちらを出す', v15.showTextWins);
  check('ちいさく みせる: 小さい表示を押しても消える', v15.tapSmallHides);
  check('ちいさく みせる: 音は鳴らさない(読み上げ0回)', v15.smallSpoken === 0);
  check('ちいさく みせる: 出ている間はスイッチスキャンの対象に入る/消えたら外れる',
    v15.scanHasSmall && v15.scanNoSmallWhenHidden);
  check('ほぞん: 即よみ OFF で押しても読み上げない(0回)', v15.offSpoken === 0);
  check('ほぞん: 即よみ OFF でも文バーには戻る', v15.offBar === 'みず|ほしい');
  check('ほぞん: 即よみ ON なら今までどおり読み上げる',
    v15.onSpoken.length === 1 && v15.onSpoken[0] === 'みず、ほしい' && v15.onBar === 'みず|ほしい');
}
check('index.html: 小さい表示は最初は隠れている', /<button id="smallview" class="hidden"/.test(html));
const showSec = (/<section id="scr-show"[\s\S]*?<\/section>/.exec(html) || [''])[0];
check('index.html: ちいさく みせる のボタンは「みせる」画面の中', /id="btn-show-small"/.test(showSec));
const tabsNav = (/<nav id="tabs">[\s\S]*?<\/nav>/.exec(html) || [''])[0];
check('フッターのタブは6個のまま(新しいタブを作らない)', (tabsNav.match(/<button/g) || []).length === 6);
check('RTL(ar)では小さい表示を左すみに出す', /html\[dir="rtl"\]#smallview\{[^}]*right:auto;[^}]*left:/.test(css));
check('小さい表示は文字サイズ設定(rem)に合わせ、はみ出さない(最大幅・最大高さ・折り返し)',
  /#smallview\{[^}]*font-size:[0-9.]+rem/.test(css) && /#smallview\{[^}]*max-width:/.test(css) &&
  /#smallview\{[^}]*max-height:/.test(css) && /#smallview\{[^}]*overflow-wrap:anywhere/.test(css));

/* ---- [つかいかた] はじめての つかいかた(2026-09-30) ----
   まだ読んでいない端末(localStorage が空)で起動すると案内が出て、読んだ端末では出ない。
   ほんものの動き(ページ送り・戻る・全言語)は store/_back_check.js(ヘッドレスChrome)で見る */
console.log('');
console.log('[つかいかた] はじめての つかいかた');
check('index.html: せっていに「つかいかた」の行とボタンがある', ids.has('set-guide-row') && ids.has('lb-guide') && ids.has('btn-guide'));
check('読んだ端末(種あり)では 案内は出ない', vm.runInContext('guideOv === null', sandbox));
const fresh = Object.assign({}, sandbox, {
  document: Object.assign({}, documentStub, { body: makeEl('body'), documentElement: Object.assign(makeEl('html'), { lang: '', dir: '' }) }),
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} }
});
fresh.window = fresh; fresh.globalThis = fresh;
vm.createContext(fresh);
let freshOk = true;
try { vm.runInContext(src, fresh, { filename: 'app-bundle-fresh.js' }); }
catch (e) { freshOk = false; console.log('    → ' + e.message); }
check('まだ読んでいない端末(空)で起動しても 例外なし', freshOk);
check('まだ読んでいない端末では 案内が出る(本文は日本語の1ページ目)', freshOk && vm.runInContext('!!guideOv', fresh) &&
  fresh.document.body.children.indexOf(vm.runInContext('guideOv', fresh)) >= 0);
const allCtx = { LBL: {}, I18N: {} };
vm.createContext(allCtx);
vm.runInContext(['./i18n.js', './data/cards.js'].concat(fs.readdirSync('./data').filter(f => /^lang\.[a-z]+\.js$/.test(f)).map(f => './data/' + f))
  .map(f => fs.readFileSync(f, 'utf8')).join('\n') + '\n;globalThis.__g = { I18N, LBL };', allCtx);
const G = allCtx.__g;
const gLangs = Object.keys(G.I18N);
check('案内: 14言語すべてに guide がある', gLangs.length === 14 && gLangs.every(l => G.I18N[l].guide && Array.isArray(G.I18N[l].guide.bodies)));
const nPages = G.I18N.ja.guide.bodies.length;
check('案内: ページ数は 5〜8(ja ' + nPages + 'ページ)・全言語で heads/bodies が同じ数', nPages >= 5 && nPages <= 8 &&
  gLangs.every(l => G.I18N[l].guide.bodies.length === nPages && G.I18N[l].guide.heads.length === nPages));
const tok = (s) => (String(s).match(/\{@?[A-Za-z0-9_.]+\}/g) || []).sort().join(' ');
const tokBad = [];
gLangs.forEach(l => G.I18N.ja.guide.bodies.forEach((b, i) => {
  if (tok(G.I18N[l].guide.bodies[i]) !== tok(b)) tokBad.push(l + ':' + (i + 1));
}));
check('案内: 全言語で どのページも ja と同じ ボタン名({…})を あげている' + (tokBad.length ? '(' + tokBad.join(', ') + ')' : ''), tokBad.length === 0);
const NG_WORDS = /子ども|こども|子供|キッズ|知育|児童|お子さま|kids|children|child|—|―|無料|むりょう|free/i;
const wordBad = [];
gLangs.forEach(l => { const g = G.I18N[l].guide; [g.title, g.prev, g.next, g.start, g.again].concat(g.heads, g.bodies).forEach(s => { if (NG_WORDS.test(s)) wordBad.push(l + ': ' + String(s).slice(0, 30)); }); });
check('案内: 禁句・ダッシュ・価格の言葉が無い' + (wordBad.length ? '(' + wordBad.join(' / ') + ')' : ''), wordBad.length === 0);

console.log('');
if (ng) { console.error('SMOKE NG: ' + ng + '件 失敗 / OK ' + ok + '件'); process.exit(1); }
console.log('SMOKE OK: セーフエリア/バージョン/v1.5/つかいかた 全' + ok + '件 合格');
