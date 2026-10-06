// Visuals of the furniture pieces (task T2.9, decision D20): the glTF model of the catalog item when
// it loads, otherwise a procedural fallback block (a box of the catalog size plus a dark strip on the
// front, the -z side). Plus the outline frame drawn on the floor around the footprint (D14).
//
// Geometries and materials are shared: one set of materials for every piece, one block geometry per
// catalog id, one frame geometry per footprint size, and the glTF clones share the cached geometry
// and materials of the model. Pieces are therefore disposed with `disposeResources: false`.

import {
  AssetManager,
  Box3,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Vector3,
  type Object3D,
} from '@iwsdk/core';
import { slog, swarn } from '../log';
import type { CatalogItem } from '../logic/catalog';
import type { OutlineKind } from '../logic/furniture-diff';
import { palette } from './theme';

/** Thickness of the outline frame, in real metres of the plan (D14). */
export const OUTLINE_WIDTH = 0.1;
/** The frame floats this high above the floor, above the door strips (0.01 m). */
const OUTLINE_LIFT = 0.02;
/** Depth of the dark front strip of a fallback block, metres. */
const STRIP_DEPTH = 0.02;
/** A model is reported when a side differs from the catalog size by more than this, metres. */
const SIZE_TOLERANCE = 0.05;

export const modelAssetId = (catalogId: string): string => `furniture-${catalogId}`;

interface PieceUserData {
  outline: Mesh;
}

export class FurnitureVisuals {
  private readonly blockMaterial = new MeshStandardMaterial({ color: palette.furniture, roughness: 1, metalness: 0 });
  private readonly stripMaterial = new MeshStandardMaterial({ color: palette.furnitureFront, roughness: 1, metalness: 0 });
  private readonly greenMaterial = new MeshBasicMaterial({ color: palette.outlineValid, side: DoubleSide });
  private readonly redMaterial = new MeshBasicMaterial({ color: palette.outlineInvalid, side: DoubleSide });
  private readonly blockGeometry = new Map<string, BufferGeometry>();
  private readonly stripGeometry = new Map<string, BufferGeometry>();
  private readonly frameGeometry = new Map<string, BufferGeometry>();
  private readonly itemById = new Map<string, CatalogItem>();
  /** Catalog ids whose model loaded: only these are instantiated from the AssetManager. */
  private readonly modelReady = new Set<string>();

  constructor(items: readonly CatalogItem[]) {
    for (const item of items) this.itemById.set(item.id, item);
  }

  /**
   * Loads the model of every catalog item that has one (all in parallel, through the AssetManager).
   * A model that fails to load is reported once and that item keeps the fallback block.
   * With `simulateFailure` (`failmodels=1` together with `debug=1`) every load is replaced by a failure.
   */
  async preload(simulateFailure = false): Promise<{ models: number; fallbacks: number }> {
    const withModel = [...this.itemById.values()].filter((item) => typeof item.model === 'string');
    if (simulateFailure) slog('debug failmodels=1: every furniture model fails to load');
    const results = await Promise.allSettled(
      withModel.map((item) =>
        simulateFailure
          ? Promise.reject(new Error('simulated model failure'))
          : AssetManager.loadGLTFById(modelAssetId(item.id)),
      ),
    );
    results.forEach((result, index) => {
      const item = withModel[index];
      if (result.status === 'fulfilled') {
        this.modelReady.add(item.id);
        this.checkSize(item, result.value.scene);
      } else {
        swarn(`furniture model unavailable ${item.id}: using a block`);
      }
    });
    const models = this.modelReady.size;
    const fallbacks = this.itemById.size - models;
    slog(`furniture models loaded=${models} fallback=${fallbacks}`);
    return { models, fallbacks };
  }

  /** True if the catalog item shows a glTF model (false: fallback block). */
  hasModel(catalogId: string): boolean {
    return this.modelReady.has(catalogId);
  }

  /** A new piece object: model or block, plus a hidden outline frame. Origin on the floor, at the centre of the footprint. */
  create(item: CatalogItem): Group {
    const group = new Group();
    const body = this.createBody(item);
    group.add(body);
    const frame = new Mesh(this.frame(item.size[0], item.size[1]), this.redMaterial);
    frame.visible = false;
    group.add(frame);
    (group.userData as PieceUserData).outline = frame;
    return group;
  }

  /** Shows the frame in the colour of `kind` (`none` hides it). */
  setOutline(group: Object3D, kind: OutlineKind): void {
    const frame = (group.userData as Partial<PieceUserData>).outline;
    if (!frame) return;
    frame.visible = kind !== 'none';
    if (kind !== 'none') frame.material = kind === 'green' ? this.greenMaterial : this.redMaterial;
  }

