/* IZLETI – aplikacija (PWA) */
'use strict';

const LIST_GORE = 'Gore in hribi';
const VRSTNI_RED = ['Gore in hribi', 'Kolesarjenje', 'Pohodi', 'Izleti', 'Deževni dnevi', 'Ostalo', 'Ferate', 'Potovanja'];
const IKONE = { 'Gore in hribi': '⛰️', 'Kolesarjenje': '🚴', 'Pohodi': '🥾', 'Izleti': '🚗', 'Deževni dnevi': '☔', 'Ostalo': '🎡', 'Ferate': '🧗', 'Potovanja': '✈️' };
const IZVORI = { A: 'Ajdovščina', M: 'Most na Soči' };
const POTI_LISTI = {
  'Poti': { nadrejeni: 'Gore in hribi', kljuc: 'ID vrha', obiskano: 'Prehojena' },
  'Kolesarske poti': { nadrejeni: 'Kolesarjenje', kljuc: 'Cilj', obiskano: 'Prevožena' },
};
const BARVE_POTI = ['#d62f2f', '#1f6fd1', '#2e9e5b', '#e67e22', '#8e44ad', '#17a2b8', '#c0392b', '#6d4c41'];

const S = {
  url: localStorage.getItem('izleti_url') || '',
  zeton: localStorage.getItem('izleti_zeton') || '',
  izvor: localStorage.getItem('izleti_izvor') || 'A',
  ver: 0, listi: {}, items: [], poti: [],
  zaslon: [], // sklad zaslonov
  seznam: { tipi: JSON.parse(localStorage.getItem('izleti_seznam_tipi') || '[]'), kdo: 'Skupaj', prikaz: 'cilji', pogled: 'seznam', barve: localStorage.getItem('izleti_barve') || 'kat' },
  razisk: { pogled: 'seznam', f: privzetiFiltri(LIST_GORE) },
  vikend: { vir: 'seznam', f: privzetiFiltri(LIST_GORE), zadnji: [] },
};

function privzetiFiltri(tip) {
  return { tip, q: '', status: 'ne-oba', seznam: '', voznja: '', kat: '', vrsta: '', podvrsta: '', gorovje: '', vmin: '', vmax: '',
    hoja: '', vzpon: '', zaht: '', spp: '', dolzina: '', kolo: '', razvrsti: 'voznja' };
}

// ---------------- pomočniki ----------------
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { if (v === '' || v === undefined || v === null) return null; const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; };
const ura = min => { if (min === null || min === undefined || min === '') return ''; min = Math.round(min); return Math.floor(min / 60) + ':' + String(min % 60).padStart(2, '0'); };
const koord = s => { const m = String(s || '').match(/(-?\d+[.,]\d+)\s*,\s*(-?\d+[.,]\d+)/); return m ? [parseFloat(m[1].replace(',', '.')), parseFloat(m[2].replace(',', '.'))] : null; };
const danes = () => new Date().toISOString().slice(0, 10);
const datumSl = s => { if (!s) return ''; const [y, m, d] = s.split('-'); return `${+d}. ${+m}. ${y}`; };
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
function obvesti(t, ms = 2500) { const o = $('#obvestilo'); o.textContent = t; o.hidden = false; clearTimeout(obvesti.t); obvesti.t = setTimeout(() => o.hidden = true, ms); }

