// The real objects of the room in the room view of the mixed reality mode (`?mr=1`, plan MR, decisions DMR3 and DMR4, task MR.3).
//
// What it does, in the room view only (with the model view or without `mr` nothing here acts):
//   - every scanned volume (`XRMesh` with `isBounded3D` and a furniture label, not as big as the room: `classifyVolume`) gets an outline,
//     ONE instanced mesh `ui:scan-outlines` for all of them (src/ui/scan-outlines.ts), +1 draw call;
//   - the RAY of each hand (`world.player.raySpaces[hand]`, the target ray pose of the input source, -Z forward) points at the nearest
//     volume it reaches (`pickVolume`, slab test, scratch objects only); that outline changes colour;
//   - a pinch (brief) with a hand that points at a volume SELECTS it: logs `mr object selected label=couch size=169x82x82` (cm) and opens the
//     card `ui:scan-card` (name, measures, `Add to Mine`, `Close`) pinned in front of the head (src/ui/scan-card-panel.ts);
//   - `Add to Mine` makes the own piece `my-scan-<kind>-<n>` (`ownPieceFromVolume`), dispatches `addScanned` (saved with the state) and tells
//     `onAdded` so the app joins it to the catalog (menu tab `Mine`, FitCheck). An object that is already there shows `Added`.
//
// Pinch arbitration: in the room view the pinches of the model do not exist. This system claims EVERY free pinch as `menu` (the
// highest priority), so no later listener (the grab, the tape measure, the pins, the viewpoint markers, the one-hand drag) gets it.
// Register it AFTER every control that is itself a `menu` claim (the menu, the buttons, the room button, the panels, the coach) and
// BEFORE the tape measure and the furniture grab.
//
// Nothing here allocates per frame: the rays, the poses and the hits are preallocated.

import { XRMesh, createSystem, Quaternion, Vector3, type Entity, type World } from '@iwsdk/core';
import { slog } from '../log';
import { scaleExtent } from '../logic/menu';
import { pinnedConeAngleDeg } from '../logic/menu-anchor';
import {
  addStatus,
  classifyVolume,
  createScanVolume,
  ownPieceFromVolume,
  pickVolume,
  type ScanVolume,
  type ScannedPiece,
  type VolumeHit,
  type VolumeInfo,
} from '../logic/room-scan';
import type { RoomObstacle } from '../logic/room-pieces';
import { volumeCenter } from '../logic/room-scan-log';
import { CARD_EXTENT, pickCardControl, type CardControl } from '../logic/room-view';
import { addScanned, type Store } from '../logic/state';
import { panelFontSupports } from '../ui/fonts';
import { ScanCardPanel, type CardModel } from '../ui/scan-card-panel';
import { OUTLINE_CAPACITY, ScanOutlines, type OutlineState } from '../ui/scan-outlines';
import { strings } from '../ui/strings';
import { isHighContrast, onAccessChange } from '../ui/theme';
import { onPinchStart, pinchClaims, pinchPoint, type Hand } from './pinch-input';
import { isRoomView } from './view-mode';
import { onRoomViewChange } from './room-view';

/** The ray reaches this far, metres: a room is small. */
export const RAY_MAX_DISTANCE = 8;
/** A pose that moved less than this (metres or quaternion units) is not written again. */
const POSE_EPSILON = 1e-4;

const HANDS: readonly Hand[] = ['left', 'right'];

export interface RoomObjectsHooks {
  /** Called after a piece was added to the state (the app joins it to the catalog). */
  onAdded?(piece: ScannedPiece): void;
  /** False when there is no catalog to join (the piece is still saved). */
  catalogReady?: boolean;
}

interface Entry {
  entity: Entity;
  info: VolumeInfo;
  volume: ScanVolume;
  /** Slot of its outline. */
  slot: number;
  state: OutlineState;
}

interface RoomObjectsContext {
  store: Store;
  hooks: RoomObjectsHooks;
  outlines: ScanOutlines;
  card: ScanCardPanel;
}

