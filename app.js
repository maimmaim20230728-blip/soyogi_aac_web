'use strict';
// そよぎ式AACアプリ 本体

// ---------- 状態 ----------
const LS_SET = 'soyogi_aac.settings';
const LS_MY = 'soyogi_aac.mycards';
const LS_PH = 'soyogi_aac.phrases';
const SOYOGI_URL = 'https://soyogi.hp.peraichi.com/top';
const DEF = {
  lang: 'ja', textSize: 'm', grid: 'm', instant: true, rate: 'normal',
  scanOn: false, scanSpeed: 'normal',
  voice: { ja: '', en: '' }
};

function loadJSON(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch (e) { return fallback; }
}
function saveJSON(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
}

let S = Object.assign({}, DEF, loadJSON(LS_SET, {}));
S.voice = Object.assign({}, DEF.voice, S.voice || {});
let myCards = loadJSON(LS_MY, []);
let phrases = loadJSON(LS_PH, []);   // 保存した文 [{id, text, chips}]
let bar = [];            // 文バー [{e, t, img?}]
let curCat = 'core';
let editMine = false;
let dlgImg = '';         // ダイアログで選択中の写真(dataURL)

const $ = (sel) => document.querySelector(sel);

// 対応14言語（障害者版WSサポートと同一）: [コード, 表示名, TTSロケール]
const LANGS = [
  ['ja', '日本語', 'ja-JP'],
  ['en', 'English', 'en-US'],
  ['zh', '中文', 'zh-CN'],
  ['es', 'Español', 'es-ES'],
  ['hi', 'हिन्दी', 'hi-IN'],
  ['ar', 'العربية', 'ar-SA'],
  ['pt', 'Português', 'pt-BR'],
  ['fr', 'Français', 'fr-FR'],
  ['ru', 'Русский', 'ru-RU'],
  ['id', 'Bahasa Indonesia', 'id-ID'],
  ['de', 'Deutsch', 'de-DE'],
  ['ko', '한국어', 'ko-KR'],
  ['it', 'Italiano', 'it-IT'],
  ['bn', 'বাংলা', 'bn-BD']
];
function T() { return I18N[S.lang] || I18N.en || I18N.ja; }
function lbl(id) {
  const t = LBL[S.lang] || {};
  return t[id] || LBL.en[id] || LBL.ja[id] || id;
}
function speakLang() {
  const row = LANGS.find(l => l[0] === S.lang);
  return row ? row[2] : 'en-US';
}
// 言語パックの遅延読み込み（ja/enは同梱・他はdata/lang.<code>.js）
function loadLang(code, cb) {
  if (LBL[code] && I18N[code]) { cb(true); return; }
  const s = document.createElement('script');
  s.src = 'data/lang.' + code + '.js';
  s.onload = () => cb(!!(LBL[code] && I18N[code]));
  s.onerror = () => cb(false);
  document.head.appendChild(s);
}
function applyDir() {
  document.documentElement.dir = (S.lang === 'ar') ? 'rtl' : 'ltr';
}

// ---------- 読み上げ ----------
const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
let voices = [];

function refreshVoices() {
  if (!synth) return;
  voices = synth.getVoices() || [];
  fillVoiceSelect();
}
function langVoices() {
  const prefix = speakLang().split('-')[0].toLowerCase();
  return voices.filter(v => v.lang && v.lang.toLowerCase().indexOf(prefix) === 0);
}
function pickVoice() {
  const vs = langVoices();
  if (!vs.length) return null;
  const wanted = S.voice[S.lang];
  if (wanted) {
    const found = vs.find(v => v.name === wanted);
    if (found) return found;
  }
  return vs.find(v => v.localService) || vs[0];
}
function speak(text) {
  if (!synth || !text) return false;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = speakLang();
  const v = pickVoice();
  if (v) u.voice = v;
  u.rate = { slow: 0.75, normal: 1, fast: 1.3 }[S.rate] || 1;
  synth.speak(u);
  return true;
}
function buzz() { if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) {} } }

