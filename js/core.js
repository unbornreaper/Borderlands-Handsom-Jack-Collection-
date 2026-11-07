/*
 * WBWHO JACKED - core file codecs.
 * Everything needed to read and write Borderlands 2 / Pre-Sequel saves:
 * SHA-1, CRC-32, LZO1X, zlib (via the browser), Huffman, protobuf, item serials.
 * Works in the browser and in Node (for tests).
 */
(function (root) {
  'use strict';
  const WB = root.WB = root.WB || {};

  /* ---------------- small byte helpers ---------------- */
  const enc = new TextEncoder();
  const dec = new TextDecoder('latin1');
  function concat(arrs) {
    let n = 0; for (const a of arrs) n += a.length;
    const out = new Uint8Array(n); let o = 0;
    for (const a of arrs) { out.set(a, o); o += a.length; }
    return out;
  }
  function u32be(v) { return new Uint8Array([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]); }
  function readU32(b, o, little) {
    return little ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0
      : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  }
  function writeU32(v, little) { const b = u32be(v >>> 0); return little ? b.reverse() : b; }
  function strToBytes(s) { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b; }
  function bytesToStr(b) { return dec.decode(b); }
  function utf8(s) { return enc.encode(s); }
  function eq(a, b) { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }
  function b64(bytes) {
    let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'latin1').toString('base64');
  }
  function unb64(str) {
    const s = typeof atob === 'function' ? atob(str) : Buffer.from(str, 'base64').toString('latin1');
    return strToBytes(s);
  }
  WB.bytes = { concat, u32be, readU32, writeU32, strToBytes, bytesToStr, utf8, eq, b64, unb64 };

  /* ---------------- CRC-32 ---------------- */
  const CRC_T = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC_T[n] = c >>> 0; }
  function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  WB.crc32 = crc32;

  /* ---------------- SHA-1 (sync, so it works from file://) ---------------- */
  function sha1(msg) {
    const ml = msg.length, withPad = ((ml + 9 + 63) >> 6) << 6;
    const m = new Uint8Array(withPad); m.set(msg); m[ml] = 0x80;
    const bits = ml * 8;
    m[withPad - 4] = (bits >>> 24) & 255; m[withPad - 3] = (bits >>> 16) & 255; m[withPad - 2] = (bits >>> 8) & 255; m[withPad - 1] = bits & 255;
    m[withPad - 5] = Math.floor(ml / 0x20000000) & 255;
    let h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0;
    const w = new Int32Array(80);
    for (let off = 0; off < withPad; off += 64) {
      for (let i = 0; i < 16; i++) w[i] = (m[off + i * 4] << 24) | (m[off + i * 4 + 1] << 16) | (m[off + i * 4 + 2] << 8) | m[off + i * 4 + 3];
      for (let i = 16; i < 80; i++) { const x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]; w[i] = (x << 1) | (x >>> 31); }
      let a = h0, b = h1, c = h2, d = h3, e = h4;
      for (let i = 0; i < 80; i++) {
        let f, k;
        if (i < 20) { f = (b & c) | (~b & d); k = 0x5A827999; }
        else if (i < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1; }
        else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
        else { f = b ^ c ^ d; k = 0xCA62C1D6; }
        const t = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) | 0;
        e = d; d = c; c = (b << 30) | (b >>> 2); b = a; a = t;
      }
      h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0;
    }
    return concat([u32be(h0), u32be(h1), u32be(h2), u32be(h3), u32be(h4)]);
  }
  WB.sha1 = sha1;

  /* ---------------- LZO1X ---------------- */
  function lzoDecompress(src, outLen) {
    const out = new Uint8Array(outLen);
    let ip = 0, op = 0, t, mPos;
    const err = (m) => { throw new Error('LZO: ' + m); };
    const copyLit = (n) => { if (op + n > outLen || ip + n > src.length) err('overrun'); out.set(src.subarray(ip, ip + n), op); ip += n; op += n; };
    const copyMatch = (pos, n) => { if (pos < 0) err('lookbehind'); if (op + n > outLen) err('overrun'); for (let i = 0; i < n; i++) out[op++] = out[pos++]; };
    let state = 'start';
    // explicit state machine mirroring lzo1x_d.ch
    if (src[ip] > 17) {
      t = src[ip++] - 17;
      if (t < 4) { copyLit(t); t = src[ip++]; state = 'match'; }
      else { copyLit(t); state = 'first_literal_run'; }
    } else state = 'loop';
    for (;;) {
      if (state === 'loop') {
        t = src[ip++];
        if (t >= 16) { state = 'match'; continue; }
        if (t === 0) { while (src[ip] === 0) { t += 255; ip++; } t += 15 + src[ip++]; }
        copyLit(t + 3);
        state = 'first_literal_run';
      }
      if (state === 'first_literal_run') {
        t = src[ip++];
        if (t >= 16) { state = 'match'; continue; }
        mPos = op - (1 + 0x0800) - (t >> 2) - (src[ip++] << 2);
        copyMatch(mPos, 3);
        state = 'match_done';
      }
      if (state === 'match') {
        if (t >= 64) {
          mPos = op - 1 - ((t >> 2) & 7) - (src[ip++] << 3);
          t = (t >> 5) - 1;
          copyMatch(mPos, t + 2);
        } else if (t >= 32) {
          t &= 31;
          if (t === 0) { while (src[ip] === 0) { t += 255; ip++; } t += 31 + src[ip++]; }
          mPos = op - 1 - ((src[ip] >> 2) + (src[ip + 1] << 6)); ip += 2;
          copyMatch(mPos, t + 2);
        } else if (t >= 16) {
          mPos = op - ((t & 8) << 11);
          t &= 7;
          if (t === 0) { while (src[ip] === 0) { t += 255; ip++; } t += 7 + src[ip++]; }
          mPos -= (src[ip] >> 2) + (src[ip + 1] << 6); ip += 2;
          if (mPos === op) break; // end of stream
          mPos -= 0x4000;
          copyMatch(mPos, t + 2);
        } else {
          mPos = op - 1 - (t >> 2) - (src[ip++] << 2);
          copyMatch(mPos, 2);
        }
        state = 'match_done';
      }
      if (state === 'match_done') {
        t = src[ip - 2] & 3;
        if (t === 0) { state = 'loop'; continue; }
        copyLit(t);
        t = src[ip++];
        state = 'match';
        continue;
      }
    }
    if (op !== outLen) err('size mismatch ' + op + ' vs ' + outLen);
    return out;
  }

  // Simple greedy LZO1X compressor (valid stream, uses M2/M3 matches only).
  function lzoCompress(src) {
    const n = src.length, out = [];
    const MAXD = 0x4000;
    const head = new Int32Array(1 << 14).fill(-1);
    const hash = (i) => (((src[i] << 16) | (src[i + 1] << 8) | src[i + 2]) * 2654435761 >>> 18) & 0x3FFF;
    let litStart = 0, i = 0, first = true;
    let lastStatePos = -1; // index in out[] of the byte holding the 2 "state" bits
    const emitLiterals = (start, end) => {
      const L = end - start;
      if (L === 0) return;
      if (first) {
        if (L <= 238) out.push(17 + L);
        else { out.push(0); let r = L - 18; while (r > 255) { out.push(0); r -= 255; } out.push(r); }
      } else if (L <= 3) {
        out[lastStatePos] |= L;
      } else if (L - 3 <= 15) out.push(L - 3);
      else { out.push(0); let r = L - 18; while (r > 255) { out.push(0); r -= 255; } out.push(r); }
      for (let k = start; k < end; k++) out.push(src[k]);
    };
    while (i + 3 <= n) {
      const h = hash(i), cand = head[h]; head[h] = i;
      let len = 0, dist = 0;
      if (cand >= 0 && i - cand <= MAXD && src[cand] === src[i] && src[cand + 1] === src[i + 1] && src[cand + 2] === src[i + 2]) {
        len = 3; while (i + len < n && src[cand + len] === src[i + len] && len < 264) len++;
        dist = i - cand;
      }
      // the very first instruction cannot be a match, and short literal runs (1-3)
      // right at the start must be encoded with the special first-byte form.
      if (len >= 3 && !(first && i === 0)) {
        emitLiterals(litStart, i);
        first = false;
        const D = dist - 1;
        if (len <= 8 && D < 0x800) {
          out.push(((len - 1) << 5) | ((D & 7) << 2)); lastStatePos = out.length - 1;
          out.push(D >> 3);
        } else {
          if (len - 2 <= 31) out.push(32 | (len - 2));
          else { out.push(32); let r = len - 2 - 31; while (r > 255) { out.push(0); r -= 255; } out.push(r); }
          out.push((D & 63) << 2); lastStatePos = out.length - 1;
          out.push(D >> 6);
        }
        for (let k = i + 1; k < i + len && k + 3 <= n; k++) head[hash(k)] = k;
        i += len; litStart = i;
      } else i++;
    }
    emitLiterals(litStart, n);
    out.push(0x11, 0, 0);
    return Uint8Array.from(out);
  }
  WB.lzo = { decompress: lzoDecompress, compress: lzoCompress };

  /* ---------------- zlib (browser/Node native) ---------------- */
  async function streamThrough(bytes, stream) {
    const s = new Blob([bytes]).stream().pipeThrough(stream);
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  WB.zlib = {
    inflate: (b) => streamThrough(b, new DecompressionStream('deflate')),
    deflate: (b) => streamThrough(b, new CompressionStream('deflate')),
  };

  /* ---------------- Huffman (Gearbox WSG flavour) ---------------- */
  function huffDecode(data, size) {
    let bit = 0;
    const rb = () => { const v = (data[bit >> 3] >> (7 - (bit & 7))) & 1; bit++; return v; };
    const readTree = () => {
      if (rb() === 1) { let v = 0; for (let i = 0; i < 8; i++) v = (v << 1) | rb(); return v; }
      return [readTree(), readTree()];
    };
    const tree = readTree();
    const out = new Uint8Array(size);
    if (typeof tree === 'number') { out.fill(tree); return out; }
    for (let o = 0; o < size; o++) {
      let node = tree;
      while (typeof node !== 'number') node = node[rb()];
      out[o] = node;
    }
    return out;
  }
  function huffEncode(data) {
    const freq = new Array(256).fill(0);
    for (const c of data) freq[c]++;
    let nodes = [];
    for (let i = 0; i < 256; i++) if (freq[i]) nodes.push({ w: freq[i], v: i });
    if (nodes.length === 0) nodes.push({ w: 1, v: 0 });
    if (nodes.length === 1) nodes.push({ w: 0, v: (nodes[0].v + 1) & 255 });
    while (nodes.length > 1) {
      nodes.sort((a, b) => a.w - b.w);
      const [a, b] = nodes.splice(0, 2);
      nodes.push({ w: a.w + b.w, l: a, r: b });
    }
    const codes = new Array(256);
    let acc = 0, nb = 0;
    const out = [];
    const wb = (b) => { acc = (acc << 1) | b; nb++; if (nb === 8) { out.push(acc); acc = 0; nb = 0; } };
    const walk = (node, code) => {
      if (node.v !== undefined && !node.l) {
        wb(1); for (let i = 7; i >= 0; i--) wb((node.v >> i) & 1);
        codes[node.v] = code; return;
      }
      wb(0); walk(node.l, code + '0'); walk(node.r, code + '1');
    };
    walk(nodes[0], '');
    const table = codes.map((c) => c && Array.from(c, (ch) => ch === '1' ? 1 : 0));
    for (const c of data) for (const b of table[c]) wb(b);
    if (nb) out.push(acc << (8 - nb));
    return Uint8Array.from(out);
  }
  WB.huffman = { decode: huffDecode, encode: huffEncode };

  /* ---------------- Save container ---------------- */
  const BLOCK = 0x40000;
  function looksZlib(b, o) { return (b[o] & 0x0F) === 8 && ((b[o] << 8) | b[o + 1]) % 31 === 0; }

  async function unwrapSave(file) {
    const b = file instanceof Uint8Array ? file : new Uint8Array(file);
    const info = { scheme: 'lzo', little: true, sha1ok: true };
    if (bytesToStr(b.subarray(0, 4)) === 'CON ') throw new Error('This is an Xbox 360 CON package. Extract SaveGame.sav from it first (Horizon / Modio).');
    let inner;
    if (bytesToStr(b.subarray(0, 3)) === 'WSG') { info.scheme = 'none'; inner = b; }
    else {
      if (b.length < 28) throw new Error('File too small to be a Borderlands save.');
      info.sha1ok = eq(sha1(b.subarray(20)), b.subarray(0, 20));
      const usize = readU32(b, 20, false);
      if (usize > 0x4000000 || usize < 16) throw new Error('This file is not a Borderlands save this editor understands. (PlayStation/Xbox saves must be decrypted first.)');
      const body = b.subarray(24);
      const blocks = [];
      if (usize <= BLOCK) blocks.push({ data: body, size: usize });
      else {
        const count = readU32(body, 0, false); let off = 4 + count * 8, left = usize;
        for (let i = 0; i < count; i++) {
          const cs = readU32(body, 4 + i * 8, false), us = Math.min(readU32(body, 8 + i * 8, false), left);
          blocks.push({ data: body.subarray(off, off + cs), size: us }); off += cs; left -= us;
        }
        info.blocks = true;
      }
      const parts = [];
      for (const blk of blocks) {
        if (looksZlib(blk.data, 0)) {
          try { parts.push((await WB.zlib.inflate(blk.data)).subarray(0, blk.size)); info.scheme = 'zlib'; continue; } catch (e) { /* fall through to LZO */ }
        }
        parts.push(lzoDecompress(blk.data, blk.size)); info.scheme = 'lzo';
      }
      inner = concat(parts);
    }
    // inner: [size BE] "WSG" version crc usize huffman...
    let o = info.scheme === 'none' ? 0 : 4;
    if (bytesToStr(inner.subarray(o, o + 3)) !== 'WSG') throw new Error('Not a Borderlands 2 / Pre-Sequel save (missing WSG header).');
    o += 3;
    const verLE = readU32(inner, o, true);
    info.little = verLE === 2;
    if (!info.little && readU32(inner, o, false) !== 2) throw new Error('Unknown save version.');
    const crc = readU32(inner, o + 4, info.little);
    const size = readU32(inner, o + 8, info.little);
    if (size > 0x4000000) throw new Error('Save looks damaged (bad size).');
    const pb = huffDecode(inner.subarray(o + 12), size);
    if (crc32(pb) !== crc) throw new Error('Save checksum (CRC) failed - file is damaged.');
    if (!info.sha1ok) info.warning = 'SHA-1 header did not match (file was probably edited before). It will be fixed on save.';
    return { pb, info };
  }

  async function wrapSave(pb, info) {
    const little = info.little;
    const huff = huffEncode(pb);
    const wsg = concat([strToBytes('WSG'), writeU32(2, little), writeU32(crc32(pb), little), writeU32(pb.length, little), huff]);
    if (info.scheme === 'none') return wsg;
    const inner = concat([u32be(wsg.length), wsg]);
    const compress = info.scheme === 'zlib' ? WB.zlib.deflate : async (x) => lzoCompress(x);
    let payload;
    if (inner.length <= BLOCK) payload = await compress(inner);
    else {
      const chunks = [];
      for (let p = 0; p < inner.length; p += BLOCK) chunks.push(await compress(inner.subarray(p, Math.min(inner.length, p + BLOCK))));
      const hdr = [u32be(chunks.length)];
      for (const c of chunks) hdr.push(u32be(c.length), u32be(BLOCK));
      payload = concat(hdr.concat(chunks));
    }
    const hashed = concat([u32be(inner.length), payload]);
    return concat([sha1(hashed), hashed]);
  }
  WB.save = { unwrap: unwrapSave, wrap: wrapSave };

  /* ---------------- Protobuf (lossless, order preserving) ---------------- */
  // A message is { f: [ {n, t, v} ] } where v is Number/BigInt (varint, fixed) or Uint8Array (len)
  class Msg {
    constructor(fields) { this.f = fields || []; }
    static parse(b) {
      const f = []; let p = 0;
      const rv = () => {
        let lo = 0, shift = 0, big = null, byte;
        do {
          byte = b[p++];
          if (byte === undefined) throw new Error('protobuf: truncated');
          if (shift < 28) lo |= (byte & 0x7F) << shift;
          else { if (big === null) big = BigInt(lo >>> 0); big |= BigInt(byte & 0x7F) << BigInt(shift); }
          shift += 7;
        } while (byte & 0x80);
        if (big === null) return lo >>> 0;
        return big <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(big) : big;
      };
      while (p < b.length) {
        const key = rv(); const n = Math.floor(Number(key) / 8), t = Number(key) & 7;
        let v;
        if (t === 0) v = rv();
        else if (t === 2) { const l = Number(rv()); v = b.slice(p, p + l); p += l; }
        else if (t === 5) { v = readU32(b, p, true); p += 4; }
        else if (t === 1) { v = b.slice(p, p + 8); p += 8; }
        else throw new Error('protobuf: wire type ' + t);
        f.push({ n, t, v });
      }
      return new Msg(f);
    }
    static varint(v) {
      const out = [];
      if (typeof v === 'number' && v >= 0 && v <= 0xFFFFFFFF) {
        while (v > 0x7F) { out.push((v & 0x7F) | 0x80); v = Math.floor(v / 128); }
        out.push(v); return out;
      }
      let x = BigInt(v); if (x < 0n) x += 1n << 64n;
      while (x > 0x7Fn) { out.push(Number(x & 0x7Fn) | 0x80); x >>= 7n; }
      out.push(Number(x)); return out;
    }
    encode() {
      const parts = [];
      for (const { n, t, v } of this.f) {
        parts.push(Uint8Array.from(Msg.varint(n * 8 + t)));
        if (t === 0) parts.push(Uint8Array.from(Msg.varint(v)));
        else if (t === 2) { const by = v instanceof Msg ? v.encode() : v; parts.push(Uint8Array.from(Msg.varint(by.length)), by); }
        else if (t === 5) parts.push(writeU32(v, true));
        else if (t === 1) parts.push(v);
      }
      return concat(parts);
    }
    all(n) { return this.f.filter((x) => x.n === n); }
    has(n) { return this.f.some((x) => x.n === n); }
    get(n, def) { const x = this.f.find((y) => y.n === n); return x ? x.v : def; }
    num(n, def = 0) { const v = this.get(n); if (v === undefined) return def; return typeof v === 'bigint' ? Number(BigInt.asIntN(64, v)) : v; }
    int(n, def = 0) { const v = this.get(n); if (v === undefined) return def; if (typeof v === 'bigint') return Number(BigInt.asIntN(64, v)); return v > 0x7FFFFFFF && v <= 0xFFFFFFFF ? v - 0x100000000 : v; }
    str(n, def = '') { const v = this.get(n); return v === undefined ? def : (v instanceof Msg ? '' : new TextDecoder('utf-8').decode(v)); }
    msg(n) { const v = this.get(n); return v === undefined ? null : (v instanceof Msg ? v : Msg.parse(v)); }
    msgs(n) { return this.all(n).map((x) => (x.v instanceof Msg ? x.v : Msg.parse(x.v))); }
    packed(n) { // packed varints
      const v = this.get(n); if (v === undefined) return [];
      if (typeof v !== 'object') return [v];
      const out = []; let p = 0;
      while (p < v.length) { let x = 0, s = 0, byte; do { byte = v[p++]; x += (byte & 0x7F) * Math.pow(2, s); s += 7; } while (byte & 0x80); out.push(x); }
      return out;
    }
    setPacked(n, arr) { this.set(n, Uint8Array.from(arr.flatMap((x) => Msg.varint(x))), 2); }
    // replace first occurrence (or insert sorted), keeping wire type
    set(n, v, t) {
      if (t === undefined) t = v instanceof Uint8Array || v instanceof Msg ? 2 : 0;
      if (typeof v === 'string') { v = new TextEncoder().encode(v); t = 2; }
      if (typeof v === 'boolean') v = v ? 1 : 0;
      if (typeof v === 'number' && v < 0 && t === 0) v = BigInt(v);
      const i = this.f.findIndex((x) => x.n === n);
      if (i >= 0) { this.f[i] = { n, t, v }; return this; }
      let pos = this.f.findIndex((x) => x.n > n); if (pos < 0) pos = this.f.length;
      this.f.splice(pos, 0, { n, t, v }); return this;
    }
    setStr(n, s) { return this.set(n, new TextEncoder().encode(s), 2); }
    // replace all repeated entries of field n with list of values
    setAll(n, list, t = 2) {
      let pos = this.f.findIndex((x) => x.n === n);
      if (pos < 0) { pos = this.f.findIndex((x) => x.n > n); if (pos < 0) pos = this.f.length; }
      this.f = this.f.filter((x) => x.n !== n);
      const items = list.map((v) => ({ n, t, v: typeof v === 'string' ? new TextEncoder().encode(v) : v }));
      this.f.splice(pos, 0, ...items);
      return this;
    }
    remove(n) { this.f = this.f.filter((x) => x.n !== n); return this; }
  }
  WB.Msg = Msg;

  /* ---------------- Item serials ---------------- */
  // Bit layout (LSB-first) from Gibbed's PackedDataHelper.
  function bogoXor(buf, seed) {
    let x = BigInt((seed | 0) >> 5) & 0xFFFFFFFFn;
    for (let i = 0; i < buf.length; i++) { x = (x * 0x10A860C1n) % 0xFFFFFFFBn; buf[i] ^= Number(x & 0xFFn); }
  }
  function bogoDecrypt(data) {
    const seed = readU32(data, 1, false);
    const out = data.slice();
    if (seed === 0) return out;
    const temp = data.slice(5); bogoXor(temp, seed);
    const len = temp.length, right = (seed % 32) % len, left = len - right;
    out.set(temp.subarray(left, left + right), 5); out.set(temp.subarray(0, left), 5 + right);
    return out;
  }
  function bogoEncrypt(data) {
    const seed = readU32(data, 1, false);
    const out = data.slice();
    if (seed === 0) return out;
    const len = data.length - 5, right = (seed % 32) % len, left = len - right;
    const temp = new Uint8Array(len);
    temp.set(data.subarray(5, 5 + right), left); temp.set(data.subarray(5 + right, 5 + len), 0);
    bogoXor(temp, seed); out.set(temp, 5);
    return out;
  }
  class BitReader {
    constructor(b) { this.b = b; this.p = 0; }
    read(n) { let v = 0; for (let i = 0; i < n; i++, this.p++) { const bit = (this.b[this.p >> 3] >> (this.p & 7)) & 1; v += bit * Math.pow(2, i); } return v; }
  }
  class BitWriter {
    constructor() { this.b = []; this.p = 0; }
    write(v, n) { for (let i = 0; i < n; i++, this.p++) { if ((this.p & 7) === 0) this.b.push(0); if (Math.floor(v / Math.pow(2, i)) & 1) this.b[this.b.length - 1] |= 1 << (this.p & 7); } }
  }
  // asset groups: [sublibraryBits, assetBits]
  const GROUPS = { WeaponTypes: [7, 6], WeaponParts: [6, 11], ItemTypes: [9, 8], ItemParts: [6, 10], Manufacturers: [4, 7], BalanceDefs: [10, 10] };
  const WEAPON_SLOTS = ['body', 'grip', 'barrel', 'sight', 'stock', 'elemental', 'accessory1', 'accessory2', 'material', 'prefix', 'title'];
  const ITEM_SLOTS = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'material', 'prefix', 'title'];
  function readRef(r, g) {
    const [sb, ab] = GROUPS[g]; const v = r.read(sb + ab);
    if (v === Math.pow(2, sb + ab) - 1) return null;
    const asset = v % Math.pow(2, ab), hi = Math.floor(v / Math.pow(2, ab));
    return { asset, sub: hi & ((1 << (sb - 1)) - 1), useSet: (hi >> (sb - 1)) & 1 };
  }
  function writeRef(w, g, ref) {
    const [sb, ab] = GROUPS[g];
    if (!ref) { w.write(Math.pow(2, sb + ab) - 1, sb + ab); return; }
    const hi = (ref.sub & ((1 << (sb - 1)) - 1)) | (ref.useSet ? 1 << (sb - 1) : 0);
    w.write(hi * Math.pow(2, ab) + ref.asset, sb + ab);
  }
  function decodeItem(data) {
    if (data.length < 5 || data.length > 40) throw new Error('bad item length');
    const raw = bogoDecrypt(data);
    const fileCheck = (raw[5] << 8) | raw[6];
    const full = new Uint8Array(40).fill(0xFF); full.set(raw); full[5] = 0xFF; full[6] = 0xFF;
    const h = crc32(full); const check = ((h >>> 16) ^ h) & 0xFFFF;
    const r = new BitReader(full);
    const version = r.read(7), isWeapon = r.read(1) === 1;
    const uid = r.read(32); r.read(16);
    const set = r.read(8);
    const it = { version, isWeapon, uid, set, checkOk: check === fileCheck, seed: readU32(data, 1, false) };
    it.type = readRef(r, isWeapon ? 'WeaponTypes' : 'ItemTypes');
    it.balance = readRef(r, 'BalanceDefs');
    it.manufacturer = readRef(r, 'Manufacturers');
    it.grade = r.read(7); it.stage = r.read(7);
    it.parts = {};
    for (const s of isWeapon ? WEAPON_SLOTS : ITEM_SLOTS) it.parts[s] = readRef(r, isWeapon ? 'WeaponParts' : 'ItemParts');
    return it;
  }
  function encodeItem(it) {
    const w = new BitWriter();
    w.write(it.version, 7); w.write(it.isWeapon ? 1 : 0, 1);
    w.write(it.uid >>> 0, 32); w.write(0xFFFF, 16); w.write(it.set, 8);
    writeRef(w, it.isWeapon ? 'WeaponTypes' : 'ItemTypes', it.type);
    writeRef(w, 'BalanceDefs', it.balance);
    writeRef(w, 'Manufacturers', it.manufacturer);
    w.write(it.grade & 127, 7); w.write(it.stage & 127, 7);
    for (const s of it.isWeapon ? WEAPON_SLOTS : ITEM_SLOTS) writeRef(w, it.isWeapon ? 'WeaponParts' : 'ItemParts', it.parts[s]);
    const bits = w.p;
    let bytes = Uint8Array.from(w.b);
    if (bits & 7) bytes[bytes.length - 1] |= (0xFF << (bits & 7)) & 0xFF;
    if (bytes.length > 40) throw new Error('item too large');
    const full = new Uint8Array(40).fill(0xFF); full.set(bytes);
    const h = crc32(full); const check = ((h >>> 16) ^ h) & 0xFFFF;
    full[5] = check >> 8; full[6] = check & 255;
    let end = 40; while (end > 7 && full[end - 1] === 0xFF) end--;
    // the 4 uid bytes are what the game uses as the BE seed
    return bogoEncrypt(full.slice(0, end));
  }
  // Re-key an item (new random seed) without touching contents.
  function rekeyItem(data, seed) {
    const raw = bogoDecrypt(data);
    raw[1] = (seed >>> 24) & 255; raw[2] = (seed >>> 16) & 255; raw[3] = (seed >>> 8) & 255; raw[4] = seed & 255;
    // checksum covers header incl. seed, so recompute
    const full = new Uint8Array(40).fill(0xFF); full.set(raw); full[5] = 0xFF; full[6] = 0xFF;
    const h = crc32(full); const check = ((h >>> 16) ^ h) & 0xFFFF;
    raw[5] = check >> 8; raw[6] = check & 255;
    return bogoEncrypt(raw);
  }
  // "Expansion" fake items Gearbox uses to stash extra data (eridium > 99, OP levels...)
  function isExpansionItem(data) {
    const raw = bogoDecrypt(data);
    if (raw.length < 8 || raw[7] !== 0xFF) return false;
    for (let i = 8; i < raw.length; i++) if (raw[i] !== 0) return false;
    return true;
  }
  const HACK_SERIAL = Uint8Array.from([0x07, 0, 0, 0, 0, 0x39, 0x2A, 0xFF].concat(new Array(32).fill(0)));
  WB.items = { decode: decodeItem, encode: encodeItem, rekey: rekeyItem, isExpansion: isExpansionItem, HACK_SERIAL, WEAPON_SLOTS, ITEM_SLOTS, GROUPS, decrypt: bogoDecrypt };

  /* ---------------- profile.bin ---------------- */
  function parseProfile(b) {
    const sha1ok = eq(sha1(b.subarray(20)), b.subarray(0, 20));
    const usize = readU32(b, 20, false);
    const data = lzoDecompress(b.subarray(24), usize);
    const count = readU32(data, 0, false); let p = 4;
    const entries = [];
    for (let i = 0; i < count; i++) {
      const e = { start: data[p], id: readU32(data, p + 1, false), type: data[p + 5] }; p += 6;
      if (e.type === 1) { e.value = readU32(data, p, false) | 0; p += 4; }
      else if (e.type === 4) { const l = readU32(data, p, false); e.value = bytesToStr(data.subarray(p + 4, p + 4 + l)); p += 4 + l; }
      else if (e.type === 5) { e.raw = data.slice(p, p + 4); e.value = new DataView(e.raw.buffer).getFloat32(0, false); p += 4; }
      else if (e.type === 6) { const l = readU32(data, p, false); e.value = data.slice(p + 4, p + 4 + l); p += 4 + l; }
      else if (e.type === 8) { e.value = data[p]; p += 1; }
      else throw new Error('profile: unknown entry type ' + e.type);
      e.end = data[p++];
      entries.push(e);
    }
    return { entries, sha1ok };
  }
  function buildProfile(prof) {
    const parts = [u32be(prof.entries.length)];
    for (const e of prof.entries) {
      parts.push(Uint8Array.from([e.start]), u32be(e.id), Uint8Array.from([e.type]));
      if (e.type === 1) parts.push(u32be(e.value >>> 0));
      else if (e.type === 4) { const s = strToBytes(e.value); parts.push(u32be(s.length), s); }
      else if (e.type === 5) { const r = new Uint8Array(4); new DataView(r.buffer).setFloat32(0, e.value, false); parts.push(r); }
      else if (e.type === 6) parts.push(u32be(e.value.length), e.value);
      else if (e.type === 8) parts.push(Uint8Array.from([e.value & 255]));
      parts.push(Uint8Array.from([e.end]));
    }
    const data = concat(parts);
    const hashed = concat([u32be(data.length), lzoCompress(data)]);
    return concat([sha1(hashed), hashed]);
  }
  // Badass bonus-stat string codec (from B2Profile)
  const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ', MAGIC = 0x9A3652D9;
  function decodeBonus(code) {
    const list = []; let value = MAGIC, shift = 0;
    for (let i = 0; i < code.length; i++) {
      const index = ALPHA.indexOf(code[i]);
      value = (value ^ ((index << shift) >>> 0)) >>> 0;
      shift += 5;
      if (shift > 31) { list.push(value >>> 0); shift &= 7; value = (MAGIC ^ (index >>> (5 - shift))) >>> 0; }
    }
    return list;
  }
  function encodeBonus(list) {
    let code = '', index = 0, shift = 0;
    for (let i = 0; i < list.length; i++) {
      const value = (list[i] ^ MAGIC) >>> 0;
      if (shift > 0) { index = (index | (value << shift)) & 0x1F; shift = 5 - shift; code += ALPHA[index]; }
      for (; shift < 28; shift += 5) { index = (value >>> shift) & 0x1F; code += ALPHA[index]; }
      index = value >>> shift; shift = 32 - shift;
    }
    if (shift > 0) code += ALPHA[index];
    return code;
  }
  WB.profile = { parse: parseProfile, build: buildProfile, decodeBonus, encodeBonus };
})(typeof window !== 'undefined' ? window : globalThis);
