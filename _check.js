'use strict';
// データ検証: 全カードidのラベル網羅・id重複・I18Nキー一致を機械チェック
// 使い方: node _check.js
const fs = require('fs');
const vm = require('vm');

const ctx = {};
vm.createContext(ctx);
const files = ['./i18n.js', './data/cards.js'].concat(
  fs.readdirSync('./data').filter(f => /^lang\.[a-z]+\.js$/.test(f)).map(f => './data/' + f)
);
const src = files.map(f => fs.readFileSync(f, 'utf8')).join('\n') +
  '\n;globalThis.__out = { CARDS, ER_CARDS, LBL, I18N, CATEGORIES };';
vm.runInContext(src, ctx);
const { CARDS, ER_CARDS, LBL, I18N, CATEGORIES } = ctx.__out;
let ng = 0;
const allIds = CARDS.concat(ER_CARDS).map(c => c.id);

// id重複
const seen = {};
allIds.forEach(id => { if (seen[id]) { console.log('NG dup id: ' + id); ng++; } seen[id] = 1; });

// カテゴリ整合
const catIds = new Set(CATEGORIES.map(c => c.id));
CARDS.forEach(c => { if (!catIds.has(c.cat)) { console.log('NG unknown cat: ' + c.id + ' -> ' + c.cat); ng++; } });

// 言語ごとのラベル網羅 + I18Nキー一致(enを基準)
const enKeys = JSON.stringify(collectKeys(I18N.en));
function collectKeys(o, pre) {
  return Object.keys(o).sort().flatMap(k =>
    (o[k] && typeof o[k] === 'object') ? collectKeys(o[k], (pre || '') + k + '.') : [(pre || '') + k]);
}
Object.keys(LBL).forEach(lg => {
  allIds.forEach(id => {
    if (!LBL[lg][id]) { console.log('NG missing label: ' + lg + ':' + id); ng++; }
  });
  const extra = Object.keys(LBL[lg]).filter(k => !seen[k]);
  extra.forEach(k => { console.log('WARN unused label: ' + lg + ':' + k); });
});
Object.keys(I18N).forEach(lg => {
  const keys = JSON.stringify(collectKeys(I18N[lg]));
  if (keys !== enKeys) {
    console.log('NG I18N key mismatch: ' + lg);
    const a = collectKeys(I18N[lg]), b = collectKeys(I18N.en);
    b.filter(k => !a.includes(k)).forEach(k => console.log('   missing: ' + k));
    a.filter(k => !b.includes(k)).forEach(k => console.log('   extra: ' + k));
    ng++;
  }
});

console.log('langs LBL: ' + Object.keys(LBL).join(',') + ' / I18N: ' + Object.keys(I18N).join(','));
console.log('cards: ' + CARDS.length + ' + ER ' + ER_CARDS.length);
console.log(ng === 0 ? 'ALL OK' : 'NG x' + ng);
process.exit(ng === 0 ? 0 : 1);
