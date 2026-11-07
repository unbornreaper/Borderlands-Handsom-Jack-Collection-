const { load } = require('./load'); load('js/core.js');
const fs = require('fs'); const WB = globalThis.WB; const assert = require('assert');
const S = (process.env.WB_SAMPLES || '/tmp/claude-0/samples') + '/';
(async () => {
  for (const f of ['bl2-save-editor/tests/Save0001.sav', 'libBL2/TestSaves/Save0001.sav']) {
    const b = new Uint8Array(fs.readFileSync(S + f));
    const { pb, info } = await WB.save.unwrap(b);
    const m = WB.Msg.parse(pb);
    assert(WB.bytes.eq(m.encode(), pb), 'protobuf roundtrip');
    console.log(f, info, pb.length, 'class', m.str(1), 'lvl', m.num(2), 'name', m.msg(19).str(1), 'cur', m.packed(6));
    const out = await WB.save.wrap(pb, info);
    const again = await WB.save.unwrap(out);
    assert(WB.bytes.eq(again.pb, pb) && again.info.sha1ok);
    // check lzo compresses into something decodable and our huffman matches
    console.log('  rewrap ok', b.length, '->', out.length);
    let n = 0, bad = 0;
    for (const fld of [53, 54, 41]) for (const it of m.msgs(fld)) {
      const ser = it.get(1); if (WB.items.isExpansion(ser)) { console.log('  expansion item q=', it.int(2)); continue; }
      const d = WB.items.decode(ser); n++; if (!d.checkOk) bad++;
      const re = WB.items.encode(d);
      if (!WB.bytes.eq(re, ser)) console.log('  reencode differs', WB.bytes.b64(ser), WB.bytes.b64(re));
    }
    console.log('  items', n, 'bad', bad);
  }
  // LZO fuzz
  for (let t = 0; t < 300; t++) {
    const len = Math.floor(Math.random() * 5000);
    const a = new Uint8Array(len); const alpha = 1 + Math.floor(Math.random() * 255);
    for (let i = 0; i < len; i++) a[i] = Math.random() < 0.3 && i > 10 ? a[i - 1 - Math.floor(Math.random() * 10)] : Math.floor(Math.random() * alpha);
    const c = WB.lzo.compress(a); const d = WB.lzo.decompress(c, len);
    assert(WB.bytes.eq(a, d), 'lzo fuzz ' + t);
  }
  console.log('lzo fuzz ok');
  // profile
  const pr = new Uint8Array(fs.readFileSync(S + 'libBL2/TestSaves/profile.bin'));
  const P = WB.profile.parse(pr); console.log('profile sha', P.sha1ok, P.entries.map(e => e.id + ':' + e.type + ':' + (e.value instanceof Uint8Array ? '[' + e.value.length + ']' : e.value)).join(' '));
  const rb = WB.profile.build(P); const P2 = WB.profile.parse(rb);
  assert(P2.sha1ok && JSON.stringify(P2.entries.map(e=>[e.id,String(e.value)])) === JSON.stringify(P.entries.map(e=>[e.id,String(e.value)])));
  console.log('profile roundtrip ok');
})().catch(e => { console.error(e); process.exit(1); });
