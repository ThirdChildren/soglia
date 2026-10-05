// Builds public/catalog/models/<catalogId>.glb from the Kenney Furniture Kit sources (CC0).
// Needs @gltf-transform/core, /functions, /extensions (installed outside the project, not a dependency):
//   node build-furniture.mjs <srcDir> <outDir> <catalog.json>
// Per piece: bake node transforms, recenter (origin on the floor, centered in x/z), scale non-uniformly
// to the catalog size [width, depth, height], turn 180 degrees about Y (Kenney fronts face +z, ours -z),
// convert material colors to vertex colors, drop UVs and unlit extension, one white PBR material, one primitive.
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds, transformPrimitive, joinPrimitives } from '@gltf-transform/functions';
import fs from 'fs';

const [srcDir, outDir, catalogPath] = process.argv.slice(2);
const parts = {
  'bed-double': ['bedDouble'],
  'bed-single': ['bedSingle'],
  'sofa-3seat': ['loungeDesignSofa'],
  armchair: ['loungeChair'],
  'table-dining': ['table'],
  chair: ['chair'],
  'coffee-table': ['tableCoffeeSquare'],
  desk: ['desk'],
  bookcase: ['bookcaseClosedWide'],
  wardrobe: ['bookcaseClosedDoors', 'bookcaseClosedDoors'], // two door units side by side
  nightstand: ['cabinetBed'],
  'tv-stand': ['cabinetTelevision'],
  rug: ['rugRectangle'],
  plant: ['pottedPlant'],
};
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
const translate = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
const scale = (x, y, z) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1];
const rotY180 = [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1];

for (const [id, names] of Object.entries(parts)) {
  const item = catalog.items.find((i) => i.id === id);
  const [w, d, h] = item.size;
  const out = new Document();
  const buffer = out.createBuffer();
  const prims = [];
  // 1) bake each source part, placing multiple copies side by side along x
  let xOff = 0;
  const staged = [];
  for (const name of names) {
    const src = await io.read(`${srcDir}/${name}.glb`);
    const scene = src.getRoot().listScenes()[0];
    const b = getBounds(scene);
    scene.traverse((node) => {
      const mesh = node.getMesh();
      if (!mesh) return;
      const wm = mul(translate(xOff - b.min[0], 0, 0), node.getWorldMatrix());
      for (const p of mesh.listPrimitives()) {
        const color = p.getMaterial()?.getBaseColorFactor() ?? [1, 1, 1, 1];
        const np = out.createPrimitive();
        const pos = out.createAccessor().setType('VEC3').setArray(new Float32Array(p.getAttribute('POSITION').getArray())).setBuffer(buffer);
        np.setAttribute('POSITION', pos);
        const nrm = p.getAttribute('NORMAL');
        if (nrm) np.setAttribute('NORMAL', out.createAccessor().setType('VEC3').setArray(new Float32Array(nrm.getArray())).setBuffer(buffer));
        const idx = p.getIndices();
        np.setIndices(out.createAccessor().setType('SCALAR').setArray(new Uint32Array(idx.getArray())).setBuffer(buffer));
        const n = pos.getCount();
        const col = new Float32Array(n * 4);
        for (let i = 0; i < n; i++) col.set(color.slice(0, 3).concat(1), i * 4);
        np.setAttribute('COLOR_0', out.createAccessor().setType('VEC4').setArray(col).setBuffer(buffer));
        transformPrimitive(np, wm);
        staged.push(np);
      }
    });
    xOff += b.max[0] - b.min[0];
  }
  // 2) join, then recenter + scale + rotate
  const mat = out.createMaterial(id).setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(0).setRoughnessFactor(0.85);
  const tmpMesh = out.createMesh(id);
  for (const p of staged) { p.setMaterial(mat); tmpMesh.addPrimitive(p); }
  const joined = joinPrimitives(staged);
  for (const p of staged) { tmpMesh.removePrimitive(p); p.dispose(); }
  joined.setMaterial(mat);
  tmpMesh.addPrimitive(joined);
  const node = out.createNode(id).setMesh(tmpMesh);
  out.createScene(id).addChild(node);
  const b0 = getBounds(out.getRoot().listScenes()[0]);
  const sx = w / (b0.max[0] - b0.min[0]), sy = h / (b0.max[1] - b0.min[1]), sz = d / (b0.max[2] - b0.min[2]);
  const cx = (b0.max[0] + b0.min[0]) / 2, cz = (b0.max[2] + b0.min[2]) / 2;
  const M = mul(rotY180, mul(scale(sx, sy, sz), translate(-cx, -b0.min[1], -cz)));
  transformPrimitive(joined, M);
  // drop UVs if any survived, remove orphans
  for (const sem of joined.listSemantics()) if (sem.startsWith('TEXCOORD')) joined.setAttribute(sem, null);
  for (const a of out.getRoot().listAccessors()) if (a.listParents().filter((p) => p.propertyType !== 'Root').length === 0) a.dispose();
  const b1 = getBounds(out.getRoot().listScenes()[0]);
  const tris = joined.getIndices().getCount() / 3;
  console.log(id.padEnd(13), 'scale', [sx, sy, sz].map((v) => v.toFixed(2)).join(' '), 'size', [0, 2, 1].map((i) => (b1.max[i] - b1.min[i]).toFixed(3)).join(' x '), 'min y', b1.min[1].toFixed(3), 'tris', tris);
  out.getRoot().getAsset().generator = 'soglia build-furniture.mjs (Kenney Furniture Kit, CC0)';
  await io.write(`${outDir}/${id}.glb`, out);
}
