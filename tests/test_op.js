// "Make it OP" / "MODDED" produce valid, re-readable items.
const { load } = require('./load'); globalThis.window = globalThis;
load('js/core.js'); load('js/jsonsave.js'); load('js/game.js'); load('js/partinfo.js'); load('data/bl2.js');
const fs = require('fs'), assert = require('assert'); const WB = globalThis.WB;
const file = process.argv[2] || (process.env.WB_SAMPLES || '/tmp/claude-0/samples') + '/libBL2/TestSaves/Save0001.sav';
(async () => {
  const G = new WB.Game(WB_DATA.bl2);
  const { pb, info } = await WB.save.unwrap(new Uint8Array(fs.readFileSync(file)));
  const S = new WB.SaveModel(pb, info, G);
  const show = (v) => Object.entries(v.parts).filter(([k]) => !['prefix', 'title'].includes(k)).map(([k, p]) => `${k}=${p ? WB.parts.describe(p, k, v.isWeapon, G).short : '-'}`).join(' | ');
  let n = 0;
  for (const e of S.inventory()) {
    if (!e.view) continue;
    for (const modded of [false, true]) {
      const v = JSON.parse(JSON.stringify({ ...e.view, it: undefined })); v.level = 80; v.stage = 80;
      WB.parts.makeOP(v, G, modded);
      const ser = G.build(v, 12345); const back = G.view(ser);
      assert(back.it.checkOk); assert.strictEqual(back.level, 80);
      for (const k of Object.keys(v.parts)) assert.strictEqual(back.parts[k], v.parts[k], k);
      if (n < 6) console.log((modded ? 'MODDED ' : 'OP     ') + back.name.padEnd(30), show(back));
      n++;
    }
  }
  console.log('items made OP + modded:', n);
})().catch((e) => { console.error(e); process.exit(1); });