// ---------- 文バー ----------
function barText() {
  const sep = S.lang === 'ja' ? '、' : (S.lang === 'zh' ? '，' : ' ');
  // 数字カード+時間単位カードが並んだら結合して自然に読む
  // 例: ja「3」「じ」「30」「ふん」→「3時30分」(さんじさんじゅっぷん)
  const UNIT_SPEAK = {
    ja: { min: '分', oclock: '時', hourdur: '時間' },
    zh: { min: '分钟', oclock: '点', hourdur: '小时' }
  };
  const units = UNIT_SPEAK[S.lang];
  const parts = [];
  for (let i = 0; i < bar.length; i++) {
    const cur = bar[i];
    const next = bar[i + 1];
    if (units && next && /^[0-9]+$/.test(cur.t)) {
      const unitId = ['oclock', 'min', 'hourdur'].find(id => next.t === lbl(id));
      if (unitId) {
        let merged = cur.t + units[unitId];
        i++;
        // 「3時」の直後に「30」「ふん」が続けば「3時30分」までまとめる
        const n2 = bar[i + 1], n3 = bar[i + 2];
        if (unitId === 'oclock' && n2 && n3 && /^[0-9]+$/.test(n2.t) && n3.t === lbl('min')) {
          merged += n2.t + units.min;
          i += 2;
        }
        parts.push(merged);
        continue;
      }
    }
    parts.push(cur.t);
  }
  return parts.join(sep);
}
function renderBar() {
  const el = $('#bar');
  el.textContent = '';
  if (!bar.length) {
    const s = document.createElement('span');
    s.className = 'empty';
    s.textContent = T().barEmpty;
    el.appendChild(s);
    return;
  }
  bar.forEach(c => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    if (c.img) {
      const im = document.createElement('img'); im.className = 'chimg'; im.src = c.img; im.alt = '';
      chip.appendChild(im);
    } else {
      const e = document.createElement('span'); e.className = 'che'; e.textContent = c.e;
      chip.appendChild(e);
    }
    const l = document.createElement('span'); l.className = 'chl'; l.textContent = c.t;
    chip.appendChild(l);
    el.appendChild(chip);
  });
  el.scrollLeft = el.scrollWidth;
}
function addToBar(emoji, text, img) {
  bar.push({ e: emoji, t: text, img: img || undefined });
  renderBar();
  buzz();
  if (S.instant) speak(text);
}

// ---------- カテゴリ・グリッド ----------
function renderCats() {
  const el = $('#cats');
  el.textContent = '';
  CATEGORIES.forEach(cat => {
    const b = document.createElement('button');
    b.className = 'cat' + (cat.id === curCat ? ' active' : '');
    const e = document.createElement('span'); e.className = 'cate'; e.textContent = cat.e;
    const l = document.createElement('span'); l.className = 'catl'; l.textContent = T().cats[cat.id];
    b.appendChild(e); b.appendChild(l);
    b.onclick = () => { curCat = cat.id; editMine = false; renderCats(); renderGrid(); };
    el.appendChild(b);
  });
}
function makeCard(emoji, text, onTap, onDel, img) {
  const b = document.createElement('button');
  b.className = 'card';
  if (img) {
    const im = document.createElement('img'); im.className = 'cimg'; im.src = img; im.alt = '';
    b.appendChild(im);
  } else {
    const e = document.createElement('span'); e.className = 'ce'; e.textContent = emoji;
    b.appendChild(e);
  }
  const l = document.createElement('span'); l.className = 'cl'; l.textContent = text;
  b.appendChild(l);
  if (onDel) {
    const d = document.createElement('span');
    d.className = 'del'; d.textContent = '✕';
    b.appendChild(d);
    b.onclick = onDel;
  } else {
    b.onclick = onTap;
  }
  return b;
}
function delMyCard(id) {
  myCards = myCards.filter(c => c.id !== id);
  saveJSON(LS_MY, myCards);
  renderGrid(); renderMyList();
}
function delPhrase(id) {
  phrases = phrases.filter(p => p.id !== id);
  saveJSON(LS_PH, phrases);
  renderGrid();
}
function renderGrid() {
  const grid = $('#grid');
  grid.textContent = '';
  const hasTools = curCat === 'mine' || curCat === 'saved';
  $('#mine-tools').classList.toggle('hidden', !hasTools);
  $('#btn-my-add').classList.toggle('hidden', curCat === 'saved');
  $('#btn-my-edit').classList.toggle('on', editMine);
  $('#btn-my-edit').textContent = editMine ? T().myDone : T().myEdit;

  if (curCat === 'saved') {
    if (!phrases.length) {
      const p = document.createElement('p');
      p.className = 'hint'; p.textContent = T().savedEmpty;
      grid.appendChild(p);
      return;
    }
    phrases.forEach(p => {
      const chips = p.chips || [];
      const emoji = chips.length ? chips.slice(0, 2).map(c => c.e || '🖼️').join('') : '📌';
      grid.appendChild(makeCard(emoji, p.text, () => {
        speak(p.text);
        bar = chips.map(c => ({ e: c.e, t: c.t, img: c.img }));
        renderBar(); buzz();
      }, editMine ? (() => delPhrase(p.id)) : undefined));
    });
    return;
  }
  if (curCat === 'mine') {
    if (!myCards.length) {
      const p = document.createElement('p');
      p.className = 'hint'; p.textContent = T().myEmpty;
      grid.appendChild(p);
      return;
    }
    myCards.forEach(c => {
      grid.appendChild(makeCard(c.e, c.label,
        () => addToBar(c.e, c.label, c.img),
        editMine ? (() => delMyCard(c.id)) : undefined,
        c.img));
    });
    return;
  }
  CARDS.filter(c => c.cat === curCat).forEach(c => {
    grid.appendChild(makeCard(c.e, lbl(c.id), () => addToBar(c.e, lbl(c.id))));
  });
}

