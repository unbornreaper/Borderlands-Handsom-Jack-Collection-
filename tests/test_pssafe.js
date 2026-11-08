// PlayStation-safe mode: never use parts from other guns (PS5 deletes those items).
const { load } = require('./load'); globalThis.window = globalThis;
load('js/core.js'); load('js/jsonsave.js'); load('js/game.js'); load('js/partinfo.js'); load('js/wish.js'); load('data/bl2.js');
const fs = require('fs'), assert = require('assert'); const WB = globalThis.WB;
const dir = process.env.WB_SAMPLES || '/tmp/claude-0/samples';
(async () => {
  const G = new WB.Game(WB_DATA.bl2); G.safeParts = true;
  const { pb, info } = await WB.save.unwrap(new Uint8Array(fs.readFileSync(dir + '/ps4.json.sav')));
  const S = new WB.SaveModel(pb, info, G);
  let n = 0;
  for (const e of S.inventory()) {
    for (const mode of ['op', 'modded', 'stack', 'stack2']) {
      const v = JSON.parse(JSON.stringify({ ...e.view, it: undefined }));
      if (mode === 'op') WB.parts.makeOP(v, G, false); else if (mode === 'modded') WB.parts.makeOP(v, G, true);
      else if (v.isWeapon) WB.parts.stack(v, G, mode === 'stack' ? 'damage' : ['speed', 'recoil']);
      assert.deepStrictEqual(G.invalidSlots(v), [], `${e.view.name} ${mode} used other-gun parts`);
      G.build(v, 1); n++;
    }
  }
  for (const t of ['legendary shock sniper with crazy crit damage, modded', 'smg with a lot of damage', 'god tier rocket launcher', 'best fire grenade']) {
    for (let i = 0; i < 5; i++) { const r = WB.wish.make(t, G, { level: 30 }); assert.deepStrictEqual(G.invalidSlots(r.view), [], t); n++; }
  }
  console.log('PS-safe builds checked:', n);
  // repair of an old modded save
  const old = process.env.WB_DILDO || '/tmp/claude-0/shots/repaired2.sav';
  if (fs.existsSync(old)) {
    const r = await WB.save.unwrap(new Uint8Array(fs.readFileSync(old)));
    const S2 = new WB.SaveModel(r.pb, r.info, G);
    console.log('repairs:', S2.repairs);
    for (const e of S2.inventory()) { assert.deepStrictEqual(G.invalidSlots(e.view), [], 'after repair ' + e.view.name); console.log('  ', e.view.name.padEnd(30), 'L' + e.view.it.grade + '/' + e.view.it.stage, 'chk', e.view.it.checkOk); }
  }
})().catch((e) => { console.error(e); process.exit(1); });
