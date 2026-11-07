// JSON (decrypted PlayStation) save support.
const { load } = require('./load'); globalThis.window = globalThis;
load('js/core.js'); load('js/jsonsave.js'); load('js/game.js'); load('data/bl2.js');
const fs = require('fs'), assert = require('assert'); const WB = globalThis.WB;
const file = process.argv[2] || (process.env.WB_SAMPLES || '/tmp/claude-0/samples') + '/ps4.json.sav';
(async () => {
  const bytes = new Uint8Array(fs.readFileSync(file));
  const G = new WB.Game(WB_DATA.bl2);
  const { pb, info } = await WB.save.unwrap(bytes);
  const S = new WB.SaveModel(pb, info, G);
  console.log(S.className, S.charName, 'L' + S.level, S.currency.slice(0, 3), 'pt', S.playthroughs, S.exp);
  for (const e of S.inventory()) console.log('  ', e.where, e.equipped ? 'E' : ' ', e.view ? `${e.view.name} [${e.view.kind}] L${e.view.level}` : e.error);
  const same = await S.toFile();
  assert(WB.bytes.eq(same, bytes), 'untouched JSON save must come back byte-identical');
  console.log('untouched: identical ✔');
  // edits
  S.setCurrency(0, 999999999); S.setCurrency(1, 500); S.level = 72; S.opLevel = 10; S.maxAmmo(); S.setBackpack(39);
  S.charName = 'WBWHO'; S.fastTravel = S.allStations().map((s) => s.id);
  S.skills.forEach((s, i) => S.setSkillGrade(i, S.skillMax(s.name)));
  const cat = G.catalog(); const c = cat.find((x) => /Conference Call/.test(x.name));
  S.addSerial(G.build(G.defaultView(c.balance, true, 72)));
  S.setMissionStatus(0, 'GD_Episode17.M_Ep17_KillJack', 4);
  S.addMission(0, 'GD_Z1_ThisTown.M_ThisTown', 4);
  for (const ch of S.challenges()) if (ch.info) S.setChallenge(ch.i, ch.info.levels[ch.info.levels.length - 1] - 1);
  const out = await S.toFile();
  const j = JSON.parse(new TextDecoder().decode(out)), o = JSON.parse(new TextDecoder().decode(bytes));
  assert.deepStrictEqual(Object.keys(j), Object.keys(o), 'same top-level keys in same order');
  for (const k of Object.keys(o)) if (!['currency','player_level','experience_points','resource_data','inventory_data','preferences_data','field16','skill_list','packed_item_data','packed_weapon_data','playthrough_data','black_market_upgrades','field15','playthroughs_completed','last_play_through_index'].includes(k)) assert.deepStrictEqual(j[k], o[k], 'untouched key changed: ' + k);
  assert.deepStrictEqual(Object.keys(j.packed_weapon_data[0]), Object.keys(o.packed_weapon_data[0]));
  console.log(' currency', j.currency.slice(0, 3), 'lvl', j.player_level, j.experience_points, 'name', j.preferences_data.character_name);
  console.log(' items', j.packed_item_data.map((x) => x.quantity + '/' + x.mark).join(' '));
  console.log(' new weapon', j.packed_weapon_data.slice(-1)[0]);
  console.log(' missions', j.playthrough_data[0].mission_data.slice(-2).map((m) => m.mission_asset + ' ' + m.status));
  console.log(' ammo', j.resource_data.map((r) => r.amount).join(','), 'bm', j.black_market_upgrades.join(','), 'ft', j.field16.length);
  const again = await WB.save.unwrap(out); const S2 = new WB.SaveModel(again.pb, again.info, G);
  console.log(' reload:', S2.charName, S2.level, S2.currency.slice(0, 3), 'OP', S2.opLevel, 'pt', S2.playthroughs, S2.inventory().slice(-1)[0].view.name);
})().catch((e) => { console.error(e); process.exit(1); });