// ---------------- komunikacija ----------------
async function api(params) {
  if (!S.url) throw new Error('V nastavitvah vpiši naslov spletne aplikacije.');
  const u = new URL(S.url);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  if (S.zeton) u.searchParams.set('t', S.zeton);
  const r = await fetch(u.toString());
  const j = await r.json();
  if (j.napaka) throw new Error(j.napaka);
  return j;
}
async function apiPost(body) {
  if (S.zeton) body.t = S.zeton;
  const r = await fetch(S.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (j.napaka) throw new Error(j.napaka);
  return j;
}

// ---------------- podatki ----------------
// predpomnilnik v IndexedDB (podatki s potmi so preveliki za localStorage)
const idb = (() => {
  let p;
  const db = () => p || (p = new Promise((res, rej) => { const r = indexedDB.open('izleti', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
  return {
    get: async k => { const d = await db(); return new Promise(res => { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }); },
    set: async (k, v) => { const d = await db(); return new Promise(res => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = res; }); },
  };
})();
async function naloziPredpomnilnik() {
  try {
    let c = await idb.get('podatki');
    if (!c) { c = JSON.parse(localStorage.getItem('izleti_podatki') || 'null'); }
    if (c) { S.ver = c.ver; S.listi = c.listi; pripravi(); return true; }
  } catch (e) {}
  return false;
}
async function osvezi(prisilno) {
  if (!S.url) return;
  try {
    if (!prisilno && S.ver) {
      const v = await api({ a: 'ver' });
      if (v.ver === S.ver) return;
    }
    const d = await api({ a: 'data' });
    S.ver = d.ver; S.listi = d.listi;
    shraniLokalno();
    pripravi();
    izrisi();
    if (prisilno) obvesti('Podatki osveženi');
  } catch (e) { obvesti('Napaka: ' + e.message, 4000); }
}

function pripravi() {
  const items = [];
  const idx = t => { const i = VRSTNI_RED.indexOf(t); return i < 0 ? 99 : i; };
  const tipi = Object.keys(S.listi).filter(t => !POTI_LISTI[t]).sort((a, b) => idx(a) - idx(b));
  tipi.forEach(tip => {
    (S.listi[tip].vrstice || []).forEach(o => {
      const gora = tip === LIST_GORE;
      const vrh = koord(o['Koordinate vrha'] || o['Koordinate']);
      const izh = koord(o['Koordinate izhodišča']);
      const visina = num(o['Višina (m)']);
      const it = {
        tip, o, gora,
        kljuc: o.ID || o.Ime,
        ime: o.Ime,
        lat: vrh ? vrh[0] : null, lon: vrh ? vrh[1] : null,
        izh,
        visina,
        kat: visina !== null ? (visina >= 2000 ? 'Gora' : 'Hrib') : (o.Kategorija || ''),
        gorovje: o.Gorovje || '',
        hoja: gora ? (num(o['Čas hoje (min)']) ?? num(o['Čas hoje']) ?? num(o['GPX čas'])) : num(o['Čas hoje']),
        dolzina: num(o['Dolžina poti (km)'] ?? o['Dolžina (km)'] ?? o['GPX dolžina (km)']),
        vzpon: num(o['Višinska razlika (m)'] ?? o['Vzpon (m)'] ?? o['GPX vzpon (m)']),
        kolo: num(o['Čas kolesarjenja']),
        vA: num(o['Vožnja iz Ajdovščine']), vM: num(o['Vožnja iz Mosta na Soči']),
        D: o['Danjel ✔'] === true || o['Danjel ✔'] === 'TRUE',
        S: o['Svetlana ✔'] === true || o['Svetlana ✔'] === 'TRUE',
        seznam: o.Seznam || '', prio: num(o.Prioriteta), sezona: o.Sezona || '', opomba: o.Opomba || '',
        spp: o['SPP / RSPP'] || '', zaht: o.Zahtevnost || '',
        vrsta: o.Vrsta || '', podvrsta: o.Podvrsta || '',
      };
      items.push(it);
    });
  });
  S.items = items;
  S.tipi = tipi;
  // poti
  const poMap = new Map(items.map(i => [i.tip + '|' + i.kljuc, i]));
  S.poti = [];
  Object.entries(POTI_LISTI).forEach(([list, cfg]) => {
    (S.listi[list]?.vrstice || []).forEach(o => {
      const kl = String(o[cfg.kljuc] ?? '');
      const st = poMap.get(cfg.nadrejeni + '|' + kl);
      const ko = koord(o['Koordinate izhodišča']);
      const p = {
        list, o, st,
        key: o.Povezava || (kl + '|' + (o.Pot || '')),
        ime: o.Pot || 'pot', izhodisce: o['Izhodišče'] || '', izhV: num(o['Višina izhodišča (m)']), izhK: ko,
        hoja: num(o['Čas (min)']) ?? num(o['Čas hoje']) ?? num(o['GPX čas']),
        kolo: num(o['Čas kolesarjenja']),
        dolzina: num(o['Dolžina (km)'] ?? o['GPX dolžina (km)']),
        vzpon: num(o['Višinska razlika (m)'] ?? o['Vzpon (m)'] ?? o['GPX vzpon (m)']),
        zaht: o.Zahtevnost || '', ferata: o.Ferata || '',
        vA: num(o['Vožnja iz Ajdovščine']), vM: num(o['Vožnja iz Mosta na Soči']),
        glavna: o.Glavna === true || o.Glavna === 'TRUE', lastna: o.Lastna === true || o.Lastna === 'TRUE',
        obiskana: o[cfg.obiskano] === true || o[cfg.obiskano] === 'TRUE',
        gpx: o['GPX (Drive)'] || '', url: (o.Povezava || '').startsWith('http') ? o.Povezava : '',
      };
      if (!st) return;
      (st.poti = st.poti || []).push(p);
      S.poti.push(p);
    });
  });
  S.items.forEach(i => { if (i.poti) i.poti.sort((a, b) => (b.glavna - a.glavna) || ((a.hoja ?? a.dolzina ?? 9999) - (b.hoja ?? b.dolzina ?? 9999))); });
}
/** Pot kot element za seznam/filtre (podatki poti + lastnosti cilja). */
function potKotItem(p) {
  const s = p.st;
  return Object.assign(Object.create(s), {
    jePot: true, pot: p, ime: s.ime + ' – ' + p.ime,
    lat: p.izhK ? p.izhK[0] : s.lat, lon: p.izhK ? p.izhK[1] : s.lon,
    hoja: p.hoja, kolo: p.kolo, dolzina: p.dolzina, vzpon: p.vzpon, zaht: p.zaht || s.zaht,
    vA: p.vA ?? s.vA, vM: p.vM ?? s.vM,
  });
}
const voznja = it => S.izvor === 'A' ? it.vA : it.vM;
function barva(it) {
  if (it.D && it.S) return 'var(--oba)';
  if (it.D) return 'var(--danjel)';
  if (it.S) return 'var(--svetlana)';
  if (it.seznam) return 'var(--seznam)';
  return 'var(--nic)';
}
const BARVE = { oba: '#2e9e5b', D: '#1a9fb0', S: '#9b59b6', seznam: '#e67e22', nic: '#8a918d' };
function barvaHex(it) { return it.D && it.S ? BARVE.oba : it.D ? BARVE.D : it.S ? BARVE.S : it.seznam ? BARVE.seznam : BARVE.nic; }
function zahtStopnja(z) { z = norm(z); if (!z) return ''; if (z.includes('zelo zahtevna') || z.includes('izjemno')) return 'zelo'; if (z.includes('zahtevna')) return 'zaht'; return 'lahka'; }
function odprtNaSeznamu(it, kdo) {
  if (!it.seznam) return false;
  if (kdo && kdo !== 'Vse' && it.seznam !== kdo) return false;
  if (it.seznam === 'Skupaj') return !(it.D && it.S);
  if (it.seznam === 'Danjel') return !it.D;
  if (it.seznam === 'Svetlana') return !it.S;
  return true;
}

// ---------------- filtriranje ----------------
function filtriraj(f, nabor) {
  const q = norm(f.q);
  let out = nabor.filter(it => {
    if (f.tip && f.tip !== 'Vse' && it.tip !== f.tip) return false;
    if (q && !norm(it.ime + ' ' + it.gorovje + ' ' + it.opomba + (it.jePot ? ' ' + it.pot.izhodisce : '')).includes(q)) return false;
    switch (f.status) {
      case 'ne-oba': if (it.D && it.S) return false; break;
      case 'nobeden': if (it.D || it.S) return false; break;
      case 'ne-D': if (it.D) return false; break;
      case 'ne-S': if (it.S) return false; break;
      case 'bil-D': if (!it.D) return false; break;
      case 'bil-S': if (!it.S) return false; break;
      case 'bil-oba': if (!(it.D && it.S)) return false; break;
    }
    if (f.seznam === 'any' && !it.seznam) return false;
    if (f.seznam && f.seznam !== 'any' && it.seznam !== f.seznam) return false;
    const v = voznja(it);
    if (f.voznja && (v === null || v > +f.voznja)) return false;
    if (it.gora || f.tip === LIST_GORE) {
      if (f.kat && it.kat !== f.kat) return false;
      if (f.gorovje && it.gorovje !== f.gorovje) return false;
      if (f.vmin && (it.visina === null || it.visina < +f.vmin)) return false;
      if (f.vmax && (it.visina === null || it.visina > +f.vmax)) return false;
      if (f.zaht && zahtStopnja(it.zaht) !== f.zaht) return false;
      if (f.spp === 'SPP' && it.spp !== 'SPP') return false;
      if (f.spp === 'RSPP' && it.spp !== 'RSPP') return false;
      if (f.spp === 'oba' && !it.spp) return false;
    }
    if (f.vrsta && it.vrsta !== f.vrsta) return false;
    if (f.podvrsta && it.podvrsta !== f.podvrsta) return false;
    if (f.hoja && (it.hoja === null || it.hoja > +f.hoja)) return false;
    if (f.vzpon && (it.vzpon === null || it.vzpon > +f.vzpon)) return false;
    if (f.dolzina && (it.dolzina === null || it.dolzina > +f.dolzina)) return false;
    if (f.kolo && (it.kolo === null || it.kolo > +f.kolo)) return false;
    return true;
  });
  const k = f.razvrsti;
  const nul = (a, b, fn, dir = 1) => { const x = fn(a), y = fn(b); if (x === null && y === null) return 0; if (x === null) return 1; if (y === null) return -1; return (x - y) * dir; };
  const fn = {
    voznja: (a, b) => nul(a, b, voznja),
    ime: (a, b) => a.ime.localeCompare(b.ime, 'sl'),
    visina: (a, b) => nul(a, b, x => x.visina, -1),
    hoja: (a, b) => nul(a, b, x => x.hoja),
    vzpon: (a, b) => nul(a, b, x => x.vzpon),
    dolzina: (a, b) => nul(a, b, x => x.dolzina),
    prilj: (a, b) => nul(a, b, x => num(x.o['Priljubljenost (%)']), -1),
    prio: (a, b) => nul(a, b, x => x.prio),
  }[k] || ((a, b) => 0);
  return out.sort(fn);
}

function filtriHtml(f, id) {
  const tipi = S.tipi || [];
  const gorovja = [...new Set(S.items.filter(i => i.gora && i.gorovje).map(i => i.gorovje))].sort((a, b) => a.localeCompare(b, 'sl'));
  const opt = (arr, val) => arr.map(([v, t]) => `<option value="${esc(v)}"${String(val) === String(v) ? ' selected' : ''}>${esc(t)}</option>`).join('');
  const ure = [['', 'brez omejitve'], ...[30, 60, 90, 120, 150, 180, 240, 300, 360, 480].map(m => [m, 'do ' + ura(m) + ' h'])];
  const gora = f.tip === LIST_GORE, kolo = f.tip === 'Kolesarjenje', pohod = f.tip === 'Pohodi';
  let h = `<div class="zavihki" data-f="${id}">${tipi.map(t => `<button class="zav${f.tip === t ? ' akt' : ''}" data-tip="${esc(t)}">${IKONE[t] || '•'} ${esc(t)}</button>`).join('')}</div>
  <details class="filtri"${S['odprti_' + id] ? ' open' : ''} data-f="${id}"><summary>Filtri</summary><div class="fmreza">
   <label class="cela">Iskanje<input data-k="q" value="${esc(f.q)}" placeholder="ime, gorovje, opomba"></label>
   <label>Obiskano<select data-k="status">${opt([['', 'vse'], ['ne-oba', 'še nisva bila oba'], ['nobeden', 'ni bil nihče'], ['ne-D', 'Danjel še ni bil'], ['ne-S', 'Svetlana še ni bila'], ['bil-D', 'Danjel je že bil'], ['bil-S', 'Svetlana je že bila'], ['bil-oba', 'sva bila že oba']], f.status)}</select></label>
   <label>Na seznamu<select data-k="seznam">${opt([['', 'vse'], ['any', 'na kateremkoli'], ['Skupaj', 'Skupaj'], ['Danjel', 'Danjel'], ['Svetlana', 'Svetlana']], f.seznam)}</select></label>
   <label>Vožnja (${IZVORI[S.izvor]})<select data-k="voznja">${opt(ure, f.voznja)}</select></label>`;
  if (gora) h += `
   <label>Kategorija<select data-k="kat">${opt([['', 'vse'], ['Gora', 'Gora (≥ 2000 m)'], ['Hrib', 'Hrib (< 2000 m)']], f.kat)}</select></label>
   <label class="cela">Gorovje<select data-k="gorovje">${opt([['', 'vsa'], ...gorovja.map(g => [g, g])], f.gorovje)}</select></label>
   <label>Višina od (m)<input data-k="vmin" type="number" inputmode="numeric" value="${esc(f.vmin)}"></label>
   <label>Višina do (m)<input data-k="vmax" type="number" inputmode="numeric" value="${esc(f.vmax)}"></label>
   <label>Zahtevnost<select data-k="zaht">${opt([['', 'vse'], ['lahka', 'lahka'], ['zaht', 'zahtevna'], ['zelo', 'zelo zahtevna']], f.zaht)}</select></label>
   <label>SPP / RSPP<select data-k="spp">${opt([['', 'vse'], ['oba', 'SPP ali RSPP'], ['SPP', 'samo SPP'], ['RSPP', 'samo RSPP']], f.spp)}</select></label>`;
  const vrste = [...new Set(S.items.filter(i => i.tip === f.tip && i.vrsta).map(i => i.vrsta))].sort((a, b) => a.localeCompare(b, 'sl'));
  if (!gora && vrste.length) {
    const pv = [...new Set(S.items.filter(i => i.tip === f.tip && i.podvrsta && (!f.vrsta || i.vrsta === f.vrsta)).map(i => i.podvrsta))].sort((a, b) => a.localeCompare(b, 'sl'));
    h += `<label>Vrsta<select data-k="vrsta">${opt([['', 'vse'], ...vrste.map(x => [x, x])], f.vrsta)}</select></label>
   <label>Podvrsta<select data-k="podvrsta">${opt([['', 'vse'], ...pv.map(x => [x, x])], f.podvrsta)}</select></label>`;
  }
  if (gora || pohod) h += `<label>Čas hoje<select data-k="hoja">${opt(ure, f.hoja)}</select></label>`;
  if (kolo) h += `<label>Čas kolesarjenja<select data-k="kolo">${opt(ure, f.kolo)}</select></label>`;
  if (gora || pohod || kolo) h += `
   <label>Višinski metri<select data-k="vzpon">${opt([['', 'brez omejitve'], ...[200, 400, 600, 800, 1000, 1200, 1500, 2000].map(m => [m, 'do ' + m + ' m'])], f.vzpon)}</select></label>
   <label>Dolžina<select data-k="dolzina">${opt([['', 'brez omejitve'], ...[5, 10, 15, 20, 30, 40, 50, 75, 100, 150].map(m => [m, 'do ' + m + ' km'])], f.dolzina)}</select></label>`;
  h += `<label class="cela">Razvrsti<select data-k="razvrsti">${opt([['voznja', 'po času vožnje'], ['ime', 'po imenu'], ...(gora ? [['visina', 'po višini'], ['prilj', 'po priljubljenosti']] : []), ['hoja', 'po času hoje'], ['vzpon', 'po višinskih metrih'], ['dolzina', 'po dolžini'], ['prio', 'po prioriteti']], f.razvrsti)}</select></label>
   <button class="gumb svetel mali cela" data-ponastavi="${id}">Ponastavi filtre</button>
  </div></details>`;
  return h;
}
function poveziFiltre(root, f, id, ob) {
  root.querySelectorAll(`.zavihki[data-f="${id}"] .zav`).forEach(b => b.onclick = () => {
    const nov = privzetiFiltri(b.dataset.tip);
    ['status', 'seznam', 'voznja'].forEach(k => nov[k] = f[k]);
    Object.keys(f).forEach(k => delete f[k]); Object.assign(f, nov); ob();
  });
  const det = root.querySelector(`details.filtri[data-f="${id}"]`);
  if (det) det.ontoggle = () => S['odprti_' + id] = det.open;
  root.querySelectorAll(`details.filtri[data-f="${id}"] [data-k]`).forEach(el => {
    const ev = el.tagName === 'INPUT' ? 'input' : 'change';
    el.addEventListener(ev, () => { f[el.dataset.k] = el.value; if (el.dataset.k === 'vrsta') f.podvrsta = ''; clearTimeout(poveziFiltre.t); poveziFiltre.t = setTimeout(() => ob(el.dataset.k === 'vrsta' ? undefined : true), el.tagName === 'INPUT' ? 350 : 0); });
  });
  const p = root.querySelector(`[data-ponastavi="${id}"]`);
  if (p) p.onclick = () => { const t = f.tip; Object.keys(f).forEach(k => delete f[k]); Object.assign(f, privzetiFiltri(t)); ob(); };
}

// ---------------- kartice in seznami ----------------
function kartica(it) {
  const v = voznja(it);
  const zn = [];
  if (v !== null) zn.push(`<span class="zn">🚗 ${ura(v)}</span>`);
  if (it.hoja) zn.push(`<span class="zn">🥾 ${ura(it.hoja)}</span>`);
  if (it.kolo) zn.push(`<span class="zn">🚴 ${ura(it.kolo)}</span>`);
  if (it.dolzina) zn.push(`<span class="zn">↔ ${String(it.dolzina).replace('.', ',')} km</span>`);
  if (it.vzpon) zn.push(`<span class="zn">↗ ${it.vzpon} m</span>`);
  if (it.zaht) zn.push(`<span class="zn">${esc(it.zaht.replace(' označena pot', '').replace(' pot', ''))}</span>`);
  if (it.spp) zn.push(`<span class="zn ${it.spp.toLowerCase()}">${esc(it.spp)}</span>`);
  if (it.prio) zn.push(`<span class="zn prio">P${it.prio}</span>`);
  const pod = it.gora ? [it.visina ? it.visina + ' m' : '', it.gorovje].filter(Boolean).join(' · ') : ([it.podvrsta, it.opomba].filter(Boolean).join(' · ') || it.o['Kraj za izračun vožnje'] || '');
  const ob = it.D && it.S ? 'oba' : it.D ? 'Danjel' : it.S ? 'Svetlana' : '';
  if (it.jePot) {
    const p = it.pot;
    const pod2 = [p.izhodisce ? 'iz ' + p.izhodisce + (p.izhV ? ' (' + p.izhV + ' m)' : '') : '', it.visina ? 'vrh ' + it.visina + ' m' : ''].filter(Boolean).join(' · ');
    return `<div class="kartica" data-kljuc="${esc(it.kljuc)}" data-tip="${esc(it.tip)}" data-pot="${esc(p.key)}">
    <span class="pika" style="background:${barva(it)}"></span>
    <div class="tel"><div class="ime">${esc(it.ime)}${p.glavna ? ' ⭐' : ''}${p.gpx ? ' 📍' : ''}</div>
    <div class="pod">${esc(pod2)}</div><div class="znacke">${zn.join('')}</div></div>
    ${p.obiskana ? '<span class="obisk">✓ prehojena</span>' : ''}</div>`;
  }
  return `<div class="kartica" data-kljuc="${esc(it.kljuc)}" data-tip="${esc(it.tip)}">
    <span class="pika" style="background:${barva(it)}"></span>
    <div class="tel"><div class="ime">${S.zaslon.at(-1) === 'seznam' && S.seznam.tipi.length !== 1 ? (IKONE[it.tip] || '') + ' ' : ''}${esc(it.ime)}</div>
    <div class="pod">${esc(pod)}</div><div class="znacke">${zn.join('')}</div></div>
    ${ob ? `<span class="obisk">✓ ${ob}</span>` : ''}</div>`;
}
function izrisiSeznam(el, arr) {
  let n = 0;
  const korak = 60;
  const dodaj = () => {
    const del = arr.slice(n, n + korak).map(kartica).join('');
    n += korak;
    el.querySelector('.vec')?.remove();
    el.insertAdjacentHTML('beforeend', del);
    if (n < arr.length) {
      el.insertAdjacentHTML('beforeend', `<button class="gumb svetel vec">Pokaži več (${arr.length - n})</button>`);
      const b = el.querySelector('.vec');
      b.onclick = dodaj;
      if ('IntersectionObserver' in window) { const io = new IntersectionObserver(e => { if (e[0].isIntersecting) { io.disconnect(); dodaj(); } }); io.observe(b); }
    }
  };
  el.innerHTML = arr.length ? '' : '<div class="prazno">Ni zadetkov.</div>';
  if (arr.length) dodaj();
  el.onclick = e => { const k = e.target.closest('.kartica'); if (k) odpriPodrobnosti(k.dataset.tip, k.dataset.kljuc, k.dataset.pot); };
}
const najdi = (tip, kljuc) => S.items.find(i => i.tip === tip && String(i.kljuc) === String(kljuc));

// ---------------- zemljevid ----------------
let karta = null;
const KAT_BARVE = { 'Gora': '#c0392b', 'Hrib': '#e67e22', 'Kolesarjenje': '#2471a3', 'Pohodi': '#229954', 'Izleti': '#8e44ad',
  'Deževni dnevi': '#17a2b8', 'Ostalo': '#d4ac0d', 'Ferate': '#6d4c41', 'Potovanja': '#e84393' };
const katIme = it => it.gora ? (it.kat || 'Hrib') : it.tip;
const katBarva = it => KAT_BARVE[katIme(it)] || '#555';
const obiskanZa = (it, kdo) => kdo === 'Skupaj' ? (it.D && it.S) : kdo === 'Danjel' ? it.D : kdo === 'Svetlana' ? it.S : (it.D || it.S);
function legendaKat(arr) {
  const k = [...new Set(arr.map(katIme))].sort((a, b) => Object.keys(KAT_BARVE).indexOf(a) - Object.keys(KAT_BARVE).indexOf(b));
  return `<div class="legenda">${k.map(x => `<span><i style="background:${KAT_BARVE[x] || '#555'}"></i>${x === 'Gora' ? 'Gore' : x === 'Hrib' ? 'Hribi' : x}</span>`).join('')}<span><i style="background:#fff;border:2px solid #777;width:9px;height:9px"></i>obiskano</span></div>`;
}
function zemljevid(el, arr, poKat, kdo) {
  if (karta) { karta.remove(); karta = null; }
  karta = L.map(el, { preferCanvas: true, zoomControl: true }).setView([46.1, 14.5], 8);
  podlaga(karta);
  const tocke = [];
  arr.forEach(it => {
    if (it.lat === null) return;
    const ob = poKat && obiskanZa(it, kdo) && !odprtNaSeznamu(it, kdo);
    const m = L.circleMarker([it.lat, it.lon], poKat
      ? { radius: 7, color: ob ? katBarva(it) : '#fff', weight: ob ? 2.5 : 1.2, fillColor: ob ? '#fff' : katBarva(it), fillOpacity: .95 }
      : { radius: 6, color: '#fff', weight: 1.2, fillColor: barvaHex(it), fillOpacity: .95 }).addTo(karta);
    const v = voznja(it);
    m.bindPopup(`<b>${esc(it.ime)}</b><br>${it.visina ? it.visina + ' m · ' : ''}${v !== null ? '🚗 ' + ura(v) : ''}${it.hoja ? ' · 🥾 ' + ura(it.hoja) : ''}<br><a href="#" data-odpri>Odpri podrobnosti ›</a>`);
    m.on('popupopen', e => e.popup.getElement().querySelector('[data-odpri]').onclick = ev => { ev.preventDefault(); odpriPodrobnosti(it.tip, it.kljuc, it.jePot ? it.pot.key : undefined); });
    tocke.push([it.lat, it.lon]);
  });
  if (tocke.length) karta.fitBounds(tocke, { padding: [20, 20], maxZoom: 12 });
  setTimeout(() => karta && karta.invalidateSize(), 50);
}
function podlaga(k) {
  const topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 16, attribution: '© OpenStreetMap, © OpenTopoMap' });
  const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' });
  topo.addTo(k);
  L.control.layers({ 'Topografska': topo, 'Cestna': osm }, null, { position: 'topright' }).addTo(k);
}
const legenda = `<div class="legenda"><span><i style="background:${BARVE.oba}"></i>oba</span><span><i style="background:${BARVE.D}"></i>Danjel</span><span><i style="background:${BARVE.S}"></i>Svetlana</span><span><i style="background:${BARVE.seznam}"></i>na seznamu</span><span><i style="background:${BARVE.nic}"></i>ostalo</span></div>`;
const preklopPogled = p => `<div class="preklop" data-pogled><button data-p="seznam" class="${p === 'seznam' ? 'akt' : ''}">☰ Seznam</button><button data-p="karta" class="${p === 'karta' ? 'akt' : ''}">🗺 Zemljevid</button></div>`;

// ---------------- zasloni ----------------
function pojdi(z) { S.zaslon.push(z); izrisi(); window.scrollTo(0, 0); history.pushState({ z: S.zaslon.length }, ''); }
function nazaj() { if (S.zaslon.length > 1) { S.zaslon.pop(); izrisi(); } }
window.addEventListener('popstate', () => { if (S.zaslon.length > 1) { S.zaslon.pop(); izrisi(); } });

function izrisi() {
  const z = S.zaslon.at(-1) || 'domov';
  $('#nazaj').hidden = z === 'domov';
  $('#izvor').textContent = '🚗 ' + IZVORI[S.izvor];
  if (karta && !String(z).startsWith('podrobno')) { karta.remove(); karta = null; }
  const m = $('#vsebina');
  if (!S.url && z !== 'nastavitve') { S.zaslon = ['domov', 'nastavitve']; return izrisi(); }
  if (z === 'domov') return zDomov(m);
  if (z === 'seznam') return zSeznam(m);
  if (z === 'razisk') return zRaziskuj(m);
  if (z === 'vikend') return zVikend(m);
  if (z === 'stat') return zStatistika(m);
  if (z === 'nastavitve') return zNastavitve(m);
  if (z.startsWith('podrobno')) {
    const [, tip, ...k] = z.split(':');
    S.podrobno = najdi(tip, k.join(':')) || S.podrobno;
    return zPodrobno(m, S.podrobno);
  }
}

function zDomov(m) {
  $('#naslov').textContent = 'Izleti';
  const odprti = S.items.filter(i => odprtNaSeznamu(i, 'Vse')).length;
  m.innerHTML = `<div class="domov">
    <button class="velik" data-z="seznam"><span class="em">📋</span><div><b>Najin seznam</b><span>${odprti} odprtih ciljev</span></div></button>
    <button class="velik" data-z="razisk"><span class="em">🧭</span><div><b>Raziskuj</b><span>${S.items.length} destinacij s filtri in zemljevidom</span></div></button>
    <button class="velik" data-z="vikend"><span class="em">🎲</span><div><b>Kam ta vikend?</b><span>naključni predlog po tvojih filtrih</span></div></button>
    <div class="domov-spodaj">
      <button class="velik" data-z="stat"><span class="em">📊</span><div><b>Statistika</b></div></button>
      <button class="velik" data-z="nastavitve"><span class="em">⚙️</span><div><b>Nastavitve</b></div></button>
    </div>
    <div class="stanje">${S.ver ? 'Podatki: ' + new Date(S.ver).toLocaleString('sl-SI') : 'Podatki še niso naloženi.'}</div></div>`;
  m.querySelectorAll('[data-z]').forEach(b => b.onclick = () => pojdi(b.dataset.z));
}

function zSeznam(m) {
  $('#naslov').textContent = 'Najin seznam';
  const st = S.seznam;
  const cilj = i => odprtNaSeznamu(i, st.kdo), bil = i => obiskanZa(i, st.kdo);
  const osnova = S.items.filter(i => st.prikaz === 'cilji' ? cilj(i) : st.prikaz === 'obiskano' ? bil(i) : (cilj(i) || bil(i)));
  const tipi = (S.tipi || []).filter(t => osnova.some(i => i.tip === t));
  const izbrani = st.tipi.filter(t => tipi.includes(t));
  let arr = izbrani.length ? osnova.filter(i => izbrani.includes(i.tip)) : osnova;
  const datum = i => (st.kdo === 'Svetlana' ? i.o['Datum Svetlana'] : i.o['Datum Danjel'] || i.o['Datum Svetlana']) || i.o.Datum || '';
  if (st.prikaz === 'obiskano') arr.sort((a, b) => datum(b).localeCompare(datum(a)) || a.ime.localeCompare(b.ime, 'sl'));
  else arr.sort((a, b) => (bil(a) - bil(b)) || ((a.prio ?? 9) - (b.prio ?? 9)) || ((voznja(a) ?? 9999) - (voznja(b) ?? 9999)));
  const opis = st.prikaz === 'obiskano' ? 'obiskanih · najnovejši najprej' : st.prikaz === 'vse' ? 'destinacij · najprej cilji' : 'ciljev · po prioriteti in vožnji';
  m.innerHTML = `<div class="zavihki ovij"><button class="zav${izbrani.length ? '' : ' akt'}" data-tip="">Vse</button>${tipi.map(t => `<button class="zav${izbrani.includes(t) ? ' akt' : ''}" data-tip="${esc(t)}">${izbrani.includes(t) ? '✓ ' : ''}${IKONE[t] || ''} ${esc(t)}</button>`).join('')}</div>
    <div class="orodja"><div class="preklop" data-kdo>${['Skupaj', 'Danjel', 'Svetlana', 'Vse'].map(k => `<button data-k="${k}" class="${st.kdo === k ? 'akt' : ''}">${k}</button>`).join('')}</div>${preklopPogled(st.pogled)}</div>
    <div class="orodja"><div class="preklop" data-prikaz>${[['cilji', 'Cilji'], ['obiskano', 'Obiskano'], ['vse', 'Oboje']].map(([k, t]) => `<button data-k="${k}" class="${st.prikaz === k ? 'akt' : ''}">${t}</button>`).join('')}</div><span class="stevec">${arr.length} ${opis}</span></div>
    <div id="rez"></div>`;
  m.querySelectorAll('.zavihki .zav').forEach(b => b.onclick = () => {
    const t = b.dataset.tip;
    if (!t) st.tipi = [];
    else if (izbrani.includes(t)) st.tipi = izbrani.filter(x => x !== t);
    else st.tipi = [...izbrani, t];
    if (st.tipi.length === tipi.length) st.tipi = [];   // vse izbrane = Vse
    localStorage.setItem('izleti_seznam_tipi', JSON.stringify(st.tipi));
    izrisi();
  });
  m.querySelectorAll('[data-kdo] button').forEach(b => b.onclick = () => { st.kdo = b.dataset.k; izrisi(); });
  m.querySelectorAll('[data-pogled] button').forEach(b => b.onclick = () => { st.pogled = b.dataset.p; izrisi(); });
  m.querySelectorAll('[data-prikaz] button').forEach(b => b.onclick = () => { st.prikaz = b.dataset.k; izrisi(); });
  const rez = $('#rez');
  if (st.pogled === 'karta') {
    const poKat = st.barve === 'kat';
    rez.innerHTML = `<div class="orodja"><span class="stevec">Barve pik:</span><div class="preklop" data-barve><button data-k="kat" class="${poKat ? 'akt' : ''}">Kategorija</button><button data-k="obisk" class="${poKat ? '' : 'akt'}">Obiskano</button></div></div>`
      + '<div class="zemljevid" id="karta"></div>' + (poKat ? legendaKat(arr) : legenda);
    rez.querySelectorAll('[data-barve] button').forEach(b => b.onclick = () => { st.barve = b.dataset.k; localStorage.setItem('izleti_barve', st.barve); izrisi(); });
    zemljevid($('#karta'), arr, poKat, st.kdo);
  }
  else { rez.className = 'seznam'; izrisiSeznam(rez, arr); }
}

function zRaziskuj(m, samoRez) {
  $('#naslov').textContent = 'Raziskuj';
  const st = S.razisk;
  const imaPoti = S.poti.some(p => p.st.tip === st.f.tip);
  const poPoteh = imaPoti && st.nacin === 'poti';
  const nabor = poPoteh ? S.poti.filter(p => p.st.tip === st.f.tip).map(potKotItem) : S.items;
  const arr = filtriraj(st.f, nabor);
  const enota = poPoteh ? ' poti' : ' zadetkov';
  if (samoRez && $('#rez')) { $('#stevec').textContent = arr.length + enota; return prikaziRez(arr, st.pogled); }
  const preklopPoti = imaPoti ? `<div class="preklop" data-nacin><button data-n="cilji" class="${poPoteh ? '' : 'akt'}">${st.f.tip === 'Kolesarjenje' ? 'Cilji' : 'Vrhovi'}</button><button data-n="poti" class="${poPoteh ? 'akt' : ''}">Poti</button></div>` : '';
  m.innerHTML = filtriHtml(st.f, 'r') + `<div class="orodja">${preklopPoti}<span class="stevec" id="stevec">${arr.length}${enota}</span>${preklopPogled(st.pogled)}</div><div id="rez"></div>`;
  m.querySelectorAll('[data-nacin] button').forEach(b => b.onclick = () => { st.nacin = b.dataset.n; zRaziskuj(m); });
  poveziFiltre(m, st.f, 'r', (le) => zRaziskuj(m, le));
  m.querySelectorAll('[data-pogled] button').forEach(b => b.onclick = () => { st.pogled = b.dataset.p; zRaziskuj(m); });
  prikaziRez(arr, st.pogled);
}
function prikaziRez(arr, pogled) {
  const rez = $('#rez');
  if (pogled === 'karta') {
    if (!$('#karta')) rez.innerHTML = '<div class="zemljevid" id="karta"></div>' + legenda;
    rez.className = '';
    zemljevid($('#karta'), arr);
  } else { rez.className = 'seznam'; izrisiSeznam(rez, arr); }
}

function zVikend(m, samoRez) {
  $('#naslov').textContent = 'Kam ta vikend?';
  const st = S.vikend;
  const nabor = st.vir === 'seznam' ? S.items.filter(i => odprtNaSeznamu(i, 'Vse')) : S.items;
  const arr = filtriraj(st.f, nabor);
  if (samoRez && $('#vstevec')) { $('#vstevec').textContent = arr.length + ' možnih ciljev'; return; }
  m.innerHTML = `<div class="orodja"><div class="preklop" data-vir><button data-v="seznam" class="${st.vir === 'seznam' ? 'akt' : ''}">📋 Najin seznam</button><button data-v="katalog" class="${st.vir === 'katalog' ? 'akt' : ''}">🧭 Vse destinacije</button></div></div>`
    + filtriHtml(st.f, 'v') + `<div class="orodja"><span class="stevec" id="vstevec">${arr.length} možnih ciljev</span></div>
    <button class="gumb" id="predlagaj" style="width:100%;padding:14px">🎲 Predlagaj</button><div class="predlog" id="predlog"></div>`;
  m.querySelectorAll('[data-vir] button').forEach(b => b.onclick = () => { st.vir = b.dataset.v; st.zadnji = []; zVikend(m); });
  poveziFiltre(m, st.f, 'v', le => zVikend(m, le));
  $('#predlagaj').onclick = () => {
    const kand = filtriraj(st.f, st.vir === 'seznam' ? S.items.filter(i => odprtNaSeznamu(i, 'Vse')) : S.items);
    if (!kand.length) { $('#predlog').innerHTML = '<div class="prazno">Ni ciljev, ki ustrezajo filtrom.</div>'; return; }
    let izbor = kand.filter(i => !st.zadnji.includes(i.tip + i.kljuc));
    if (!izbor.length) { st.zadnji = []; izbor = kand; }
    const it = izbor[Math.floor(Math.random() * izbor.length)];
    st.zadnji.push(it.tip + it.kljuc);
    $('#predlog').innerHTML = kartica(it) + `<div class="akcije"><button class="gumb svetel" id="drug">🎲 Drug predlog</button><button class="gumb" id="odpri">Odpri podrobnosti</button></div>`;
    $('#predlog .kartica').onclick = () => odpriPodrobnosti(it.tip, it.kljuc);
    $('#odpri').onclick = () => odpriPodrobnosti(it.tip, it.kljuc);
    $('#drug').onclick = () => $('#predlagaj').click();
    $('#predlagaj').textContent = '🎲 Drug predlog';
  };
}

// ---------------- podrobnosti ----------------
function odpriPodrobnosti(tip, kljuc, potKey) {
  const it = najdi(tip, kljuc);
  if (!it) return;
  S.podrobno = it;
  S.izbranaPot = potKey || null;
  S.vsePoti = false;
  pojdi('podrobno:' + tip + ':' + kljuc);
}

function zPodrobno(m, it) {
  const o = it.o;
  $('#naslov').textContent = it.ime;
  const v = (n, f) => (o[n] !== undefined && o[n] !== '') ? (f ? f(o[n]) : esc(o[n])) : '';
  const vrstice = [];
  const dodaj = (t, val) => { if (val !== '' && val !== null && val !== undefined) vrstice.push(`<dt>${t}</dt><dd>${val}</dd>`); };
  if (it.gora) {
    dodaj('Višina', it.visina ? it.visina + ' m' : '');
    dodaj('Kategorija', esc(it.kat));
    dodaj('Gorovje', v('Gorovje'));
    dodaj('Država', v('Država'));
    dodaj('Vrsta', v('Vrsta'));
    dodaj('SPP / RSPP', v('SPP / RSPP'));
    dodaj('Izhodišče (glavna pot)', [v('Izhodišče (najkrajša pot)'), o['Višina izhodišča (m)'] ? '(' + o['Višina izhodišča (m)'] + ' m)' : ''].filter(Boolean).join(' '));
    dodaj('Čas hoje', it.hoja ? ura(it.hoja) + ' h' : '');
    dodaj('Dolžina poti', o['Dolžina poti (km)'] ? String(o['Dolžina poti (km)']).replace('.', ',') + ' km' : '');
    dodaj('Višinska razlika', o['Višinska razlika (m)'] ? o['Višinska razlika (m)'] + ' m' : '');
    dodaj('Zahtevnost', v('Zahtevnost'));
    dodaj('Ferata', v('Ferata'));
    dodaj('Oprema poletje', v('Oprema poletje'));
    dodaj('Oprema zima', v('Oprema zima'));
    dodaj('GPX', o['GPX dolžina (km)'] ? `${String(o['GPX dolžina (km)']).replace('.', ',')} km · ${ura(num(o['GPX čas']))} h · ↗ ${o['GPX vzpon (m)'] || '–'} m` : '');
    dodaj('Priljubljenost', o['Priljubljenost (%)'] ? o['Priljubljenost (%)'] + ' %' : '');
  } else {
    dodaj('Vrsta', [v('Vrsta'), v('Podvrsta')].filter(Boolean).join(' – '));
    dodaj('Kraj', v('Kraj za izračun vožnje'));
    dodaj('Dolžina', it.dolzina ? String(it.dolzina).replace('.', ',') + ' km' : '');
    dodaj('Čas kolesarjenja', it.kolo ? ura(it.kolo) + ' h' : '');
    dodaj('Čas hoje', it.hoja ? ura(it.hoja) + ' h' : '');
    dodaj('Vzpon', it.vzpon ? it.vzpon + ' m' : '');
  }
  dodaj('Vožnja iz Ajdovščine', it.vA !== null ? `${ura(it.vA)} h · ${o['km iz Ajdovščine'] ?? '–'} km` : '');
  dodaj('Vožnja iz Mosta na Soči', it.vM !== null ? `${ura(it.vM)} h · ${o['km iz Mosta na Soči'] ?? '–'} km` : '');
  const obD = it.D ? '✓ ' + (datumSl(o['Datum Danjel'] || o.Datum) || 'da') : 'še ne';
  const obS = it.S ? '✓ ' + (datumSl(o['Datum Svetlana'] || o.Datum) || 'da') : 'še ne';
  dodaj('Danjel', obD);
  dodaj('Svetlana', obS);

  const izbr = (it.poti || []).find(p => p.key === S.izbranaPot);
  const nav = (izbr && izbr.izhK) || it.izh || (it.lat !== null ? [it.lat, it.lon] : null);
  const povez = [];
  const navIme = izbr ? izbr.izhodisce : (it.gora && o['Izhodišče (najkrajša pot)'] ? o['Izhodišče (najkrajša pot)'] : it.ime);
  if (nav) povez.push(`<a class="gumb" id="navGumb" href="geo:${nav[0]},${nav[1]}?q=${nav[0]},${nav[1]}(${encodeURIComponent(navIme || it.ime)})">🧭 Navigacija${(izbr && izbr.izhK) || it.izh ? ' do izhodišča' : ''}</a>`);
  if (o['hribi.net']) povez.push(`<a class="gumb svetel" target="_blank" rel="noopener" href="${esc(o['hribi.net'])}">hribi.net</a>`);
  if (o['Najkrajša pot']) povez.push(`<a class="gumb svetel" target="_blank" rel="noopener" href="${esc(o['Najkrajša pot'])}">Opis poti</a>`);
  if (o['GPX (Drive)']) povez.push(`<a class="gumb svetel" target="_blank" rel="noopener" href="${esc(o['GPX (Drive)'])}">GPX</a>`);
  if (o.Povezava) povez.push(`<a class="gumb svetel" target="_blank" rel="noopener" href="${esc(o.Povezava)}">Povezava</a>`);

  const opt = (arr, val) => arr.map(([a, b]) => `<option value="${a}"${String(val ?? '') === String(a) ? ' selected' : ''}>${b}</option>`).join('');
  m.innerHTML = `<div class="podrobno">
    <h2>${IKONE[it.tip] || ''} ${esc(it.ime)}</h2>
    <div class="pod">${esc(it.gora ? [it.visina ? it.visina + ' m' : '', it.gorovje].filter(Boolean).join(' · ') : it.tip)}</div>
    <div class="vreme" id="vreme"><div style="grid-column:1/-1">Nalagam vremensko napoved …</div></div>
    ${(it.lat !== null || o['GPX (Drive)'] || (it.poti && it.poti.some(p => p.izhK))) ? '<div class="mini-zemljevid" id="mkarta"></div>' : ''}
    <div class="akcije">${povez.join('')}</div>
    ${it.poti && it.poti.length ? `<div class="sekcija"><h3>Poti (${it.poti.length}) <small style="font-weight:400;color:var(--siva)">– tapni pot za podrobnosti</small></h3><div id="poti"></div></div>` : ''}
    <div class="sekcija"><h3>Podatki</h3><dl class="podatki">${vrstice.join('')}</dl></div>
    <div class="akcije"><button class="gumb" id="obisk">✓ Obiskano …</button></div>
    <div class="sekcija"><h3>Načrtovanje</h3><div class="fmreza">
      <label>Seznam<select id="eSeznam">${opt([['', '– ni na seznamu –'], ['Skupaj', 'Skupaj'], ['Danjel', 'Danjel'], ['Svetlana', 'Svetlana']], it.seznam)}</select></label>
      <label>Prioriteta<select id="ePrio">${opt([['', '–'], ['1', '1 (najvišja)'], ['2', '2'], ['3', '3']], it.prio)}</select></label>
      <label class="cela">Sezona<input id="eSezona" value="${esc(it.sezona)}" placeholder="npr. jeseni, spomladi"></label>
      <label class="cela">Opomba<textarea id="eOpomba">${esc(it.opomba)}</textarea></label>
      <button class="gumb cela" id="shrani">Shrani</button></div></div>
  </div>`;

  $('#shrani').onclick = async () => {
    const polja = { Seznam: $('#eSeznam').value, Prioriteta: $('#ePrio').value, Sezona: $('#eSezona').value.trim(), Opomba: $('#eOpomba').value.trim() };
    $('#shrani').disabled = true; $('#shrani').textContent = 'Shranjujem …';
    try {
      await apiPost({ a: 'uredi', list: it.tip, kljuc: it.kljuc, polja });
      Object.assign(it, { seznam: polja.Seznam, prio: num(polja.Prioriteta), sezona: polja.Sezona, opomba: polja.Opomba });
      Object.assign(it.o, polja);
      shraniLokalno();
      obvesti('Shranjeno ✓');
    } catch (e) { obvesti('Napaka: ' + e.message, 4000); }
    $('#shrani').disabled = false; $('#shrani').textContent = 'Shrani';
  };
  $('#obisk').onclick = () => oknoObisk(it);

  vreme(it);
  if ($('#mkarta')) miniKarta(it);
  if (it.poti && it.poti.length) potiSekcija(it);
}

function oknoObisk(it) {
  const ozadje = document.createElement('div');
  ozadje.className = 'okno-ozadje';
  const izbr = (it.poti || []).find(p => p.key === S.izbranaPot);
  ozadje.innerHTML = `<div class="okno"><h3>Obiskano: ${esc(it.ime)}</h3>
    ${izbr ? `<label class="stevec" style="display:flex;gap:6px;align-items:center;margin-bottom:10px"><input type="checkbox" id="oPot" checked style="width:auto"> po poti: ${esc(izbr.ime)}</label>` : ''}
    <div class="moznosti"><button class="gumb svetel" data-kdo="D">Danjel</button><button class="gumb svetel" data-kdo="S">Svetlana</button><button class="gumb" data-kdo="oba">Oba</button></div>
    <label class="stevec">Datum<input type="date" id="oDatum" value="${danes()}"></label>
    <div class="akcije"><button class="gumb svetel" id="oPreklic" style="flex:1">Prekliči</button></div></div>`;
  document.body.appendChild(ozadje);
  const zapri = () => ozadje.remove();
  ozadje.onclick = e => { if (e.target === ozadje) zapri(); };
  $('#oPreklic', ozadje).onclick = zapri;
  ozadje.querySelectorAll('[data-kdo]').forEach(b => b.onclick = async () => {
    const kdo = b.dataset.kdo, datum = $('#oDatum', ozadje).value || danes();
    ozadje.querySelectorAll('button').forEach(x => x.disabled = true);
    try {
      const sPotjo = izbr && $('#oPot', ozadje) && $('#oPot', ozadje).checked;
      await apiPost(Object.assign({ a: 'obisk', list: it.tip, kljuc: it.kljuc, kdo, datum }, sPotjo ? { potList: izbr.list, pot: izbr.key } : {}));
      if (sPotjo) { izbr.obiskana = true; izbr.o[POTI_LISTI[izbr.list].obiskano] = true; }
      if (kdo !== 'S') { it.D = true; it.o['Danjel ✔'] = true; it.o['Datum Danjel'] = datum; }
      if (kdo !== 'D') { it.S = true; it.o['Svetlana ✔'] = true; it.o['Datum Svetlana'] = datum; }
      if (!it.gora) it.o.Datum = datum;
      shraniLokalno();
      zapri(); obvesti('Zabeleženo ✓'); izrisi();
    } catch (e) { obvesti('Napaka: ' + e.message, 4000); ozadje.querySelectorAll('button').forEach(x => x.disabled = false); }
  });
}

function shraniLokalno() {
  idb.set('podatki', { ver: S.ver, listi: S.listi }).catch(() => {});
  try { localStorage.removeItem('izleti_podatki'); } catch (e) {}
}

const WMO = c => c === 0 ? '☀️' : c <= 1 ? '🌤️' : c === 2 ? '⛅' : c === 3 ? '☁️' : c <= 48 ? '🌫️' : c <= 57 ? '🌦️' : c <= 67 ? '🌧️' : c <= 77 ? '🌨️' : c <= 82 ? '🌦️' : c <= 86 ? '🌨️' : '⛈️';
async function vreme(it) {
  const el = $('#vreme');
  const t = it.lat !== null ? [it.lat, it.lon] : it.izh;
  if (!t) { el.remove(); return; }
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${t[0]}&longitude=${t[1]}${it.visina ? '&elevation=' + it.visina : ''}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Europe%2FLjubljana&forecast_days=7`;
    const j = await (await fetch(u)).json();
    const dn = ['ned', 'pon', 'tor', 'sre', 'čet', 'pet', 'sob'];
    el.innerHTML = j.daily.time.map((d, i) => {
      const dt = new Date(d + 'T12:00');
      const pad = j.daily.precipitation_sum[i];
      return `<div>${i === 0 ? 'danes' : dn[dt.getDay()] + ' ' + dt.getDate() + '.'}<span class="sim">${WMO(j.daily.weather_code[i])}</span><b>${Math.round(j.daily.temperature_2m_max[i])}°</b> / ${Math.round(j.daily.temperature_2m_min[i])}°${pad >= 0.5 ? '<br>💧' + Math.round(pad) + ' mm' : ''}</div>`;
    }).join('') + (it.visina ? `<div style="grid-column:1/-1;font-size:11px">Napoved za ${it.visina} m (Open-Meteo)</div>` : '');
  } catch (e) { el.innerHTML = '<div style="grid-column:1/-1">Vremenske napovedi ni bilo mogoče naložiti.</div>'; }
}

function gpxId(g) { return g && (g.match(/\/d\/([\w-]{20,})/) || g.match(/[?&]id=([\w-]{20,})/) || [])[1]; }
const gpxCache = {};
async function naloziGpx(id) {
  if (gpxCache[id]) return gpxCache[id];
  const { gpx } = await api({ a: 'gpx', id });
  const xml = new DOMParser().parseFromString(gpx, 'application/xml');
  return (gpxCache[id] = [...xml.querySelectorAll('trkpt, rtept')].map(p => [+p.getAttribute('lat'), +p.getAttribute('lon')]));
}
let slojPoti = null;
async function miniKarta(it) {
  if (karta) { karta.remove(); karta = null; }
  karta = L.map('mkarta', { zoomControl: true });
  podlaga(karta);
  slojPoti = L.layerGroup().addTo(karta);
  if (it.lat !== null) L.marker([it.lat, it.lon]).addTo(karta).bindPopup(esc(it.ime));
  karta.setView(it.lat !== null ? [it.lat, it.lon] : (it.izh || [46.1, 14.5]), it.lat !== null || it.izh ? 13 : 8);
  setTimeout(() => karta && karta.invalidateSize(), 60);
  await risiPoti(it);
}
/** Na zemljevid nariše izbrano pot (ali vse poti) – izhodišča in sledi GPX. */
async function risiPoti(it) {
  if (!karta || !slojPoti) return;
  slojPoti.clearLayers();
  const meje = it.lat !== null ? [[it.lat, it.lon]] : [];
  const poti = it.poti || [];
  let izbor;
  if (S.vsePoti) izbor = poti;
  else {
    const p = poti.find(x => x.key === S.izbranaPot) || poti.find(x => x.glavna);
    izbor = p ? [p] : [];
  }
  const glavniGpx = !izbor.length && it.o['GPX (Drive)'] ? [{ gpx: it.o['GPX (Drive)'], izhK: it.izh, izhodisce: it.o['Izhodišče (najkrajša pot)'] || '', ime: 'glavna pot' }] : [];
  if (!izbor.length && !glavniGpx.length && it.izh) izbor = [{ izhK: it.izh, izhodisce: it.o['Izhodišče (najkrajša pot)'] || '', ime: 'glavna pot' }];
  const vse = izbor.length ? izbor : glavniGpx;
  for (let i = 0; i < vse.length; i++) {
    const p = vse[i], barvaP = BARVE_POTI[i % BARVE_POTI.length];
    if (p.izhK) {
      L.circleMarker(p.izhK, { radius: 7, color: '#fff', weight: 2, fillColor: S.vsePoti ? barvaP : BARVE.D, fillOpacity: 1 })
        .addTo(slojPoti).bindPopup('Izhodišče: ' + esc(p.izhodisce) + '<br>' + esc(p.ime));
      meje.push(p.izhK);
    }
    const id = gpxId(p.gpx);
    if (id) {
      try {
        const pts = await naloziGpx(id);
        if (pts.length && karta) { L.polyline(pts, { color: barvaP, weight: 4, opacity: .9 }).addTo(slojPoti); pts.forEach(x => meje.push(x)); }
      } catch (e) { obvesti('GPX ni bilo mogoče naložiti'); }
    }
  }
  if (karta && meje.length > 1) karta.fitBounds(meje, { padding: [25, 25], maxZoom: 14 });
}

function potiSekcija(it) {
  const el = $('#poti');
  const cas = p => p.hoja ? ura(p.hoja) + ' h' : p.kolo ? ura(p.kolo) + ' h' : '';
  const izbr = it.poti.find(p => p.key === S.izbranaPot);
  el.innerHTML = `<div class="akcije" style="margin-top:0"><button class="gumb svetel mali" id="vsePoti">${S.vsePoti ? 'Pokaži samo izbrano' : 'Pokaži vse poti na zemljevidu'}</button></div>` +
    it.poti.map((p, i) => {
      const odprta = izbr && p.key === izbr.key;
      const zn = [cas(p), p.dolzina ? String(p.dolzina).replace('.', ',') + ' km' : '', p.vzpon ? '↗ ' + p.vzpon + ' m' : ''].filter(Boolean).join(' · ');
      let h = `<div class="pot" data-i="${i}" style="cursor:pointer${odprta ? ';background:#eef3f0;margin:0 -12px;padding:8px 12px' : ''}">
        ${S.vsePoti ? `<i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${BARVE_POTI[i % BARVE_POTI.length]};margin-right:5px"></i>` : ''}
        <b>${esc(p.ime)}</b>${p.glavna ? ' ⭐' : ''}${p.gpx ? ' 📍' : ''}${p.lastna ? ' <small>(lastna)</small>' : ''}${p.obiskana ? ' <small>✓</small>' : ''}
        <br><small>${esc(zn)}${p.zaht ? ' · ' + esc(p.zaht) : ''}</small></div>`;
      if (odprta) {
        const v = voznja(p);
        const d = [];
        const dd = (t, x) => { if (x) d.push(`<dt>${t}</dt><dd>${x}</dd>`); };
        dd('Izhodišče', esc(p.izhodisce) + (p.izhV ? ' (' + p.izhV + ' m)' : ''));
        dd(p.kolo ? 'Čas kolesarjenja' : 'Čas hoje', cas(p));
        dd('Dolžina', p.dolzina ? String(p.dolzina).replace('.', ',') + ' km' : '');
        dd(p.kolo ? 'Vzpon' : 'Višinska razlika', p.vzpon ? p.vzpon + ' m' : '');
        dd('Zahtevnost', esc(p.zaht)); dd('Ferata', esc(p.ferata));
        dd('Oprema poletje', esc(p.o['Oprema poletje'] || '')); dd('Oprema zima', esc(p.o['Oprema zima'] || ''));
        if (p.o['GPX dolžina (km)']) dd('GPX', `${String(p.o['GPX dolžina (km)']).replace('.', ',')} km · ${ura(num(p.o['GPX čas']))} h · ↗ ${p.o['GPX vzpon (m)'] || '–'} m`);
        dd('Vožnja (' + IZVORI[S.izvor] + ')', v !== null ? ura(v) + ' h' : '');
        dd('Opomba', esc(p.o.Opomba || ''));
        h += `<div style="padding:4px 0 10px"><dl class="podatki">${d.join('')}</dl><div class="akcije">
          ${p.izhK ? `<a class="gumb mali" href="geo:${p.izhK[0]},${p.izhK[1]}?q=${p.izhK[0]},${p.izhK[1]}(${encodeURIComponent(p.izhodisce || p.ime)})">🧭 Do izhodišča</a>` : ''}
          ${p.url ? `<a class="gumb svetel mali" target="_blank" rel="noopener" href="${esc(p.url)}">Opis poti</a>` : ''}
          ${p.gpx ? `<a class="gumb svetel mali" target="_blank" rel="noopener" href="${esc(p.gpx)}">GPX</a>` : ''}
          ${p.glavna ? '' : `<button class="gumb svetel mali" data-glavna="${i}">⭐ Nastavi kot glavno pot</button>`}</div></div>`;
      }
      return h;
    }).join('');
  el.querySelectorAll('.pot[data-i]').forEach(x => x.onclick = () => {
    const p = it.poti[+x.dataset.i];
    S.izbranaPot = S.izbranaPot === p.key ? null : p.key;
    S.vsePoti = false;
    potiSekcija(it); risiPoti(it); posodobiNav(it);
  });
  $('#vsePoti', el).onclick = () => { S.vsePoti = !S.vsePoti; potiSekcija(it); risiPoti(it); };
  el.querySelectorAll('[data-glavna]').forEach(b => b.onclick = async ev => {
    ev.stopPropagation();
    const p = it.poti[+b.dataset.glavna];
    b.disabled = true; b.textContent = 'Shranjujem …';
    try {
      await apiPost({ a: 'glavna', list: p.list, pot: p.key });
      it.poti.forEach(x => { x.glavna = x === p; x.o.Glavna = x === p; });
      // podatke glavne poti prenesi na cilj (tudi lokalno, do naslednje osvežitve)
      Object.assign(it, { hoja: p.hoja ?? it.hoja, dolzina: p.dolzina ?? it.dolzina, vzpon: p.vzpon ?? it.vzpon, zaht: p.zaht || it.zaht, vA: p.vA ?? it.vA, vM: p.vM ?? it.vM, izh: p.izhK || it.izh });
      if (it.gora) Object.assign(it.o, { 'Izhodišče (najkrajša pot)': p.izhodisce, 'Koordinate izhodišča': p.o['Koordinate izhodišča'] });
      it.poti.sort((a, c) => (c.glavna - a.glavna) || ((a.hoja ?? a.dolzina ?? 9999) - (c.hoja ?? c.dolzina ?? 9999)));
      shraniLokalno();
      obvesti('Glavna pot nastavljena ✓');
      izrisi();
    } catch (e) { obvesti('Napaka: ' + e.message, 4000); b.disabled = false; }
  });
}
function posodobiNav(it) {
  const a = $('#navGumb');
  const p = (it.poti || []).find(x => x.key === S.izbranaPot);
  const t = (p && p.izhK) || it.izh || (it.lat !== null ? [it.lat, it.lon] : null);
  if (!a || !t) return;
  const ime = p ? p.izhodisce : (it.o['Izhodišče (najkrajša pot)'] || it.ime);
  a.href = `geo:${t[0]},${t[1]}?q=${t[0]},${t[1]}(${encodeURIComponent(ime || it.ime)})`;
}

// ---------------- statistika ----------------
function zStatistika(m) {
  $('#naslov').textContent = 'Statistika';
  const gore = S.items.filter(i => i.gora);
  const st = (fn) => ({ D: gore.filter(i => i.D && fn(i)).length, S: gore.filter(i => i.S && fn(i)).length, O: gore.filter(i => i.D && i.S && fn(i)).length, N: gore.filter(fn).length });
  const vsi = st(() => true), g2000 = st(i => i.kat === 'Gora'), spp = st(i => i.spp === 'SPP'), rspp = st(i => i.spp === 'RSPP');
  const najvisji = k => gore.filter(i => i[k]).sort((a, b) => (b.visina || 0) - (a.visina || 0))[0];
  const nD = najvisji('D'), nS = najvisji('S');
  const vrstica = (naziv, x, n, cls) => `<div class="vrstica-stat"><span>${naziv}</span><div class="palica ${cls}"><i style="width:${n ? Math.round(100 * x / n) : 0}%"></i></div><span>${x}/${n}</span></div>`;
  const blok = (naslov, s) => `<div class="sekcija"><h3>${naslov}</h3>${vrstica('Danjel', s.D, s.N, 'd')}${vrstica('Svetlana', s.S, s.N, 's')}${vrstica('Oba', s.O, s.N, '')}</div>`;
  // po letih
  const leta = {};
  S.items.forEach(i => {
    const d1 = i.o['Datum Danjel'] || (i.D ? i.o.Datum : ''), d2 = i.o['Datum Svetlana'] || (i.S ? i.o.Datum : '');
    if (d1) { const y = d1.slice(0, 4); (leta[y] = leta[y] || { D: 0, S: 0 }).D++; }
    if (d2) { const y = d2.slice(0, 4); (leta[y] = leta[y] || { D: 0, S: 0 }).S++; }
  });
  const letaHtml = Object.keys(leta).sort().reverse().map(y => `<div class="vrstica-stat"><span>${y}</span><span>Danjel ${leta[y].D} · Svetlana ${leta[y].S}</span><span></span></div>`).join('') || '<span class="stevec">Datumi obiskov še niso vpisani – vpisujejo se ob označevanju v aplikaciji.</span>';
  // po gorovjih
  const gor = {};
  gore.forEach(i => { const g = i.gorovje || '–'; gor[g] = gor[g] || { N: 0, D: 0, S: 0 }; gor[g].N++; if (i.D) gor[g].D++; if (i.S) gor[g].S++; });
  const gorHtml = Object.entries(gor).sort((a, b) => b[1].N - a[1].N).map(([g, s]) => `<div style="margin:8px 0 2px;font-size:13px;font-weight:600">${esc(g)}</div>${vrstica('Danjel', s.D, s.N, 'd')}${vrstica('Svetlana', s.S, s.N, 's')}`).join('');
  // ostali tipi
  const ostali = (S.tipi || []).filter(t => t !== LIST_GORE).map(t => {
    const a = S.items.filter(i => i.tip === t);
    return `<div class="vrstica-stat"><span>${IKONE[t] || ''} ${esc(t)}</span><span>Danjel ${a.filter(i => i.D).length} · Svetlana ${a.filter(i => i.S).length} · odprtih ${a.filter(i => odprtNaSeznamu(i, 'Vse')).length}</span><span>${a.length}</span></div>`;
  }).join('');
  m.innerHTML = `
    <div class="stat-mreza">
      <div class="stat"><b>${vsi.D}</b><span>vrhov Danjel</span></div>
      <div class="stat"><b>${vsi.S}</b><span>vrhov Svetlana</span></div>
      <div class="stat"><b>${S.items.filter(i => odprtNaSeznamu(i, 'Vse')).length}</b><span>odprtih ciljev</span></div>
    </div>
    <div class="sekcija"><h3>Najvišji vrh</h3><dl class="podatki">
      <dt>Danjel</dt><dd>${nD ? esc(nD.ime) + ' (' + nD.visina + ' m)' : '–'}</dd>
      <dt>Svetlana</dt><dd>${nS ? esc(nS.ime) + ' (' + nS.visina + ' m)' : '–'}</dd></dl></div>
    ${blok('Vsi vrhovi v katalogu', vsi)}${blok('Gore (≥ 2000 m)', g2000)}${blok('Slovenska planinska pot (SPP)', spp)}${blok('Razširjena SPP (RSPP)', rspp)}
    <div class="sekcija"><h3>Po letih</h3>${letaHtml}</div>
    <div class="sekcija"><h3>Ostali izleti</h3>${ostali}</div>
    <details class="filtri"><summary>Po gorovjih</summary>${gorHtml}</details>`;
}

// ---------------- nastavitve ----------------
function zNastavitve(m) {
  $('#naslov').textContent = 'Nastavitve';
  m.innerHTML = `<div class="sekcija"><div class="fmreza">
    <label class="cela">Naslov spletne aplikacije (Apps Script, konča se z /exec)<input id="nUrl" value="${esc(S.url)}" placeholder="https://script.google.com/macros/s/…/exec"></label>
    <label class="cela">Žeton (če si ga nastavil v Script Properties kot ZETON)<input id="nZeton" value="${esc(S.zeton)}"></label>
    <label class="cela">Privzeto izhodišče za čas vožnje<select id="nIzvor"><option value="A"${S.izvor === 'A' ? ' selected' : ''}>Ajdovščina</option><option value="M"${S.izvor === 'M' ? ' selected' : ''}>Most na Soči</option></select></label>
    <button class="gumb cela" id="nShrani">Shrani in naloži podatke</button>
    <button class="gumb svetel cela" id="nOsvezi">Ponovno naloži vse podatke</button>
  </div></div>`;
  $('#nShrani').onclick = async () => {
    S.url = $('#nUrl').value.trim(); S.zeton = $('#nZeton').value.trim(); S.izvor = $('#nIzvor').value;
    localStorage.setItem('izleti_url', S.url); localStorage.setItem('izleti_zeton', S.zeton); localStorage.setItem('izleti_izvor', S.izvor);
    $('#nShrani').textContent = 'Nalagam …';
    await osvezi(true);
    S.zaslon = ['domov']; izrisi();
  };
  $('#nOsvezi').onclick = () => osvezi(true);
}

// ---------------- zagon ----------------
$('#nazaj').onclick = () => history.back();
$('#izvor').onclick = () => { S.izvor = S.izvor === 'A' ? 'M' : 'A'; localStorage.setItem('izleti_izvor', S.izvor); izrisi(); };
S.zaslon = ['domov'];
history.replaceState({ z: 1 }, '');
(async () => {
  if (await naloziPredpomnilnik()) izrisi();
  else { $('#vsebina').innerHTML = '<div class="nalaganje">Nalagam podatke …</div>'; if (!S.url) izrisi(); }
  osvezi(!S.ver);
})();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') osvezi(false); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
