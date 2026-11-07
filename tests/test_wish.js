// "Describe it" weapon maker.
const { load } = require('./load'); globalThis.window = globalThis;
load('js/core.js'); load('js/game.js'); load('js/partinfo.js'); load('js/wish.js'); load('data/bl2.js'); load('data/tps.js');
const assert = require('assert'); const WB = globalThis.WB;
const G = new WB.Game(WB_DATA.bl2), T = new WB.Game(WB_DATA.tps);
const wishes = [
  'legendary shock sniper with crazy crit damage, modded',
  'conference call level 72',
  'a fast corrosive smg that looks like jakobs',
  'jakobs shotgun that one shots everything',
  'unkempt harold',
  'best shield with big capacity',
  'fire grenade',
  'slag pistol low recoil high accuracy',
  'god tier rocket launcher',
  'the bee',
  'purple vladof assault rifle with big mag',
];
let t = Date.now();
for (const text of wishes) {
  const r = WB.wish.make(text, G, { level: 72 });
  const ser = G.build(r.view, 1); const back = G.view(ser); assert(back.it.checkOk);
  console.log(text.padEnd(55), '→', back.name.padEnd(28), back.kind.padEnd(13), back.rarity.padEnd(10), 'L' + back.level, '|', r.understood.join(', '), r.notes.join(' '));
}
const r = WB.wish.make('legendary laser with fire rate', T, { level: 70 }); console.log('TPS:', T.view(T.build(r.view, 1)).name, r.understood.join(', '));
console.log('ms per wish', ((Date.now() - t) / (wishes.length + 1)).toFixed(0));
