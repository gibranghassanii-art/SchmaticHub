import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Parse in a Web Worker so big files never freeze the page. cb(stageText) is optional.
export const parse = (buf, cb) => new Promise((ok, no) => {
  const w = new Worker(new URL('./litematic.js', import.meta.url), { type: 'module' });
  w.onmessage = e => e.data.stage ? cb?.(e.data.stage) : (w.terminate(), e.data.error ? no(Error(e.data.error)) : ok(e.data));
  w.onerror = () => no(Error('Could not start the parser worker'));
  w.postMessage(buf, [buf]);
});

const dispose = g => g.traverse(o => { o.geometry?.dispose(); o.material?.dispose?.() });

function build(d) {
  const [x, y, z] = d.dim, g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(d.pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(d.col, 3, true));
  g.setIndex(new THREE.BufferAttribute(d.idx, 1));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  m.position.set(-x / 2, -y / 2, -z / 2);
  const n = Math.max(x, z) + 8, grid = new THREE.GridHelper(n, n, 0x4ade5a, 0x2b3a2f);
  grid.position.y = -y / 2 - .02;
  return new THREE.Group().add(m, grid);
}

function frame(C, O, [x, y, z]) {
  const r = Math.hypot(x, y, z) / 2, D = r / Math.sin(C.fov * Math.PI / 360) * Math.max(1, 1 / C.aspect) * 1.05;
  C.near = D / 300; C.far = D * 10; C.position.set(.55, .45, .75).setLength(D);
  O.target.set(0, 0, 0); O.maxDistance = D * 3; O.minDistance = 2; C.updateProjectionMatrix(); O.update();
}

// Interactive viewer: rotate (drag), zoom (wheel/pinch), pan (right-drag / two fingers). Renders only on change.
export function mount(el) {
  const R = new THREE.WebGLRenderer({ antialias: true, alpha: true }), S = new THREE.Scene(),
    C = new THREE.PerspectiveCamera(45, 1, .1, 1e4), O = new OrbitControls(C, R.domElement);
  R.setPixelRatio(Math.min(devicePixelRatio, 2)); el.prepend(R.domElement);
  const draw = () => R.render(S, C); O.addEventListener('change', draw);
  const ro = new ResizeObserver(() => {
    const w = el.clientWidth || 1, h = el.clientHeight || 1;
    R.setSize(w, h, false); C.aspect = w / h; C.updateProjectionMatrix(); draw();
  }); ro.observe(el);
  let g, d, dead;
  return {
    async load(buf, cb) {
      const r = await parse(buf, cb); if (dead) return r;
      d = r; if (g) { S.remove(g); dispose(g) }
      g = build(r); S.add(g); frame(C, O, r.dim); draw(); return r;
    },
    reset() { if (d) { frame(C, O, d.dim); draw() } },
    dispose() { dead = 1; ro.disconnect(); O.dispose(); g && dispose(g); R.dispose(); R.forceContextLoss(); R.domElement.remove() }
  };
}

// Card previews: one shared offscreen renderer renders the real schematic to a PNG, one at a time, cached.
const cache = new Map(); let TR, chain = Promise.resolve();
export function thumb(url) {
  if (!cache.has(url)) { const p = chain.then(() => shot(url)).catch(() => null); chain = p; cache.set(url, p) }
  return cache.get(url);
}
async function shot(url) {
  const r = await fetch(url); if (!r.ok) throw 0;
  const d = await parse(await r.arrayBuffer());
  TR ??= new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); TR.setSize(480, 300);
  const S = new THREE.Scene(), C = new THREE.PerspectiveCamera(40, 1.6, 1, 1e4), g = build(d);
  S.add(g); frame(C, { target: new THREE.Vector3(), update() {} }, d.dim); TR.render(S, C);
  const u = TR.domElement.toDataURL(); dispose(g); return u;
}
