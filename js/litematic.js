// Web Worker (module). Input: ArrayBuffer of a .litematic file (gzip-compressed NBT).
// Output: {dim:[x,y,z], blocks, meta, pos, col, idx} – one face-culled mesh with baked Minecraft-style face shading.
// Data only is parsed; nothing in the file is ever executed.

const hex = h => [h >> 16, (h >> 8) & 255, h & 255];
const PAL = [[/water/, 0x3d6fd9], [/lava|magma/, 0xe5651b], [/glowstone|lantern|lamp|shroomlight|torch|froglight/, 0xffd36b],
  [/glass|ice/, 0xaedcf0], [/leaves|moss|azalea|vine|lily/, 0x3b7d2c], [/grass|fern/, 0x5b8c3b], [/snow|quartz|diorite|calcite|bone|white/, 0xeceae4],
  [/stone_brick/, 0x7a7a7e], [/deepslate/, 0x4b4b52], [/blackstone|basalt|obsidian|coal|black/, 0x2a262e], [/nether/, 0x6b2d2d], [/brick/, 0x9c5240],
  [/sandstone/, 0xd9cc98], [/sand/, 0xdbd0a0], [/dirt|mud|farmland|podzol|path/, 0x7b5635], [/gold/, 0xf5d142], [/iron|chain|anvil/, 0xc9c9cc],
  [/diamond|prism/, 0x4ed8d0], [/copper/, 0xc97a52], [/emerald/, 0x2ecc71], [/redstone/, 0xb01818],
  [/dark_oak/, 0x3f2a17], [/spruce/, 0x6a4a2c], [/birch/, 0xd9c98b], [/jungle/, 0xa9795a], [/acacia/, 0xc06a3b], [/cherry/, 0xe9b4c2], [/mangrove/, 0x7a3b3b],
  [/oak|wood|log|plank|bamboo|barrel|chest|door|crafting|bookshelf/, 0xa8814a], [/cobble|stone|andesite|tuff|gravel/, 0x818181], [/granite|terracotta/, 0xa46a54],
  [/light_blue/, 0x6fb3e8], [/light_gray/, 0x9a9a9a], [/orange/, 0xe8801a], [/magenta/, 0xc74ebd], [/yellow/, 0xf0d230], [/lime/, 0x80c71f], [/pink/, 0xf08cb4],
  [/gray/, 0x464a4f], [/cyan/, 0x168d9c], [/purple/, 0x7b2fb5], [/blue/, 0x3548a8], [/brown/, 0x6b4426], [/green/, 0x4a6a1f], [/red/, 0xb02e26]];
// Blocks that don't hide their neighbours' faces (glass, plants, panes, lights…). Drawn as plain cubes – an approximation.
const THIN = /glass|water|ice$|leaves|vine|torch|lantern|flower|fern|tall_grass|^grass$|short_grass|sapling|button|plate|carpet|rail|ladder|sign|banner|lever|bars|pane|fence|chain|candle|lily/;
function colorOf(n) {
  for (const [r, c] of PAL) if (r.test(n)) return hex(c);
  let h = 0; for (const ch of n) h = Math.imul(h, 31) + ch.charCodeAt(0) | 0;   // unknown block: stable hashed colour
  return [90 + (h & 63), 90 + ((h >> 6) & 63), 90 + ((h >> 12) & 63)];
}

async function gunzip(buf) {
  const s = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

function nbt(u8) {
  const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), td = new TextDecoder(); let p = 0;
  const str = () => { const n = v.getUint16(p); p += 2; const s = td.decode(u8.subarray(p, p + n)); p += n; return s };
  const rd = t => {
    switch (t) {
      case 1: return v.getInt8(p++);
      case 2: p += 2; return v.getInt16(p - 2);
      case 3: p += 4; return v.getInt32(p - 4);
      case 4: p += 8; return v.getUint32(p - 8) * 4294967296 + v.getUint32(p - 4);
      case 5: p += 4; return v.getFloat32(p - 4);
      case 6: p += 8; return v.getFloat64(p - 8);
      case 7: { const n = v.getInt32(p); p += 4 + n; return u8.subarray(p - n, p) }
      case 8: return str();
      case 9: { const t2 = v.getInt8(p), n = v.getInt32(p + 1); p += 5; return Array.from({ length: n }, () => rd(t2)) }
      case 10: { const o = {}; for (;;) { const t2 = v.getInt8(p++); if (!t2) return o; o[str()] = rd(t2) } }
      case 11: { const n = v.getInt32(p); p += 4; return Array.from({ length: n }, () => rd(3)) }
      case 12: { // long array -> little-endian 32-bit words (bit i of the stream = word[i>>5] bit i&31)
        const n = v.getInt32(p); p += 4; const w = new Uint32Array(n * 2);
        for (let i = 0; i < n; i++) { w[2 * i + 1] = v.getUint32(p); w[2 * i] = v.getUint32(p + 4); p += 8 }
        return w }
      default: throw Error('Corrupt NBT data (tag ' + t + ')');
    }
  };
  if (v.getInt8(0) !== 10) throw Error('Not an NBT file');
  p = 1; str(); return rd(10);
}

