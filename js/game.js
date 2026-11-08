/*
 * WBWHO JACKED - game knowledge + save model.
 * Game: turns packed item serials into names/parts using the asset tables.
 * SaveModel: friendly getters/setters on top of the raw protobuf.
 */
(function (root) {
  'use strict';
  const WB = root.WB;
  const { Msg } = WB;

  const last = (p) => (p ? p.slice(p.lastIndexOf('.') + 1) : '');
  const humanize = (s) => String(s || '')
    .replace(/^(GD_|D_)/, '')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ').trim();
  WB.util = { last, humanize };

  const W_SLOTS = WB.items.WEAPON_SLOTS, I_SLOTS = WB.items.ITEM_SLOTS;

  class Game {
    constructor(D) {
      this.D = D;
      this.key = D.key;
      this.index = {}; // set -> group -> path -> {sub, asset}
      for (const [sid, groups] of Object.entries(D.alm.sets)) {
        const g2 = this.index[sid] = {};
        for (const [g, subs] of Object.entries(groups)) {
          const m = g2[g] = new Map();
          subs.forEach(([pkg, assets], sub) => (assets || []).forEach((a, asset) => { const k = pkg + '.' + a; if (!m.has(k)) m.set(k, { sub, asset }); }));
        }
      }
      this.setIds = Object.keys(D.alm.sets).map(Number).sort((a, b) => a - b);
      this._wbCache = new Map(); this._ibCache = new Map();
      this._buildPools();
    }

    /* ---------- asset references ---------- */
    lookup(group, ref, set) {
      if (!ref) return null;
      const s = this.D.alm.sets[ref.useSet ? set : 0];
      const lib = s && s[group] && s[group][ref.sub];
      if (!lib || !lib[1] || ref.asset >= lib[1].length) return null;
      return lib[0] + '.' + lib[1][ref.asset];
    }
    inSet(group, path, set) { const g = this.index[set] && this.index[set][group]; return g ? g.get(path) : undefined; }
    // pick the item's asset set so that every path can be encoded
    chooseSet(pairs, preferred) {
      const ok = (S) => pairs.every(([g, p]) => !p || this.inSet(g, p, 0) || this.inSet(g, p, S));
      if (preferred !== undefined && ok(preferred)) return preferred;
      for (const S of this.setIds) if (ok(S)) return S;
      return null;
    }
    ref(group, path, set) {
      if (!path) return null;
      const a = this.inSet(group, path, 0); if (a) return { sub: a.sub, asset: a.asset, useSet: 0 };
      const b = this.inSet(group, path, set); if (b) return { sub: b.sub, asset: b.asset, useSet: 1 };
      throw new Error('Part not available in this game: ' + path);
    }

    /* ---------- balances ---------- */
    weaponBalance(path) {
      if (this._wbCache.has(path)) return this._wbCache.get(path);
      const chain = []; let cur = path, guard = 0;
      while (cur && this.D.weaponBalance[cur] && guard++ < 20) { chain.unshift(cur); cur = this.D.weaponBalance[cur].base; }
      const res = { type: null, mfgs: [], parts: {} };
      for (const s of W_SLOTS.slice(0, 9)) res.parts[s] = [];
      for (const b of chain) {
        const B = this.D.weaponBalance[b];
        if (B.weapon_type) res.type = B.weapon_type;
        if (B.manufacturers) res.mfgs = B.manufacturers.slice();
        const PL = B.parts && this.D.weaponBalanceParts[B.parts];
        if (!PL) continue;
        if (PL.weapon_type) res.type = PL.weapon_type;
        for (const s of W_SLOTS.slice(0, 9)) this._addList(res.parts[s], PL[s], PL.mode);
      }
      // empty slots fall back to the weapon type's lists
      const T = res.type && this.D.weaponTypes[res.type];
      if (T) for (const s of W_SLOTS.slice(0, 9)) {
        if (!res.parts[s].length && T[s + '_parts']) res.parts[s] = (this.D.weaponPartLists[T[s + '_parts']] || []).slice();
      }
      this._wbCache.set(path, res);
      return res;
    }
    itemBalance(path) {
      if (this._ibCache.has(path)) return this._ibCache.get(path);
      const chain = []; let cur = path, guard = 0;
      while (cur && this.D.itemBalance[cur] && guard++ < 20) { chain.unshift(cur); cur = this.D.itemBalance[cur].base; }
      const res = { item: null, items: [], mfgs: [], parts: {} };
      for (const s of I_SLOTS.slice(0, 9)) res.parts[s] = [];
      for (const b of chain) {
        const B = this.D.itemBalance[b];
        if (B.item) res.item = B.item;
        if (B.items) res.items = B.items.slice();
        if (B.manufacturers) res.mfgs = B.manufacturers.slice();
        const PL = B.parts && this.D.itemBalanceParts[B.parts];
        if (!PL) continue;
        if (PL.item) res.item = PL.item;
        for (const s of I_SLOTS.slice(0, 9)) this._addList(res.parts[s], PL[s], PL.mode);
      }
      if (!res.item && res.items.length) res.item = res.items[0];
      const I = res.item && this.D.items[res.item];
      if (I) for (const s of I_SLOTS.slice(0, 9)) {
        if (!res.parts[s].length && I[s + '_parts']) res.parts[s] = (this.D.itemPartLists[I[s + '_parts']] || []).slice();
      }
      this._ibCache.set(path, res);
      return res;
    }
    _addList(dest, src, mode) {
      if (mode === 'Additive') { if (src) dest.push(...src.filter(Boolean)); }
      else if (mode === 'Selective') { if (src) { dest.length = 0; dest.push(...src.filter(Boolean)); } }
      else { dest.length = 0; if (src) dest.push(...src.filter(Boolean)); }
    }

    /* ---------- pools of every part ever used per slot ("any weapon" modding) ---------- */
    _buildPools() {
      const wp = {}, ip = {};
      for (const s of W_SLOTS) wp[s] = new Set();
      for (const s of I_SLOTS) ip[s] = new Set();
      for (const b of Object.keys(this.D.weaponBalance)) {
        const r = this.weaponBalance(b);
        for (const s of W_SLOTS.slice(0, 9)) r.parts[s].forEach((p) => wp[s].add(p));
      }
      for (const T of Object.values(this.D.weaponTypes)) for (const s of W_SLOTS.slice(0, 9)) {
        if (T[s + '_parts']) (this.D.weaponPartLists[T[s + '_parts']] || []).forEach((p) => wp[s].add(p));
      }
      for (const b of Object.keys(this.D.itemBalance)) {
        const r = this.itemBalance(b);
        for (const s of I_SLOTS.slice(0, 9)) r.parts[s].forEach((p) => ip[s].add(p));
      }
      for (const n of Object.keys(this.D.weaponNames)) {
        const l = last(n).toLowerCase();
        (l.startsWith('title') ? wp.title : wp.prefix).add(n);
      }
      for (const n of Object.keys(this.D.itemNames)) {
        const l = last(n).toLowerCase();
        (l.startsWith('title') ? ip.title : ip.prefix).add(n);
      }
      const fin = (o, g) => { for (const k of Object.keys(o)) o[k] = [...o[k]].filter((p) => this.inAnySet(g, p)).sort(); return o; };
      this.pools = { weapon: fin(wp, 'WeaponParts'), item: fin(ip, 'ItemParts') };
    }
    inAnySet(g, p) { return this.setIds.some((s) => this.inSet(g, p, s)); }

    /* ---------- item views ---------- */
    view(serial) {
      const it = WB.items.decode(serial);
      const w = it.isWeapon, set = it.set;
      const v = { it, isWeapon: w, set, level: it.grade, stage: it.stage };
      v.type = this.lookup(w ? 'WeaponTypes' : 'ItemTypes', it.type, set);
      v.balance = this.lookup('BalanceDefs', it.balance, set);
      v.manufacturer = this.lookup('Manufacturers', it.manufacturer, set);
      v.parts = {};
      for (const s of w ? W_SLOTS : I_SLOTS) v.parts[s] = this.lookup(w ? 'WeaponParts' : 'ItemParts', it.parts[s], set);
      v.name = this.itemName(v);
      v.kind = this.kind(v);
      v.rarity = this.rarity(v);
      v.mfgName = last(v.manufacturer) || '—';
      return v;
    }
    build(v, uid) {
      const w = v.isWeapon;
      const pg = w ? 'WeaponParts' : 'ItemParts';
      const pairs = [[w ? 'WeaponTypes' : 'ItemTypes', v.type], ['BalanceDefs', v.balance], ['Manufacturers', v.manufacturer]];
      for (const s of w ? W_SLOTS : I_SLOTS) pairs.push([pg, v.parts[s]]);
      const set = this.chooseSet(pairs, v.set);
      if (set === null) throw new Error('These parts come from DLC sets that cannot be combined in one item.');
      const it = {
        version: this.D.alm.version, isWeapon: w,
        uid: uid !== undefined ? uid : (v.it ? v.it.uid : randomUid()),
        set,
        type: this.ref(pairs[0][0], v.type, set),
        balance: this.ref('BalanceDefs', v.balance, set),
        manufacturer: this.ref('Manufacturers', v.manufacturer, set),
        grade: clampLevel(v.level), stage: clampLevel(v.stage !== undefined ? v.stage : v.level),
        parts: {},
      };
      for (const s of w ? W_SLOTS : I_SLOTS) it.parts[s] = this.ref(pg, v.parts[s], set);
      return WB.items.encode(it);
    }
    // pick the name prefix the game would show for the chosen parts
    autoPrefix(v) {
      const T = v.isWeapon ? this.D.weaponParts : this.D.itemParts, N = v.isWeapon ? this.D.weaponNames : this.D.itemNames;
      const order = v.isWeapon ? ['accessory1', 'accessory2', 'elemental', 'grip', 'barrel', 'sight', 'stock', 'body'] : ['delta', 'alpha', 'beta', 'gamma', 'epsilon', 'eta', 'theta', 'zeta'];
      for (const s of order) {
        const P = v.parts[s] && T[v.parts[s]];
        const pre = P && (P.prefixes || []).find((x) => N[x] && this.fits(v, 'prefix', x));
        if (pre) { v.parts.prefix = pre; return; }
      }
    }
    // can this part go in this slot without mixing two different DLC asset sets?
    fits(v, slot, path) {
      const w = v.isWeapon, pg = w ? 'WeaponParts' : 'ItemParts';
      const pairs = [[w ? 'WeaponTypes' : 'ItemTypes', v.type], ['BalanceDefs', v.balance], ['Manufacturers', v.manufacturer]];
      for (const s of w ? W_SLOTS : I_SLOTS) pairs.push([pg, s === slot ? path : v.parts[s]]);
      return this.chooseSet(pairs) !== null;
    }
    // slots holding a part this item normally can't have (names excluded)
    invalidSlots(v) {
      const valid = this.validParts(v); const out = [];
      for (const [slot, p] of Object.entries(v.parts)) {
        if (!p || slot === 'prefix' || slot === 'title') continue;
        if (valid[slot] && valid[slot].length && !valid[slot].includes(p)) out.push(slot);
      }
      return out;
    }
    namePart(path, weapon) {
      if (!path) return null;
      const t = weapon ? this.D.weaponNames : this.D.itemNames;
      return t[path] ? t[path].name : null;
    }
    itemName(v) {
      const w = v.isWeapon;
      if (!w && v.type && this.D.items[v.type] && this.D.items[v.type].has_full_name) return this.D.items[v.type].name;
      const pre = this.namePart(v.parts.prefix, w), title = this.namePart(v.parts.title, w);
      let base = title;
      if (!base) base = w ? (this.D.weaponTypes[v.type] || {}).name : (this.D.items[v.type] || {}).name;
      if (!base) base = humanize(last(v.balance || v.type || 'Unknown item'));
      return pre ? pre + ' ' + base : base;
    }
    kind(v) {
      if (v.isWeapon) return (this.D.weaponTypes[v.type] || {}).type || 'Weapon';
      const t = (this.D.items[v.type] || {}).type || 'Item';
      return { GrenadeMod: 'Grenade', Artifact: this.key === 'tps' ? 'Oz Kit' : 'Relic', ClassMod: 'Class Mod', CrossDLCClassMod: 'Class Mod', UsableCustomizationItem: 'Skin/Head', UsableItem: 'Usable', MissionItem: 'Mission Item' }[t] || t;
    }
    rarity(v) {
      const b = (v.balance || '') + ' ' + (v.parts.material || '');
      const s = b.toLowerCase();
      if (/glitch/.test(s)) return 'glitch';
      if (/effervescent|_rainbow|_7_/.test(s)) return 'effervescent';
      if (/pearl|_6_/.test(s)) return 'pearl';
      if (/seraph|gd_aster_raidweapons|_seraph/.test(s)) return 'seraph';
      if (/alien|etech|e_tech/.test(s)) return 'etech';
      if (/legendary|_5_/.test(s)) return 'legendary';
      if (/_4_|veryrare/.test(s)) return 'purple';
      if (/_3_|rare|unique/.test(s)) return 'blue';
      if (/_2_|uncommon/.test(s)) return 'green';
      return 'white';
    }
    // which parts fit this item, per slot
    validParts(v) {
      const w = v.isWeapon;
      const res = {};
      if (w) {
        const B = v.balance ? this.weaponBalance(v.balance) : null;
        for (const s of W_SLOTS.slice(0, 9)) res[s] = B ? B.parts[s] : [];
        const T = this.D.weaponTypes[v.type] || {};
        const titles = new Set(), prefixes = new Set();
        // titles/prefixes from the actual parts first (that's where legendary names live)
        const order = ['barrel', 'body', 'grip', 'accessory1', 'accessory2', 'elemental', 'sight', 'stock', 'material'];
        for (const s of order) for (const p of [v.parts[s]].concat(res[s])) {
          const P = p && this.D.weaponParts[p]; if (!P) continue;
          (P.titles || []).forEach((x) => titles.add(x)); (P.prefixes || []).forEach((x) => prefixes.add(x));
        }
        (T.titles || []).forEach((x) => titles.add(x)); (T.prefixes || []).forEach((x) => prefixes.add(x));
        res.title = [...titles]; res.prefix = [...prefixes];
      } else {
        const B = v.balance ? this.itemBalance(v.balance) : null;
        for (const s of I_SLOTS.slice(0, 9)) res[s] = B ? B.parts[s] : [];
        const I = this.D.items[v.type] || {};
        const titles = new Set(), prefixes = new Set();
        for (const s of I_SLOTS.slice(0, 9)) for (const p of [v.parts[s]].concat(res[s])) {
          const P = p && this.D.itemParts[p]; if (!P) continue;
          (P.titles || []).forEach((x) => titles.add(x)); (P.prefixes || []).forEach((x) => prefixes.add(x));
        }
        (I.titles || []).forEach((x) => titles.add(x)); (I.prefixes || []).forEach((x) => prefixes.add(x));
        res.title = [...titles]; res.prefix = [...prefixes];
      }
      return res;
    }
    // every buildable balance (for the "create new item" picker)
    catalog() {
      if (this._catalog) return this._catalog;
      const out = [];
      for (const b of Object.keys(this.D.weaponBalance)) {
        const r = this.weaponBalance(b);
        if (!r.type || !r.mfgs.length || !this.inAnySet('BalanceDefs', b)) continue;
        const v = this.defaultView(b, true); if (!v) continue;
        out.push({ balance: b, weapon: true, name: v.name, kind: v.kind, rarity: v.rarity, mfg: last(r.mfgs[0]) });
      }
      for (const b of Object.keys(this.D.itemBalance)) {
        const r = this.itemBalance(b);
        if (!r.item || !this.inAnySet('BalanceDefs', b)) continue;
        const v = this.defaultView(b, false); if (!v) continue;
        if (v.kind === 'Usable' || v.kind === 'Mission Item') continue;
        out.push({ balance: b, weapon: false, name: v.name, kind: v.kind, rarity: v.rarity, mfg: last(r.mfgs[0] || '') });
      }
      out.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
      return (this._catalog = out);
    }
    defaultView(balance, weapon, level = 50) {
      const r = weapon ? this.weaponBalance(balance) : this.itemBalance(balance);
      const v = { isWeapon: weapon, balance, type: weapon ? r.type : r.item, manufacturer: r.mfgs[0] || null, level, stage: level, parts: {} };
      for (const s of (weapon ? W_SLOTS : I_SLOTS).slice(0, 9)) v.parts[s] = r.parts[s].length ? r.parts[s][r.parts[s].length - 1] : null;
      const vp = this.validParts(v);
      v.parts.title = vp.title[0] || null; v.parts.prefix = vp.prefix[0] || null;
      this.autoPrefix(v);
      v.name = this.itemName(v); v.kind = this.kind(v); v.rarity = this.rarity(v);
      return v;
    }
  }
  function randomUid() { return (Math.random() * 0x100000000) >>> 0 || 1; }
  function clampLevel(l) { l = Math.round(Number(l)); if (!Number.isFinite(l)) l = 1; return Math.max(0, Math.min(127, l)); }
  WB.Game = Game;
  WB.randomUid = randomUid;

  /* =================== SAVE MODEL =================== */
  const XP = [0, 358, 1241, 2850, 5376, 8997, 13886, 20208, 28126, 37798, 49377, 63016, 78861, 97061, 117757, 141092, 167206, 196238, 228322, 263595, 302190, 344238, 389873, 439222, 492414, 549578, 610840, 676325, 746158, 820463, 899363, 982980, 1071435, 1164850, 1263343, 1367034, 1476041, 1590483, 1710476, 1836137, 1967582, 2104926, 2248285, 2397772, 2553501, 2715586, 2884139, 3059273, 3241098, 3429728, 3625271, 3827840, 4037543, 4254491, 4478792, 4710556, 4949890, 5196902, 5451701, 5714393, 5985086, 6263885, 6550897, 6846227, 7149982, 7462266, 7783184, 8112840, 8451340, 8798786, 9155282, 9520931, 9895837, 10280103, 10673830, 11077120, 11490077, 11912801, 12345393, 12787955];
  WB.XP = XP;

  const AMMO = {
    rifle: ['D_Resources.AmmoResources.Ammo_Combat_Rifle', 'D_Resourcepools.AmmoPools.Ammo_Combat_Rifle_Pool', 'Assault Rifle', [280, 420, 560, 700, 840, 980, 1120, 1260]],
    pistol: ['D_Resources.AmmoResources.Ammo_Repeater_Pistol', 'D_Resourcepools.AmmoPools.Ammo_Repeater_Pistol_Pool', 'Pistol', [200, 300, 400, 500, 600, 700, 800, 900]],
    launcher: ['D_Resources.AmmoResources.Ammo_Rocket_Launcher', 'D_Resourcepools.AmmoPools.Ammo_Rocket_Launcher_Pool', 'Rocket Launcher', [12, 15, 18, 21, 24, 27, 30, 33]],
    shotgun: ['D_Resources.AmmoResources.Ammo_Combat_Shotgun', 'D_Resourcepools.AmmoPools.Ammo_Combat_Shotgun_Pool', 'Shotgun', [80, 100, 120, 140, 160, 180, 200, 220]],
    smg: ['D_Resources.AmmoResources.Ammo_Patrol_SMG', 'D_Resourcepools.AmmoPools.Ammo_Patrol_SMG_Pool', 'SMG', [360, 540, 720, 900, 1080, 1260, 1440, 1620]],
    sniper: ['D_Resources.AmmoResources.Ammo_Sniper_Rifle', 'D_Resourcepools.AmmoPools.Ammo_Sniper_Rifle_Pool', 'Sniper Rifle', [48, 60, 72, 84, 96, 108, 120, 132]],
    grenade: ['D_Resources.AmmoResources.Ammo_Grenade_Protean', 'D_Resourcepools.AmmoPools.Ammo_Grenade_Protean_Pool', 'Grenade', [3, 4, 5, 6, 7, 8, 9, 10]],
    laser: ['D_Resources.AmmoResources.Ammo_Combat_Laser', 'D_Resourcepools.AmmoPools.Ammo_Combat_Laser_Pool', 'Laser', [500, 620, 740, 860, 980, 1100, 1220, 1340]],
  };
  WB.AMMO = AMMO;
  const f32 = new DataView(new ArrayBuffer(4));
  const toF = (u) => { f32.setUint32(0, u >>> 0, true); return f32.getFloat32(0, true); };
  const fromF = (f) => { f32.setFloat32(0, f, true); return f32.getUint32(0, true); };
  const td = new TextDecoder('utf-8');
  const s2 = (b) => (b instanceof Uint8Array ? td.decode(b) : String(b));

  // BL2 capstones / 1-point skills (best effort by internal name)
  const ONE_POINT = new Set(['thoughtlock', 'res', 'ruin', 'doubleup', 'nuke', 'gemini', 'bore', 'b0re', 'deathblossom', 'deathbl0ss0m', 'manymustfall', 'moneyshot', 'keepfiring', 'comeatmebro', 'nokilllikeoverkill', 'thebetterhalf', 'makeitsparkle', 'robotrampage', 'withclaws', 'releasethebeast', 'ravingretribution', 'elementalempathy', 'scorn', 'phaselock', 'sabertooth', 'deceptionstrike', 'deathmark', 'buzzaxerampage']);

  class SaveModel {
    constructor(pb, info, game) {
      this.root = Msg.parse(pb);
      this.info = info; this.game = game; this.D = game.D;
      this.tps = game.key === 'tps';
      this._extractExpansion();
      this.stageZero = this._detectStageZero();
      this.repairs = this._repairLimits();
    }
    // PS4/PS5 saves keep the item's second level field ("game stage") at 0; PC saves copy the level.
    // New and edited items must follow the save's own pattern or the game throws them away.
    _detectStageZero() {
      let zero = 0, total = 0;
      for (const x of this.root.f) {
        if (x.n !== 53 && x.n !== 54 && x.n !== 41) continue;
        try { const it = WB.items.decode(Msg.parse(x.v).get(1)); if (it.grade > 1) { total++; if (it.stage === 0) zero++; } } catch (e) { /* skip */ }
      }
      if (this.info.scheme === 'json') return true; // PlayStation: always stage 0 (game drops items otherwise)
      return total > 0 ? zero * 2 > total : false;
    }
    // fix values left by older versions of the editor that break the game
    _repairLimits() {
      const notes = [];
      const sl = this.slots, bm = this.root.packed(36);
      if (sl.backpack > 39 || (bm[7] || 0) > 9) { this.setBackpack(Math.min(39, sl.backpack)); notes.push('backpack size ' + sl.backpack + ' → ' + this.slots.backpack); }
      if (this.stageZero) {
        // PlayStation: items with a non-zero game stage, or above the character's level, vanish in game
        let fixed = 0; const cap = this.level;
        for (const x of this.root.f) {
          if (x.n !== 53 && x.n !== 54 && x.n !== 41) continue;
          const m = Msg.parse(x.v); const ser = m.get(1);
          try {
            if (WB.items.isExpansion(ser)) continue;
            const it = WB.items.decode(ser);
            if (it.stage === 0 && it.grade <= cap) continue;
            if (it.grade <= 1 && it.stage <= 1) continue; // skins/level-1 items are stored that way by the game
            it.stage = 0; it.grade = Math.min(it.grade, cap);
            m.set(1, WB.items.encode(it), 2); x.v = m.encode(); fixed++;
          } catch (e) { /* leave unknown items alone */ }
        }
        if (fixed) notes.push(fixed + ' item' + (fixed > 1 ? 's' : '') + ' re-stored the PlayStation way (so they show up in game)');
        let swapped = 0;
        for (const x of this.root.f) {
          if (x.n !== 53 && x.n !== 54 && x.n !== 41) continue;
          const m = Msg.parse(x.v); const ser = m.get(1);
          try {
            if (WB.items.isExpansion(ser)) continue;
            const v = this.game.view(ser); const bad = this.game.invalidSlots(v);
            if (!bad.length) continue;
            const valid = this.game.validParts(v);
            for (const s of bad) {
              const opts = valid[s].filter((p) => this.game.fits(v, s, p));
              const sc = (p) => (WB.parts && WB.parts.score ? WB.parts.score(p, s, v.isWeapon, this.game) : 0);
              v.parts[s] = opts.sort((a, b) => sc(b) - sc(a))[0] || valid[s][0];
            }
            this.game.autoPrefix(v); v.set = undefined; // let it fall back to the plain base-game set if it can
            m.set(1, this.game.build(v, v.it.uid), 2); x.v = m.encode(); swapped++;
          } catch (e) { /* leave it */ }
        }
        if (swapped) notes.push(swapped + ' modded item' + (swapped > 1 ? 's' : '') + ' given their own legit parts (PS5 deletes guns with other guns\' parts)');
      }
      if (sl.bank > 24 || (bm[8] || 0) > 9) { this.setBank(Math.min(24, sl.bank)); notes.push('bank size ' + sl.bank + ' → ' + this.slots.bank); }
      return notes;
    }
    applyStage(v) { v.stage = this.stageZero ? 0 : v.level; return v; }
    static detectGame(pb) {
      const m = Msg.parse(pb); const cls = m.str(1);
      const tps = ['GD_Gladiator', 'GD_Enforcer', 'GD_Lawbringer', 'GD_Prototype', 'Quince_Doppel', 'Crocus_Baroness'].some((p) => cls.startsWith(p));
      return tps ? 'tps' : 'bl2';
    }
    /* ---------- Gearbox's hidden "expansion" items ---------- */
    _extractExpansion() {
      this.exp = {}; // id -> {v1, v2}
      const keep = [];
      for (const fld of this.root.f) {
        if (fld.n === 53) {
          const m = Msg.parse(fld.v);
          const q = m.int(2);
          if (q < 0 && WB.items.isExpansion(m.get(1))) {
            const d = -q, id = d & 0xFF;
            if (id >= 1 && id <= 5) { this.exp[id] = { v1: (d >> 8) & 0x7FFFFF, v2: m.int(4) }; continue; }
          }
        }
        keep.push(fld);
      }
      this.root.f = keep;
    }
    _injectExpansion(root) {
      const add = (id, v1, v2 = 0) => {
        const m = new Msg([]);
        m.set(1, WB.items.HACK_SERIAL.slice(), 2);
        m.set(2, -(id | (Math.max(0, Math.min(v1, 0x7FFFFF)) << 8)), 0);
        m.set(3, 0, 0); m.set(4, v2, 0);
        const pos = root.f.findIndex((x) => x.n > 53);
        const lastItem = root.f.map((x) => x.n).lastIndexOf(53);
        const at = lastItem >= 0 ? lastItem + 1 : (pos < 0 ? root.f.length : pos);
        root.f.splice(at, 0, { n: 53, t: 2, v: m.encode() });
      };
      // eridium/moonstone above 99 and playthrough info go into the hidden items, like the game does
      const cur = root.packed(6);
      if (cur.length > 1 && cur[1] > 99) { add(1, cur[1] - 99); cur[1] = 99; root.setPacked(6, cur); }
      const done = root.num(7), lastPT = root.num(49);
      if (done > 1 && lastPT >= 1 && lastPT <= 0x800000) { add(2, lastPT - 1, (done - 1) & 0xFF); root.set(49, 1, 0); root.set(7, 1, 0); }
      for (const id of [3, 4, 5]) if (this.exp[id]) add(id, this.exp[id].v1, this.exp[id].v2);
    }
    async toFile() {
      const copy = new Msg(this.root.f.map((x) => ({ ...x })));
      // merge eridium/playthroughs back into plain fields first so _injectExpansion can split them
      const cur = copy.packed(6);
      if (this.exp[1]) { cur[1] = (cur[1] || 0) + this.exp[1].v1; copy.setPacked(6, cur); }
      if (this.exp[2]) { copy.set(49, copy.num(49) + this.exp[2].v1, 0); copy.set(7, copy.num(7) + this.exp[2].v2, 0); }
      this._injectExpansion(copy);
      return WB.save.wrap(copy.encode(), this.info);
    }
    // eridium & playthroughs as the game sees them
    get currency() {
      const c = this.root.packed(6);
      while (c.length < 6) c.push(0);
      if (this.exp[1]) c[1] += this.exp[1].v1;
      return c;
    }
    set currency(arr) { delete this.exp[1]; this.root.setPacked(6, arr.map((x) => Math.max(0, Math.min(2147483647, Math.round(x) || 0)))); }
    setCurrency(i, v) { const c = this.currency; while (c.length <= i) c.push(0); c[i] = v; this.currency = c; }

    get playthroughs() { return this.root.num(7) + (this.exp[2] ? this.exp[2].v2 : 0); }
    set playthroughs(v) { if (this.exp[2]) { this.root.set(49, this.root.num(49) + this.exp[2].v1, 0); delete this.exp[2]; } this.root.set(7, Math.max(0, Math.min(2, v)), 0); }
    get opLevel() { return this.exp[4] ? this.exp[4].v1 : 0; }
    set opLevel(v) { v = Math.max(0, Math.min(10, v | 0)); if (v === 0) delete this.exp[4]; else this.exp[4] = { v1: v, v2: 0 }; if (v > 0 && this.playthroughs < 2) this.playthroughs = 2; }

    /* ---------- character ---------- */
    get classPath() { return this.root.str(1); }
    get className() { const c = this.D.classes[this.classPath]; return c ? c.name + ' (' + c.class + ')' : humanize(last(this.classPath)); }
    get charName() { const ui = this.root.msg(19); return ui ? ui.str(1) : ''; }
    set charName(v) { const ui = this.root.msg(19) || new Msg([]); ui.setStr(1, v); this.root.set(19, ui.encode(), 2); }
    get colors() {
      const ui = this.root.msg(19); if (!ui) return [];
      return [2, 3, 4].map((n) => { const c = ui.msg(n); return c ? { a: c.num(1), r: c.num(2), g: c.num(3), b: c.num(4) } : null; });
    }
    setColor(i, rgb) {
      const ui = this.root.msg(19) || new Msg([]);
      const c = ui.msg(2 + i) || new Msg([]);
      c.set(1, 255, 0); c.set(2, rgb.r, 0); c.set(3, rgb.g, 0); c.set(4, rgb.b, 0);
      ui.set(2 + i, c.encode(), 2); this.root.set(19, ui.encode(), 2);
    }
    get level() { return this.root.num(2, 1); }
    set level(l) {
      const max = this.tps ? 70 : 80; l = Math.max(1, Math.min(max, l | 0));
      this.root.set(2, l, 0);
      const xp = this.xp, lo = XP[l - 1], hi = XP[l] === undefined ? Infinity : XP[l];
      if (xp < lo || xp >= hi) this.root.set(3, lo, 0);
    }
    get xp() { return this.root.num(3); }
    set xp(v) { this.root.set(3, Math.max(0, v | 0), 0); let l = 1; while (l < XP.length && XP[l] <= v) l++; const max = this.tps ? 70 : 80; this.root.set(2, Math.min(l, max), 0); }
    get skillPoints() { return this.root.num(4); }
    set skillPoints(v) { this.root.set(4, Math.max(0, v | 0), 0); }
    get saveId() { return this.root.num(20); }
    set saveId(v) { this.root.set(20, Math.max(0, v | 0), 0); }
    get playTime() { return this.root.num(25); }
    changeClass(path) {
      const C = this.D.classes[path]; if (!C) return;
      this.root.setStr(1, path);
      let pkg = 0;
      for (const [k, v] of Object.entries(this.D.dlc)) if (C.dlc && C.dlc.split('.')[0] === k.split('.')[0]) pkg = v.id;
      this.root.set(44, C.dlc ? 1 : 0, 0); this.root.set(45, pkg, 0);
      this.root.remove(8); // the game rebuilds the skill tree for the new class
      const usage = C.class === 'Gunzerker' ? 'Mercenary' : C.class === 'Commando' ? 'Soldier' : C.class;
      const heads = this.customizationsFor('Head', usage), skins = this.customizationsFor('Skin', usage);
      const pick = (list) => (list.find((x) => /default/i.test(x.path)) || list[0] || {}).path;
      this.setOutfit(pick(heads), pick(skins));
    }

    /* ---------- skills ---------- */
    get skills() { return this.root.msgs(8).map((m) => ({ name: m.str(1), grade: m.num(2), points: m.num(3), slot: m.int(4) })); }
    setSkillGrade(i, g) {
      const list = this.root.all(8); const m = Msg.parse(list[i].v);
      m.set(2, Math.max(0, Math.min(255, g | 0)), 0); list[i].v = m.encode();
    }
    skillMax(name) {
      const s = this.D.skills && this.D.skills[name]; if (s && s.max_grade) return s.max_grade;
      const parts = name.split('.'), leaf = (parts[parts.length - 1] || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (/^skill/.test(leaf) || leaf === (parts[1] || '').toLowerCase()) return 1; // action skill
      return ONE_POINT.has(leaf) ? 1 : 5;
    }
    skillInfo(name) { const s = this.D.skills && this.D.skills[name]; return { name: (s && s.name) || humanize(last(name).replace(/^Skill_/, '')), desc: s && s.description ? s.description.replace(/\[-?skill\]/g, '').replace(/<[^>]+>/g, '') : '' }; }

    /* ---------- ammo / SDUs ---------- */
    get bmKeys() { return ['rifle', 'pistol', 'launcher', 'shotgun', 'smg', 'sniper', 'grenade', 'backpack', 'bank'].concat(this.tps ? ['laser'] : []); }
    get blackMarket() { const v = this.root.packed(36); const o = {}; this.bmKeys.forEach((k, i) => (o[k] = v[i] || 0)); return o; }
    setBlackMarket(key, lvl) {
      const v = this.root.packed(36); while (v.length < this.bmKeys.length) v.push(0);
      v[this.bmKeys.indexOf(key)] = Math.max(0, Math.min(key === 'backpack' || key === 'bank' ? 9 : 7, lvl | 0));
      this.root.setPacked(36, v);
    }
    get ammo() {
      const res = this.root.msgs(11);
      return this.bmKeys.filter((k) => AMMO[k]).map((k) => {
        const m = res.find((r) => r.str(1) === AMMO[k][0]);
        return { key: k, label: AMMO[k][2], amount: m ? Math.round(toF(m.get(3, 0))) : 0, level: m ? m.num(4) : 0, max: AMMO[k][3] };
      });
    }
    setAmmo(key, amount, level) {
      const A = AMMO[key]; const all = this.root.all(11);
      let entry = all.find((x) => Msg.parse(x.v).str(1) === A[0]);
      const m = entry ? Msg.parse(entry.v) : new Msg([]);
      m.setStr(1, A[0]); m.setStr(2, A[1]); m.set(3, fromF(amount), 5); m.set(4, level | 0, 0);
      if (entry) entry.v = m.encode();
      else { const list = all.map((x) => x.v).concat([m.encode()]); this.root.setAll(11, list); }
    }
    maxAmmo() {
      for (const k of this.bmKeys) if (AMMO[k]) this.setBlackMarket(k, 7);
      for (const a of this.ammo) this.setAmmo(a.key, a.max[7], 7);
    }
    get slots() { const s = this.root.msg(13) || new Msg([]); return { backpack: s.num(1, 12), weapons: s.num(2, 2), flourished: s.num(3, 0), bank: this.root.num(56, 6) }; }
    // capped at the game's real limits: oversized backpacks/banks can make the game wipe the inventory
    setBackpack(size) {
      const sdu = Math.max(0, Math.min(9, Math.ceil(((size | 0) - 12) / 3)));
      const s = this.root.msg(13) || new Msg([]); s.set(1, 12 + sdu * 3, 0); this.root.set(13, s.encode(), 2);
      this.setBlackMarket('backpack', sdu);
    }
    setBank(size) {
      const sdu = Math.max(0, Math.min(9, Math.ceil(((size | 0) - 6) / 2)));
      this.root.set(56, 6 + sdu * 2, 0); this.setBlackMarket('bank', sdu);
    }
    setWeaponSlots(n) {
      n = Math.max(2, Math.min(4, n | 0));
      const s = this.root.msg(13) || new Msg([]); s.set(2, n, 0); if (s.num(3) > n - 2) s.set(3, n - 2, 0); this.root.set(13, s.encode(), 2);
    }

    /* ---------- inventory ---------- */
    // field 54 = weapons, 53 = items (gear), 41 = bank
    inventory() {
      const out = [];
      const td2 = (fld) => this.root.f.forEach((x, idx) => {
        if (x.n !== fld) return;
        const m = Msg.parse(x.v); const ser = m.get(1);
        let v = null, err = null;
        try { v = this.game.view(ser); } catch (e) { err = e.message; }
        out.push({ field: fld, idx, msg: m, serial: ser, view: v, error: err,
          where: fld === 41 ? 'bank' : 'backpack',
          equipped: fld === 54 ? m.num(2) > 0 : fld === 53 ? m.num(3) === 1 : false,
          slot: fld === 54 ? m.num(2) : 0,
          mark: fld === 54 ? m.num(3) : fld === 53 ? m.num(4) : 0 });
      });
      td2(54); td2(53); td2(41);
      return out;
    }
    _entryIndex(entry) { return this.root.f.findIndex((x, i) => i === entry.idx && x.n === entry.field); }
    replaceSerial(entry, serial) {
      const i = this._entryIndex(entry); if (i < 0) throw new Error('item moved');
      const m = Msg.parse(this.root.f[i].v); m.set(1, serial, 2); this.root.f[i].v = m.encode();
    }
    removeEntry(entry) { const i = this._entryIndex(entry); if (i >= 0) this.root.f.splice(i, 1); }
    addSerial(serial, where = 'backpack') {
      const raw = WB.items.decrypt(serial);
      const isWeapon = (raw[0] & 0x80) !== 0;
      let fld, m = new Msg([]);
      m.set(1, serial, 2);
      if (where === 'bank') fld = 41;
      else if (isWeapon) { fld = 54; m.set(2, 0, 0); m.set(3, 1, 0); }
      else { fld = 53; m.set(2, 1, 0); m.set(3, 0, 0); m.set(4, 1, 0); }
      const lastPos = this.root.f.map((x) => x.n).lastIndexOf(fld);
      let at = lastPos >= 0 ? lastPos + 1 : this.root.f.findIndex((x) => x.n > fld);
      if (at < 0) at = this.root.f.length;
      this.root.f.splice(at, 0, { n: fld, t: 2, v: m.encode() });
    }
    moveEntry(entry, where) { const ser = entry.serial; this.removeEntry(entry); this.addSerial(ser, where); }
    setMark(entry, mark) {
      const i = this._entryIndex(entry); const m = Msg.parse(this.root.f[i].v);
      if (entry.field === 54) m.set(3, mark, 0); else if (entry.field === 53) m.set(4, mark, 0);
      this.root.f[i].v = m.encode();
    }
    setEquipped(entry, on, slot) {
      const i = this._entryIndex(entry); const m = Msg.parse(this.root.f[i].v);
      if (entry.field === 54) m.set(2, on ? (slot || 1) : 0, 0); else if (entry.field === 53) m.set(3, on ? 1 : 0, 0);
      this.root.f[i].v = m.encode();
    }
    setAllLevels(level) {
      for (const x of this.root.f) {
        if (x.n !== 53 && x.n !== 54 && x.n !== 41) continue;
        const m = Msg.parse(x.v); const ser = m.get(1);
        try {
          const it = WB.items.decode(ser);
          if (it.grade <= 1 && it.stage <= 1) continue; // level-1 items (skins etc.) stay as they are
          it.grade = level; it.stage = this.stageZero ? 0 : level;
          m.set(1, WB.items.encode(it), 2); x.v = m.encode();
        } catch (e) { /* leave unknown items alone */ }
      }
    }

    /* ---------- missions ---------- */
    playthroughList() { return this.root.msgs(18); }
    missions(pt) {
      const P = this.root.msgs(18)[pt]; if (!P) return [];
      return P.msgs(3).map((m) => ({ path: m.str(1), status: m.num(2), info: this.D.missions[m.str(1)] || null, msg: m }));
    }
    _writePT(pt, P) { const list = this.root.all(18); list[pt].v = P.encode(); }
    setMissionStatus(pt, path, status) {
      const P = this.root.msgs(18)[pt]; if (!P) return;
      const all = P.all(3);
      for (const x of all) { const m = Msg.parse(x.v); if (m.str(1) === path) { m.set(2, status, 0); if (status === 4) m.set(8, 0, 0); x.v = m.encode(); } }
      this._writePT(pt, P);
    }
    removeMission(pt, path) {
      const P = this.root.msgs(18)[pt]; if (!P) return;
      P.f = P.f.filter((x) => !(x.n === 3 && Msg.parse(x.v).str(1) === path));
      if (P.str(2) === path) P.setStr(2, 'None');
      this._writePT(pt, P);
    }
    addMission(pt, path, status) {
      const P = this.root.msgs(18)[pt]; if (!P) return false;
      const existing = P.msgs(3);
      if (existing.some((m) => m.str(1) === path)) { this.setMissionStatus(pt, path, status); return true; }
      // copy DLC flags from a mission of the same package, or treat as base game
      const pkg = path.split('.')[0];
      const prefix = pkg.split('_').slice(0, 2).join('_');
      let dlcFrom = null;
      for (const p of this.root.msgs(18)) for (const m of p.msgs(3)) if (m.str(1).split('.')[0].split('_').slice(0, 2).join('_') === prefix) dlcFrom = m;
      const isBase = /^GD_(Episode|Z1|Z2|Z3|Plot|Main|Ma_|Co_|Cork|Moon|Ep|Side|Sub)/.test(pkg) || /^GD_Z\d/.test(pkg);
      if (!dlcFrom && !isBase && !/^GD_Episode/.test(pkg)) return false;
      const m = new Msg([]);
      m.setStr(1, path); m.set(2, status, 0);
      m.set(3, dlcFrom ? dlcFrom.num(3) : 0, 0); m.set(4, dlcFrom ? dlcFrom.num(4) : 0, 0);
      m.set(5, new Uint8Array(0), 2); m.set(6, 0, 0); m.set(7, new Uint8Array(0), 2); m.set(8, 0, 0); m.set(10, 1, 0); m.set(11, this.level, 0);
      const all = P.all(3).map((x) => x.v).concat([m.encode()]);
      P.setAll(3, all);
      this._writePT(pt, P);
      return true;
    }
    copyMissions(fromPT, toPT) {
      const list = this.root.all(18); if (!list[fromPT] || !list[toPT]) return;
      const src = Msg.parse(list[fromPT].v), dst = Msg.parse(list[toPT].v);
      dst.setAll(3, src.all(3).map((x) => x.v)); dst.set(2, src.get(2, new Uint8Array(0)), 2);
      list[toPT].v = dst.encode();
    }

    /* ---------- fast travel ---------- */
    get fastTravel() { return this.root.all(16).map((x) => s2(x.v)); }
    set fastTravel(list) { this.root.setAll(16, [...new Set(list)]); }
    allStations() {
      return Object.entries(this.D.travel)
        .filter(([, t]) => t.$type === 'FastTravelStationDefinition' && t.resource_name && !t.send_only)
        .map(([path, t]) => ({ path, id: t.resource_name, name: t.station_display_name || t.display_name || t.resource_name, dlc: t.dlc_expansion ? ((this.D.dlcContents[t.dlc_expansion] || {}).name || 'DLC') : 'Base Game' }));
    }

    /* ---------- outfits / vehicles ---------- */
    customizationsFor(type, usage) {
      return Object.entries(this.D.customizations).filter(([, c]) => c.type === type && (c.usage || []).includes(usage)).map(([path, c]) => ({ path, name: c.name || humanize(last(path)) })).sort((a, b) => a.name.localeCompare(b.name));
    }
    get usage() {
      const C = this.D.classes[this.classPath]; if (!C) return null;
      const map = { Gunzerker: 'Mercenary', Commando: 'Soldier', Fragtrap: 'Prototype' };
      return map[C.class] || C.class;
    }
    get outfit() { const w = this.root.all(35).map((x) => s2(x.v)); return { head: w[0] || 'None', skin: w[4] || 'None', list: w }; }
    setOutfit(head, skin) {
      const w = this.root.all(35).map((x) => s2(x.v)); while (w.length < 5) w.push(w.length === 0 || w.length === 4 ? 'None' : '0');
      if (head) w[0] = head; if (skin) w[4] = skin;
      this.root.setAll(35, w);
    }
    vehicleFamilies() {
      return this.tps
        ? [['GD_Globals.VehicleSpawnStation.VehicleFamily_MoonBuggy', 'Moon Buggy', 'MoonBuggy'], ['GD_Globals.VehicleSpawnStation.VehicleFamily_StingRay', 'Stingray', 'StingRay']]
        : [['GD_Globals.VehicleSpawnStation.VehicleFamily_Runner', 'Runner', 'Runner'], ['GD_Globals.VehicleSpawnStation.VehicleFamily_BanditTechnical', 'Bandit Technical', 'BanditTech'], ['GD_OrchidPackageDef.Vehicles.VehicleFamily_Hovercraft', 'Sandskiff (Pirate DLC)', 'Hovercraft'], ['GD_SagePackageDef.Vehicles.VehicleFamily_FanBoat', 'Fan Boat (Hammerlock DLC)', 'FanBoat']];
    }
    vehicleSkins(family) { const m = this.root.msgs(57).find((x) => x.str(1) === family); return m ? m.all(2).map((x) => s2(x.v)) : []; }
    setVehicleSkins(family, skins) {
      const list = this.root.all(57);
      const keep = list.map((x) => x.v).filter((v) => Msg.parse(v).str(1) !== family);
      const real = skins.filter((s) => s && s !== 'None');
      if (real.length) { const m = new Msg([]); m.setStr(1, family); m.setAll(2, skins.map((s) => s || 'None')); keep.push(m.encode()); }
      this.root.setAll(57, keep);
    }

    /* ---------- challenges (inside the stats blob) ---------- */
    challenges() {
      const b = this.root.get(15); if (!(b instanceof Uint8Array) || b.length < 10) return null;
      const L = this.info.little, dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
      const size = dv.getUint32(4, L), count = dv.getUint16(8, L);
      if (size + 8 !== b.length || count * 12 !== size - 2) return null;
      const known = new Map((this.D.challenges || []).map((c) => [c.id, c]));
      const out = [];
      for (let i = 0; i < count; i++) {
        const o = 10 + i * 12;
        const id = dv.getUint16(o, L), total = dv.getUint32(o + 3, L), prev = dv.getUint32(o + 8, L);
        out.push({ i, id, total, prev, value: total - prev, info: known.get(id) || null });
      }
      return out;
    }
    setChallenge(i, value) {
      const b = this.root.get(15).slice(); const L = this.info.little, dv = new DataView(b.buffer);
      const o = 10 + i * 12; const prev = dv.getUint32(o + 8, L);
      dv.setUint32(o + 3, Math.min(0xFFFFFFFF, prev + Math.max(0, value)), L);
      this.root.set(15, b, 2);
    }

    /* ---------- misc unlocks ---------- */
    unlockSlaughterdome() {
      for (const n of [23, 24]) { const v = this.root.packed(n); if (!v.includes(1)) v.push(1); this.root.setPacked(n, v); }
    }
  }
  WB.SaveModel = SaveModel;
})(typeof window !== 'undefined' ? window : globalThis);
