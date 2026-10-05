// Ghost hand of the onboarding hint (`ui:ghost-hand-left`, `ui:ghost-hand-right`): a simple
// see-through hand built from boxes, no text. Four meshes per hand (palm, thumb, index finger, the
// three curled fingers), so four draw calls. Geometry and material are shared by both hands and
// are created on first use (front faces only: a transparent double-sided material is drawn twice);
// the entity itself exists only while the hint is on screen.
//
// Local frame: the fingers point toward -Z, the thumb is on top (+Y); the palm faces sideways, so
// the same shape serves for the left and the right hand. `setOpenness` turns the thumb and the
// index finger around X: 1 = apart, 0 = their tips touch (a pinch).
//
// Not interactive on purpose: no RayInteractable, so it never takes a ray from the real hands.

import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Entity,
  type World,
} from '@iwsdk/core';
import { tagEntity } from '../components/tag-entity';
import { stableId } from '../logic/ids';

export type HandSide = 'left' | 'right';

const GHOST_COLOR = 0x4cc3ff;
const GHOST_OPACITY = 0.6;

/** Thumb and index finger: hinge position on the palm (metres), length, and angle at both ends. */
const THUMB_HINGE_Y = 0.045;
const THUMB_HINGE_Z = -0.01;
const THUMB_LENGTH = 0.11;
const THUMB_CLOSED = -0.136; // radians: tip meets the index tip
const THUMB_OPEN = 0.7;
const INDEX_HINGE_Y = 0.015;
const INDEX_HINGE_Z = -0.045;
const INDEX_LENGTH = 0.08;
const INDEX_CLOSED = 0.188;
const INDEX_OPEN = -0.55;

interface SharedParts {
  palm: BoxGeometry;
  thumb: BoxGeometry;
  index: BoxGeometry;
  curled: BoxGeometry;
  material: MeshBasicMaterial;
}

let shared: SharedParts | null = null;

function getShared(): SharedParts {
  if (shared) return shared;
  const thumb = new BoxGeometry(0.018, 0.018, THUMB_LENGTH);
  thumb.translate(0, 0, -THUMB_LENGTH / 2);
  const index = new BoxGeometry(0.016, 0.016, INDEX_LENGTH);
  index.translate(0, 0, -INDEX_LENGTH / 2);
  shared = {
    palm: new BoxGeometry(0.03, 0.09, 0.09),
    thumb,
    index,
    curled: new BoxGeometry(0.018, 0.05, 0.04),
    material: new MeshBasicMaterial({
      color: GHOST_COLOR,
      transparent: true,
      opacity: GHOST_OPACITY,
      depthWrite: false,
    }),
  };
  return shared;
}

export class GhostHand {
  readonly entity: Entity;
  readonly group: Group;
  private readonly thumb: Mesh;
  private readonly index: Mesh;

  constructor(world: World, readonly side: HandSide) {
    const parts = getShared();
    this.group = new Group();
    this.group.rotation.order = 'YXZ';

    const palm = new Mesh(parts.palm, parts.material);
    this.thumb = new Mesh(parts.thumb, parts.material);
    this.thumb.position.set(0, THUMB_HINGE_Y, THUMB_HINGE_Z);
    this.index = new Mesh(parts.index, parts.material);
    this.index.position.set(0, INDEX_HINGE_Y, INDEX_HINGE_Z);
    const curled = new Mesh(parts.curled, parts.material);
    curled.position.set(0, -0.03, -0.065);
    for (const mesh of [palm, this.thumb, this.index, curled]) {
      mesh.renderOrder = 10;
      this.group.add(mesh);
    }
    this.setOpenness(1);

    this.entity = world.createTransformEntity(this.group);
    tagEntity(this.entity, stableId.ui(side === 'left' ? 'ghost-hand-left' : 'ghost-hand-right'));
  }

  /** 1 = thumb and index apart, 0 = pinching. Allocation-free. */
  setOpenness(openness: number): void {
    const o = openness < 0 ? 0 : openness > 1 ? 1 : openness;
    this.thumb.rotation.x = THUMB_CLOSED + (THUMB_OPEN - THUMB_CLOSED) * o;
    this.index.rotation.x = INDEX_CLOSED + (INDEX_OPEN - INDEX_CLOSED) * o;
  }

  /** Removes the entity. The shared geometry and material stay for the next time. */
  dispose(): void {
    this.entity.dispose({ disposeResources: false });
  }
}
