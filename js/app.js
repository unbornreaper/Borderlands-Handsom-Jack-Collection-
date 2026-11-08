/* WBWHO JACKED - user interface */
(function () {
  'use strict';
  const WB = window.WB;
  const { last, humanize } = WB.util;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const RAR = { white: 'Common', green: 'Uncommon', blue: 'Rare', purple: 'Very Rare', etech: 'E-Tech', legendary: 'Legendary', seraph: 'Seraph', pearl: 'Pearlescent', effervescent: 'Effervescent', glitch: 'Glitch' };
  const fmt = (n) => Number(n || 0).toLocaleString('en-US');

  const st = {
    kind: null, // 'save' | 'profile'
    games: {}, game: null, model: null, profile: null,
    fileName: '', original: null, tab: 'quick', history: [], changes: 0,
    inv: { q: '', where: 'all' }, forge: { q: '', kind: '', rarity: '' }, missions: { pt: 0, q: '' }, chal: { q: '' },
    edit: null, picker: null,
  };

  /* ---------------- loading ---------------- */
  function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.appendChild(s); });
  }
  async function getGame(key) {
    if (st.games[key]) return st.games[key];
    if (!(window.WB_DATA && window.WB_DATA[key])) await loadScript('data/' + key + '.js?v=10');
    return (st.games[key] = new WB.Game(window.WB_DATA[key]));
  }
  async function openFile(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    busy('Unpacking ' + file.name + '…');
    try {
      const looksProfile = /profile/i.test(file.name);
      if (looksProfile) { openProfile(bytes, file.name); return; }
      let unwrapped;
      try { unwrapped = await WB.save.unwrap(bytes); }
      catch (e) { try { openProfile(bytes, file.name); return; } catch (e2) { throw e; } }
      const key = WB.SaveModel.detectGame(unwrapped.pb);
      const game = await getGame(key);
      st.kind = 'save'; st.game = game; st.model = new WB.SaveModel(unwrapped.pb, unwrapped.info, game);
      st.profile = null; st.fileName = file.name; st.original = bytes; st.history = []; st.changes = 0;
      if (!['quick', 'character', 'money', 'skills', 'gear', 'forge', 'ammo', 'missions', 'travel', 'outfits', 'vehicles', 'challenges', 'codes', 'info'].includes(st.tab)) st.tab = 'quick';
      render();
      toast('Loaded ' + st.model.charName + ' — ' + st.model.className + ' (' + game.D.title + ')');
      if (unwrapped.info.warning) toast(unwrapped.info.warning);
    } catch (e) {
      console.error(e); render(); toast(e.message || String(e), true);
    } finally { busy(null); }
  }
  function openProfile(bytes, name) {
    const p = WB.profile.parse(bytes);
    st.kind = 'profile'; st.profile = p; st.model = null; st.fileName = name; st.original = bytes; st.history = []; st.changes = 0; st.tab = 'profile';
    render(); toast('Loaded profile.bin');
  }

  /* ---------------- undo + mutations ---------------- */
  function snapshot() {
    if (st.kind === 'save') return { f: st.model.root.f.map((x) => ({ ...x })), exp: JSON.stringify(st.model.exp) };
    return { entries: st.profile.entries.map((e) => ({ ...e, value: e.value instanceof Uint8Array ? e.value.slice() : e.value })) };
  }
  function restore(s) {
    if (st.kind === 'save') { st.model.root.f = s.f; st.model.exp = JSON.parse(s.exp); }
    else st.profile.entries = s.entries;
  }
  function mutate(label, fn, keepModal) {
    const snap = snapshot();
    try { fn(); } catch (e) { console.error(e); restore(snap); toast(e.message || String(e), true); return false; }
    st.history.push(snap); if (st.history.length > 60) st.history.shift();
    st.changes++;
    if (label) toast(label);
    if (!keepModal) render(); else renderShell();
    return true;
  }
  function undo() { const s = st.history.pop(); if (!s) return toast('Nothing to undo'); restore(s); st.changes = Math.max(0, st.changes - 1); render(); toast('Undone'); }

  async function download() {
    try {
      busy('Packing your save…');
      const out = st.kind === 'save' ? await st.model.toFile() : WB.profile.build(st.profile);
      // safety: make sure what we wrote opens again
      if (st.kind === 'save') await WB.save.unwrap(out); else WB.profile.parse(out);
      const blob = new Blob([out], { type: 'application/octet-stream' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = st.fileName || 'Save0001.sav';
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
      toast('Saved! Replace the file in your save folder (keep a backup of the old one).');
    } catch (e) { console.error(e); toast('Could not save: ' + e.message, true); } finally { busy(null); }
  }
  function downloadOriginal() {
    const blob = new Blob([st.original], { type: 'application/octet-stream' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (st.fileName || 'save').replace(/(\.\w+)?$/, '.backup$1');
    a.click();
  }

  /* ---------------- toast / busy ---------------- */
  let toastTimer;
  function toast(msg, err) {
    let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.className = 'toast' + (err ? ' err' : ''); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), err ? 6000 : 2600);
  }
  function busy(msg) { if (msg) toast(msg); }

  /* ---------------- render ---------------- */
  const SAVE_TABS = [
    ['quick', '⚡', 'Quick Mods'], ['character', '👤', 'Character'], ['money', '💰', 'Currency'], ['skills', '🧠', 'Skills'],
    ['gear', '🔫', 'Backpack & Bank'], ['forge', '🛠️', 'Weapon Forge'], ['ammo', '🎒', 'Ammo & Space'], ['missions', '📜', 'Missions'],
    ['travel', '🗺️', 'Fast Travel'], ['outfits', '👕', 'Outfits'], ['vehicles', '🚗', 'Vehicles'], ['challenges', '🏆', 'Challenges'],
    ['codes', '🔑', 'Code Vault'], ['info', 'ℹ️', 'File Info'],
  ];
  const PROFILE_TABS = [['profile', '🗝️', 'Keys & Badass'], ['pinfo', 'ℹ️', 'File Info']];

  function renderShell() {
    const chips = $('#fileChips');
    if (st.kind === 'save') {
      const m = st.model;
      chips.innerHTML = `<span class="chip">🎮 <b>${esc(st.game.D.title)}</b></span><span class="chip">👤 <b>${esc(m.charName)}</b> · ${esc(m.className)} · Lv <b>${m.level}</b></span>`;
    } else if (st.kind === 'profile') chips.innerHTML = '<span class="chip">🗝️ <b>profile.bin</b></span>';
    else chips.innerHTML = '';
    const bar = $('#savebar');
    bar.classList.toggle('hidden', !st.kind);
    if (st.kind) $('#saveInfo').innerHTML = `<b>${esc(st.fileName)}</b> · ${st.changes ? `<span style="color:var(--accent)">${st.changes} change${st.changes > 1 ? 's' : ''}</span>` : 'no changes yet'}`;
    $('#undoBtn').disabled = !st.history.length;
  }
  function render() {
    renderShell();
    document.body.classList.toggle('editing', !!st.kind);
    const app = $('#app');
    if (!st.kind) { app.innerHTML = landing(); return; }
    const tabs = st.kind === 'save' ? SAVE_TABS.filter(([k]) => !(k === 'vehicles' && st.model.info.scheme === 'json')) : PROFILE_TABS;
    const views = st.kind === 'save' ? VIEWS : PVIEWS;
    let body;
    try { body = views[st.tab](); } catch (e) { console.error(e); body = `<div class="warn">This section hit an error: ${esc(e.message)}</div>`; }
    app.innerHTML = `<div class="layout"><nav class="tabs">${tabs.map(([k, ic, n]) => `<button data-tab="${k}" class="${st.tab === k ? 'on' : ''}"><span class="ic">${ic}</span>${n}</button>`).join('')}</nav><main class="view">${body}</main></div>`;
    const on = app.querySelector('nav.tabs button.on'); if (on && on.scrollIntoView && window.innerWidth <= 820) on.scrollIntoView({ block: 'nearest', inline: 'center' });
    renderModal();
  }

  function landing() {
    return `<div class="landing">
      <h2>DROP. MOD. <span style="color:var(--accent)">DOMINATE.</span></h2>
      <p>The easiest save editor for <b>Borderlands 2</b> and <b>The Pre-Sequel</b> from the Handsome Jack Collection. Max your money, build god-roll guns part by part, finish missions, unlock everything. Your file never leaves your device.</p>
      <div class="drop" id="drop" data-act="pick">
        <div class="icon">📂</div>
        <b>Tap to open your save</b>
        <span class="muted">or drag &amp; drop <code>Save0001.sav</code> / <code>profile.bin</code> here</span>
      </div>
      <div class="features">
        ${['💰 Money & Eridium', '⬆️ Level & OP', '🔫 Weapon Forge', '🧩 Swap any part', '📖 Part explanations', '🧠 Skills', '📜 Missions', '🗺️ Fast Travel', '👕 Heads & Skins', '🚗 Vehicle skins', '🏆 Challenges', '🗝️ Golden Keys', '🎖️ Badass Rank', '🔑 Gibbed codes', '↶ Undo']
          .map((x) => `<span class="chip">${x}</span>`).join('')}
      </div>
      <div class="how">
        <details open><summary>📁 Where is my save? (PC / Steam)</summary>
          <p>Borderlands 2: <code>Documents\\My Games\\Borderlands 2\\WillowGame\\SaveData\\&lt;numbers&gt;\\</code></p>
          <p>Pre-Sequel: <code>Documents\\My Games\\Borderlands The Pre-Sequel\\WillowGame\\SaveData\\&lt;numbers&gt;\\</code></p>
          <p>Each character is a <code>SaveXXXX.sav</code> file. <code>profile.bin</code> in the same folder holds Golden Keys, Badass Rank and unlocked skins.</p>
        </details>
        <details><summary>🛡️ Before you start</summary>
          <p>1. Close the game. 2. Copy your save folder somewhere safe (backup!). 3. Open the save here, mod it, hit <b>Download save</b>. 4. Put the downloaded file back in the same folder with the same name.</p>
          <p>Turn off Steam Cloud while you swap files, or Steam may put the old save back.</p>
        </details>
        <details><summary>🎮 PlayStation / Xbox</summary>
          <p>Console saves are encrypted by the console. You need a tool such as Save Wizard (PS4) or a save transfer tool to export a decrypted save first. Decrypted PC-style, PS3, Vita and Switch-style saves are detected automatically.</p>
        </details>
        <details><summary>⚠️ Online play</summary>
          <p>Use modded gear responsibly. Don't drop crazy items on strangers in public lobbies.</p>
        </details>
      </div>
    </div>`;
  }

  /* ---------------- helpers for views ---------------- */
  const card = (title, inner, hint) => `<div class="card"><h3>${title}</h3>${inner}${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
  const num = (key, val, attrs = '') => `<input type="number" data-set="${key}" value="${esc(val)}" ${attrs}>`;
  const sec = (t, sub) => `<h2 class="sec">${t}</h2>${sub ? `<p class="sub">${sub}</p>` : ''}`;
  const bl2 = () => st.game && st.game.key === 'bl2';

  const CUR = () => (bl2()
    ? [[0, '💵', 'Cash', 999999999], [1, '💜', 'Eridium', 500], [2, '🔮', 'Seraph Crystals', 999], [4, '🎟️', 'Torgue Tokens', 999]]
    : [[0, '💵', 'Cash', 999999999], [1, '🌙', 'Moonstone', 999]]);
  const maxLevel = () => (bl2() ? 80 : 70);

  /* ================= VIEWS (save) ================= */
  const VIEWS = {
    quick() {
      const P = [
        ['maxMoney', '💰', 'Max all currency', 'Cash, ' + (bl2() ? 'Eridium, Seraph Crystals and Torgue Tokens' : 'Moonstone') + ' to the cap.'],
        ['maxLevel', '⬆️', 'Max level', 'Level ' + maxLevel() + (bl2() ? ' + OP 10 + UVHM unlocked.' : ' + UVHM unlocked.')],
        ['maxSkills', '🧠', 'Max all skills', 'Every skill to its max rank.'],
        ['gearLevel', '🔫', 'Gear = my level', 'All weapons & gear scale to your level.'],
        ['maxAmmo', '🎒', 'Max ammo & space', 'All ammo SDUs, max ammo, biggest backpack & bank, 4 weapon slots.'],
        ['allTravel', '🗺️', 'Unlock all fast travel', 'Every station, incl. DLC.'],
        ['modes', '🔓', 'Unlock TVHM + UVHM', 'All difficulty modes' + (bl2() ? ' + Creature Slaughterdome.' : '.')],
        ['chal1', '🏆', 'Challenges: 1 away', 'Every challenge 1 kill/point from max. Finish them in-game to farm Badass Rank.'],
      ];
      return sec('Quick Mods', 'One-tap buttons for smooth brains. Every button can be undone.') +
        `<div class="cards">${P.map(([a, e, t, d]) => `<div class="card preset"><span class="emo">${e}</span><b>${t}</b><span class="muted" style="font-size:13px">${d}</span><button class="btn gold small" data-act="preset" data-p="${a}">Do it</button></div>`).join('')}
        <div class="card preset" style="border-color:rgba(255,204,0,.5)"><span class="emo">☢️</span><b>GOD MODE</b><span class="muted" style="font-size:13px">All of the above at once.</span><button class="btn gold" data-act="preset" data-p="all">UNLEASH</button></div></div>`;
    },

    character() {
      const m = st.model; const D = st.game.D;
      const classes = Object.entries(D.classes).sort((a, b) => a[1].sort_order - b[1].sort_order);
      const pts = m.playthroughs;
      return sec('Character', 'Name, level, XP and modes.') + `<div class="cards">
        ${card('🏷️ Name', `<input type="text" maxlength="30" data-set="charName" value="${esc(m.charName)}">`, 'Shown in menus and to other players.')}
        ${card('⬆️ Level', `<div class="row"><input type="range" min="1" max="${maxLevel()}" value="${m.level}" data-set="level" data-live="lvlNum"><input id="lvlNum" class="no-grow" style="width:84px" type="number" min="1" max="${maxLevel()}" data-set="level" value="${m.level}"></div>
            <label class="f">Experience (XP)</label>${num('xp', m.xp)}`, 'Changing level fixes XP for you (and the other way round).')}
        ${card('✨ Skill points', num('skillPoints', m.skillPoints, 'min="0"'), 'Unspent points you can put into skills.')}
        ${card('🔥 Difficulty modes', `<select data-set="playthroughs">${['Normal only', 'True Vault Hunter unlocked', 'Ultimate Vault Hunter unlocked'].map((t, i) => `<option value="${i}" ${pts === i ? 'selected' : ''}>${t}</option>`).join('')}</select>`, 'Which playthroughs you can pick in the main menu.')}
        ${bl2() ? card('💀 Overpower (OP) level', `<select data-set="opLevel">${[...Array(11).keys()].map((i) => `<option value="${i}" ${m.opLevel === i ? 'selected' : ''}>${i ? 'OP ' + i : 'None'}</option>`).join('')}</select>`, 'Needs level 80 + UVHM. Lets you play enemies up to level 90. Sets UVHM for you.') : ''}
        ${card('🧬 Class', `<div class="big-num" style="font-size:18px">${esc(m.className)}</div>
            <label class="f">Change class (advanced)</label><select data-set="classPath">${classes.map(([p, c]) => `<option value="${esc(p)}" ${p === m.classPath ? 'selected' : ''}>${esc(c.name)} — ${esc(c.class)}</option>`).join('')}</select>`, 'Changing class resets your skill tree and outfit to the new class defaults.')}
        ${card('💾 Save slot ID', num('saveId', m.saveId, 'min="0"'), 'Only change if two saves fight over the same slot.')}
        ${card('⏱️ Time played', `<div class="big-num">${Math.floor(m.playTime / 3600)}h ${Math.floor((m.playTime % 3600) / 60)}m</div>`)}
      </div>`;
    },

    money() {
      const m = st.model; const c = m.currency;
      return sec('Currency', 'Type any amount or hit MAX.') + `<div class="cards">${CUR().map(([i, e, n, max]) => card(`${e} ${n}`,
        `<div class="row">${num('cur:' + i, c[i] || 0, 'min="0"')}<button class="btn gold small no-grow" data-act="curMax" data-i="${i}" data-max="${max}">MAX</button></div>`,
        i === 1 && bl2() ? 'Game cap is 500. The editor stores it exactly like the game does.' : i === 0 ? 'Cap shown in game is 999,999,999+.' : '')).join('')}</div>
        <details class="card" style="margin-top:14px"><summary class="muted">Advanced: raw currency slots</summary><div class="row" style="margin-top:10px">${c.map((v, i) => `<div><label class="f">Slot ${i}</label>${num('cur:' + i, v)}</div>`).join('')}</div></details>`;
    },

    skills() {
      const m = st.model; const sk = m.skills;
      if (!sk.length) return sec('Skills') + '<div class="warn">No skills in this save yet. Play a little first (or the class was just changed).</div>';
      const groups = {};
      sk.forEach((s, i) => { const tree = humanize(s.name.split('.')[1] || 'Skills'); (groups[tree] = groups[tree] || []).push([s, i]); });
      return sec('Skills', 'Set any skill rank. Most skills max at 5, capstones and action skills at 1.') +
        `<div class="toolbar"><button class="btn gold" data-act="preset" data-p="maxSkills">Max all</button><button class="btn" data-act="refundSkills">Reset all (refund points)</button><span class="chip">Unspent points: <b>${m.skillPoints}</b></span></div>` +
        Object.entries(groups).map(([g, list]) => `<div class="group-title">${esc(g)}</div><div class="list">${list.map(([s, i]) => {
          const inf = m.skillInfo(s.name), mx = m.skillMax(s.name);
          return `<div class="li"><div class="grow"><div class="ttl">${esc(inf.name)}</div><div class="sm">${esc(inf.desc || s.name)}</div></div>
            <input type="number" min="0" max="${Math.max(mx, 10)}" value="${s.grade}" data-set="skill:${i}" style="width:80px"><span class="muted" style="font-size:12px">/ ${mx}</span></div>`;
        }).join('')}</div>`).join('');
    },

    gear() {
      const m = st.model; const inv = m.inventory();
      const q = st.inv.q.toLowerCase(), w = st.inv.where;
      const shown = inv.filter((e) => {
        if (w === 'backpack' && e.where !== 'backpack') return false;
        if (w === 'bank' && e.where !== 'bank') return false;
        if (w === 'weapons' && !(e.view && e.view.isWeapon)) return false;
        if (w === 'gear' && (!e.view || e.view.isWeapon)) return false;
        if (w === 'equipped' && !e.equipped) return false;
        if (q && !(e.view && (e.view.name + ' ' + e.view.kind + ' ' + e.view.mfgName).toLowerCase().includes(q))) return false;
        return true;
      });
      const seg = [['all', 'All'], ['backpack', 'Backpack'], ['bank', 'Bank'], ['weapons', 'Guns'], ['gear', 'Gear'], ['equipped', 'Equipped']];
      return sec('Backpack & Bank', `${inv.filter((e) => e.where === 'backpack').length} in backpack · ${inv.filter((e) => e.where === 'bank').length} in bank. Tap anything to edit its parts.`) +
        `<div class="toolbar"><input type="search" placeholder="Search name, type, maker…" data-set="invQ" value="${esc(st.inv.q)}">
          <div class="seg">${seg.map(([k, n]) => `<button data-act="invWhere" data-w="${k}" class="${w === k ? 'on' : ''}">${n}</button>`).join('')}</div>
          <button class="btn gold small" data-act="tab" data-t="forge">+ New item</button></div>
        <div class="inv-grid">${shown.map((e) => itemCard(e)).join('') || '<div class="muted">Nothing here.</div>'}</div>`;
    },

    forge() {
      const cat = st.game.catalog();
      const f = st.forge, q = f.q.toLowerCase();
      const kinds = [...new Set(cat.map((c) => c.kind))].sort();
      const list = cat.filter((c) => (!f.kind || c.kind === f.kind) && (!f.rarity || c.rarity === f.rarity) && (!q || (c.name + ' ' + c.mfg + ' ' + c.kind + ' ' + last(c.balance)).toLowerCase().includes(q)));
      const rar = ['white', 'green', 'blue', 'purple', 'etech', 'legendary', 'seraph', 'pearl', 'effervescent', 'glitch'];
      const EX = ['legendary shock sniper with crazy crit, modded', 'conference call', 'fast corrosive smg that looks like jakobs', 'jakobs shotgun that one shots everything', 'best fire grenade', 'shield with big capacity', 'god tier rocket launcher'];
      return sec('Weapon Forge', 'Spawn any gun, shield, grenade, class mod or relic in the game — then customize every part.') +
        `<div class="card" style="margin-bottom:16px;border-color:rgba(255,204,0,.45)"><h3>🤖 Describe it — the site builds it</h3>
          <textarea id="wishBox" rows="2" placeholder="e.g. legendary shock sniper with crazy crit damage, modded" style="resize:vertical">${esc(st.forge.wish || '')}</textarea>
          <div class="row" style="margin-top:8px"><button class="btn gold no-grow" data-act="wish">✨ Make it</button><span class="muted" style="font-size:12px">Say a type, maker, element, rarity, stats (damage, crit, fire rate, accuracy, recoil, mag, reload), a gun's name, "looks like jakobs", a level, or "modded".</span></div>
          <div class="row" style="margin-top:8px;gap:6px">${EX.map((e) => `<button class="chip" data-act="wishEx" data-t="${esc(e)}" style="cursor:pointer">${esc(e)}</button>`).join('')}</div></div>` +
        `<div class="toolbar"><input type="search" placeholder="Search e.g. Conference Call, Bee, Sledge, Harold…" data-set="forgeQ" value="${esc(f.q)}">
          <select data-set="forgeKind" style="width:auto"><option value="">All types</option>${kinds.map((k) => `<option value="${esc(k)}" ${f.kind === k ? 'selected' : ''}>${esc(humanize(k))}</option>`).join('')}</select>
          <select data-set="forgeRarity" style="width:auto"><option value="">All rarities</option>${rar.map((r) => `<option value="${r}" ${f.rarity === r ? 'selected' : ''}>${RAR[r]}</option>`).join('')}</select></div>
        <p class="muted" style="font-size:12px">${list.length} matches${list.length > 240 ? ' (showing 240 — search to narrow it down)' : ''}</p>
        <div class="inv-grid">${list.slice(0, 240).map((c) => `<div class="item r-${c.rarity}" data-act="forgeNew" data-b="${esc(c.balance)}" data-w="${c.weapon ? 1 : 0}">
          <div class="nm">${esc(c.name)}</div><div class="meta">${esc(humanize(c.kind))} · ${esc(c.mfg)} · ${esc(RAR[c.rarity] || '')}</div><div class="meta" style="font-size:10px;opacity:.6">${esc(last(c.balance))}</div></div>`).join('')}</div>`;
    },

    ammo() {
      const m = st.model; const bm = m.blackMarket; const sl = m.slots;
      return sec('Ammo & Space', 'Black Market upgrades (SDUs), ammo, backpack and bank size.') +
        `<div class="toolbar"><button class="btn gold" data-act="preset" data-p="maxAmmo">Max everything</button></div>
        <div class="cards">
          ${card('🎒 Backpack slots', `<div class="row"><input type="number" min="12" max="200" value="${sl.backpack}" data-set="backpack"><button class="btn small no-grow" data-act="setVal" data-k="backpack" data-v="39">39 (max)</button></div>`, 'Normal max is 39. Bigger works but is "modded".')}
          ${card('🏦 Bank slots', `<div class="row"><input type="number" min="6" max="200" value="${sl.bank}" data-set="bank"><button class="btn small no-grow" data-act="setVal" data-k="bank" data-v="24">24 (max)</button></div>`, 'Normal max is 24.')}
          ${card('🔫 Weapon slots', `<select data-set="weaponSlots">${[2, 3, 4].map((n) => `<option ${sl.weapons === n ? 'selected' : ''}>${n}</option>`).join('')}</select>`, 'How many guns you can equip (4 = all slots).')}
        </div>
        <div class="group-title">Ammo</div><div class="list">${m.ammo.map((a) => `<div class="li"><div class="grow"><div class="ttl">${esc(a.label)}</div><div class="sm">SDU level ${bm[a.key] || 0}/7 · max ${fmt(a.max[Math.min(7, bm[a.key] || 0)])}</div></div>
          <label class="muted" style="font-size:12px">SDU</label><select data-set="sdu:${a.key}">${[...Array(8).keys()].map((i) => `<option ${(bm[a.key] || 0) === i ? 'selected' : ''}>${i}</option>`).join('')}</select>
          <input type="number" min="0" value="${a.amount}" data-set="ammo:${a.key}" style="width:100px"></div>`).join('')}</div>`;
    },

    missions() {
      const m = st.model; const pts = m.playthroughList();
      if (!pts.length) return sec('Missions') + '<div class="warn">No mission data yet.</div>';
      const pt = Math.min(st.missions.pt, pts.length - 1);
      const list = m.missions(pt); const q = st.missions.q.toLowerCase();
      const SN = ['Not started', 'Active', 'Objectives done', 'Ready to turn in', 'Complete', 'Failed'];
      const names = ['Normal', 'TVHM', 'UVHM'];
      const shown = list.filter((x) => !q || ((x.info && x.info.name) || x.path).toLowerCase().includes(q));
      const missing = Object.keys(st.game.D.missions).filter((p) => !list.some((x) => x.path === p)).length;
      return sec('Missions', `${list.filter((x) => x.status === 4).length} of ${list.length} complete in ${names[pt] || 'mode ' + pt}. Change a status or remove a mission to replay it.`) +
        `<div class="toolbar"><div class="seg">${pts.map((_, i) => `<button data-act="pt" data-i="${i}" class="${i === pt ? 'on' : ''}">${names[i] || 'PT ' + i}</button>`).join('')}</div>
          <input type="search" placeholder="Search missions…" data-set="missionQ" value="${esc(st.missions.q)}"></div>
        <div class="toolbar"><button class="btn green small" data-act="missionsAll">✔ Complete all listed</button>
          <button class="btn small" data-act="missionsAdd">+ Add ${missing} missing as complete</button>
          ${pts.length > 1 ? `<button class="btn small" data-act="missionsCopy">Copy ${names[pt]} → other modes</button>` : ''}</div>
        <div class="warn">Tip: completing story missions you haven't reached can skip unlocks (like Sanctuary fast travel). Safest is completing side missions, or copying Normal progress to TVHM/UVHM.</div>
        <div class="list">${shown.map((x) => `<div class="li"><div class="grow"><div class="ttl">${esc((x.info && x.info.name) || humanize(last(x.path)))} ${x.info && x.info.is_plot_critical ? '<span class="pill">Story</span>' : ''}</div><div class="sm">${esc(x.info ? x.info.description : x.path)}</div></div>
          <select data-set="mstatus:${esc(x.path)}">${SN.map((n, i) => `<option value="${i}" ${x.status === i ? 'selected' : ''}>${n}</option>`).join('')}</select>
          <button class="btn red small" data-act="mremove" data-p="${esc(x.path)}" title="Remove (lets you redo it)">✕</button></div>`).join('')}</div>`;
    },

    travel() {
      const m = st.model; const on = new Set(m.fastTravel); const all = st.model.allStations();
      const groups = {}; all.forEach((s) => (groups[s.dlc] = groups[s.dlc] || []).push(s));
      return sec('Fast Travel', `${all.filter((s) => on.has(s.id)).length} of ${all.length} stations unlocked.`) +
        `<div class="toolbar"><button class="btn gold" data-act="preset" data-p="allTravel">Unlock all</button></div>` +
        Object.entries(groups).sort((a, b) => (a[0] === 'Base Game' ? -1 : b[0] === 'Base Game' ? 1 : a[0].localeCompare(b[0]))).map(([g, list]) => `<div class="group-title">${esc(g)}</div><div class="cards">${list.map((s) => `<label class="li check"><input type="checkbox" data-set="ft:${esc(s.id)}" ${on.has(s.id) ? 'checked' : ''}><span>${esc(s.name)}</span></label>`).join('')}</div>`).join('');
    },

    outfits() {
      const m = st.model; const u = m.usage; const o = m.outfit;
      const heads = m.customizationsFor('Head', u), skins = m.customizationsFor('Skin', u);
      const opts = (list, cur) => (list.some((x) => x.path === cur) ? '' : `<option value="${esc(cur)}" selected>${esc(humanize(last(cur)))} (current)</option>`) + list.map((x) => `<option value="${esc(x.path)}" ${x.path === cur ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
      const cols = m.colors; const hex = (c) => (c ? '#' + [c.r, c.g, c.b].map((x) => x.toString(16).padStart(2, '0')).join('') : '#ffffff');
      return sec('Outfits', 'Wear any head or skin for your class — no unlock needed. (To unlock them all in the menu, open profile.bin.)') +
        `<div class="cards">${card('🎭 Head', `<select data-set="head">${opts(heads, o.head)}</select>`, heads.length + ' heads available')}
        ${card('🧥 Skin', `<select data-set="skin">${opts(skins, o.skin)}</select>`, skins.length + ' skins available')}
        ${card('🎨 Name colors', `<div class="row">${[0, 1, 2].map((i) => `<div><label class="f">Color ${i + 1}</label><input class="swatch" type="color" data-set="color:${i}" value="${hex(cols[i])}"></div>`).join('')}</div>`, 'Colors used on your character card.')}</div>`;
    },

    vehicles() {
      const m = st.model;
      return sec('Vehicles', 'Pick a skin for every vehicle.') + `<div class="cards">${m.vehicleFamilies().map(([fam, name, usage]) => {
        const skins = m.customizationsFor('Skin', usage); const cur = m.vehicleSkins(fam);
        const sel = (i) => `<select data-set="veh:${i}:${esc(fam)}"><option value="None">Default</option>${skins.map((s) => `<option value="${esc(s.path)}" ${cur[i] === s.path ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>`;
        return card('🚗 ' + esc(name), `<label class="f">Skin</label>${sel(0)}<label class="f">Skin (2nd variant)</label>${sel(1)}`, skins.length + ' skins');
      }).join('')}</div>`;
    },

    challenges() {
      const list = st.model.challenges();
      if (!list) return sec('Challenges') + '<div class="warn">Challenge data in this save could not be read.</div>';
      const known = list.filter((c) => c.info); const q = st.chal.q.toLowerCase();
      const groups = {};
      known.filter((c) => !q || (c.info.name + c.info.desc + c.info.cat).toLowerCase().includes(q)).forEach((c) => (groups[c.info.cat] = groups[c.info.cat] || []).push(c));
      return sec('Challenges', 'Badass challenges. Setting them 1 away from done lets you finish them in game and collect the Badass Rank.') +
        `<div class="toolbar"><button class="btn gold" data-act="preset" data-p="chal1">1 away from max</button><button class="btn" data-act="chalMax">Complete all</button><button class="btn red" data-act="chalZero">Reset to 0</button>
          <input type="search" placeholder="Search challenges…" data-set="chalQ" value="${esc(st.chal.q)}"></div>` +
        Object.entries(groups).map(([g, cs]) => `<div class="group-title">${esc(g)}</div><div class="list">${cs.map((c) => {
          const lv = c.info.levels, top = lv[lv.length - 1], done = lv.filter((x) => c.value >= x).length;
          return `<div class="li"><div class="grow"><div class="ttl">${esc(c.info.name)} <span class="pill ${done === lv.length ? 'good' : ''}">${done}/${lv.length}</span></div><div class="sm">${esc(c.info.desc)} · goals ${lv.map(fmt).join(' / ')}</div><div class="progress"><i style="width:${Math.min(100, (c.value / top) * 100)}%"></i></div></div>
            <input type="number" min="0" value="${c.value}" data-set="chal:${c.i}" style="width:110px"></div>`;
        }).join('')}</div>`).join('');
    },

    codes() {
      const inv = st.model.inventory().filter((e) => e.view);
      const pre = bl2() ? 'BL2' : 'BLOZ';
      const lines = []; let lastW = '';
      for (const e of inv) { if (e.where !== lastW) { lines.push('; ' + (e.where === 'bank' ? 'Bank' : 'Backpack')); lastW = e.where; } lines.push(pre + '(' + WB.bytes.b64(WB.items.rekey(e.serial, 0)) + ')'); }
      return sec('Code Vault', 'Gibbed-style item codes. Share your god rolls or paste codes from the internet.') +
        `<div class="cards"><div class="card"><h3>📥 Import codes</h3><textarea class="codes" id="importBox" placeholder="${pre}(hwAAAAD...)\n${pre}(BwAAAAA...)"></textarea>
          <div class="row" style="margin-top:8px"><select id="importWhere"><option value="backpack">Into backpack</option><option value="bank">Into bank</option></select><button class="btn gold no-grow" data-act="import">Import</button></div>
          <div class="hint">One code per line. Lines starting with ; are ignored.</div></div>
        <div class="card"><h3>📤 Export all (${inv.length})</h3><textarea class="codes" readonly id="exportBox">${esc(lines.join('\n'))}</textarea>
          <div class="row" style="margin-top:8px"><button class="btn no-grow" data-act="copyExport">Copy</button></div></div></div>`;
    },

    info() {
      const m = st.model; const i = m.info;
      return sec('File Info', 'What WBWHO detected about this file.') + `<div class="cards">${card('📄 File', [
        ['Name', st.fileName], ['Game', st.game.D.title], ['Format', { lzo: 'PC (LZO)', zlib: 'PS3 / Vita / Android (zlib)', none: 'Switch / raw', json: 'PlayStation JSON (decrypted)' }[i.scheme] || i.scheme], ['Byte order', i.little ? 'Little endian' : 'Big endian (PS3 / 360)'], ['Header hash', i.sha1ok ? 'OK' : 'Mismatch (will be fixed)'], ['Size', fmt(st.original.length) + ' bytes'],
      ].map(([a, b]) => `<div class="stat-row"><span class="muted">${a}</span><b>${esc(b)}</b></div>`).join(''))}
        ${card('🛟 Backup', '<button class="btn" data-act="backup">Download untouched original</button>', 'Keep this in case anything goes wrong.')}</div>`;
    },
  };

  function itemCard(e) {
    if (!e.view) return `<div class="item"><div class="nm">Unknown item</div><div class="meta">${esc(e.error)}</div></div>`;
    const v = e.view;
    return `<div class="item r-${v.rarity}" data-act="edit" data-f="${e.field}" data-i="${e.idx}">
      <div class="badges">${e.equipped ? '<span class="pill good">E</span>' : ''}${e.where === 'bank' ? '<span class="pill">Bank</span>' : ''}${e.mark === 2 ? '<span class="pill">★</span>' : ''}</div>
      <div class="nm">${esc(v.name)}</div><div class="meta">${esc(humanize(v.kind))} · ${esc(v.mfgName)} · Lv ${v.level} · ⚡${fmt(WB.parts.profile(v, st.game).power)}</div></div>`;
  }

  /* ================= item editor modal ================= */
  // keep the item's "game stage" the way this save stores it; untouched levels stay exactly as they were
  function fixStage(e) {
    const v = e.v;
    if (e.base && e.base.level === v.level && e.base.stage !== undefined) v.stage = e.base.stage;
    else st.model.applyStage(v);
    return v;
  }
  function statsCard(v, e) {
    const P = WB.parts.profile(v, st.game);
    const B = e.base ? WB.parts.profile(e.base, st.game) : null;
    const rows = Object.entries(P.stats).filter(([k, x]) => x.val !== 0 || (B && B.stats[k].val !== 0)).map(([k, x]) => {
      const before = B ? B.stats[k].val : null, diff = before === null ? 0 : x.val - before;
      const pct = Math.max(0, Math.min(100, (x.val / 6) * 100));
      return `<div style="margin:6px 0"><div class="row" style="font-size:13px"><span>${x.ic} ${esc(x.label)}</span><span class="no-grow" style="font-weight:800">${x.val > 0 ? '+' : ''}${Math.round(x.val * 10) / 10}${diff ? ` <span style="color:${diff > 0 ? 'var(--good)' : 'var(--bad)'}">${diff > 0 ? '▲' : '▼'}${Math.round(Math.abs(diff) * 10) / 10}</span>` : ''}</span></div><div class="progress"><i style="width:${pct}%${x.val < 0 ? ';background:var(--bad)' : ''}"></i></div></div>`;
    }).join('');
    const pd = B ? P.power - B.power : 0;
    return `<div class="card" style="margin-bottom:14px"><h3>📊 Stats</h3>
      <div class="row" style="align-items:flex-end"><div><div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:1px">Power score</div><div class="big-num">${fmt(P.power)}${pd ? ` <span style="font-size:15px;color:${pd > 0 ? 'var(--good)' : 'var(--bad)'}">${pd > 0 ? '▲' : '▼'}${fmt(Math.abs(pd))}</span>` : ''}</div></div>
        <div class="no-grow" style="text-align:right;font-size:13px">Lv <b>${v.level}</b> · ${esc(RAR[P.rarity] || P.rarity)}${P.element ? ' · ' + esc(P.element) : ''}${P.uniqueAbility ? '<br><span class="pill good">Special ability</span>' : ''}</div></div>
      ${rows || '<div class="muted" style="font-size:13px;margin-top:8px">No bonus parts yet — try Make it OP or Stack a stat.</div>'}
      <div class="hint">Numbers count how many parts boost each stat (+1 ≈ one bonus part). Power score is a WBWHO estimate from level, rarity and parts — not the in-game damage number.${e.base ? ' ▲▼ = change since you opened it.' : ''}</div></div>`;
  }
  function openEditor(entry, view, isNew) {
    st.edit = { entry, isNew, v: JSON.parse(JSON.stringify({ ...view, it: undefined })), it: view.it, where: entry ? entry.where : 'backpack' };
    if (st.edit.v.level === undefined) st.edit.v.level = st.model.level;
    st.edit.base = isNew ? null : JSON.parse(JSON.stringify(st.edit.v));
    renderModal();
  }
  function editView() {
    const e = st.edit; const G = st.game;
    const v = e.v; v.name = G.itemName(v); v.kind = G.kind(v); v.rarity = G.rarity(v); v.mfgName = last(v.manufacturer);
    return v;
  }
  function renderModal() {
    let host = $('#modal'); if (!host) { host = document.createElement('div'); host.id = 'modal'; document.body.appendChild(host); }
    if (st.picker) { host.innerHTML = pickerHTML(); return; }
    if (!st.edit || st.kind !== 'save') { host.innerHTML = ''; return; }
    const G = st.game, v = editView(), e = st.edit;
    const slots = v.isWeapon ? WB.items.WEAPON_SLOTS : WB.items.ITEM_SLOTS;
    const valid = G.validParts(v);
    const mfgs = v.isWeapon ? G.weaponBalance(v.balance).mfgs : G.itemBalance(v.balance).mfgs;
    const shownSlots = slots; // show every slot, even empty ones, so you can add parts
    host.innerHTML = `<div class="modal-bg" data-act="closeEdit"><div class="modal" data-stop="1">
      <header><h3 class="r-${v.rarity}" style="color:var(--rc)">${esc(v.name)}</h3><button class="x" data-act="closeEdit">✕</button></header>
      <div class="body">
        <div class="row" style="margin-bottom:12px"><span class="chip">${esc(humanize(v.kind))}</span><span class="chip">🏭 ${esc(v.mfgName || '—')}</span><span class="chip r-${v.rarity}" style="color:var(--rc)">${esc(RAR[v.rarity] || v.rarity)}</span></div>
        ${statsCard(v, e)}
        <div class="cards" style="margin-bottom:14px">
          ${card('Level', `<div class="row"><input type="range" min="1" max="${bl2() ? 99 : 80}" value="${v.level}" data-eset="level" data-live="ilvl"><input id="ilvl" type="number" class="no-grow" style="width:80px" min="0" max="127" value="${v.level}" data-eset="level"></div>
            <button class="btn small" data-act="lvlMe" style="margin-top:8px">Match my level (${st.model.level})</button>`, 'Item level controls its damage/stats.')}
          ${card('⚡ One-tap power', `<div class="row"><button class="btn gold" data-act="makeOP" data-m="0">Make it OP</button><button class="btn red" data-act="makeOP" data-m="1">☢️ MODDED</button></div>`, '<b>OP</b>: best legit parts, best rarity, your max level. <b>MODDED</b>: stacks the strongest parts from any gun into every slot (damage, crit, fire rate). Single-player fun; may be flagged online.')}
          ${v.isWeapon ? card('🧱 Stack a stat', `<div class="stackgrid">${Object.entries(WB.parts.STACKS).map(([k, x]) => `<button class="btn small ${(e.stacks || []).includes(k) ? 'gold' : ''}" data-act="stack" data-s="${k}">${x.label}</button>`).join('')}</div>`, 'Tap one or more. Fills grip, sight, stock, both accessories (and the barrel, unless it\'s a legendary barrel) with the strongest parts for your picks, shared between them. Modded.') : ''}
          ${card('Manufacturer', `<select data-eset="manufacturer">${[...new Set(mfgs.concat(v.manufacturer ? [v.manufacturer] : []))].map((m) => `<option value="${esc(m)}" ${m === v.manufacturer ? 'selected' : ''}>${esc(last(m))}</option>`).join('')}</select>`, 'Changes who "made" it (affects some stats & looks).')}
        </div>
        <div class="group-title">Parts — tap one to swap it</div>
        <div class="slots">${shownSlots.map((s) => {
          const d = WB.parts.describe(v.parts[s], s, v.isWeapon, G);
          const fits = !v.parts[s] || (valid[s] || []).includes(v.parts[s]);
          return `<div class="slot" data-act="pick" data-slot="${s}"><div class="lbl">${esc(WB.parts.slotLabel(s, v.kind))} ${fits ? '' : '<span class="pill bad">modded</span>'}</div>
            <div class="val">${v.parts[s] ? esc(d.title) : '<span class="muted">Empty — tap to add a part</span>'}</div><div class="tags">${d.tags.map((t) => `<span class="tagc ${t.good ? '' : 'neg'}">${esc(t.t)}</span>`).join('')}</div><div class="desc">${esc(d.long)}</div></div>`;
        }).join('')}</div>
      </div>
      <footer>
        ${e.isNew ? `${e.wish ? '<button class="btn" data-act="wish" data-again="1">🎲 Re-roll</button>' : ''}<button class="btn" data-act="closeEdit">Cancel</button><button class="btn" data-act="addItem" data-w="bank">Add to bank</button><button class="btn gold" data-act="addItem" data-w="backpack">Add to backpack</button>` : `
        <button class="btn red small" data-act="delItem">🗑 Delete</button>
        <button class="btn small" data-act="dupItem">⧉ Duplicate</button>
        <button class="btn small" data-act="moveItem">${e.where === 'bank' ? '→ Backpack' : '→ Bank'}</button>
        ${e.entry.field !== 41 ? `<button class="btn small" data-act="favItem">${e.entry.mark === 2 ? '☆ Unfavorite' : '★ Favorite'}</button>` : ''}
        <button class="btn small" data-act="copyCode">Copy code</button>
        <button class="btn gold" data-act="saveItem">✔ Apply changes</button>`}
      </footer></div></div>`;
  }
  function pickerHTML() {
    const p = st.picker, G = st.game, v = st.edit.v;
    const valid = G.validParts(v)[p.slot] || [];
    const pools = G.pools[v.isWeapon ? 'weapon' : 'item'];
    const nameSlot = p.slot === 'prefix' || p.slot === 'title';
    const pool = p.mode === 2 && !nameSlot ? [...new Set(Object.entries(pools).filter(([k]) => k !== 'prefix' && k !== 'title').flatMap(([, l]) => l))].sort()
      : p.mode >= 1 ? pools[p.slot] || [] : valid;
    const q = p.q.toLowerCase();
    const fitting = p.mode === 0 ? pool : pool.filter((x) => G.fits(v, p.slot, x));
    const hidden = pool.length - fitting.length;
    const opts = [null].concat(fitting).map((path) => ({ path, d: WB.parts.describe(path, p.slot, v.isWeapon, G) }))
      .filter((o) => !q || (o.d.title + ' ' + o.d.short + ' ' + (o.path || '')).toLowerCase().includes(q));
    return `<div class="modal-bg" data-act="closePick"><div class="modal" data-stop="1">
      <header><h3>Pick ${esc(WB.parts.slotLabel(p.slot, v.kind))}</h3><button class="x" data-act="closePick">✕</button></header>
      <div class="body">
        <div class="toolbar"><input type="search" placeholder="Search parts (e.g. recoil, damage, Jakobs)…" data-pset="q" value="${esc(p.q)}" autofocus>
          <div class="seg"><button data-act="pickAll" data-v="0" class="${p.mode === 0 ? 'on' : ''}">Fits (${valid.length})</button><button data-act="pickAll" data-v="1" class="${p.mode === 1 ? 'on' : ''}">Any weapon</button>${nameSlot ? '' : `<button data-act="pickAll" data-v="2" class="${p.mode === 2 ? 'on' : ''}">Any slot ★</button>`}</div></div>
        ${p.mode === 1 ? '<div class="warn">Parts from other guns/items can look or act weird and may be flagged in online play. Fun for single player!</div>' : ''}
        ${p.mode === 2 ? '<div class="warn">★ Stack mode: put ANY part in this slot — e.g. a second damage accessory in the Sight or Stock slot — to pile up more bonuses. Very modded.</div>' : ''}
        ${hidden ? `<p class="muted" style="font-size:12px">${hidden} parts hidden — they come from a different DLC than this item's other parts, and the game can't mix those.</p>` : ''}
        <div class="plist">${opts.slice(0, 400).map((o) => `<button class="popt ${o.path === v.parts[p.slot] ? 'cur' : ''}" data-act="pickPart" data-p="${esc(o.path || '')}">
          <div class="t">${esc(o.d.title)} ${o.d.tags.map((t) => `<span class="tagc ${t.good ? '' : 'neg'}">${esc(t.t)}</span>`).join(' ')}</div>
          <div class="muted" style="font-size:12px">${esc(o.d.long)}</div>${o.path ? `<div class="p">${esc(o.path)}</div>` : ''}</button>`).join('')}</div>
      </div></div></div>`;
  }

  /* ================= PROFILE VIEWS ================= */
  const BONUS = ['Max Health', 'Shield Capacity', 'Shield Recharge Delay', 'Shield Recharge Rate', 'Melee Damage', 'Grenade Damage', 'Gun Accuracy', 'Gun Damage', 'Fire Rate', 'Recoil Reduction', 'Reload Speed', 'Elemental Effect Chance', 'Elemental Effect Damage', 'Critical Hit Damage'];
  const KEYS = [[0, 'SHiFT Golden Keys'], [254, 'Pre-order Golden Keys'], [173, 'Mechromancer Pack Keys']];
  const pe = (id) => st.profile.entries.find((e) => e.id === id);
  function goldenKeys() {
    const e = pe(162); const out = {}; KEYS.forEach(([id]) => (out[id] = { keys: 0, used: 0, present: false }));
    if (e && e.value instanceof Uint8Array) for (let i = 0; i + 2 < e.value.length; i += 3) { out[e.value[i]] = { keys: e.value[i + 1], used: e.value[i + 2], present: true }; }
    return out;
  }
  function setGoldenKeys(src, keys, used) {
    let e = pe(162);
    if (!e) { const tmpl = st.profile.entries.find((x) => x.type === 6) || { start: 1, end: 0 }; e = { start: tmpl.start, id: 162, type: 6, value: new Uint8Array(0), end: tmpl.end }; st.profile.entries.push(e); }
    const gk = goldenKeys(); gk[src] = { keys, used, present: true };
    const bytes = [];
    for (const [id, v] of Object.entries(gk)) if (v.present) bytes.push(+id, Math.max(0, Math.min(255, v.keys)), Math.max(0, Math.min(255, v.used)));
    e.value = Uint8Array.from(bytes);
  }
  function bonusStats() { const e = pe(143); return e && e.value ? WB.profile.decodeBonus(e.value) : new Array(14).fill(0); }
  const PVIEWS = {
    profile() {
      const gk = goldenKeys();
      const r1 = pe(136), r2 = pe(137), tok = pe(138), earned = pe(139);
      const rank = r1 && r2 ? Math.floor((r1.value + r2.value) / 10) : 0;
      const bs = bonusStats(); const invested = bs.reduce((a, b) => a + b, 0);
      return sec('Golden Keys & Badass Rank', 'These live in profile.bin and count for every character.') + `<div class="cards">
        ${KEYS.map(([id, n]) => card('🗝️ ' + n, `<div class="row"><div><label class="f">Keys</label><input type="number" min="0" max="255" data-pset2="gk:${id}:keys" value="${gk[id].keys}"></div><div><label class="f">Used</label><input type="number" min="0" max="255" data-pset2="gk:${id}:used" value="${gk[id].used}"></div></div>
          <button class="btn gold small" data-act="gkMax" data-id="${id}" style="margin-top:8px">255 keys, 0 used</button>`, 'Available = keys − used. Max 255 per source.')).join('')}
        ${card('🎖️ Badass Rank', `<div class="big-num">${fmt(rank)}</div><label class="f">Tokens earned</label><input type="number" min="0" max="62530" data-pset2="tokensEarned" value="${earned ? earned.value : 0}"><label class="f">Tokens available to spend</label><input type="number" min="0" data-pset2="tokens" value="${tok ? tok.value : 0}">`, 'Setting tokens earned updates your rank to match. Invested: ' + invested)}
        ${card('📈 Unlock all customizations', '<button class="btn gold" data-act="unlockCust">Unlock every head & skin</button>', 'Every head and skin shows up in the Quick-Change menu for all characters.')}
      </div>
      <div class="group-title">Badass bonus stats (tokens invested)</div>
      <div class="toolbar"><button class="btn small" data-act="bsEven">Spread available tokens evenly</button><button class="btn small red" data-act="bsReset">Refund all</button></div>
      <div class="cards">${BONUS.map((n, i) => `<div class="li"><div class="grow"><div class="ttl">${n}</div><div class="sm">+${(Math.round(Math.pow(bs[i] || 0, 0.75) * 10) / 10)}%</div></div><input type="number" min="0" data-pset2="bs:${i}" value="${bs[i] || 0}" style="width:90px"></div>`).join('')}</div>`;
    },
    pinfo() {
      return sec('File Info') + card('📄 profile.bin', `<div class="stat-row"><span class="muted">Entries</span><b>${st.profile.entries.length}</b></div><div class="stat-row"><span class="muted">Header hash</span><b>${st.profile.sha1ok ? 'OK' : 'Mismatch'}</b></div>
        <button class="btn" data-act="backup" style="margin-top:10px">Download untouched original</button>`);
    },
  };
  function setBonus(list) { const e = pe(143); if (e) e.value = WB.profile.encodeBonus(list.map((x) => Math.max(0, x | 0))); }
  function setTokensEarned(t) {
    t = Math.max(0, Math.min(62530, t | 0));
    const earned = pe(139); const tok = pe(138); const r1 = pe(136), r2 = pe(137);
    const invested = bonusStats().reduce((a, b) => a + b, 0);
    if (earned) earned.value = t;
    if (tok) tok.value = Math.max(0, t - invested);
    const rank = Math.floor(Math.pow(t, 1.8));
    if (r1 && r2) { const half = Math.floor((rank * 10) / 2); r1.value = half; r2.value = half; }
  }

  /* ================= presets ================= */
  const PRESETS = {
    maxMoney() { for (const [i, , , max] of CUR()) st.model.setCurrency(i, max); },
    maxLevel() { st.model.level = maxLevel(); st.model.xp = WB.XP[maxLevel() - 1]; if (bl2()) st.model.opLevel = 10; else st.model.playthroughs = 2; },
    maxSkills() { st.model.skills.forEach((s, i) => st.model.setSkillGrade(i, st.model.skillMax(s.name))); },
    gearLevel() { st.model.setAllLevels(st.model.level + (bl2() ? st.model.opLevel : 0)); },
    maxAmmo() { const m = st.model; m.maxAmmo(); m.setBackpack(39); m.setBank(24); m.setWeaponSlots(4); },
    allTravel() { st.model.fastTravel = st.model.fastTravel.concat(st.model.allStations().map((s) => s.id)); },
    modes() { st.model.playthroughs = 2; if (bl2()) st.model.unlockSlaughterdome(); },
    chal1() { const l = st.model.challenges(); if (l) for (const c of l) if (c.info) { const top = c.info.levels[c.info.levels.length - 1]; if (c.value < top - 1) st.model.setChallenge(c.i, top - 1); } },
  };

  /* ================= events ================= */
  const actions = {
    pick() { $('#fileInput').click(); },
    tab(el) { st.tab = el.dataset.t; st.edit = null; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); },
    preset(el) {
      const p = el.dataset.p;
      if (p === 'all') mutate('☢️ GOD MODE ACTIVATED', () => { ['maxLevel', 'maxMoney', 'maxSkills', 'maxAmmo', 'allTravel', 'modes', 'chal1', 'gearLevel'].forEach((k) => PRESETS[k]()); });
      else mutate('Done!', PRESETS[p]);
    },
    curMax(el) { mutate('Maxed', () => st.model.setCurrency(+el.dataset.i, +el.dataset.max)); },
    setVal(el) { setters[el.dataset.k](el.dataset.v); },
    refundSkills() { mutate('Skills reset, points refunded', () => { const m = st.model; let pts = 0; m.skills.forEach((s, i) => { pts += s.grade; m.setSkillGrade(i, 0); }); m.skillPoints = m.skillPoints + pts; }); },
    invWhere(el) { st.inv.where = el.dataset.w; render(); },
    edit(el) {
      const e = st.model.inventory().find((x) => x.field === +el.dataset.f && x.idx === +el.dataset.i);
      if (e && e.view) openEditor(e, e.view, false);
    },
    forgeNew(el) { const v = st.game.defaultView(el.dataset.b, el.dataset.w === '1', st.model.level); openEditor(null, v, true); },
    closeEdit(el, ev) { if (ev && ev.target.closest('[data-stop]') && !ev.target.closest('.x') && !ev.target.closest('.btn')) return; st.edit = null; renderModal(); },
    closePick(el, ev) { if (ev && ev.target.closest('[data-stop]') && !ev.target.closest('.x')) return; st.picker = null; renderModal(); },
    lvlMe() { st.edit.v.level = st.model.level; st.edit.v.stage = st.model.level; renderModal(); },
    pick_slot(el) { st.picker = { slot: el.dataset.slot, q: '', mode: 0 }; renderModal(); },
    wishEx(el) { const b = $('#wishBox'); if (b) b.value = el.dataset.t; st.forge.wish = el.dataset.t; actions.wish(el); },
    wish(el) {
      const box = $('#wishBox');
      const text = el.dataset.again && st.edit && st.edit.wish ? st.edit.wish : (box ? box.value : st.forge.wish || '');
      if (!text.trim()) return toast('Type what you want first 🙂', true);
      st.forge.wish = text;
      try {
        const lvl = Math.min(127, st.model.level + (bl2() ? st.model.opLevel : 0));
        const r = WB.wish.make(text, st.game, { level: lvl });
        openEditor(null, r.view, true); st.edit.wish = text; renderModal();
        toast('Understood: ' + (r.understood.join(' · ') || 'something cool') + (r.notes.length ? '  ' + r.notes.join(' ') : '') + (r.choices > 1 ? `  (🎲 ${r.choices} matches — Re-roll for another)` : ''));
      } catch (err) { toast(err.message, true); }
    },
    stack(el) {
      const e = st.edit, k = el.dataset.s;
      if (!e.orig) e.orig = JSON.parse(JSON.stringify(e.v.parts));
      e.stacks = e.stacks || [];
      e.stacks = e.stacks.includes(k) ? e.stacks.filter((x) => x !== k) : e.stacks.concat(k);
      e.v.parts = JSON.parse(JSON.stringify(e.orig)); // start from the parts before stacking
      let n = 0; if (e.stacks.length) n = WB.parts.stack(e.v, st.game, e.stacks);
      st.game.autoPrefix(e.v); renderModal();
      toast(e.stacks.length ? `Stacked ${e.stacks.map((x) => WB.parts.STACKS[x].label).join(' + ')} into ${n} slots — tap Apply to keep` : 'Stacking cleared');
    },
    pickAll(el) { st.picker.mode = +el.dataset.v; renderModal(); },
    makeOP(el) {
      const v = st.edit.v; const modded = el.dataset.m === '1';
      const lvl = Math.min(127, st.model.level + (bl2() ? st.model.opLevel : 0));
      v.level = lvl; v.stage = lvl;
      WB.parts.makeOP(v, st.game, modded);
      st.game.autoPrefix(v);
      renderModal(); toast(modded ? '☢️ MODDED — tap Apply to keep it' : '⚡ OP — tap Apply to keep it');
    },
    pickPart(el) { st.edit.v.parts[st.picker.slot] = el.dataset.p || null; st.picker = null; renderModal(); },
    saveItem() {
      const e = st.edit;
      if (mutate('Item updated', () => st.model.replaceSerial(e.entry, st.game.build(fixStage(e), e.it ? e.it.uid : undefined)))) { st.edit = null; render(); }
    },
    addItem(el) {
      const e = st.edit;
      if (mutate('Added to ' + el.dataset.w + '!', () => st.model.addSerial(st.game.build(fixStage(e), WB.randomUid()), el.dataset.w))) { st.edit = null; render(); }
    },
    delItem() { if (!confirm('Delete this item?')) return; const e = st.edit; if (mutate('Deleted', () => st.model.removeEntry(e.entry))) { st.edit = null; render(); } },
    dupItem() { const e = st.edit; if (mutate('Duplicated', () => st.model.addSerial(st.game.build(fixStage(e), WB.randomUid()), e.where))) { st.edit = null; render(); } },
    moveItem() { const e = st.edit; const to = e.where === 'bank' ? 'backpack' : 'bank'; if (mutate('Moved to ' + to, () => st.model.moveEntry(e.entry, to))) { st.edit = null; render(); } },
    favItem() { const e = st.edit; if (mutate('Updated', () => st.model.setMark(e.entry, e.entry.mark === 2 ? 1 : 2))) { st.edit = null; render(); } },
    copyCode() {
      const ser = st.game.build(fixStage(st.edit), 0);
      copy((bl2() ? 'BL2' : 'BLOZ') + '(' + WB.bytes.b64(ser) + ')');
    },
    pt(el) { st.missions.pt = +el.dataset.i; render(); },
    missionsAll() { const pt = st.missions.pt; mutate('All listed missions complete', () => st.model.missions(pt).forEach((x) => st.model.setMissionStatus(pt, x.path, 4))); },
    missionsAdd() {
      const pt = st.missions.pt; let added = 0, skipped = 0;
      if (!confirm('Add every mission you don\'t have yet, marked complete?\n\nThis can skip story unlocks. Keep a backup!')) return;
      mutate(null, () => { const have = new Set(st.model.missions(pt).map((x) => x.path)); for (const p of Object.keys(st.game.D.missions)) if (!have.has(p)) { if (st.model.addMission(pt, p, 4)) added++; else skipped++; } });
      toast(`Added ${added} missions` + (skipped ? ` (${skipped} DLC missions skipped — start them in game first)` : ''));
    },
    missionsCopy() { const pt = st.missions.pt; mutate('Copied to other modes', () => st.model.playthroughList().forEach((_, i) => { if (i !== pt) st.model.copyMissions(pt, i); })); },
    mremove(el) { const pt = st.missions.pt; mutate('Mission removed — you can redo it', () => st.model.removeMission(pt, el.dataset.p)); },
    chalMax() { mutate('All challenges complete', () => { for (const c of st.model.challenges()) if (c.info) st.model.setChallenge(c.i, c.info.levels[c.info.levels.length - 1]); }); },
    chalZero() { if (confirm('Reset all known challenges to 0?')) mutate('Challenges reset', () => { for (const c of st.model.challenges()) if (c.info) st.model.setChallenge(c.i, 0); }); },
    import() {
      const txt = $('#importBox').value; const where = $('#importWhere').value; let ok = 0, bad = 0;
      mutate(null, () => {
        for (const line of txt.split(/\r?\n/)) {
          const m = line.trim().match(/^(BL2|BLOZ)\(([A-Za-z0-9+/=]+)\)$/); if (!m) { if (line.trim() && !line.trim().startsWith(';')) bad++; continue; }
          try {
            let ser = WB.items.rekey(WB.bytes.unb64(m[2]), WB.randomUid());
            const it = WB.items.decode(ser);
            const want = st.model.stageZero ? 0 : it.grade;
            if (it.grade > 1 && it.stage !== want) { it.stage = want; ser = WB.items.encode(it); }
            st.game.view(ser); st.model.addSerial(ser, where); ok++;
          } catch (e) { bad++; }
        }
      });
      toast(`Imported ${ok} item${ok === 1 ? '' : 's'}` + (bad ? `, ${bad} invalid line(s) skipped` : ''), ok === 0 && bad > 0);
    },
    copyExport() { copy($('#exportBox').value); },
    backup() { downloadOriginal(); },
    gkMax(el) { mutate('255 Golden Keys!', () => setGoldenKeys(+el.dataset.id, 255, 0)); },
    unlockCust() { mutate('Every head & skin unlocked', () => { const e = pe(300); if (!e) throw new Error('No customization entry in this profile'); e.value = new Uint8Array(e.value.length).fill(255); }); },
    bsEven() { mutate('Tokens spread out', () => { const bs = bonusStats(); const tok = pe(138); let left = tok ? tok.value : 0; let i = 0; while (left > 0) { bs[i % 14]++; left--; i++; } setBonus(bs); if (tok) tok.value = 0; }); },
    bsReset() { mutate('Tokens refunded', () => { const bs = bonusStats(); const tok = pe(138); const sum = bs.reduce((a, b) => a + b, 0); setBonus(bs.map(() => 0)); if (tok) tok.value += sum; }); },
  };
  function copy(text) {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast('Copied!'), () => {
      const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); toast('Copied!');
    });
  }

  const setters = {
    charName: (v) => mutate('Name changed', () => (st.model.charName = v.slice(0, 30))),
    level: (v) => mutate('Level ' + v, () => (st.model.level = +v)),
    xp: (v) => mutate('XP set', () => (st.model.xp = +v)),
    skillPoints: (v) => mutate('Skill points set', () => (st.model.skillPoints = +v)),
    playthroughs: (v) => mutate('Modes updated', () => (st.model.playthroughs = +v)),
    opLevel: (v) => mutate('OP level ' + v, () => (st.model.opLevel = +v)),
    saveId: (v) => mutate('Slot ID set', () => (st.model.saveId = +v)),
    classPath: (v) => { if (confirm('Change class? Your skills and outfit will reset to the new class.')) mutate('Class changed', () => st.model.changeClass(v)); else render(); },
    backpack: (v) => mutate('Backpack size set', () => st.model.setBackpack(+v)),
    bank: (v) => mutate('Bank size set', () => st.model.setBank(+v)),
    weaponSlots: (v) => mutate('Weapon slots set', () => st.model.setWeaponSlots(+v)),
    head: (v) => mutate('New head!', () => st.model.setOutfit(v, null)),
    skin: (v) => mutate('New skin!', () => st.model.setOutfit(null, v)),
    invQ: (v) => { st.inv.q = v; render(); },
    forgeQ: (v) => { st.forge.q = v; render(); },
    forgeKind: (v) => { st.forge.kind = v; render(); },
    forgeRarity: (v) => { st.forge.rarity = v; render(); },
    missionQ: (v) => { st.missions.q = v; render(); },
    chalQ: (v) => { st.chal.q = v; render(); },
  };
  function prefixed(key, val, el) {
    const [k, a, b] = key.split(':');
    const m = st.model;
    if (k === 'cur') return mutate('Updated', () => m.setCurrency(+a, +val));
    if (k === 'skill') return mutate('Skill set', () => m.setSkillGrade(+a, +val));
    if (k === 'sdu') return mutate('SDU set', () => { m.setBlackMarket(a, +val); const am = m.ammo.find((x) => x.key === a); m.setAmmo(a, am.max[+val], +val); });
    if (k === 'ammo') return mutate('Ammo set', () => { const am = m.ammo.find((x) => x.key === a); m.setAmmo(a, +val, am.level); });
    if (k === 'mstatus') return mutate('Mission updated', () => m.setMissionStatus(st.missions.pt, key.slice(8), +val));
    if (k === 'ft') return mutate(el.checked ? 'Unlocked' : 'Locked', () => { const s = new Set(m.fastTravel); el.checked ? s.add(a) : s.delete(a); m.fastTravel = [...s]; });
    if (k === 'color') return mutate('Color set', () => { const h = val.replace('#', ''); m.setColor(+a, { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) }); });
    if (k === 'veh') { const fam = key.split(':').slice(2).join(':'); return mutate('Vehicle skin set', () => { const cur = m.vehicleSkins(fam); while (cur.length < 2) cur.push('None'); cur[+a] = val; m.setVehicleSkins(fam, cur); }); }
    if (k === 'chal') return mutate('Challenge set', () => m.setChallenge(+a, +val));
    void b;
  }
  function profileSet(key, val) {
    const [k, a, b] = key.split(':');
    if (k === 'gk') return mutate('Golden keys set', () => { const gk = goldenKeys()[+a]; setGoldenKeys(+a, b === 'keys' ? +val : gk.keys, b === 'used' ? +val : gk.used); });
    if (k === 'tokensEarned') return mutate('Badass tokens set', () => setTokensEarned(+val));
    if (k === 'tokens') return mutate('Tokens set', () => { const e = pe(138); if (e) e.value = Math.max(0, +val | 0); });
    if (k === 'bs') return mutate('Bonus stat set', () => { const bs = bonusStats(); bs[+a] = +val; setBonus(bs); });
  }

  document.addEventListener('click', (ev) => {
    const tabBtn = ev.target.closest('[data-tab]');
    if (tabBtn) { st.tab = tabBtn.dataset.tab; render(); return; }
    const el = ev.target.closest('[data-act]'); if (!el) return;
    let act = el.dataset.act;
    if (act === 'pick' && el.dataset.slot) act = 'pick_slot';
    if ((act === 'closeEdit' || act === 'closePick') && el.classList.contains('modal-bg') && ev.target !== el) return;
    if (actions[act]) actions[act](el, ev);
  });
  document.addEventListener('change', (ev) => {
    const el = ev.target;
    if (el.id === 'fileInput') { if (el.files[0]) openFile(el.files[0]); el.value = ''; return; }
    if (el.type === 'search') return; // handled live by keyup
    if (el.dataset.set) { const k = el.dataset.set; const val = el.type === 'checkbox' ? el.checked : el.value; if (setters[k]) setters[k](val, el); else prefixed(k, val, el); return; }
    if (el.dataset.pset2) { profileSet(el.dataset.pset2, el.value); return; }
    if (el.dataset.eset) {
      const k = el.dataset.eset; if (k === 'level') { st.edit.v.level = +el.value; st.edit.v.stage = +el.value; } else st.edit.v[k] = el.value;
      renderModal();
    }
  });
  document.addEventListener('input', (ev) => {
    const el = ev.target;
    if (el.dataset.live) { const o = document.getElementById(el.dataset.live); if (o) o.value = el.value; }
    if (el.dataset.pset === 'q') {
      st.picker.q = el.value; const pos = el.selectionStart; renderModal();
      const n = $('[data-pset="q"]'); if (n) { n.focus(); n.setSelectionRange(pos, pos); }
    }
  });
  // search boxes: live filtering without losing focus
  document.addEventListener('keyup', (ev) => {
    const el = ev.target; if (el.type !== 'search' || !el.dataset.set) return;
    clearTimeout(el._t); el._t = setTimeout(() => { const k = el.dataset.set; const pos = el.selectionStart; setters[k](el.value); const n = $(`[data-set="${k}"]`); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }, 220);
  });
  $('#downloadBtn').addEventListener('click', download);
  $('#undoBtn').addEventListener('click', undo);
  $('#newFileBtn').addEventListener('click', () => $('#fileInput').click());
  document.addEventListener('keydown', (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key === 'z' && st.kind && !/input|textarea/i.test(ev.target.tagName)) { ev.preventDefault(); undo(); }
    if (ev.key === 'Escape') { if (st.picker) st.picker = null; else st.edit = null; renderModal(); }
  });
  // drag & drop anywhere
  ['dragover', 'dragenter'].forEach((t) => document.addEventListener(t, (e) => { e.preventDefault(); const d = $('#drop'); if (d) d.classList.add('over'); }));
  document.addEventListener('dragleave', () => { const d = $('#drop'); if (d) d.classList.remove('over'); });
  document.addEventListener('drop', (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) openFile(f); });
  window.addEventListener('beforeunload', (e) => { if (st.changes) { e.preventDefault(); e.returnValue = ''; } });

  window.WBApp = { st, openFile }; // handy for debugging
  render();
})();