  /**
   * The preview frame of a held piece (D14): a flat frame on the floor of the model, in its own object (not part
   * of the piece, which follows the hand). Hidden until `setPreview` shows it.
   */
  createPreviewFrame(item: Pick<CatalogItem, 'size'>): Mesh {
    const mesh = new Mesh(this.frame(item.size[0], item.size[1]), this.greenMaterial);
    mesh.visible = false;
    return mesh;
  }

  /** Shows the preview frame in the colour of `kind`, or hides it (`none`). */
  setPreview(mesh: Mesh, kind: OutlineKind): void {
    mesh.visible = kind !== 'none';
    if (kind !== 'none') mesh.material = kind === 'green' ? this.greenMaterial : this.redMaterial;
  }

  /** Frees the shared geometries and materials (when the whole furniture system goes away). */
  dispose(): void {
    for (const geometry of [...this.blockGeometry.values(), ...this.stripGeometry.values(), ...this.frameGeometry.values()]) {
      geometry.dispose();
    }
    this.blockGeometry.clear();
    this.stripGeometry.clear();
    this.frameGeometry.clear();
    for (const material of [this.blockMaterial, this.stripMaterial, this.greenMaterial, this.redMaterial]) {
      material.dispose();
    }
  }

  private createBody(item: CatalogItem): Object3D {
    if (this.modelReady.has(item.id)) {
      const gltf = AssetManager.getGLTF(modelAssetId(item.id));
      if (gltf) return gltf.scene;
      swarn(`furniture model missing from the cache ${item.id}: using a block`);
    }
    return this.createBlock(item);
  }

  private createBlock(item: CatalogItem): Group {
    const [w, d, h] = item.size;
    const block = new Group();
    const box = new Mesh(this.box(this.blockGeometry, item.id, w, h, d, 0, h / 2, 0), this.blockMaterial);
    block.add(box);
    // Front strip: on the -z face, sticking out by half its depth so it never z-fights with the box.
    const stripHeight = Math.max(h * 0.6, 0.005);
    const strip = new Mesh(
      this.box(this.stripGeometry, item.id, w * 0.8, stripHeight, STRIP_DEPTH, 0, h / 2, -d / 2),
      this.stripMaterial,
    );
    block.add(strip);
    return block;
  }

  private box(
    cache: Map<string, BufferGeometry>,
    key: string,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
  ): BufferGeometry {
    let geometry = cache.get(key);
    if (!geometry) {
      geometry = new BoxGeometry(w, h, d);
      geometry.translate(x, y, z);
      cache.set(key, geometry);
    }
    return geometry;
  }

  /** Frame geometry: a flat ring just outside the footprint `w` x `d`, OUTLINE_WIDTH thick. */
  private frame(w: number, d: number): BufferGeometry {
    const key = `${w}x${d}`;
    let geometry = this.frameGeometry.get(key);
    if (!geometry) {
      geometry = frameGeometry(w, d);
      this.frameGeometry.set(key, geometry);
    }
    return geometry;
  }

  private checkSize(item: CatalogItem, scene: Object3D): void {
    const size = new Box3().setFromObject(scene).getSize(new Vector3());
    const [w, d, h] = item.size;
    if (
      Math.abs(size.x - w) > SIZE_TOLERANCE ||
      Math.abs(size.z - d) > SIZE_TOLERANCE ||
      Math.abs(size.y - h) > SIZE_TOLERANCE
    ) {
      swarn(
        `furniture model ${item.id} size ${size.x.toFixed(2)}x${size.z.toFixed(2)}x${size.y.toFixed(2)} ` +
          `differs from the catalog ${w}x${d}x${h}`,
      );
    }
  }
}

/** Flat ring around a `w` x `d` rectangle centred on the origin (pure data: exported for tests). */
export function frameGeometry(w: number, d: number, width = OUTLINE_WIDTH): BufferGeometry {
  const ix = w / 2;
  const iz = d / 2;
  const ox = ix + width;
  const oz = iz + width;
  const y = OUTLINE_LIFT;
  // Outer corners 0-3, inner corners 4-7, in the same order.
  const positions = new Float32Array([
    -ox, y, -oz, ox, y, -oz, ox, y, oz, -ox, y, oz,
    -ix, y, -iz, ix, y, -iz, ix, y, iz, -ix, y, iz,
  ]);
  const indices: number[] = [];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    indices.push(i, j, 4 + j, i, 4 + j, 4 + i);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry;
}
