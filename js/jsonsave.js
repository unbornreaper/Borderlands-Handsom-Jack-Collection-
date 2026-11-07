/*
 * WBWHO JACKED - support for JSON-format saves (decrypted PS4 / PS5 saves exported by
 * save tools as readable JSON instead of the binary .sav format).
 *
 * The JSON is turned into the same protobuf structure the rest of the editor uses, and on
 * save it is written back as JSON with the original key names, key order and spacing.
 * Keys the editor doesn't understand are copied through untouched.
 */
(function (root) {
  'use strict';
  const WB = root.WB;
  const { Msg } = WB;

  const ENUMS = {
    MS: ['MS_NotStarted', 'MS_Active', 'MS_RequiredObjectivesComplete', 'MS_ReadyToTurnIn', 'MS_Complete', 'MS_Failed'],
    MARK: ['Trash', 'Standard', 'Favorite'],
    QS: ['None', 'Up', 'Down', 'Left', 'Right'],
  };
  // [jsonKey, fieldNumber, type, subSchema]
  const COL = [['A', 1, 'int'], ['R', 2, 'int'], ['G', 3, 'int'], ['B', 4, 'int']];
  const S = {
    top: [
      ['player_class', 1, 'str'], ['player_level', 2, 'int'], ['experience_points', 3, 'int'], ['general_skill_points', 4, 'int'],
      ['special_skill_points', 5, 'int'], ['currency', 6, 'packed'], ['playthroughs_completed', 7, 'int'],
      ['skill_list', 8, 'msgs', 'skill'], ['resource_data', 11, 'msgs', 'res'], ['inventory_data', 13, 'msg', 'inv'],
      ['field15', 15, 'bytes'], ['field16', 16, 'strs'], ['field17', 17, 'str'], ['playthrough_data', 18, 'msgs', 'pt'],
      ['preferences_data', 19, 'msg', 'pref'], ['save_game_id', 20, 'int'], ['field21', 21, 'int'], ['field22', 22, 'int'],
      ['field23', 23, 'packed'], ['field24', 24, 'packed'], ['total_play_time', 25, 'int'], ['last_saved_date', 26, 'str'],
      ['applied_customizations', 35, 'strs'], ['black_market_upgrades', 36, 'packed'], ['active_mission_number', 37, 'int'],
      ['bank_slots', 41, 'msgs', 'bank'],
      ['is_dlc_player_class', 44, 'bool'], ['dlc_player_class_id', 45, 'int'], ['completey_explored_areas', 46, 'strs'],
      ['num_golden_keys_notified', 48, 'int'], ['last_play_through_index', 49, 'int'],
      ['packed_item_data', 53, 'msgs', 'pid'], ['packed_weapon_data', 54, 'msgs', 'pwd'], ['max_bank_slots', 56, 'int'],
    ],
    skill: [['skill_asset', 1, 'str'], ['level', 2, 'int'], ['max_points', 3, 'int'], ['equipped_slot_id', 4, 'int']],
    res: [['resource_asset', 1, 'str'], ['field2', 2, 'str'], ['amount', 3, 'float'], ['field4', 4, 'int']],
    inv: [['inventory_max', 1, 'int'], ['weapon_max', 2, 'int'], ['num_flourished', 3, 'int']],
    pt: [['number', 1, 'int'], ['mission_asset', 2, 'str'], ['mission_data', 3, 'msgs', 'md'], ['filterd', 5, 'strs']],
    md: [['mission_asset', 1, 'str'], ['status', 2, 'enum', 'MS'], ['is_dlc', 3, 'bool'], ['dlc_package_id', 4, 'int'],
      ['objectives_progress', 5, 'packed'], ['active_objective_id', 6, 'int'], ['sub_objectives_list', 7, 'packed'],
      ['needs_rewards', 8, 'bool'], ['field9', 9, 'int'], ['field10', 10, 'bool'], ['game_stage', 11, 'int']],
    pref: [['character_name', 1, 'str'], ['primary_color', 2, 'msg', 'col'], ['secondary_color', 3, 'msg', 'col'], ['tertiary_color', 4, 'msg', 'col']],
    col: COL,
    pid: [['item_serial_number', 1, 'bytes'], ['quantity', 2, 'int'], ['is_equipped', 3, 'bool'], ['mark', 4, 'enum', 'MARK']],
    pwd: [['weapon_serial_number', 1, 'bytes'], ['quick_slot', 2, 'enum', 'QS'], ['mark', 3, 'enum', 'MARK'], ['field4', 4, 'int']],
    bank: [['item_serial_number', 1, 'bytes']],
  };

  const f32 = new DataView(new ArrayBuffer(4));
  const te = new TextEncoder(), td = new TextDecoder('utf-8');

  /* ---------- JSON -> protobuf ---------- */
  function toMsg(obj, schema) {
    const m = new Msg([]);
    for (const [key, n, type, sub] of schema) {
      if (!(key in obj)) continue;
      const v = obj[key];
      if (type === 'msgs') { for (const o of v || []) m.f.push({ n, t: 2, v: toMsg(o, S[sub]).encode() }); continue; }
      if (type === 'strs') { for (const s of v || []) m.f.push({ n, t: 2, v: te.encode(String(s)) }); continue; }
      if (type === 'msg') { if (v && typeof v === 'object') m.f.push({ n, t: 2, v: toMsg(v, S[sub]).encode() }); continue; }
      if (type === 'str') m.f.push({ n, t: 2, v: te.encode(String(v)) });
      else if (type === 'bytes') m.f.push({ n, t: 2, v: WB.bytes.unb64(String(v)) });
      else if (type === 'packed') m.f.push({ n, t: 2, v: Uint8Array.from((v || []).flatMap((x) => Msg.varint(x))) });
      else if (type === 'float') { f32.setFloat32(0, Number(v) || 0, true); m.f.push({ n, t: 5, v: f32.getUint32(0, true) }); }
      else if (type === 'bool') m.f.push({ n, t: 0, v: v ? 1 : 0 });
      else if (type === 'enum') { let i = ENUMS[sub].indexOf(v); if (i < 0) i = typeof v === 'number' ? v : 0; m.f.push({ n, t: 0, v: i }); }
      else { const x = Number(v) || 0; m.f.push({ n, t: 0, v: x < 0 ? BigInt(x) : x }); }
    }
    return m;
  }

  /* ---------- protobuf -> JSON ---------- */
  const intOf = (v) => (typeof v === 'bigint' ? Number(BigInt.asIntN(64, v)) : (v > 0x7FFFFFFF && v <= 0xFFFFFFFF ? v - 0x100000000 : v));
  function fromMsg(m, schema, orig, ctx) {
    const out = {};
    const known = new Map(schema.map((s) => [s[0], s]));
    const order = orig ? Object.keys(orig) : schema.map((s) => s[0]);
    for (const s of schema) if (!order.includes(s[0]) && m.has(s[1])) order.push(s[0]);
    for (const key of order) {
      const s = known.get(key);
      if (!s) { out[key] = orig[key]; continue; } // not understood: keep as-is
      const [, n, type, sub] = s;
      const all = m.all(n);
      if (type === 'msgs') {
        if (n === 41 && all.length && !ctx.bankKey) throw new Error('This save type can\'t take bank items from the editor yet — keep them in the backpack.');
        const sch = n === 41 ? [[ctx.bankKey, 1, 'bytes']] : S[sub];
        const origArr = orig && Array.isArray(orig[key]) ? orig[key] : [];
        out[key] = all.map((x, i) => fromMsg(Msg.parse(x.v), sch, origArr[i] && sameShape(origArr[i], sch) ? origArr[i] : null, ctx));
        continue;
      }
      if (type === 'strs') { out[key] = all.map((x) => td.decode(x.v)); continue; }
      if (type === 'msg') { out[key] = all.length ? fromMsg(Msg.parse(all[0].v), S[sub], orig && orig[key], ctx) : (orig ? orig[key] : {}); continue; }
      if (!all.length) { out[key] = orig && key in orig ? orig[key] : defaultFor(type, sub); continue; }
      const v = all[0].v;
      if (type === 'str') out[key] = td.decode(v);
      else if (type === 'bytes') out[key] = WB.bytes.b64(v);
      else if (type === 'packed') out[key] = m.packed(n);
      else if (type === 'float') { f32.setUint32(0, v >>> 0, true); const fl = f32.getFloat32(0, true); out[key] = Number.isInteger(Math.round(fl * 1000) / 1000) ? Math.round(fl) : Math.round(fl * 1000) / 1000; }
      else if (type === 'bool') out[key] = !!Number(v);
      else if (type === 'enum') { const i = Number(v); out[key] = ENUMS[sub][i] !== undefined ? ENUMS[sub][i] : i; }
      else out[key] = intOf(v);
    }
    return out;
  }
  function sameShape(o, sch) { return o && typeof o === 'object' && sch.every((s) => s[0] in o); }
  function defaultFor(type, sub) {
    if (type === 'str' || type === 'bytes') return '';
    if (type === 'bool') return false;
    if (type === 'packed') return [];
    if (type === 'enum') return ENUMS[sub][0];
    return 0;
  }

  function isJson(bytes) {
    let i = 0; if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) i = 3;
    while (i < bytes.length && /\s/.test(String.fromCharCode(bytes[i]))) i++;
    return bytes[i] === 0x7B; // '{'
  }
  function parse(bytes) {
    const text = td.decode(bytes).replace(/^﻿/, '');
    const json = JSON.parse(text);
    if (!json || typeof json !== 'object' || !('player_class' in json)) throw new Error('This JSON file doesn\'t look like a Borderlands save.');
    const indent = (text.match(/^\{\r?\n([ \t]+)"/) || [])[1] || ' ';
    const bankKey = Array.isArray(json.bank_slots) && json.bank_slots[0] ? Object.keys(json.bank_slots[0])[0] : null;
    const pb = toMsg(json, S.top).encode();
    return { pb, info: { scheme: 'json', little: true, sha1ok: true, json, indent, newline: /\r\n/.test(text) ? '\r\n' : '\n', trailing: /\n$/.test(text), bankKey } };
  }
  function build(pb, info) {
    const out = fromMsg(Msg.parse(pb), S.top, info.json, { bankKey: info.bankKey });
    let text = JSON.stringify(out, null, info.indent);
    if (info.newline === '\r\n') text = text.replace(/\n/g, '\r\n');
    if (info.trailing) text += info.newline;
    return te.encode(text);
  }
  WB.jsonSave = { isJson, parse, build };

  /* ---------- other PlayStation / tool layouts ---------- */
  const B = WB.bytes;
  const hex = (b, n = 16) => Array.from(b.subarray(0, n), (x) => x.toString(16).padStart(2, '0')).join(' ');
  function utf16(bytes) {
    if (bytes[0] === 0xFF && bytes[1] === 0xFE) return { le: true, bom: true };
    if (bytes[0] === 0xFE && bytes[1] === 0xFF) return { le: false, bom: true };
    if (bytes[0] === 0x7B && bytes[1] === 0x00) return { le: true, bom: false };
    if (bytes[0] === 0x00 && bytes[1] === 0x7B) return { le: false, bom: false };
    return null;
  }
  function decode16(bytes, u) {
    const start = u.bom ? 2 : 0; let s = '';
    for (let i = start; i + 1 < bytes.length; i += 2) s += String.fromCharCode(u.le ? bytes[i] | (bytes[i + 1] << 8) : (bytes[i] << 8) | bytes[i + 1]);
    return s;
  }
  function encode16(text, u) {
    const out = new Uint8Array((u.bom ? 2 : 0) + text.length * 2); let o = 0;
    if (u.bom) { out[0] = u.le ? 0xFF : 0xFE; out[1] = u.le ? 0xFE : 0xFF; o = 2; }
    for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); out[o++] = u.le ? c & 255 : c >> 8; out[o++] = u.le ? c >> 8 : c & 255; }
    return out;
  }
  function looksLikeSavePB(b) {
    try { const m = Msg.parse(b); const c = m.str(1); return /CharClass|^GD_|^Crocus|^Quince/.test(c) && m.has(2) ? true : false; } catch (e) { return false; }
  }
  async function tryAlternatives(b, firstErr) {
    // 1) size-prefixed WSG without SHA-1 or compression
    if (B.bytesToStr(b.subarray(4, 7)) === 'WSG') {
      const r = await unwrap(b.subarray(4)); r.info.scheme = 'sizedwsg'; return r;
    }
    // 2) LZO / zlib without the SHA-1 header: [size][compressed]
    if (b.length > 8) {
      const fake = B.concat([new Uint8Array(20), b]);
      try { const r = await unwrap(fake); r.info.outerScheme = r.info.scheme; r.info.scheme = 'nosha'; r.info.warning = null; return r; } catch (e) { /* next */ }
    }
    // 3) whole file zlib-compressed
    if ((b[0] & 0x0F) === 8 && ((b[0] << 8) | b[1]) % 31 === 0) {
      try {
        const inner = await WB.zlib.inflate(b);
        const r = await WB.save.unwrap(inner);
        return { pb: r.pb, info: { scheme: 'zlibwrap', inner: r.info, little: r.info.little, sha1ok: true } };
      } catch (e) { /* next */ }
    }
    // 4) bare protobuf (already fully decoded)
    if (looksLikeSavePB(b)) return { pb: b.slice(), info: { scheme: 'raw', little: true, sha1ok: true } };
    const e = new Error(`This file isn't a save layout the editor knows yet (${b.length} bytes, starts: ${hex(b, 8)}). Send it to the developer so support can be added.`);
    e.cause = firstErr; throw e;
  }

  // hook into the normal save loader/writer
  const unwrap = WB.save.unwrap, wrap = WB.save.wrap;
  WB.save.unwrap = async (file) => {
    const b = file instanceof Uint8Array ? file : new Uint8Array(file);
    if (isJson(b)) return parse(b);
    const u = utf16(b);
    if (u) {
      const r = parse(te.encode(decode16(b, u)));
      r.info.utf16 = u; return r;
    }
    try { return await unwrap(b); } catch (e) { return tryAlternatives(b, e); }
  };
  WB.save.wrap = async (pb, info) => {
    if (info.scheme === 'json') {
      const out = build(pb, info);
      return info.utf16 ? encode16(td.decode(out), info.utf16) : out;
    }
    if (info.scheme === 'raw') return pb;
    if (info.scheme === 'sizedwsg') { const w = await wrap(pb, { ...info, scheme: 'none' }); return B.concat([B.u32be(w.length), w]); }
    if (info.scheme === 'nosha') return (await wrap(pb, { ...info, scheme: info.outerScheme })).subarray(20);
    if (info.scheme === 'zlibwrap') return WB.zlib.deflate(await WB.save.wrap(pb, info.inner));
    return wrap(pb, info);
  };
})(typeof window !== 'undefined' ? window : globalThis);