// [dx,dy,dz, shade, 4 corners] – faces drawn double-sided, so winding doesn't matter
const F = [[1, 0, 0, .8, [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]]], [-1, 0, 0, .8, [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]]],
  [0, 1, 0, 1, [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]]], [0, -1, 0, .5, [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]]],
  [0, 0, 1, .65, [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]], [0, 0, -1, .65, [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]]]];

function build(root) {
  if (!root.Regions) throw Error('Not a valid .litematic file (no Regions found)');
  const regs = Object.values(root.Regions).map(r => {
    const s = r.Size, q = r.Position;
    return { r, sx: Math.abs(s.x), sy: Math.abs(s.y), sz: Math.abs(s.z), o: [q.x + (s.x < 0 ? s.x + 1 : 0), q.y + (s.y < 0 ? s.y + 1 : 0), q.z + (s.z < 0 ? s.z + 1 : 0)] };
  });
  const mn = [0, 1, 2].map(i => Math.min(...regs.map(g => g.o[i])));
  const mx = [0, 1, 2].map(i => Math.max(...regs.map(g => g.o[i] + [g.sx, g.sy, g.sz][i])));
  const [X, Y, Z] = mx.map((m, i) => m - mn[i]);
  if (X * Y * Z > 6.4e7) throw Error(`Schematic is too large to preview (${X}×${Y}×${Z}). You can still download it.`);
  const grid = new Uint16Array(X * Y * Z), names = [''], ids = new Map(); let count = 0;
  for (const g of regs) {
    const pal = g.r.BlockStatePalette.map(b => {
      const n = b.Name.replace('minecraft:', ''); if (/air$/.test(n)) return 0;
      let i = ids.get(n); if (!i) { i = names.push(n) - 1; ids.set(n, i) } return i;
    });
    const bits = Math.max(2, 32 - Math.clz32(pal.length - 1)), mask = 2 ** bits - 1, w = g.r.BlockStates;
    let i = 0;
    for (let y = 0; y < g.sy; y++) for (let z = 0; z < g.sz; z++) for (let x = 0; x < g.sx; x++, i++) {
      const s = i * bits, k = s >>> 5, o = s & 31; let val = w[k] >>> o;
      if (o + bits > 32) val |= w[k + 1] << (32 - o);
      const id = pal[val & mask];
      if (id) { count++; grid[((y + g.o[1] - mn[1]) * Z + (z + g.o[2] - mn[2])) * X + (x + g.o[0] - mn[0])] = id }
    }
  }
  const cols = names.map(n => n && colorOf(n)), thin = names.map(n => THIN.test(n));
  const pos = [], col = [], idx = []; let nv = 0;
  for (let y = 0; y < Y; y++) for (let z = 0; z < Z; z++) for (let x = 0; x < X; x++) {
    const id = grid[(y * Z + z) * X + x]; if (!id) continue;
    const c = cols[id], k = .9 + .1 * (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) >>> 0) % 100 / 100;
    for (const [dx, dy, dz, sh, q] of F) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      const o = nx < 0 || ny < 0 || nz < 0 || nx >= X || ny >= Y || nz >= Z ? 0 : grid[(ny * Z + nz) * X + nx];
      if (o && (!thin[o] || o === id)) continue;          // hidden face
      for (const [a, b, d] of q) { pos.push(x + a, y + b, z + d); col.push(c[0] * sh * k, c[1] * sh * k, c[2] * sh * k) }
      idx.push(nv, nv + 1, nv + 2, nv, nv + 2, nv + 3); nv += 4;
    }
    if (nv > 8e6) throw Error('Too many visible faces to preview. You can still download it.');
  }
  const M = root.Metadata || {};
  return { dim: [X, Y, Z], blocks: count, types: names.length - 1,
    meta: { name: M.Name, author: M.Author, desc: M.Description, ver: root.Version, dv: root.MinecraftDataVersion },
    pos: new Float32Array(pos), col: new Uint8Array(col), idx: new Uint32Array(idx) };
}

if (typeof WorkerGlobalScope !== 'undefined') onmessage = async e => {
  try {
    const b = new Uint8Array(e.data);
    if (b[0] !== 0x1f || b[1] !== 0x8b) throw Error('Not a valid .litematic file (expected gzip-compressed data)');
    postMessage({ stage: 'Decompressing' }); const root = nbt(await gunzip(e.data));
    postMessage({ stage: 'Building mesh' }); const r = build(root);
    postMessage(r, [r.pos.buffer, r.col.buffer, r.idx.buffer]);
  } catch (err) { postMessage({ error: err.message || String(err) }) }
};