// Shared with the system, which has no constructor arguments: set by `createRoomObjects`.
let context: RoomObjectsContext | null = null;

/** Creates the outlines and the card and registers the system. */
export function createRoomObjects(world: World, store: Store, hooks: RoomObjectsHooks = {}): void {
  const outlines = new ScanOutlines();
  outlines.setHighContrast(isHighContrast());
  // An entity for the mesh (never `scene.add`); the mesh keeps its own name, `ui:scan-outlines`.
  world.createTransformEntity(outlines.mesh);
  context = { store, hooks, outlines, card: new ScanCardPanel(world) };
  world.registerSystem(RoomObjectsSystem);
}

/** True while the card of a real object is open (the hint of the palm menu and the coach stay out of its way, like for the Issues panel). */
export function isScanCardOpen(): boolean {
  return context?.card.isOpen ?? false;
}

/**
 * What the virtual pieces system (src/systems/room-pieces.ts) gives this one: the first look at a pinch of the room view (a control of the
 * card of a piece, or a piece to take) and the closing of its card. It is a bridge, not an import, because that system imports this one.
 */
export interface PieceBridge {
  /** Called after the card of a real object had no use for the pinch; `volumeDistance` is the distance to the volume the hand points at, -1 for none. True when the pinch is taken. */
  handlePinch(hand: Hand, volumeDistance: number): boolean;
  /** Closes the card of a virtual piece (a real object was selected). */
  closeCard(via: string): void;
}

let pieceBridge: PieceBridge | null = null;
let activeSystem: RoomObjectsSystem | null = null;

/** Registers (or, with null, removes) the bridge to the virtual pieces. */
export function registerPieceBridge(bridge: PieceBridge | null): void {
  pieceBridge = bridge;
}

/** The real volumes as obstacles for the virtual pieces: their poses are kept up to date in place; do not modify. */
export function getRoomObstacles(): readonly RoomObstacle[] {
  return activeSystem?.obstacles ?? [];
}

/** Distance to the real volume `hand` points at, metres; -1 when the hand points at none (or the room view is off). */
export function volumeHoverDistance(hand: Hand): number {
  return activeSystem ? activeSystem.hoverDistance[hand] : -1;
}

/** Closes the card of a real object (the card of a virtual piece opened, or the session is suspended). */
export function closeScanCard(via: string): void {
  activeSystem?.closeCard(via);
}

