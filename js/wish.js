/*
 * WBWHO JACKED - "Describe it" weapon maker.
 * Reads a plain-English wish ("legendary shock jakobs sniper with crazy crit, modded")
 * and builds an item from the game data. Runs fully offline - no AI service needed.
 */
(function (root) {
  'use strict';
  const WB = root.WB;
  const { last } = WB.util;

  const TYPES = [
    [/\b(pistols?|handguns?|revolvers?)\b/, 'Pistol'], [/\b(smgs?|sub ?machine ?guns?|uzis?)\b/, 'SMG'],
    [/\b(shotguns?|boomsticks?)\b/, 'Shotgun'], [/\b(assault rifles?|\bars?\b|ar15|rifles?|machine ?guns?)\b/, 'AssaultRifle'],
    [/\b(snipers?|sniper rifles?)\b/, 'SniperRifle'], [/\b(launchers?|rockets?|rpgs?|bazookas?)\b/, 'RocketLauncher'],
    [/\b(lasers?)\b/, 'Laser'], [/\b(shields?)\b/, 'Shield'], [/\b(grenades?|nades?)\b/, 'Grenade'],
    [/\b(class ?mods?|coms?)\b/, 'Class Mod'], [/\b(relics?|artifacts?)\b/, 'Relic'], [/\b(oz ?kits?)\b/, 'Oz Kit'],
  ];
  const MFGS = ['bandit', 'scav', 'dahl', 'hyperion', 'jakobs', 'maliwan', 'tediore', 'torgue', 'vladof', 'anshin', 'pangolin'];
  const ELEMENTS = [
    [/\b(fire|incendiary|burn\w*|flame\w*|hot)\b/, 'fire', /fire|incendiar/], [/\b(shock\w*|electric\w*|lightning|zap\w*|tesla)\b/, 'shock', /shock/],
    [/\b(corrosive|acid\w*|toxic|poison\w*|melt\w*)\b/, 'corrosive', /corros/], [/\b(slag\w*|purple goo)\b/, 'slag', /slag/],
    [/\b(explosive|explod\w*|boom\w*|kaboom)\b/, 'explosive', /explos/], [/\b(cryo|ice|icy|frost\w*|freez\w*)\b/, 'cryo', /ice|cryo/],
    [/\b(no element|non.?elemental|plain)\b/, 'none', /none/],
  ];
  const RARITY = [
    [/\b(effervescent|rainbow)\b/, 'effervescent'], [/\b(pearl\w*|cyan)\b/, 'pearl'], [/\b(seraph|pink)\b/, 'seraph'],
    [/\b(glitch)\b/, 'glitch'], [/\b(e-?tech|alien)\b/, 'etech'], [/\b(legendary|legendaries|orange|leggy)\b/, 'legendary'],
    [/\b(purple|epic|very rare)\b/, 'purple'], [/\b(blue|rare)\b/, 'blue'], [/\b(green|uncommon)\b/, 'green'], [/\b(white|common|basic)\b/, 'white'],
  ];
  const STATS = [
    [/\b(damage|dmg|power\w*|hard.?hitting|strong\w*|deadly|one.?shot|kill\w*)\b/, '+Damage'],
    [/\b(crit\w*|head ?shots?|weak ?spots?)\b/, '+Crit damage'],
    [/\b(fire ?rate|fast|rapid|spray|full.?auto|speed)\b/, '+Fire rate'],
    [/\b(accura\w*|precis\w*|laser.?beam|tight)\b/, '+Accuracy'],
    [/\b(recoil|stable|stability|steady|control\w*)\b/, 'Less recoil'],
    [/\b(mag\w*|ammo|clip|bullets)\b/, '+Magazine size'],
    [/\b(reload\w*)\b/, '+Reload speed'],
    [/\b(melee|bayonet|blade|stab\w*)\b/, '+Melee damage'],
    [/\b(elemental|element chance|status)\b/, '+Elemental chance'],
    [/\b(capacity|tank\w*|big shield)\b/, '+Capacity'], [/\b(recharge|regen\w*)\b/, '+Recharge rate'],
  ];
  const MODDED = /\b(mod+ed|op|overpowered|god\w*|broken|insane|crazy|busted|cheat\w*|hacked|max(ed)?|best|strongest|over ?powered)\b/;

  function parse(text, game) {
    const t = ' ' + String(text || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9\- ]+/g, ' ') + ' ';
    const w = { raw: text, stats: [] };
    for (const [re, k] of TYPES) if (re.test(t)) { w.kind = k; break; }
    // manufacturer for looks ("looks like jakobs", "jakobs skin") vs the maker itself
    const look = t.match(/(?:looks? like|skin|paint\w*|colou?r\w*|style)\s+(?:a |an |of )?(\w+)/) || t.match(/(\w+)\s+(?:skin|paint|look\w*|colou?r)/);
    if (look && MFGS.includes(look[1])) w.lookMfg = look[1];
    for (const m of MFGS) if (new RegExp('\\b' + m + '\\b').test(t) && m !== w.lookMfg) { w.mfg = m; break; }
    for (const [re, k, partRe] of ELEMENTS) if (re.test(t)) { w.element = k; w.elementRe = partRe; break; }
    for (const [re, k] of RARITY) if (re.test(t)) { w.rarity = k; break; }
    for (const [re, k] of STATS) if (re.test(t)) w.stats.push(k);
    w.modded = MODDED.test(t);
    const KEY = { '+Damage': 'damage', '+Crit damage': 'crit', '+Fire rate': 'speed', 'Less recoil': 'recoil', '+Accuracy': 'recoil', '+Reload speed': 'reload', '+Magazine size': 'mag', '+Elemental chance': 'element' };
    if (/\b(stack\w*|a lot of|lots of|tons of|so much|max\w*|crazy|insane|no recoil|zero recoil|super)\b/.test(t) && w.stats.length) {
      w.stack = [...new Set(w.stats.map((x) => KEY[x]).filter(Boolean))]; w.modded = true;
    }
    const lv = t.match(/\b(?:level|lvl|lv|l)\s*(\d{1,3})\b/) || t.match(/\b(\d{1,3})\s*(?:level|lvl)\b/);
    if (lv) w.level = Math.min(127, +lv[1]); else if (/\bmax(imum)? level\b/.test(t)) w.level = 'max';
    // a specific item by name ("conference call", "unkempt harold", "the bee")
    const names = nameIndex(game);
    let best = null;
    const STOP = /^(crit|fire|shock|slag|boom|fast|hot|ice|acid|power|rapid|basic|best|bullets|blue|green|purple|orange|pink|god|op|max|mod|modded|damage|level)$/;
    for (const n of names) if (n.key.length >= 3 && !STOP.test(n.key) && t.includes(' ' + n.key + ' ') && (!best || n.key.length > best.key.length)) best = n;
    if (best && w.kind) { const c = game.catalog().find((x) => x.balance === best.balance); if (c && !kindMatch(c, w.kind)) best = null; }
    if (best) w.name = best;
    return w;
  }

  function nameIndex(game) {
    if (game._wishNames) return game._wishNames;
    const out = [];
    for (const c of game.catalog()) {
      const v = game.defaultView(c.balance, c.weapon);
      const title = game.namePart(v.parts.title, c.weapon) || c.name;
      const key = title.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9\- ]+/g, ' ').replace(/\s+/g, ' ').trim();
      if (key && !/^(pistol|shotgun|smg|sniper rifle|assault rifle|rocket launcher|laser|shield|grenade|class mod|relic)$/.test(key)) out.push({ key, balance: c.balance, title });
    }
    return (game._wishNames = out);
  }

  const kindMatch = (c, k) => !k || c.kind === k || (k === 'Relic' && c.kind === 'Oz Kit') || (k === 'Oz Kit' && c.kind === 'Relic');

  function make(text, game, opts = {}) {
    const w = parse(text, game);
    const cat = game.catalog();
    const notes = [];
    let pool;
    if (w.name) {
      pool = cat.filter((c) => c.balance === w.name.balance);
      notes.push('🎯 ' + w.name.title);
    } else {
      const score = (c) => {
        let s = 0;
        if (w.kind) s += kindMatch(c, w.kind) ? 100 : -1000;
        else s += c.weapon ? 10 : -50; // no type said: assume they want a gun
        if (w.mfg) s += c.mfg.toLowerCase() === w.mfg ? 40 : -20;
        if (w.rarity) s += c.rarity === w.rarity ? 50 : -15;
        else s += { legendary: 25, seraph: 20, pearl: 22, effervescent: 22, etech: 12, purple: 10, blue: 5 }[c.rarity] || 0;
        if (w.element && w.element !== 'none') {
          if (w.elementRe.test(c.balance.toLowerCase())) s += 15;
          const vp = game.validParts(game.defaultView(c.balance, c.weapon));
          const els = c.weapon ? vp.elemental || [] : [].concat(vp.delta || [], vp.alpha || [], vp.gamma || []);
          s += els.some((p) => w.elementRe.test(last(p).toLowerCase())) ? 30 : -10;
        }
        return s;
      };
      const scored = cat.map((c) => [score(c), c]).sort((a, b) => b[0] - a[0]);
      const top = scored[0] ? scored[0][0] : 0;
      pool = scored.filter(([s]) => s >= top - 5).map(([, c]) => c);
    }
    if (!pool.length) throw new Error('Couldn\'t find anything like that. Try e.g. "legendary shock sniper with high crit".');
    const pick = pool[Math.floor((opts.random || Math.random)() * pool.length)];
    const charLevel = opts.level || 50;
    const level = w.level === 'max' ? charLevel : (w.level || charLevel);
    const v = game.defaultView(pick.balance, pick.weapon, level);
    v.stage = level;

    // shape the parts around what they asked for
    const slots = v.isWeapon ? ['grip', 'sight', 'stock', 'accessory1', 'accessory2', 'barrel'] : WB.items.ITEM_SLOTS.filter((s) => !['prefix', 'title', 'material'].includes(s));
    if (w.modded) WB.parts.makeOP(v, game, true);
    else WB.parts.makeOP(v, game, false);
    if (w.stats.length && v.isWeapon && w.stack) { WB.parts.stack(v, game, w.stack); }
    else if (w.stats.length) tuneForStats(v, game, w);
    if (v.isWeapon && w.element) setElement(v, game, w, notes);
    if (!v.isWeapon && w.element && w.element !== 'none') setGearElement(v, game, w);
    game.autoPrefix(v);
    if (w.element && w.element !== 'none') fixElementWords(v, game, w);
    if (w.lookMfg) setLook(v, game, w.lookMfg, notes);
    void slots;
    v.name = game.itemName(v); v.kind = game.kind(v); v.rarity = game.rarity(v);

    const understood = [w.rarity, w.mfg, w.element, w.kind, ...w.stats, w.stack ? 'STACKED' : null, w.modded ? 'MODDED' : null, w.lookMfg ? 'looks: ' + w.lookMfg : null, w.level ? 'level ' + level : null].filter(Boolean);
    return { view: v, wish: w, understood, notes, choices: pool.length };
  }

  function tuneForStats(v, game, w) {
    const pools = game.pools[v.isWeapon ? 'weapon' : 'item'];
    const valid = game.validParts(v);
    const slots = v.isWeapon ? ['grip', 'sight', 'stock', 'accessory1', 'accessory2'] : ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta'];
    const all = v.isWeapon && w.modded ? [...new Set(['grip', 'sight', 'stock', 'accessory1', 'accessory2'].flatMap((s) => pools[s]))] : null;
    slots.forEach((s, i) => {
      const focus = w.stats[i % w.stats.length];
      const cand = all || (w.modded ? pools[s] : valid[s]) || [];
      let best = v.parts[s], bestSc = -1e9;
      for (const p of cand) {
        const d = WB.parts.describe(p, s, v.isWeapon, game);
        let sc = WB.parts.score(p, s, v.isWeapon, game, null);
        for (const t of d.tags) if (w.stats.includes(t.t)) sc += t.t === focus ? 20 : 8;
        if (sc > bestSc && game.fits(v, s, p)) { bestSc = sc; best = p; }
      }
      if (best && bestSc > -1e9) v.parts[s] = best;
    });
  }
  function setElement(v, game, w, notes) {
    const valid = game.validParts(v).elemental || [];
    const pool = w.modded ? game.pools.weapon.elemental : valid;
    const pkg = (p) => (p || '').split('.')[0];
    const home = pkg(v.parts.body);
    const match = (list) => list.filter((p) => w.elementRe.test(last(p).toLowerCase()));
    const ok = (l) => match(l).filter((p) => game.fits(v, 'elemental', p));
    const opts = ok(valid).length ? ok(valid) : ok(pool);
    if (!opts.length) { notes.push('⚠️ No ' + w.element + ' version of this item exists' + (w.modded ? '' : ' (try adding "modded")')); return; }
    v.parts.elemental = opts.find((p) => pkg(p) === home) || opts[0];
  }
  // keep the name honest: no "Corrosive" prefix on a fire item
  function fixElementWords(v, game, w) {
    const ELW = /fire|incendiar|flame|shock|electr|corros|caustic|slag|explos|ice|cryo|frost/i;
    const N = v.isWeapon ? game.D.weaponNames : game.D.itemNames;
    const nm = (p) => ((N[p] || {}).name || last(p) || '');
    const pre = v.parts.prefix;
    if (pre && ELW.test(nm(pre)) && !w.elementRe.test(nm(pre).toLowerCase()) && !w.elementRe.test(last(pre).toLowerCase())) {
      const vp = game.validParts(v).prefix || [];
      const good = vp.find((p) => w.elementRe.test((nm(p) + last(p)).toLowerCase()) && game.fits(v, 'prefix', p)) || vp.find((p) => !ELW.test(nm(p) + last(p)) && game.fits(v, 'prefix', p));
      v.parts.prefix = good || null;
    }
    // avoid "Incendiary Incendiary Transfusion"
    const p2 = v.parts.prefix, t2 = v.parts.title;
    if (p2 && t2 && nm(t2).toLowerCase().includes(nm(p2).toLowerCase())) {
      const vp = game.validParts(v).prefix || [];
      v.parts.prefix = vp.find((p) => !ELW.test(nm(p) + last(p)) && !nm(t2).toLowerCase().includes(nm(p).toLowerCase()) && game.fits(v, 'prefix', p)) || null;
    }
  }
  function setGearElement(v, game, w) {
    const valid = game.validParts(v);
    for (const s of ['delta', 'alpha', 'gamma', 'beta']) {
      const opts = (valid[s] || []).filter((p) => w.elementRe.test(last(p).toLowerCase()) && game.fits(v, s, p));
      if (opts.length) {
        v.parts[s] = opts.sort((a, b) => WB.parts.score(b, s, false, game) - WB.parts.score(a, s, false, game))[0];
        const vp = game.validParts(v);
        const ELW = /fire|incendiar|shock|corros|slag|explos|ice|cryo/;
        const tl = (vp.title || []).filter((p) => w.elementRe.test(last(p).toLowerCase()));
        if (tl.length) v.parts.title = tl[0];
        else if (v.parts.title && ELW.test(last(v.parts.title).toLowerCase())) { const plain = (vp.title || []).find((p) => !ELW.test(last(p).toLowerCase())); if (plain) v.parts.title = plain; }
        return;
      }
    }
  }
  function setLook(v, game, mfg, notes) {
    const key = v.isWeapon ? 'weapon' : 'item';
    const mats = game.pools[key].material.filter((p) => last(p).toLowerCase().includes(mfg) && game.fits(v, 'material', p));
    if (!mats.length) { notes.push('⚠️ No ' + mfg + ' paint job for this'); return; }
    const pkg = (p) => (p || '').split('.')[0];
    const home = pkg(v.parts.material || v.parts.body);
    const tier = (p) => +((last(p).match(/_(\d)/) || [0, 0])[1]);
    v.parts.material = mats.filter((p) => pkg(p) === home).sort((a, b) => tier(b) - tier(a))[0] || mats.sort((a, b) => tier(b) - tier(a))[0];
  }

  WB.wish = { parse, make };
})(typeof window !== 'undefined' ? window : globalThis);
