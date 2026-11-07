const { load } = require('./load');
globalThis.window = globalThis;
load('js/core.js'); load('js/game.js'); load('data/bl2.js'); load('data/tps.js');
const fs = require('fs'), assert = require('assert'); const WB = globalThis.WB;
(async () => {
  let t = Date.now(); const G = new WB.Game(WB_DATA.bl2); console.log('game init ms', Date.now() - t);
  t = Date.now(); const cat = G.catalog(); console.log('catalog', cat.length, 'ms', Date.now() - t, cat.filter(c => c.rarity === 'legendary').slice(0, 25).map(c => c.name + '/' + c.kind));
  const GT = new WB.Game(WB_DATA.tps); console.log('tps catalog', GT.catalog().length);
  for (const f of ['bl2-save-editor/tests/Save0001.sav', 'libBL2/TestSaves/Save0001.sav']) {
    const { pb, info } = await WB.save.unwrap(new Uint8Array(fs.readFileSync((process.env.WB_SAMPLES || '/tmp/claude-0/samples') + '/' + f)));
    const S = new WB.SaveModel(pb, info, G);
    console.log(S.className, S.charName, 'lvl', S.level, 'cur', S.currency.slice(0, 5), 'pt', S.playthroughs, 'op', S.opLevel, S.exp);
    for (const e of S.inventory()) console.log('  ', e.where, e.equipped ? 'E' : ' ', e.view ? `${e.view.name} [${e.view.kind}] ${e.view.rarity} L${e.view.level} ${e.view.mfgName}` : e.error);
    // unchanged save must be byte-identical inside
    const out = await S.toFile(); const back = await WB.save.unwrap(out);
    assert(WB.bytes.eq(back.pb, pb), 'untouched model roundtrip identical');
    // edits
    S.setCurrency(0, 999999999); S.setCurrency(1, 500); S.level = 72; S.opLevel = 8; S.maxAmmo(); S.setBackpack(39); S.setBank(24);
    S.charName = 'WBWHO'; S.fastTravel = S.allStations().map(s => s.id); S.unlockSlaughterdome();
    const inv = S.inventory(); const we = inv.find(e => e.view && e.view.isWeapon);
    if (we) { const v = we.view; v.level = 72; S.replaceSerial(we, G.build(v)); }
    const c = cat.find(c => /Conference Call/.test(c.name)) || cat[0]; const nv = G.defaultView(c.balance, c.weapon, 72);
    S.addSerial(G.build(nv)); S.addSerial(G.build(G.defaultView(cat.find(c=>c.kind==='Shield').balance,false,72)), 'bank');
    const ch = S.challenges(); console.log('challenges', ch.length, ch.filter(c => c.info).length);
    for (const c of ch) if (c.info) S.setChallenge(c.i, c.info.levels[c.info.levels.length - 1] - 1);
    const pts = S.playthroughList().length; S.copyMissions(0, 1);
    console.log('add mission', S.addMission(0, 'GD_Z1_ThisTown.M_ThisTown', 4), S.addMission(0, 'GD_Allium_Delivery.M_Delivery', 4));
    const out2 = await S.toFile(); const back2 = await WB.save.unwrap(out2);
    const S2 = new WB.SaveModel(back2.pb, back2.info, G);
    console.log(' after:', S2.charName, S2.level, S2.xp, S2.currency.slice(0, 5), 'op', S2.opLevel, 'pt', S2.playthroughs, S2.slots, S2.blackMarket, 'ft', S2.fastTravel.length);
    console.log(' raw eridium field', WB.Msg.parse(back2.pb).packed(6)[1], 'exp', S2.exp);
    console.log(' new items:', S2.inventory().slice(-3).map(e => e.where + ':' + (e.view ? e.view.name + ' L' + e.view.level : e.error)));
    console.log(' ammo', S2.ammo.map(a => a.key + '=' + a.amount + '/' + a.level).join(' '));
  }
})().catch(e => { console.error(e); process.exit(1); });