// ---------- きんきゅう ----------
function renderEr() {
  const el = $('#er-grid');
  el.textContent = '';
  ER_CARDS.forEach(c => {
    const b = makeCard(c.e, lbl(c.id), () => {
      speak(lbl(c.id));
      buzz();
      b.classList.add('flash');
      setTimeout(() => b.classList.remove('flash'), 600);
    });
    el.appendChild(b);
  });
}

// ---------- スキャン入力（スイッチ） ----------
// 行→個別の2段階スキャン。スイッチ=画面のどこでもタップ/スペース/Enter。
// 1.5秒長押し or Esc でOFFに戻れる（閉じ込め防止）。
let scan = { timer: null, level: 1, rows: [], ri: 0, ii: 0, cycles: 0 };
let scanHold = null;

function scanSpeedMs() {
  return { slow: 2000, normal: 1300, fast: 850 }[S.scanSpeed] || 1300;
}
function scanTargets() {
  if (!$('#bigview').classList.contains('hidden')) return null; // でか文字中はスイッチ=閉じる
  let root;
  if (!$('#mydlg').classList.contains('hidden')) root = $('#mydlg');
  else root = document.querySelector('.screen:not(.hidden)');
  if (!root) return [];
  const els = [...root.querySelectorAll('button')]
    .filter(b => b.offsetParent !== null && !b.classList.contains('empty'));
  if (root.id !== 'mydlg') els.push(...document.querySelectorAll('#tabs button'));
  return els;
}
function scanBuildRows() {
  const els = scanTargets();
  if (!els || !els.length) { scan.rows = []; return; }
  const sorted = els.map(el => ({ el, top: el.getBoundingClientRect().top }))
    .sort((a, b) => a.top - b.top);
  const rows = [];
  let cur = null, curTop = -9999;
  sorted.forEach(x => {
    if (Math.abs(x.top - curTop) > 12) { cur = []; rows.push(cur); curTop = x.top; }
    cur.push(x.el);
  });
  rows.forEach(r => r.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left));
  scan.rows = rows;
  if (scan.ri >= rows.length) scan.ri = 0;
}
function scanClearHi() {
  document.querySelectorAll('.scan-hi').forEach(e => e.classList.remove('scan-hi'));
}
function scanPaint() {
  scanClearHi();
  const row = scan.rows[scan.ri];
  if (!row) return;
  if (scan.level === 1) {
    row.forEach(e => e.classList.add('scan-hi'));
    row[0].scrollIntoView({ block: 'nearest' });
  } else {
    const el = row[scan.ii];
    if (el) { el.classList.add('scan-hi'); el.scrollIntoView({ block: 'nearest' }); }
  }
}
function scanTick() {
  if (!scan.rows.length) { scanBuildRows(); scanPaint(); return; }
  if (scan.level === 1) {
    scan.ri = (scan.ri + 1) % scan.rows.length;
    if (scan.ri === 0) scanBuildRows(); // 一周ごとに画面変化を拾う
  } else {
    scan.ii++;
    const row = scan.rows[scan.ri] || [];
    if (scan.ii >= row.length) {
      scan.ii = 0; scan.cycles++;
      if (scan.cycles >= 2) { scan.level = 1; scan.cycles = 0; } // 2周で行選択に戻る
    }
  }
  scanPaint();
}
function scanResetTimer() {
  if (scan.timer) clearInterval(scan.timer);
  scan.timer = setInterval(scanTick, scanSpeedMs());
}
function scanStart() {
  scanStop();
  scan.level = 1; scan.ri = 0; scan.ii = 0; scan.cycles = 0;
  scanBuildRows();
  scanPaint();
  scanResetTimer();
}
function scanStop() {
  if (scan.timer) clearInterval(scan.timer);
  scan.timer = null;
  scanClearHi();
}
function scanSelect() {
  if (!$('#bigview').classList.contains('hidden')) {
    $('#bigview').classList.add('hidden');
    setTimeout(scanStart, 50);
    return;
  }
  if (!scan.rows.length) { scanBuildRows(); scanPaint(); return; }
  if (scan.level === 1) {
    scan.level = 2; scan.ii = 0; scan.cycles = 0;
    scanPaint();
    scanResetTimer();
  } else {
    const el = (scan.rows[scan.ri] || [])[scan.ii];
    scanClearHi();
    if (el) el.click(); // プログラム的click(isTrusted=false)は封鎖を通過する
    scan.level = 1; scan.ri = 0; scan.ii = 0; scan.cycles = 0;
    setTimeout(() => { scanBuildRows(); scanPaint(); }, 80);
    scanResetTimer();
  }
}
function scanEnable(on) {
  S.scanOn = on;
  saveJSON(LS_SET, S);
  syncSegs();
  if (on) scanStart(); else scanStop();
}
function bindScan() {
  document.addEventListener('pointerdown', (ev) => {
    if (!S.scanOn) return;
    ev.preventDefault(); ev.stopPropagation();
    scanHold = setTimeout(() => { scanHold = null; scanEnable(false); }, 1500);
  }, true);
  document.addEventListener('pointerup', (ev) => {
    if (!S.scanOn) { if (scanHold) { clearTimeout(scanHold); scanHold = null; } return; }
    ev.preventDefault(); ev.stopPropagation();
    if (scanHold) { clearTimeout(scanHold); scanHold = null; scanSelect(); }
  }, true);
  // スキャン中は生のタップclickを封じる（scanSelect経由のclick()のみ通す）
  document.addEventListener('click', (ev) => {
    if (S.scanOn && ev.isTrusted) { ev.preventDefault(); ev.stopPropagation(); }
  }, true);
  document.addEventListener('keydown', (ev) => {
    if (!S.scanOn) return;
    if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); scanSelect(); }
    else if (ev.key === 'Escape') scanEnable(false);
  });
}

