/*
 * WBWHO JACKED - plain-English part descriptions.
 * describe(path, slot, isWeapon, game) -> { title, short, long, tags:[{t, good}] }
 * Short = the quick tag ("Less recoil"), long = one sentence for smooth brains.
 */
(function (root) {
  'use strict';
  const WB = root.WB;
  const { last, humanize } = WB.util;

  const MFG = {
    bandit: 'Bandit', scav: 'Scav', dahl: 'Dahl', hyperion: 'Hyperion', jakobs: 'Jakobs', maliwan: 'Maliwan',
    tediore: 'Tediore', tedior: 'Tediore', torgue: 'Torgue', vladof: 'Vladof', anshin: 'Anshin', pangolin: 'Pangolin', atlas: 'Atlas',
  };
  const TRAIT = {
    Bandit: 'huge magazines, a bit less accurate',
    Scav: 'huge magazines, a bit less accurate',
    Dahl: 'low recoil and burst-fire when you aim down sights',
    Hyperion: 'gets MORE accurate the longer you hold the trigger',
    Jakobs: 'hard-hitting, fires as fast as you can pull the trigger',
    Maliwan: 'always elemental, strong elemental effects',
    Tediore: 'you throw it like a grenade when you reload',
    Torgue: 'explosive gyrojet rounds, big damage, slow bullets',
    Vladof: 'very high fire rate',
    Anshin: 'adds health/regeneration bonuses',
    Pangolin: 'big capacity at the cost of health',
    Atlas: 'smart tracking rounds',
  };
  // stat each manufacturer part tends to boost
  const GRIP = { Bandit: ['+Magazine size'], Scav: ['+Magazine size'], Dahl: ['Less recoil'], Hyperion: ['+Accuracy'], Jakobs: ['+Damage'], Maliwan: ['+Elemental chance'], Tediore: ['+Reload speed'], Torgue: ['+Damage'], Vladof: ['+Fire rate'] };
  const BARREL = { Bandit: ['+Damage', '+Magazine size'], Scav: ['+Damage', '+Magazine size'], Dahl: ['+Accuracy', 'Less recoil'], Hyperion: ['+Accuracy'], Jakobs: ['+Damage', '-Fire rate'], Maliwan: ['+Elemental damage'], Tediore: ['+Reload speed'], Torgue: ['++Damage', '-Fire rate'], Vladof: ['+Fire rate'] };
  const SIGHT = { Bandit: ['Low zoom'], Scav: ['Low zoom'], Dahl: ['Less recoil'], Hyperion: ['+Accuracy'], Jakobs: ['+Crit damage'], Maliwan: ['+Elemental chance'], Tediore: ['+Reload speed'], Torgue: ['+Damage'], Vladof: ['+Fire rate'] };
  const STOCK = { Bandit: ['+Magazine size'], Scav: ['+Magazine size'], Dahl: ['Less recoil'], Hyperion: ['+Accuracy'], Jakobs: ['+Crit damage'], Maliwan: ['+Elemental chance'], Tediore: ['+Reload speed'], Torgue: ['+Damage'], Vladof: ['+Fire rate'] };

  const ELEMENT = [
    [/fire|incendiar|flame|burn|hellfire|magma/, 'Fire', 'Sets enemies on fire. Best vs flesh (red health bars).'],
    [/shock|tesla|lightning/, 'Shock', 'Shreds shields fast (blue bars). Weak vs armor.'],
    [/corros|acid|toxic/, 'Corrosive', 'Melts armor (yellow bars) and robots.'],
    [/slag|amp\b/, 'Slag', 'Slagged enemies take double damage from everything else.'],
    [/ice|cryo|frost|blizzard/, 'Cryo', 'Slows and freezes enemies. Frozen enemies take bonus crit damage.'],
    [/explos|boom/, 'Explosive', 'Extra splash damage around the impact.'],
    [/laser/, 'Laser', 'Laser energy damage.'],
  ];
  const ACCESSORY = [
    [/bayonet|blade|rapier|buzzaxe|claw/, ['+Melee damage'], 'A blade on the front. Big bonus to melee hits.'],
    [/laser_double/, ['+Accuracy', 'Double laser sight'], 'Double laser sight: tighter shots.'],
    [/laser_accuracy|bipod1|shroud2|body1_accurate|bodymod_2_acc|accuracy|accurate/, ['+Accuracy'], 'Bullets go where you aim. Less spread.'],
    [/critical|bipod2|crit/, ['+Crit damage'], 'More damage on headshots / weak spots.'],
    [/stability|stabilized|foregrip|verticalgrip/, ['Less recoil', '+Stability'], 'Steadier gun. Less recoil and less kick.'],
    [/mag|shroud1|moonclip|shotgunshell/, ['+Magazine size'], 'More shots before you reload.'],
    [/firerate|fire_rate|rapid|stocktube|tech_3/, ['+Fire rate'], 'Shoots faster.'],
    [/damage|tipcover|clamp_damage|tech_2|mount3/, ['+Damage'], 'Each bullet hits harder.'],
    [/wild/, ['+Damage', 'More spread'], 'Hits harder but sprays more.'],
    [/reload|gripper|stock2/, ['+Reload speed'], 'Reloads faster.'],
    [/swapspeed|handle/, ['+Swap speed'], 'Pull this gun out faster.'],
    [/rocketspeed|bulletspeed|accelerated|box_/, ['+Projectile speed'], 'Bullets/rockets fly faster - easier to hit moving enemies.'],
    [/tech_1/, ['+Magazine size'], 'Small tech mod - extra ammo in the mag.'],
    [/fastlearner/, ['+XP from kills'], 'Luneshine: kills give you more experience.'],
    [/piercing/, ['Bullets pierce'], 'Luneshine: bullets go through enemies.'],
    [/oxygenator/, ['O2 refill'], 'Luneshine: refills your Oz oxygen.'],
    [/hardenup/, ['Damage reduction'], 'Luneshine: you take less damage.'],
    [/punisher/, ['+Damage'], 'Luneshine: bonus damage.'],
    [/safeguard/, ['Shield bonus'], 'Luneshine: protects your shield.'],
    [/serenity/, ['Stability'], 'Luneshine: calmer, steadier weapon.'],
    [/boominator/, ['Explosions'], 'Luneshine: causes explosions on hit.'],
    [/glitch_attachment_(\d+)/, null, null],
    [/none/, ['No accessory'], 'Empty slot - no extra bonus.'],
  ];
  const RARITY = { 1: ['Common', 'white'], 2: ['Uncommon', 'green'], 3: ['Rare', 'blue'], 4: ['Very Rare', 'purple'], 5: ['Legendary', 'orange'], 6: ['Pearlescent', 'cyan'], 7: ['Effervescent', 'rainbow'] };

  function mfgOf(s) { const m = s.match(/(bandit|scav|dahl|hyperion|jakobs|maliwan|tediore|tedior|torgue|vladof|anshin|pangolin|atlas)/i); return m ? MFG[m[1].toLowerCase()] : null; }
  function uniqueName(s) {
    // e.g. SG_Barrel_Jakobs_Sledges -> "Sledges"
    const parts = s.split('_');
    const i = parts.findIndex((p) => mfgOf(p) && p.length > 3);
    const tail = parts.slice(i >= 0 ? i + 1 : parts.length).filter((p) => !/^\d+$/.test(p) && !/^(barrel|body|grip|sight|stock|default)$/i.test(p));
    return tail.length ? humanize(tail.join('')) : null;
  }
  const tag = (t) => ({ t, good: !/^-|less (accur|damage)|more spread/i.test(t) || /less recoil/i.test(t) });

  function describe(path, slot, isWeapon, game) {
    if (!path) return { title: 'Empty', short: 'Nothing', long: 'No part in this slot.', tags: [] };
    const seg = last(path), s = seg.toLowerCase(), folder = (path.split('.')[1] || '').toLowerCase();
    const mfg = mfgOf(seg);
    const nameTable = isWeapon ? game.D.weaponNames : game.D.itemNames;
    const out = { title: humanize(seg.replace(/^(AR|SG|SR|SMG|RL|PS|LS|Pistol|Sniper|Shotgun|Laser|Launcher|L)_/, '')), tags: [], short: '', long: '' };
    const set = (tags, long) => { out.tags = (tags || []).map(tag); out.short = (tags || []).join(', '); out.long = long; return out; };

    if (slot === 'prefix' || slot === 'title') {
      const n = nameTable[path];
      out.title = n ? n.name : humanize(seg);
      return set([slot === 'prefix' ? 'Name prefix' : 'Name'], (slot === 'prefix' ? 'First word of the item name' : 'Main item name') + (n ? ` ("${n.name}")` : '') + '. Only changes the name you see, not the stats.' + (n && n.unique ? ' This is a special/unique name.' : ''));
    }

    if (isWeapon) {
      if (slot === 'material' || /material|mat_/.test(s)) {
        const g = (s.match(/_(\d)(_|$)/) || [])[1];
        const r = RARITY[g];
        return set([r ? r[0] + ' tier' : 'Skin'], `Paint job${mfg ? ' (' + mfg + ')' : ''}${r ? ' and rarity tier: ' + r[0] + ' (' + r[1] + ')' : ''}. Higher tiers carry small stat bonuses; unique materials come with legendary looks.`);
      }
      if (slot === 'elemental' || folder === 'elemental') {
        if (/none/.test(s)) return set(['No element'], 'Plain bullets. No elemental effect.');
        for (const [re, nm, txt] of ELEMENT) if (re.test(s)) return set([nm + ' element'], txt);
      }
      if (slot === 'body') {
        const lvl = (s.match(/_(\d)$/) || [])[1];
        return set([mfg ? mfg + ' frame' : 'Frame'].concat(lvl ? ['Tier ' + lvl] : []), `The gun's frame. Sets the base stats and look${mfg ? '. ' + mfg + ': ' + TRAIT[mfg] : ''}.`);
      }
      if (slot === 'grip') {
        if (/none/.test(s)) return set(['No grip bonus'], 'Default grip.');
        const t = GRIP[mfg] || ['Handling'];
        return set(t, `${mfg || 'Special'} grip. Changes how the gun handles: ${t.join(', ').toLowerCase()}.`);
      }
      if (slot === 'barrel') {
        const uq = uniqueName(seg);
        if (/alien|etech/.test(s)) return set(['E-tech barrel', 'Special projectiles'], `E-tech barrel${uq ? ' (' + uq + ')' : ''}. Fires special energy projectiles (plasma, darts, railgun...) and uses more ammo per shot.`);
        const second = uq && mfgOf(uq.replace(/\s/g, '')) && uq.replace(/\s/g, '').length <= 9 ? mfgOf(uq.replace(/\s/g, '')) : null;
        if (second) {
          const t = BARREL[mfg] || ['Base stats'];
          return set(t, `${mfg}-style barrel built for a ${second} gun: ${t.join(', ').toLowerCase()}. Style: ${TRAIT[mfg]}.`);
        }
        if (uq && !/^(\d|common)/i.test(uq)) {
          const P = game.D.weaponParts[path];
          const titled = P && P.titles && P.titles.map((t) => (game.D.weaponNames[t] || {}).name).filter(Boolean)[0];
          const named = titled || uq;
          return set(['Unique barrel', 'Special ability'], `Signature barrel of the "${named}". This is what gives that legendary/unique gun its special effect. Keep it if you want the red-text ability.`);
        }
        const t = BARREL[mfg] || ['Base stats'];
        return set(t, `${mfg || 'Standard'} barrel: ${t.join(', ').toLowerCase()}${mfg ? '. Style: ' + TRAIT[mfg] : ''}.`);
      }
      if (slot === 'sight') {
        if (/none/.test(s)) return set(['Iron sights', 'Fast aim'], 'No scope: little zoom, fastest aim.');
        const t = SIGHT[mfg] || ['Zoom'];
        return set(['Scope'].concat(t), `${mfg || 'Special'} scope. Changes zoom and adds a small bonus: ${t.join(', ').toLowerCase()}.`);
      }
      if (slot === 'stock') {
        if (/none/.test(s)) return set(['No stock'], 'No stock - a little more recoil.');
        const t = STOCK[mfg] || ['Handling'];
        return set(['Less sway'].concat(t), `${mfg || 'Special'} stock. Steadies the gun and adds: ${t.join(', ').toLowerCase()}.`);
      }
      // accessories (and anything else)
      for (const [re, tags, txt] of ACCESSORY) {
        const m = s.match(re);
        if (!m) continue;
        if (!tags) {
          const d = m[1];
          return set(['Glitch ' + d], `Glitch attachment "${d}". Each digit (0-4) is the strength of one random glitch bonus (fire rate, damage, accuracy, mag size...). 4444 is the strongest.`);
        }
        return set(tags, txt);
      }
      for (const [re, nm, txt] of ELEMENT) if (re.test(s)) return set([nm + ' element'], txt);
      return set([humanize(slot)], humanize(seg) + '.');
    }

    /* ---------------- gear: shields, grenades, class mods, relics, Oz kits ---------------- */
    const grade = (s.match(/grade_?(\d+)/) || [])[1];
    if (folder === 'material' || slot === 'material') {
      const g = (s.match(/material(\d)/) || s.match(/_(\d)(_|$)/) || [])[1];
      const r = RARITY[g];
      return set([r ? r[0] + ' tier' : 'Skin'], `Look and rarity tier${r ? ': ' + r[0] + ' (' + r[1] + ')' : ''}. Higher tier = slightly better numbers.`);
    }
    // shields
    if (/^body\d/.test(s) || (folder === 'body' && slot === 'alpha')) return set(['Shield body', mfg || 'Base'], `Shield core${mfg ? ' (' + mfg + ': ' + (TRAIT[mfg] || 'standard') + ')' : ''}. Sets base capacity.`);
    if (/^battery/.test(s)) return set(['+Capacity'], `${mfg || 'Standard'} battery. Mostly changes how big your shield is.`);
    if (/^capacitor/.test(s)) {
      for (const [re, nm] of ELEMENT) if (re.test(s.replace('capacitor', ''))) return set(['+Recharge', nm + ' resistance'], `${mfg || 'Standard'} capacitor. Recharge speed plus resistance to ${nm.toLowerCase()} damage.`);
      return set(['+Recharge rate', 'Shorter delay'], `${mfg || 'Standard'} capacitor. Shield refills faster / sooner.`);
    }
    if (/spike/.test(s)) return set(['Spike'], 'Hurts enemies that melee you' + elemSuffix(s) + '.');
    if (/roid/.test(s)) return set(['Roid', '+Melee when empty'], 'Huge melee damage bonus while your shield is broken.');
    if (/absorption|aequitas/.test(s)) return set(['Absorb ammo'], 'Chance to catch enemy bullets and turn them into ammo.');
    if (/booster/.test(s)) return set(['Booster orbs'], 'Drops orbs that instantly refill your shield.');
    if (/chimera|adaptive/.test(s)) return set(['Elemental resistance'], 'Resists elemental damage.');
    if (/nova/.test(s)) return set(['Nova blast'], 'Explodes' + elemSuffix(s) + ' when your shield breaks.');
    if (/turtle|juggernaut|pangolin/.test(s)) return set(['Huge capacity', '-Health'], 'Massive shield, lower max health.');
    if (/amp|impact/.test(s)) return set(['Amp shots'], 'Bonus damage on each shot while the shield is full.');
    // grenades
    if (folder === 'payload' || /^payload/.test(s)) {
      const P = [[/mirv/, 'Splits into lots of mini grenades.'], [/singularity/, 'Pulls enemies into the center before exploding.'], [/transfusion/, 'Sucks health from enemies back to you.'], [/areaeffect|cloud/, 'Leaves a lingering elemental cloud.'], [/bouncingbetty|bonny/, 'Pops up and sprays bullets/elements around.'], [/bonuspackage/, 'Releases extra child grenades on explosion.'], [/standard/, 'Classic big boom.'], [/leech/, 'Steals health.'], [/quasar/, 'Black-hole that zaps everyone nearby.']];
      for (const [re, t] of P) if (re.test(s)) return set(['Grenade type'], t);
      return set(['Grenade type'], humanize(seg.replace(/^Payload_/, '')) + ' grenade effect.');
    }
    if (folder === 'delivery' || /^delivery/.test(s)) {
      const P = [[/longbow/, 'Teleports straight to where you aim.'], [/homing/, 'Chases enemies.'], [/sticky/, 'Sticks to enemies.'], [/rubberized/, 'Bounces around.'], [/lob/, 'Normal throw.'], [/fastball/, 'Fast straight throw, huge impact.'], [/magicmissile/, 'Launches seeking missiles.'], [/rollingthunder/, 'Bounces and explodes on every bounce.']];
      for (const [re, t] of P) if (re.test(s)) return set(['Throw style'], t);
      return set(['Throw style'], humanize(seg.replace(/^Delivery_/, '')) + '.');
    }
    if (folder === 'trigger') return set(['Fuse ' + (grade || '')], 'Fuse time. Higher grade = blows up faster.');
    if (folder === 'damage' || /damage_?grade|part_damage\d/.test(s)) return set(['+Damage ' + (grade || '')], 'Grenade damage. Higher grade = bigger boom.');
    if (/damageradius/.test(s)) return set(['Blast radius'], 'How big the explosion is: ' + humanize(seg.replace(/^DamageRadius_/, '')) + '.');
    if (/childcount/.test(s)) return set(['+Child grenades ' + (grade || '')], 'More mini grenades for MIRV/bonus types.');
    if (/statusdamage/.test(s)) return set(['+Element damage ' + (grade || '')], 'Stronger elemental burn/shock/melt.');
    if (folder === 'accessory' && !isWeapon && /accessory_|_grade/.test(s)) {
      for (const [re, nm, txt] of ELEMENT) if (re.test(s)) return set([nm + ' element'], txt);
    }
    // class mods
    if (/^spec_/.test(s)) {
      const sk = [...s.matchAll(/(-)?([abc])s(\d)/g)].map((m) => (m[1] ? '-' : '+') + m[3] + ' to skill ' + m[2].toUpperCase());
      return set(sk.length ? sk : ['Skill bonuses'], 'Which skills get bonus points (A/B/C are the 3 skills this class mod boosts). ' + (/legendary/.test(s) ? 'Legendary: boosts 5 skills!' : ''));
    }
    if (/primarystat|statprimary|statpenalty/.test(s)) return set([/penalty/.test(s) ? 'Stat penalty' : 'Stat bonus'], 'Bonus stats like gun damage, fire rate, shield - digits are the strength (higher = better).');
    // relics / Oz kits
    if (/^enable(first|second|third|fourth)/.test(s)) return set(['Bonus #' + ({ first: 1, second: 2, third: 3, fourth: 4 }[s.match(/enable(first|second|third|fourth)/)[1]])], 'Turns on one of the relic\'s bonus stats.');
    if (/upgrade/.test(s)) return set(['Strength ' + (grade || '')], 'How strong the bonuses are. Higher grade = stronger.');
    if (/rightside_(\w+)/.test(s)) return set(['Ammo bonus'], 'Gives bonus for ' + humanize(seg.replace(/^RightSide_/, '')) + ' (ammo regen / capacity).');
    if (/^body_/.test(s)) return set(['Type: ' + humanize(seg.replace(/^Body_/, ''))], 'Decides what kind of relic/Oz kit this is (' + humanize(seg.replace(/^Body_/, '')) + ').');
    for (const [re, nm, txt] of ELEMENT) if (re.test(s)) return set([nm], txt);
    return set([humanize(slot)], humanize(seg) + '.');
  }
  function elemSuffix(s) { for (const [re, nm] of ELEMENT) if (re.test(s)) return ' with ' + nm.toLowerCase() + ' damage'; return ''; }

  const SLOT_LABEL = {
    body: 'Body', grip: 'Grip', barrel: 'Barrel', sight: 'Sight / Scope', stock: 'Stock', elemental: 'Element', accessory1: 'Accessory', accessory2: 'Accessory 2', material: 'Material / Rarity', prefix: 'Name Prefix', title: 'Name',
    alpha: 'Part A', beta: 'Part B', gamma: 'Part C', delta: 'Part D', epsilon: 'Part E', zeta: 'Part F', eta: 'Part G', theta: 'Part H',
  };
  const GEAR_LABELS = {
    Shield: { alpha: 'Body', beta: 'Battery', gamma: 'Capacitor', delta: 'Special Ability' },
    Grenade: { alpha: 'Grenade Type', beta: 'Throw Style', gamma: 'Fuse', delta: 'Element', epsilon: 'Damage', zeta: 'Blast Radius', eta: 'Child Grenades', theta: 'Element Strength' },
    'Class Mod': { alpha: 'Skill Boosts', beta: 'Stat Bonus', gamma: 'Stat Bonus 2', delta: 'Penalty' },
    Relic: { alpha: 'Bonus 1', beta: 'Bonus 2', gamma: 'Bonus 3', delta: 'Bonus 4', eta: 'Relic Type', theta: 'Strength' },
    'Oz Kit': { alpha: 'Bonus 1', beta: 'Bonus 2', gamma: 'Bonus 3', delta: 'Bonus 4', eta: 'Kit Type', theta: 'Strength' },
  };
  function slotLabel(slot, kind) { return (GEAR_LABELS[kind] && GEAR_LABELS[kind][slot]) || SLOT_LABEL[slot] || slot; }
  /* ---------- "make it OP" ---------- */
  const W = { '++Damage': 9, '+Damage': 7, '+Crit damage': 6, '+Fire rate': 5, '+Elemental damage': 5, '+Elemental chance': 4, '+Magazine size': 3,
    '+Accuracy': 3, 'Less recoil': 3, '+Stability': 2, '+Reload speed': 3, '+Projectile speed': 1, '+Melee damage': 1, 'Bullets pierce': 4, '+Recharge rate': 3, '+Capacity': 4, 'Shorter delay': 2 };
  function score(path, slot, isWeapon, game, focus) {
    if (!path) return -1;
    const d = describe(path, slot, isWeapon, game), s = last(path).toLowerCase();
    let sc = 0;
    for (const t of d.tags) { sc += W[t.t] || 0; if (/^-/.test(t.t)) sc -= 4; if (focus && t.t === focus) sc += 6; }
    const tier = (s.match(/_(\d)(_|$)/) || [])[1]; if (tier && (slot === 'material' || /material|mat_/.test(s))) sc += Number(tier) * 3 + (/legendary/.test(s) ? 3 : 0);
    const g = s.match(/grade_?(\d+)|_c(\d)|_b(\d)|_a(\d)/g);
    if (g) sc += g.map((x) => +x.replace(/\D/g, '')).reduce((a, b) => a + b, 0) * 2;
    if (/legendary/.test(s)) sc += 5;
    if (/none$|_none/.test(s)) sc -= 3;
    return sc;
  }
  const isUnique = (path, slot, game) => /Unique|Special|E-tech/.test(describe(path, slot, true, game).short);
  // focus = which stat each slot should push in modded mode, so bonuses stack instead of repeating
  const FOCUS = { grip: '+Damage', sight: '+Crit damage', stock: '+Fire rate', accessory1: '+Damage', accessory2: '+Crit damage', elemental: '+Damage' };
  function makeOP(v, game, modded) {
    const w = v.isWeapon;
    const slots = w ? WB.items.WEAPON_SLOTS : WB.items.ITEM_SLOTS;
    const valid = game.validParts(v);
    const pools = game.pools[w ? 'weapon' : 'item'];
    const pkg = (p) => (p || '').split('.')[0];
    const home = pkg(v.parts.body || v.parts.barrel || v.parts.alpha || v.balance);
    const used = new Set();
    const allStack = modded && w ? [...new Set(['grip', 'sight', 'stock', 'accessory1', 'accessory2', 'barrel'].flatMap((s) => pools[s]))] : [];
    for (const s of slots) {
      if (s === 'prefix' || s === 'title') continue;
      const cur = v.parts[s];
      if (w && s === 'barrel' && cur && isUnique(cur, s, game)) continue; // keep the legendary ability
      if (w && s === 'body') continue; // body sets the gun's frame; swapping breaks the look
      if (w && s === 'elemental') { if (!cur || /none/i.test(cur)) { const el = (valid.elemental || []).find((p) => !/none/i.test(p)); if (el) v.parts.elemental = el; } continue; }
      let cand;
      if (!modded) cand = valid[s] || [];
      else if (w && FOCUS[s] && s !== 'elemental') cand = allStack; else {
        const same = (pools[s] || []).filter((p) => pkg(p) === pkg(cur) || pkg(p) === home);
        cand = same.length ? same : (valid[s] || []);
      }
      if (!cand.length) continue;
      const sc = (p) => score(p, s, w, game, modded ? FOCUS[s] : null) - (used.has(p) ? 4 : 0) + (pkg(p) === home ? 1 : 0);
      let best = cur, bestSc = cur ? sc(cur) : -99;
      for (const p of cand) { const x = sc(p); if (x > bestSc) { best = p; bestSc = x; } }
      if (best) { v.parts[s] = best; used.add(best); }
    }
    return v;
  }

  WB.parts = { describe, slotLabel, makeOP, score };
})(typeof window !== 'undefined' ? window : globalThis);