export class RoomObjectsSystem extends createSystem({
  meshes: { required: [XRMesh] },
}) {
  private readonly entries: Entry[] = [];
  /** The volumes of `entries`, in the same order (what `pickVolume` takes). */
  private readonly volumes: ScanVolume[] = [];
  /** The same volumes with their names, in the same order (what the virtual pieces collide with). */
  readonly obstacles: RoomObstacle[] = [];
  /** Distance to the volume each hand points at, metres, -1 for none. */
  readonly hoverDistance: Record<Hand, number> = { left: -1, right: -1 };
  private readonly freeSlots: number[] = [];
  private readonly hit: VolumeHit = { index: -1, distance: 0 };
  private readonly origin = new Vector3();
  private readonly direction = new Vector3();
  private readonly quaternion = new Quaternion();
  private readonly point = new Vector3();
  private readonly headPosition = new Vector3();
  private readonly headForward = new Vector3();
  private readonly headQuaternion = new Quaternion();
  private readonly position: [number, number, number] = [0, 0, 0];
  private readonly rotation: [number, number, number, number] = [0, 0, 0, 1];
  private readonly center: [number, number, number] = [0, 0, 0];
  private readonly hover: Record<Hand, Entry | null> = { left: null, right: null };
  private selected: Entry | null = null;
  private lastCount = -1;
  private countChangedAt = 0;
  private time = 0;

  init(): void {
    activeSystem = this;
    for (let i = OUTLINE_CAPACITY - 1; i >= 0; i -= 1) this.freeSlots.push(i);
    this.cleanupFuncs.push(onPinchStart((hand) => this.onPinch(hand)));
    this.cleanupFuncs.push(
      onRoomViewChange((view) => {
        context?.outlines.setVisible(view === 'room');
        if (view === 'model') this.closeCard('view');
      }),
    );
    this.cleanupFuncs.push(
      onAccessChange(() => {
        context?.outlines.setHighContrast(isHighContrast());
        return 1;
      }),
    );
    const ctx = context;
    if (ctx) {
      // The card follows the list of added pieces (a restore, an add from anywhere): `Add to Mine` becomes `Added`.
      let seen = ctx.store.get().scannedFurniture;
      this.cleanupFuncs.push(
        ctx.store.subscribe((state) => {
          if (state.scannedFurniture === seen) return;
          seen = state.scannedFurniture;
          this.refreshCard();
        }),
      );
    }
    for (const entity of this.queries.meshes.entities) this.onVolume(entity);
    this.queries.meshes.subscribe('qualify', (entity) => this.onVolume(entity));
    this.queries.meshes.subscribe('disqualify', (entity) => this.onVolumeGone(entity));
    this.cleanupFuncs.push(() => {
      this.closeCard('teardown');
      context?.outlines.dispose();
      if (activeSystem === this) activeSystem = null;
    });
  }

  update(_delta: number, time: number): void {
    const ctx = context;
    if (!ctx) return;
    this.time = time;
    ctx.card.update();
    this.logCount();
    const active = isRoomView() && this.world.renderer.xr.isPresenting;
    if (!active) {
      this.clearHover();
      return;
    }
    this.refreshPoses();
    this.pointRays();
    this.paint();
  }

  /** A volume of the scan: kept when it is furniture of a plausible size. */
  private onVolume(entity: Entity): void {
    const ctx = context;
    if (!ctx || this.entries.length >= OUTLINE_CAPACITY || this.entries.some((e) => e.entity === entity)) return;
    const object = entity.object3D;
    if (!object) return;
    object.getWorldQuaternion(this.quaternion);
    this.rotation[0] = this.quaternion.x;
    this.rotation[1] = this.quaternion.y;
    this.rotation[2] = this.quaternion.z;
    this.rotation[3] = this.quaternion.w;
    const info = classifyVolume(
      entity.getValue(XRMesh, 'semanticLabel') ?? '',
      entity.getValue(XRMesh, 'isBounded3D') ?? false,
      entity.getVectorView(XRMesh, 'dimensions'),
      this.rotation,
    );
    if (!info) return;
    const slot = this.freeSlots.pop();
    if (slot === undefined) return;
    const entry: Entry = { entity, info, volume: createScanVolume(), slot, state: 'idle' };
    this.entries.push(entry);
    this.volumes.push(entry.volume);
    this.obstacles.push({ volume: entry.volume, name: info.name });
    this.writePose(entry, true);
    ctx.outlines.setVisible(isRoomView());
  }

  private onVolumeGone(entity: Entity): void {
    const ctx = context;
    const index = this.entries.findIndex((e) => e.entity === entity);
    if (!ctx || index < 0) return;
    const entry = this.entries[index];
    if (this.selected === entry) this.closeCard('gone');
    for (const hand of HANDS) if (this.hover[hand] === entry) this.hover[hand] = null;
    ctx.outlines.clear(entry.slot);
    this.freeSlots.push(entry.slot);
    this.entries.splice(index, 1);
    this.volumes.splice(index, 1);
    this.obstacles.splice(index, 1);
  }

  /** Reads the pose of the mesh of `entry` into its volume and, when it changed (or `force`), into its outline. */
  private writePose(entry: Entry, force: boolean): void {
    const ctx = context;
    const object = entry.entity.object3D;
    if (!ctx || !object) return;
    object.getWorldPosition(this.point);
    object.getWorldQuaternion(this.quaternion);
    this.position[0] = this.point.x;
    this.position[1] = this.point.y;
    this.position[2] = this.point.z;
    this.rotation[0] = this.quaternion.x;
    this.rotation[1] = this.quaternion.y;
    this.rotation[2] = this.quaternion.z;
    this.rotation[3] = this.quaternion.w;
    volumeCenter(this.position, this.rotation, entry.entity.getVectorView(XRMesh, 'min'), entry.entity.getVectorView(XRMesh, 'max'), this.center);
    const dimensions = entry.entity.getVectorView(XRMesh, 'dimensions');
    const volume = entry.volume;
    let changed = force;
    for (let i = 0; i < 3 && !changed; i += 1) {
      if (Math.abs(volume.center[i] - this.center[i]) > POSE_EPSILON || Math.abs(volume.extents[i] - dimensions[i]) > POSE_EPSILON) changed = true;
    }
    for (let i = 0; i < 4 && !changed; i += 1) {
      if (Math.abs(volume.rotation[i] - this.rotation[i]) > POSE_EPSILON) changed = true;
    }
    if (!changed) return;
    for (let i = 0; i < 3; i += 1) {
      volume.center[i] = this.center[i];
      volume.extents[i] = dimensions[i];
    }
    for (let i = 0; i < 4; i += 1) volume.rotation[i] = this.rotation[i];
    ctx.outlines.set(entry.slot, volume);
    ctx.outlines.setState(entry.slot, entry.state);
  }

  private refreshPoses(): void {
    for (const entry of this.entries) this.writePose(entry, false);
  }

  /** The ray of each hand against the volumes: the nearest one is the hovered one. */
  private pointRays(): void {
    const rays = this.world.player.raySpaces;
    // With a virtual piece in a hand (room-pieces.ts) the rays are for the floor: no object lights up.
    const holding = pinchClaims.anyClaimed('furniture');
    for (const hand of HANDS) {
      const ray = rays[hand];
      let next: Entry | null = null;
      // A hand that is not tracked has a hidden ray with its last pose: it points at nothing.
      if (ray && ray.visible && !holding) {
        ray.getWorldPosition(this.origin);
        ray.getWorldQuaternion(this.quaternion);
        this.direction.set(0, 0, -1).applyQuaternion(this.quaternion);
        if (pickVolume(this.origin, this.direction, this.volumes, RAY_MAX_DISTANCE, this.hit)) next = this.entries[this.hit.index];
      }
      this.hoverDistance[hand] = next ? this.hit.distance : -1;
      if (next !== this.hover[hand]) {
        this.hover[hand] = next;
        if (next) slog(`mr hover hand=${hand} label=${next.info.key} distance=${this.hit.distance.toFixed(2)}`);
      }
    }
  }

  private clearHover(): void {
    this.hover.left = null;
    this.hover.right = null;
    this.hoverDistance.left = -1;
    this.hoverDistance.right = -1;
    // A hidden mesh needs no colours; the next room view starts from the current states.
  }

  /** The colour of every outline: selected, pointed at by a hand, or idle. */
  private paint(): void {
    const ctx = context;
    if (!ctx) return;
    for (const entry of this.entries) {
      const state: OutlineState = entry === this.selected ? 'selected' : entry === this.hover.left || entry === this.hover.right ? 'hover' : 'idle';
      if (state === entry.state) continue;
      entry.state = state;
      ctx.outlines.setState(entry.slot, state);
    }
  }

  /** Logs how many outlines there are once the count has stayed the same for a second. */
  private logCount(): void {
    const count = this.entries.length;
    if (count !== this.lastCount) {
      this.lastCount = count;
      this.countChangedAt = this.time;
      return;
    }
    if (this.countChangedAt >= 0 && this.time - this.countChangedAt >= 1) {
      this.countChangedAt = -1;
      slog(`mr objects outlined=${count}`);
    }
  }

  // --- selection, card ---------------------------------------------------------------------------------------------------

  private onPinch(hand: Hand): void {
    const ctx = context;
    if (!ctx || !isRoomView() || !this.world.renderer.xr.isPresenting) return;
    // A control of an open menu or a button (or anyone else) has this pinch already.
    if (pinchClaims.ownerOf(hand) !== null) return;
    // With a piece in a hand the other pinch is the tap that rotates it: not ours.
    if (pinchClaims.anyClaimed('furniture')) return;
    // The pinches of the model do not exist in the room: this one is ours whatever it hits.
    if (!pinchClaims.claim(hand, 'menu')) return;
    if (ctx.card.hasFrame) {
      pinchPoint(hand, this.point);
      const control = pickCardControl(this.point, ctx.card.center, ctx.card.yaw, ctx.card.scale, this.selectedStatus().kind === 'add');
      if (control !== null) {
        this.pressCard(control);
        return;
      }
    }
    // A control of the card of a virtual piece, or a virtual piece to take (nearer than the real object the hand points at).
    if (pieceBridge?.handlePinch(hand, this.hoverDistance[hand])) return;
    const target = this.hover[hand];
    if (target) this.select(target);
  }

  private select(entry: Entry): void {
    const ctx = context;
    if (!ctx) return;
    pieceBridge?.closeCard('object');
    this.selected = entry;
    const [w, d, h] = entry.info.cm;
    slog(`mr object selected label=${entry.info.key} size=${w}x${d}x${h}`);
    const head = this.world.player.head;
    head.getWorldPosition(this.headPosition);
    head.getWorldQuaternion(this.headQuaternion);
    this.headForward.set(0, 0, -1).applyQuaternion(this.headQuaternion);
    ctx.card.open(this.cardModel(entry), this.headPosition, this.headForward);
    ctx.card.setModel(this.cardModel(entry));
    const angle = pinnedConeAngleDeg(
      ctx.card.anchor,
      ctx.card.yaw,
      this.headPosition,
      this.headForward,
      scaleExtent(CARD_EXTENT, ctx.card.scale),
    );
    slog(`mr card opened label=${entry.info.key} coneDeg=${angle.toFixed(1)}`);
    this.paint();
  }

  private selectedStatus(): ReturnType<typeof addStatus> {
    const ctx = context;
    if (!ctx || !this.selected) return { kind: 'full' };
    return addStatus(ctx.store.get().scannedFurniture, this.selected.info);
  }

  private cardModel(entry: Entry): CardModel {
    const [w, d, h] = entry.info.cm;
    const ascii = !panelFontSupports(strings.room.measures(w, d, h));
    const status = context ? addStatus(context.store.get().scannedFurniture, entry.info) : ({ kind: 'full' } as const);
    return {
      title: entry.info.name,
      measures: strings.room.measures(w, d, h, ascii),
      action: status.kind === 'add' ? 'add' : status.kind,
      addText: status.kind === 'add' ? strings.room.addToMine : status.kind === 'added' ? strings.room.added : strings.room.full,
      closeText: strings.room.close,
    };
  }

  private refreshCard(): void {
    const ctx = context;
    if (!ctx || !this.selected || !ctx.card.isOpen) return;
    ctx.card.setModel(this.cardModel(this.selected));
  }

  private pressCard(control: CardControl): void {
    const ctx = context;
    if (!ctx || !this.selected) return;
    if (control === 'close') {
      this.closeCard('button');
      return;
    }
    const entry = this.selected;
    const piece = ownPieceFromVolume(entry.info, ctx.store.get().scannedFurniture);
    if (!piece) return;
    const before = ctx.store.get().scannedFurniture.length;
    ctx.store.dispatch(addScanned(piece));
    if (ctx.store.get().scannedFurniture.length === before) return;
    slog(`mr object added id=${piece.id} name="${piece.name}" size=${piece.size.map((v) => Math.round(v * 100)).join('x')}`);
    ctx.hooks.onAdded?.(piece);
    this.refreshCard();
  }

  closeCard(via: string): void {
    const ctx = context;
    if (!ctx || (!this.selected && !ctx.card.isOpen)) return;
    ctx.card.dispose();
    this.selected = null;
    slog(`mr card closed via=${via}`);
    this.paint();
  }
}