// ---------- もじばん（文字盤） ----------
let kbText = '';
const KB_DAKU = {
  'か':'が','き':'ぎ','く':'ぐ','け':'げ','こ':'ご',
  'さ':'ざ','し':'じ','す':'ず','せ':'ぜ','そ':'ぞ',
  'た':'だ','ち':'ぢ','つ':'づ','て':'で','と':'ど',
  'は':'ば','ひ':'び','ふ':'ぶ','へ':'べ','ほ':'ぼ','う':'ゔ'
};
const KB_HANDAKU = { 'は':'ぱ','ひ':'ぴ','ふ':'ぷ','へ':'ぺ','ほ':'ぽ' };
const KB_SMALL = {
  'あ':'ぁ','い':'ぃ','う':'ぅ','え':'ぇ','お':'ぉ',
  'つ':'っ','や':'ゃ','ゆ':'ゅ','よ':'ょ','わ':'ゎ'
};
function kbToggleLast(map) {
  if (!kbText) return;
  const last = kbText.slice(-1);
  if (map[last]) { kbText = kbText.slice(0, -1) + map[last]; return; }
  // すでに変換済みなら元に戻す（トグル）
  const back = Object.keys(map).find(k => map[k] === last);
  if (back) kbText = kbText.slice(0, -1) + back;
}
function kbRows() {
  if (S.lang === 'ja') {
    return [
      'あかさたなはまやらわ',
      'いきしちにひみ りを',
      'うくすつぬふむゆるん',
      'えけせてねへめ れー',
      'おこそとのほもよろ、'
    ];
  }
  if (S.lang === 'ru') {
    return ['АБВГДЕЁЖЗИ', 'ЙКЛМНОПРСТ', 'УФХЦЧШЩЪЫЬ', 'ЭЮЯ.,?!'];
  }
  if (S.lang === 'ar') {
    return ['ابتثجحخدذر', 'زسشصضطظعغف', 'قكلمنهوية', 'ءأإآؤئى،؟'];
  }
  // ラテン文字言語 = ABC + 言語別アクセント行
  const ACC = {
    en: '', id: '',
    es: 'ÁÉÍÓÚÜÑ¿¡', fr: 'ÀÂÇÉÈÊÎÔÙÛ', de: 'ÄÖÜß',
    it: 'ÀÈÉÌÒÙ', pt: 'ÁÂÃÇÉÊÍÓÕÚ'
  };
  if (ACC[S.lang] !== undefined) {
    const rows = ['ABCDEFGHIJ', 'KLMNOPQRST', 'UVWXYZ.,?!'];
    if (ACC[S.lang]) rows.push(ACC[S.lang]);
    return rows;
  }
  return null; // zh/hi/bn/ko は文字盤なし→テキスト入力にフォールバック
}
function kbGetText() {
  return kbRows() ? kbText : $('#kb-ta').value.trim();
}
function renderKbOut() {
  const out = $('#kb-out');
  if (kbText) {
    out.textContent = kbText;
    out.classList.remove('empty');
  } else {
    out.textContent = T().kbPh;
    out.classList.add('empty');
  }
}
function kbPress(ch) {
  if (ch === '゛') kbToggleLast(KB_DAKU);
  else if (ch === '゜') kbToggleLast(KB_HANDAKU);
  else if (ch === '小') kbToggleLast(KB_SMALL);
  else kbText += ch;
  buzz();
  renderKbOut();
}
function renderKb() {
  const keys = $('#kb-keys');
  keys.textContent = '';
  const rowsDef = kbRows();
  const fallback = !rowsDef;
  $('#kb-keys').classList.toggle('hidden', fallback);
  $('#kb-out').classList.toggle('hidden', fallback);
  $('#kb-ta').classList.toggle('hidden', !fallback);
  if (fallback) {
    $('#kb-ta').placeholder = T().kbPh;
    return;
  }
  const addKey = (label, onTap, cls, span) => {
    const b = document.createElement('button');
    b.className = 'kbkey' + (cls ? ' ' + cls : '');
    if (span) b.style.gridColumn = 'span ' + span;
    b.textContent = label;
    b.onclick = onTap;
    keys.appendChild(b);
  };
  rowsDef.forEach(row => {
    row.split('').forEach(ch => {
      if (ch === ' ') {
        const sp = document.createElement('span');
        sp.className = 'kbkey empty';
        keys.appendChild(sp);
      } else {
        addKey(ch, () => kbPress(ch));
      }
    });
  });
  // 数字行
  '1234567890'.split('').forEach(n => addKey(n, () => kbPress(n), 'fn'));
  // 機能行
  if (S.lang === 'ja') {
    addKey('゛', () => kbPress('゛'), 'fn');
    addKey('゜', () => kbPress('゜'), 'fn');
    addKey('小', () => kbPress('小'), 'fn');
    addKey('。', () => kbPress('。'), 'fn');
    addKey('？', () => kbPress('？'), 'fn');
    addKey('！', () => kbPress('！'), 'fn');
    addKey(T().kbSpace, () => kbPress('　'), 'fn', 4);
  } else {
    addKey("'", () => kbPress("'"), 'fn');
    addKey('-', () => kbPress('-'), 'fn');
    addKey(T().kbSpace, () => kbPress(' '), 'fn', 8);
  }
  // 消す系
  addKey('⌫', () => { kbText = kbText.slice(0, -1); buzz(); renderKbOut(); }, 'fn warn2', 5);
  addKey(T().kbClear, () => { kbText = ''; buzz(); renderKbOut(); }, 'fn warn2', 5);
  renderKbOut();
}
function bindKb() {
  $('#btn-kb-say').onclick = () => { const t = kbGetText(); if (t) speak(t); };
  $('#btn-kb-big').onclick = () => openBig(kbGetText());
}

