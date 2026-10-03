"""Generates the DEMO schematics (real gzip+NBT .litematic files) and data/schematics.json.
Run from the repo root:  python3 tools/make_demo.py   (standard library only)"""
import gzip, struct, json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
B = {}

def box(a, b, c, d, e, f, k, h=0):
    for x in range(a, d + 1):
        for y in range(b, e + 1):
            for z in range(c, f + 1):
                if h and a < x < d and b < y < e and c < z < f: continue
                B[(x, y, z)] = k

def castle():
    box(0, 0, 0, 32, 0, 32, 'grass_block'); box(4, 1, 4, 28, 7, 28, 'stone_bricks', 1)
    for i in range(4, 29, 2):
        for j in (4, 28): B[(i, 8, j)] = B[(j, 8, i)] = 'stone_bricks'
    for x in (3, 27):
        for z in (3, 27):
            box(x, 1, z, x + 2, 12, z + 2, 'stone_bricks', 1); box(x - 1, 13, z - 1, x + 3, 13, z + 3, 'dark_oak_planks')
            box(x, 14, z, x + 2, 14, z + 2, 'dark_oak_planks'); B[(x + 1, 15, z + 1)] = 'dark_oak_planks'
    box(11, 1, 11, 21, 16, 21, 'stone_bricks', 1); box(10, 17, 10, 22, 17, 22, 'dark_oak_planks')
    box(12, 18, 12, 20, 18, 20, 'dark_oak_planks'); box(14, 19, 14, 18, 19, 18, 'dark_oak_planks')
    for x in range(14, 19):
        for y in range(1, 5): B.pop((x, y, 4), 0)
    for y in (6, 10):
        for x in (14, 18): B[(x, y, 11)] = B[(x, y, 21)] = 'glass'

def cottage():
    box(0, 0, 0, 12, 0, 10, 'grass_block'); box(2, 1, 2, 10, 1, 8, 'cobblestone'); box(2, 2, 2, 10, 4, 8, 'oak_planks', 1)
    for x in (4, 8):
        for z in (2, 8): B[(x, 3, z)] = 'glass'
    B.pop((6, 2, 8), 0); B.pop((6, 3, 8), 0)
    for i in range(5): box(1 + i, 5 + i, 1, 11 - i, 5 + i, 9, 'spruce_planks')
    box(9, 5, 3, 9, 10, 3, 'bricks'); box(0, 1, 0, 0, 3, 0, 'oak_log')

def pyramid():
    for i in range(16): box(i, i, i, 30 - i, i, 30 - i, 'cut_sandstone' if i % 4 == 0 else 'sandstone')
    B[(15, 15, 15)] = 'gold_block'

def lighthouse():
    box(0, 0, 0, 14, 0, 14, 'stone')
    for y in range(1, 21):
        r = 5 - y // 7
        for x in range(15):
            for z in range(15):
                if (r - 1) ** 2 < (x - 7) ** 2 + (z - 7) ** 2 <= r * r: B[(x, y, z)] = 'red_concrete' if y // 3 % 2 else 'white_concrete'
    box(5, 21, 5, 9, 23, 9, 'glass', 1); B[(7, 22, 7)] = 'glowstone'; box(4, 24, 4, 10, 24, 10, 'dark_oak_planks'); box(6, 25, 6, 8, 25, 8, 'dark_oak_planks')

def tower():
    box(0, 0, 0, 10, 0, 10, 'netherrack'); box(2, 1, 2, 8, 18, 8, 'blackstone', 1); box(1, 19, 1, 9, 19, 9, 'polished_blackstone')
    box(3, 1, 3, 7, 1, 7, 'lava')
    for i in range(1, 10, 2):
        for j in (1, 9): B[(i, 20, j)] = B[(j, 20, i)] = 'polished_blackstone'
    for y in (6, 12):
        B[(5, y, 2)] = B[(5, y, 8)] = 'glass'; B[(2, y + 1, 5)] = B[(8, y + 1, 5)] = 'shroomlight'

def vint(n, v): return bytes([3]) + S(n) + struct.pack('>i', v)
def S(x): b = x.encode(); return struct.pack('>H', len(b)) + b
def N(t, n, p): return bytes([t]) + S(n) + p
def P(*k): return b''.join(k) + b'\0'
def C(n, *k): return N(10, n, P(*k))
def XYZ(n, x, y, z): return C(n, vint('x', x), vint('y', y), vint('z', z))

