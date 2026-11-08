// Edited / new items must keep the save's own "game stage" pattern (PS4 saves use 0).
const { load } = require('./load'); globalThis.window = globalThis;
load('js/core.js'); load('js/jsonsave.js'); load('js/game.js'); load('js/partinfo.js'); load('js/wish.js'); load('data/bl2.js');
const fs = require('fs'), assert = require('assert'); const WB = globalThis.WB;
const dir = process.env.WB_SAMPLES || '/tmp/claude-0/samples';
(async () => {
  const G = new WB.Game(WB_DATA.bl2);
  for (const [f, expectZero] of [['ps4.json.sav', true], ['libBL2/TestSaves/Save0001.sav', false]]) {
    const { pb, info } = await WB.save.unwrap(new Uint8Array(fs.readFileSync(dir + '/' + f)));
    const S = new WB.SaveModel(pb, info, G);
    assert.strictEqual(S.stageZero, expectZero, f + ' stage pattern');
    for (const e of S.inventory()) {
      const v = JSON.parse(JSON.stringify({ ...e.view, it: undefined }));
      // untouched rebuild must be byte-identical
      assert(WB.bytes.eq(G.build(v, e.view.it.uid), e.serial), f + ' rebuild ' + e.view.name);
      // OP keeps the pattern
      WB.parts.makeOP(v, G, true); v.level = 40; S.applyStage(v);
      const d = WB.items.decode(G.build(v, 1));
      assert.strictEqual(d.stage, expectZero ? 0 : 40, 'OP stage');
    }
    const w = WB.wish.make('legendary shock sniper with crazy crit', G, { level: 30 }).view; S.applyStage(w);
    assert.strictEqual(WB.items.decode(G.build(w, 2)).stage, expectZero ? 0 : 30, 'new item stage');
    console.log(f, 'ok — stageZero =', S.stageZero);
  }
})().catch((e) => { console.error(e); process.exit(1); });