// ---------- みせる ----------
function fitBigText() {
  const el = $('#bigtext');
  let size = Math.min(window.innerWidth, window.innerHeight) * 0.5;
  el.style.fontSize = size + 'px';
  let guard = 40;
  while (guard-- > 0 && size > 14 &&
         (el.scrollHeight > window.innerHeight * 0.94 || el.scrollWidth > window.innerWidth * 0.97)) {
    size *= 0.88;
    el.style.fontSize = size + 'px';
  }
}
function openBig(text) {
  if (!text) return;
  $('#bigtext').textContent = text;
  $('#bigview').classList.remove('hidden');
  fitBigText();
}
function bindShow() {
  $('#btn-show-big').onclick = () => openBig($('#show-text').value.trim());
  $('#btn-show-say').onclick = () => speak($('#show-text').value.trim());
  $('#btn-show-from-bar').onclick = () => { $('#show-text').value = barText(); };
  $('#bigview').onclick = () => $('#bigview').classList.add('hidden');
  window.addEventListener('resize', () => {
    if (!$('#bigview').classList.contains('hidden')) fitBigText();
  });
}

// ---------- じぶんカード ----------
function renderMyList() {
  const ul = $('#my-list');
  ul.textContent = '';
  myCards.forEach(c => {
    const li = document.createElement('li');
    if (c.img) {
      const im = document.createElement('img'); im.className = 'myimg'; im.src = c.img; im.alt = '';
      li.appendChild(im);
    } else {
      const e = document.createElement('span'); e.className = 'mye'; e.textContent = c.e;
      li.appendChild(e);
    }
    const l = document.createElement('span'); l.className = 'myl'; l.textContent = c.label;
    const d = document.createElement('button'); d.textContent = '✕';
    d.onclick = () => {
      myCards = myCards.filter(x => x.id !== c.id);
      saveJSON(LS_MY, myCards);
      renderMyList(); if (curCat === 'mine') renderGrid();
    };
    li.appendChild(l); li.appendChild(d);
    ul.appendChild(li);
  });
}
function setDlgPhoto(dataUrl) {
  dlgImg = dataUrl || '';
  const prev = $('#my-photo-prev');
  prev.src = dlgImg;
  prev.classList.toggle('hidden', !dlgImg);
  $('#btn-my-photo-clear').classList.toggle('hidden', !dlgImg);
}
function resizePhoto(file, cb) {
  const img = new Image();
  img.onload = () => {
    const max = 192;
    const sc = Math.min(1, max / Math.max(img.width, img.height));
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(img.width * sc));
    cv.height = Math.max(1, Math.round(img.height * sc));
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    URL.revokeObjectURL(img.src);
    cb(cv.toDataURL('image/jpeg', 0.82));
  };
  img.onerror = () => { URL.revokeObjectURL(img.src); cb(''); };
  img.src = URL.createObjectURL(file);
}
function openMyDlg() {
  $('#my-e').value = '';
  $('#my-l').value = '';
  setDlgPhoto('');
  $('#mydlg').classList.remove('hidden');
  $('#my-l').focus();
}
function bindMyDlg() {
  $('#btn-my-add').onclick = openMyDlg;
  $('#btn-my-add2').onclick = openMyDlg;
  $('#btn-my-edit').onclick = () => { editMine = !editMine; renderGrid(); };
  $('#btn-my-cancel').onclick = () => $('#mydlg').classList.add('hidden');
  $('#btn-my-photo').onclick = () => $('#my-photo-file').click();
  $('#btn-my-photo-clear').onclick = () => setDlgPhoto('');
  $('#my-photo-file').onchange = (ev) => {
    const f = ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    resizePhoto(f, (url) => setDlgPhoto(url));
  };
  $('#btn-my-save').onclick = () => {
    const label = $('#my-l').value.trim();
    if (!label) { $('#my-l').focus(); return; }
    const emoji = $('#my-e').value.trim() || '⭐';
    const card = { id: 'my' + Date.now(), e: emoji, label };
    if (dlgImg) card.img = dlgImg;
    myCards.push(card);
    saveJSON(LS_MY, myCards);
    $('#mydlg').classList.add('hidden');
    renderMyList();
    if (curCat === 'mine') renderGrid();
  };
}