def encode(name, author, desc):
    mn = [min(k[i] for k in B) for i in range(3)]; sz = [max(k[i] for k in B) - mn[i] + 1 for i in range(3)]
    pal = ['air'] + sorted(set(B.values())); m = {n: i for i, n in enumerate(pal)}
    bits = max(2, (len(pal) - 1).bit_length()); v = i = 0
    for y in range(sz[1]):
        for z in range(sz[2]):
            for x in range(sz[0]):
                v |= m.get(B.get((x + mn[0], y + mn[1], z + mn[2])), 0) << (i * bits); i += 1
    nl = (i * bits + 63) // 64
    L = [(v >> (64 * k)) & (2 ** 64 - 1) for k in range(nl)]; L = [a - 2 ** 64 if a >= 2 ** 63 else a for a in L]
    root = C('', vint('MinecraftDataVersion', 3955), vint('Version', 6),
        C('Metadata', XYZ('EnclosingSize', *sz), N(8, 'Author', S(author)), N(8, 'Description', S(desc)), N(8, 'Name', S(name)), vint('TotalBlocks', len(B))),
        C('Regions', C(name, XYZ('Position', 0, 0, 0), XYZ('Size', *sz),
            N(9, 'BlockStatePalette', bytes([10]) + struct.pack('>i', len(pal)) + b''.join(P(N(8, 'Name', S('minecraft:' + n))) for n in pal)),
            N(12, 'BlockStates', struct.pack('>i', nl) + b''.join(struct.pack('>q', a) for a in L)))))
    return gzip.compress(root), sz

DEMOS = [  # id, title, author, description, category, tags, version, downloads, likes, date, builder, featured
 ('medieval-castle', 'Medieval Castle', 'DemoBuilder', 'A walled stone-brick castle with four corner towers, crenellated walls, a central keep and a main gate. Great for survival bases.', 'Castles', ['castle', 'medieval', 'large'], '1.21.1', 4210, 812, '2026-09-12', castle, 1),
 ('cozy-cottage', 'Cozy Cottage', 'DemoCrafter', 'A small oak-and-spruce cottage with a brick chimney and glass windows. Perfect starter house.', 'Houses', ['house', 'cottage', 'small', 'survival'], '1.21.1', 2875, 604, '2026-09-20', cottage, 1),
 ('desert-pyramid', 'Stepped Desert Pyramid', 'DemoMason', 'A stepped sandstone pyramid with a golden capstone. Easy to scale up for monuments.', 'Monuments', ['pyramid', 'desert', 'monument'], '1.20.4', 1930, 377, '2026-08-30', pyramid, 1),
 ('striped-lighthouse', 'Striped Lighthouse', 'DemoBuilder', 'A tapering red-and-white lighthouse with a glass lantern room. Fits a coastal base.', 'Towers', ['lighthouse', 'coast', 'tower'], '1.21.4', 1204, 291, '2026-09-27', lighthouse, 0),
 ('nether-watchtower', 'Nether Watchtower', 'DemoMason', 'A blackstone watchtower with a lava floor, shroomlight windows and a crenellated top.', 'Towers', ['nether', 'tower', 'blackstone'], '1.20.1', 988, 202, '2026-09-02', tower, 0),
]
os.makedirs(ROOT + '/schematics', exist_ok=True); os.makedirs(ROOT + '/data', exist_ok=True); out = []
for id_, title, au, desc, cat, tags, ver, dl, lk, date, fn, feat in DEMOS:
    B.clear(); fn(); data, sz = encode(title, au, desc)
    open(f'{ROOT}/schematics/{id_}.litematic', 'wb').write(data)
    out.append(dict(id=id_, title=title, author=au, description=desc, file=f'schematics/{id_}.litematic', fileName=f'{id_}.litematic', fileSize=len(data),
        minecraftVersion=ver, litematicaVersion='0.21.0', category=cat, dimensions=dict(x=sz[0], y=sz[1], z=sz[2]), tags=tags, downloads=dl, likes=lk, uploaded=date, featured=bool(feat), demo=True, images=[]))
json.dump(out, open(ROOT + '/data/schematics.json', 'w'), indent=2); print('wrote', len(out), 'demo schematics')