// ---------- バックアップ ----------
function bindBackup() {
  $('#btn-bk-export').onclick = () => {
    const data = { app: 'soyogi_aac', ver: 1, mycards: myCards, phrases: phrases, settings: S };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    a.download = 'soyogi-aac-backup-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  };
  $('#btn-bk-import').onclick = () => $('#bk-file').click();
  $('#bk-file').onchange = (ev) => {
    const f = ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        if (!d || d.app !== 'soyogi_aac') throw new Error('bad file');
        if (Array.isArray(d.mycards)) { myCards = d.mycards; saveJSON(LS_MY, myCards); }
        if (Array.isArray(d.phrases)) { phrases = d.phrases; saveJSON(LS_PH, phrases); }
        if (d.settings && typeof d.settings === 'object') {
          S = Object.assign({}, DEF, d.settings);
          S.voice = Object.assign({}, DEF.voice, d.settings.voice || {});
          saveJSON(LS_SET, S);
        }
        applySettings(); applyI18n(); renderAll();
        $('#bk-msg').textContent = T().bkDone;
      } catch (e) {
        $('#bk-msg').textContent = T().bkFail;
      }
    };
    r.readAsText(f);
  };
}

// ---------- せってい ----------
function fillVoiceSelect() {
  const sel = $('#set-voice');
  sel.textContent = '';
  const auto = document.createElement('option');
  auto.value = ''; auto.textContent = T().vAuto;
  sel.appendChild(auto);
  const vs = langVoices();
  if (!synth || !vs.length) {
    auto.textContent = T().vNone;
    sel.disabled = true;
    return;
  }
  sel.disabled = false;
  vs.forEach(v => {
    const o = document.createElement('option');
    o.value = v.name;
    o.textContent = v.name + (v.localService ? '' : ' ☁');
    sel.appendChild(o);
  });
  sel.value = S.voice[S.lang] || '';
  if (sel.selectedIndex < 0) sel.selectedIndex = 0;
}
function bindSeg(sel, getVal, setVal, after) {
  const box = $(sel);
  box.querySelectorAll('button').forEach(b => {
    b.onclick = () => {
      setVal(b.dataset.v);
      saveJSON(LS_SET, S);
      syncSegs();
      applySettings();
      if (after) after();
    };
  });
}
function syncSegs() {
  const mark = (sel, val) => {
    $(sel).querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.v === val));
  };
  mark('#seg-text', S.textSize);
  mark('#seg-grid', S.grid);
  mark('#seg-instant', S.instant ? '1' : '0');
  mark('#seg-rate', S.rate);
  mark('#seg-scan', S.scanOn ? '1' : '0');
  mark('#seg-scanspd', S.scanSpeed);
}
// ---------- 言語プルアップ（フッターの🌐・即反映） ----------
function langName(code) {
  const row = LANGS.find(l => l[0] === code);
  return row ? row[1] : code;
}
function bindLangTab() {
  const sel = $('#tab-lang-sel');
  sel.textContent = '';
  LANGS.forEach(([code, name]) => {
    const o = document.createElement('option');
    o.value = code;
    o.textContent = name;
    sel.appendChild(o);
  });
  sel.value = S.lang;
  sel.onchange = () => {
    const v = sel.value;
    loadLang(v, (ok) => {
      if (!ok) { sel.value = S.lang; return; }
      S.lang = v;
      saveJSON(LS_SET, S);
      applySettings();
      applyI18n();
      renderAll();
    });
  };
}
function bindSettings() {
  bindSeg('#seg-text', null, v => { S.textSize = v; });
  bindSeg('#seg-grid', null, v => { S.grid = v; });
  bindSeg('#seg-instant', null, v => { S.instant = v === '1'; });
  bindSeg('#seg-rate', null, v => { S.rate = v; });
  bindSeg('#seg-scan', null, v => { S.scanOn = v === '1'; }, () => {
    if (S.scanOn) scanStart(); else scanStop();
  });
  bindSeg('#seg-scanspd', null, v => { S.scanSpeed = v; }, () => {
    if (S.scanOn) scanResetTimer();
  });
  $('#set-voice').onchange = (ev) => {
    S.voice[S.lang] = ev.target.value;
    saveJSON(LS_SET, S);
  };
  $('#btn-voicetest').onclick = () => speak(T().vTestText);
}
function applySettings() {
  document.documentElement.dataset.textsize = S.textSize;
  document.documentElement.dataset.grid = S.grid;
  document.documentElement.lang = S.lang;
  applyDir();
}

// ---------- i18n適用 ----------
function applyI18n() {
  const t = T();
  const map = {
    '#tb-talk': t.tabs.talk, '#tb-er': t.tabs.er, '#tb-kb': t.tabs.kb,
    '#tb-show': t.tabs.show, '#tb-set': t.tabs.set,
    '#tb-lang': langName(S.lang),
    '#btn-kb-say': t.kbSay, '#btn-kb-big': t.kbBig,
    '#btn-say': '▶', '#er-title': t.erTitle, '#er-hint': t.erHint,
    '#show-title': t.showTitle,
    '#btn-show-big': t.showBig, '#btn-show-say': t.showSay, '#btn-show-from-bar': t.showFromBar,
    '#show-hint': t.showHint,
    '#set-title': t.setTitle,
    '#lb-lang': t.setLang, '#lb-text': t.setText,
    '#tx-s': t.tSmall, '#tx-m': t.tMid, '#tx-l': t.tBig,
    '#lb-grid': t.setGrid, '#gd-l': t.gBig, '#gd-m': t.gMid, '#gd-s': t.gSmall,
    '#lb-instant': t.setInstant, '#in-on': t.on, '#in-off': t.off,
    '#lb-rate': t.setRate, '#rt-s': t.rSlow, '#rt-m': t.rMid, '#rt-f': t.rFast,
    '#lb-scan': t.setScan, '#sc-off': t.scanOff, '#sc-on': t.scanOn,
    '#sp-s': t.rSlow, '#sp-m': t.rMid, '#sp-f': t.rFast,
    '#scan-hint': t.scanHint,
    '#lb-voice': t.setVoice, '#btn-voicetest': t.vTest,
    '#lb-my': t.setMy, '#btn-my-add': t.myAdd, '#btn-my-add2': t.myAdd,
    '#lb-backup': t.setBackup, '#btn-bk-export': t.bkExport, '#btn-bk-import': t.bkImport,
    '#bk-hint': t.bkHint,
    '#lb-about': t.aboutTitle, '#about-text': t.aboutText,
    '#dlg-lb-emoji': t.myEmoji, '#dlg-lb-label': t.myLabel, '#dlg-hint': t.myHint,
    '#dlg-lb-photo': t.myPhoto, '#btn-my-photo': t.myPhotoPick, '#btn-my-photo-clear': t.myPhotoClear,
    '#btn-my-save': t.mySave, '#btn-my-cancel': t.myCancel,
    '#voice-warn': t.noVoice
  };
  Object.keys(map).forEach(sel => {
    const el = $(sel);
    if (el) el.textContent = map[sel];
  });
  // クレジットはHPトップへのリンク
  const cr = $('#about-credit');
  cr.textContent = '';
  const a = document.createElement('a');
  a.href = SOYOGI_URL;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = t.credit;
  cr.appendChild(a);

  const langSel = $('#tab-lang-sel');
  if (langSel) langSel.value = S.lang;
  $('#show-text').placeholder = t.showPh;
  $('#btn-say').setAttribute('aria-label', t.say);
  $('#btn-star').setAttribute('aria-label', t.star);
  $('#btn-back').setAttribute('aria-label', t.back);
  $('#btn-clear').setAttribute('aria-label', t.clear);
  document.title = t.appName;
}

// ---------- タブ ----------
function bindTabs() {
  document.querySelectorAll('#tabs button').forEach(b => {
    if (!b.dataset.scr) return; // 🌐言語プルアップはタブ切替の対象外
    b.onclick = () => {
      document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('active', x === b));
      ['talk', 'er', 'kb', 'show', 'set'].forEach(id => {
        $('#scr-' + id).classList.toggle('hidden', id !== b.dataset.scr);
      });
      window.scrollTo(0, 0);
    };
  });
}

// ---------- 全体再描画 ----------
function renderAll() {
  renderCats();
  renderGrid();
  renderBar();
  renderEr();
  renderKb();
  renderMyList();
  fillVoiceSelect();
  syncSegs();
}

// ---------- 起動 ----------
function init() {
  // 保存済み言語のパックが未読み込みなら先に読む（失敗時は日本語に戻す）
  if (!(LBL[S.lang] && I18N[S.lang])) {
    loadLang(S.lang, (ok) => {
      if (!ok) { S.lang = 'ja'; saveJSON(LS_SET, S); }
      boot();
    });
    return;
  }
  boot();
}
function boot() {
  fillLangSelect();
  applySettings();
  applyI18n();
  renderAll();
  bindTabs();
  bindLangTab();
  bindKb();
  bindShow();
  bindMyDlg();
  bindSettings();
  bindBackup();
  bindScan();
  if (S.scanOn) scanStart();

  $('#btn-say').onclick = () => { const t = barText(); if (t) speak(t); };
  $('#btn-back').onclick = () => { bar.pop(); renderBar(); };
  $('#btn-clear').onclick = () => { bar = []; renderBar(); };
  $('#btn-star').onclick = () => {
    if (!bar.length) return;
    phrases.push({
      id: 'p' + Date.now(),
      text: barText(),
      chips: bar.map(c => ({ e: c.e, t: c.t, img: c.img }))
    });
    saveJSON(LS_PH, phrases);
    buzz();
    const b = $('#btn-star');
    b.classList.add('saved-flash');
    setTimeout(() => b.classList.remove('saved-flash'), 700);
    if (curCat === 'saved') renderGrid();
  };

  if (!synth) {
    $('#voice-warn').classList.remove('hidden');
  } else {
    refreshVoices();
    synth.onvoiceschanged = refreshVoices;
  }

  // Service Worker（開発中のlocalhostでは登録しない）
  if ('serviceWorker' in navigator &&
      !['localhost', '127.0.0.1'].includes(location.hostname)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
// boot()の末尾まで到達したら起動完了
init();
