// Virtual pieces at real scale in the room view of the mixed reality mode (`?mr=1`, plan MR, decisions DMR3, DMR5 and DMR6, tasks MR.4
// and MR.5).
//
// What it does, in the room view only (in the model view, or without `mr`, nothing here acts):
//   - a piece chosen in the menu (any tab) is made at 1:1 (the same model as the one on the table, scale 1; the block when the model
//     is missing) and follows the point where the RAY of the holding hand meets the floor, for as long as the pinch lasts; on release it
//     stays there. A placed piece is taken again by pointing at it and pinching. A ray that does not meet the scanned floor when the
//     pinch ends removes the piece. Turning: rolling the wrist about the ray (a quarter turn beyond 50 degrees; aiming elsewhere does not
//     turn it) or a tap of the other hand, as on the table;
//   - the piece is judged in plan against the real volumes (the room objects with an outline) and against the other virtual pieces:
//     a red frame on the piece and ONE label in front of the head ("Overlaps the couch"). An invalid piece may be put down anyway;
//   - a brief pinch on a placed piece (it did not move) opens its card (`ui:scan-card` again: name, measures, `Remove`, `Close`);
//   - the ray of each hand is drawn (a line and a marker, two instanced meshes: src/ui/room-ray.ts) for the whole room view;
//   - at most 12 pieces (`Room is full`); they are NOT saved (the coordinates of a room change at every session): the first one says
//     `Room layout is not saved`; the model view hides them, the room view shows them again, the end of the session clears them;
//   - the notice panel says what to do when the scan is empty (`Space Setup`), 10 seconds after the room view opens.
//
// The floor: the lowest `floor` plane of the scan (its height and the part of the floor that was scanned); without planes the floor is
// the `local-floor` reference of the session (height 0) and every point counts as floor.
//
// Pinches: the room objects system takes every free pinch of the room view as `menu`; it offers this system the pinch first through
// `registerPieceBridge` (a control of the card, or a piece to take, which is released from `menu` and claimed as `furniture`). The menu
// pick (a new piece) comes through `onMenuItemPick`, the tap of the other hand through `onPinchStart` (claimed as `menu` so nothing else
// takes it). Nothing here allocates per frame: the rays, the poses, the boxes and the lists are preallocated.

import {
  createSystem,
  Quaternion,
  Vector3,
  XRPlane,
  type Entity,
  type Object3D,
  type World,
} from '@iwsdk/core';
import { tagEntity } from '../components/tag-entity';
import { slog } from '../log';
import { findItem, type CatalogItem } from '../logic/catalog';
import { reasonLabelExtent } from '../logic/furniture-label';
import {
  createWristRotation,
  relativeTwist,
  rotateStep,
  updateWristRotation,
  type WristRotation,
} from '../logic/furniture-pose';
import { stableId } from '../logic/ids';
import { labelFit } from '../logic/label-scale';
import { pinnedConeAngleDeg, yawOfForward } from '../logic/menu-anchor';
import { REASON_LABEL_MIN_DISTANCE, VIEW_CONE_HALF_ANGLE_DEG } from '../logic/menu-thresholds';
import { scaleExtent } from '../logic/menu';
import {
  FLOOR_RAY_MAX_DISTANCE,
  MAX_FLOOR_BOUNDS,
  MAX_ROOM_PIECES,
  activeNotice,
  canAddRoomPiece,
  chooseFloorHeight,
  createPieceBox,
  createRoomEvaluation,
  evaluateRoomPiece,
  formatFloorLine,
  formatPiecePlaced,
  formatPieceRemoved,
  isFloorLabel,
  isTap,
  nextRoomInstance,
  onFloor,
  pieceBeatsVolume,
  pieceBox,
  rayFloorPoint,
  rayRollDeg,
  type FloorBounds,
  type NoticeKind,
  type RoomEvaluation,
  type RoomPieceBody,
} from '../logic/room-pieces';
import { pickVolume, toCm, type ScanVolume, type VolumeHit } from '../logic/room-scan';
import { CARD_EXTENT, compactTitle, pickCardControl, type CardControl } from '../logic/room-view';
import { anchorInCone, yawTowardHead, type ConeFit } from '../logic/view-fit';
import { panelFontSupports } from '../ui/fonts';
import type { FurnitureVisuals } from '../ui/furniture-visuals';
import { reasonLabelId, ReasonLabelPanel } from '../ui/reason-label-panel';
import { RoomNoticePanel } from '../ui/room-notice-panel';
import { RoomRays } from '../ui/room-ray';
import { ScanCardPanel, type CardModel } from '../ui/scan-card-panel';
import type { OutlineState } from '../ui/scan-outlines';
import { strings } from '../ui/strings';
import { isHighContrast, onAccessChange } from '../ui/theme';
import { onMenuItemPick, releaseMenuHand } from './menu-items';
import { closeOpenMenu } from './palm-menu';
import { onPinchEnd, onPinchStart, pinchClaims, pinchPoint, type Hand } from './pinch-input';
import { closeScanCard, getRoomObstacles, registerPieceBridge, volumeHoverDistance, volumeHoverVolume } from './room-objects';
import { isScanEmpty, onScanEmptyChange } from './room-scan-status';
import { onRoomViewChange } from './room-view';
import { isRoomView } from './view-mode';

/** The ray reaches this far when it hits nothing, metres (the line is drawn this long). */
const RAY_FREE_LENGTH = 2.5;
/** The ray picks pieces and real volumes up to this far, metres. */
const RAY_MAX_DISTANCE = 8;
/** A change of the floor point below this (metres) is not judged again. */
const MOVE_EPSILON = 0.002;
/** A piece of the room follows the hand only after the pinch has settled (milliseconds), as on the table. */
const CAPTURE_DELAY_MS = 150;
/** The floor planes are read again this often while the room view is on, seconds (a scan refines its planes). */
const FLOOR_REFRESH_SECONDS = 2;
/** A floor height that changed less than this (metres) is not a change. */
const FLOOR_EPSILON = 0.01;
/** How far outside the scanned floor a point may still count as floor, metres (the edge of a scan is not exact). */
const FLOOR_MARGIN = 0.15;
/** Where the notice sits: this far ahead of the head, metres, and this far below the eyes. */
const NOTICE_AHEAD = 0.6;
/** Height of the centre of the notice above the eyes, metres: the long one (five lines) at eye level, the short ones a little above it, clear of the pinned menu. */
const NOTICE_RISE_LONG = 0;
const NOTICE_RISE_SHORT = 0.07;
/** The label floats this high above the top of a piece, metres, and stays at most this far from the head (as the labels of the model). */
const LABEL_LIFT = 0.04;
const LABEL_MAX_DISTANCE = 0.6;
const LABEL_FIT: ConeFit = {
  halfAngleDeg: VIEW_CONE_HALF_ANGLE_DEG,
  minDistance: REASON_LABEL_MIN_DISTANCE,
  maxDistance: LABEL_MAX_DISTANCE,
};
const LABEL_ID = 'ui:reason-room#1';
const DEG_TO_RAD = Math.PI / 180;
const HANDS: readonly Hand[] = ['left', 'right'];
const HAND_INDEX: Readonly<Record<Hand, number>> = { left: 0, right: 1 };

interface Piece {
  entity: Entity;
  object: Object3D;
  body: RoomPieceBody;
  item: CatalogItem;
  /** The box the ray picks (kept in step with the pose). */
  box: ScanVolume;
  /** `valid`, or the text of the reason ("Overlaps the couch"). */
  valid: boolean;
  reasonText: string;
  outline: 'none' | 'green' | 'red';
}

interface Held {
  piece: Piece;
  hand: Hand;
  /** `menu`: a new piece (not in the list yet); `room`: a placed piece taken again. */
  source: 'menu' | 'room';
  /** Piece centre minus the floor point of the ray at the capture, metres. */
  offsetX: number;
  offsetZ: number;
  rotationDeg: number;
  wrist: WristRotation;
  initialTwist: number;
  captured: boolean;
  grabbedAt: number;
  startX: number;
  startZ: number;
  startRotation: number;
  /** The most the piece moved from where it was taken, metres, and whether it was turned (a tap needs neither). */
  moved: number;
  rotated: boolean;
  /** True once the ray met the scanned floor at least once (a new piece is invisible until then). */
  placedOnce: boolean;
  /** The ray meets the scanned floor now, and where. */
  onFloor: boolean;
  floorDistance: number;
  lastX: number;
  lastZ: number;
}

interface RoomPiecesContext {
  world: World;
  catalog: readonly CatalogItem[];
  visuals: FurnitureVisuals | null;
  rays: RoomRays;
  card: ScanCardPanel;
  notice: RoomNoticePanel;
}

// Shared with the system, which has no constructor arguments: set by `createRoomPieces`.
let context: RoomPiecesContext | null = null;
let activeSystem: RoomPiecesSystem | null = null;

/** Creates the ray meshes, the card and the notice, and registers the system. Register it right after the room objects system. */
export function createRoomPieces(world: World, catalog: readonly CatalogItem[]): void {
  const rays = new RoomRays();
  rays.setHighContrast(isHighContrast());
  world.createTransformEntity(rays.lines);
  world.createTransformEntity(rays.cursors);
  context = { world, catalog, visuals: null, rays, card: new ScanCardPanel(world), notice: new RoomNoticePanel(world) };
  world.registerSystem(RoomPiecesSystem);
}

/** Gives the system the visuals of the furniture (the models and the blocks); until then a menu pick in the room does nothing. */
export function attachRoomPieceVisuals(visuals: FurnitureVisuals): void {
  if (context) context.visuals = visuals;
}

/** Cancels the piece in the hand, if any (the session is hidden, blurred or ended). Returns true when a piece was held. */
export function cancelHeldRoomPiece(reason: string): boolean {
  return activeSystem?.cancelHeld(reason) ?? false;
}

/** Closes the cards of the room view: the card of a real object and the card of a virtual piece. */
export function closeRoomCards(via: string): void {
  closeScanCard(via);
  activeSystem?.closeCard(via);
}

export class RoomPiecesSystem extends createSystem({
  planes: { required: [XRPlane] },
}) {
  /** The placed pieces, in the order they were made. */
  readonly pieces: Piece[] = [];
  private readonly boxes: ScanVolume[] = [];
  private held: Held | null = null;
  private selected: Piece | null = null;
  /** Last instance number used per catalog id (`room:piece-chair#2`): a number is never reused inside a session. */
  private readonly instances = new Map<string, number>();
  private everPlaced = false;

  private floorY = 0;
  private readonly floorBounds: FloorBounds[] = [];
  /** The rectangles of the scanned floor, reused at every read. */
  private readonly boundsPool: FloorBounds[] = Array.from({ length: MAX_FLOOR_BOUNDS }, () => ({ minX: 0, maxX: 0, minZ: 0, maxZ: 0 }));
  /** The rounded values of the last `mr floor` line (height, planes, rectangles): a new line only when they change. */
  private readonly floorSignature = new Float64Array(3 + MAX_FLOOR_BOUNDS * 4).fill(Number.NaN);
  private readonly floorValues = new Float64Array(4);
  private floorSeconds = 0;
  private readonly floorHeights: number[] = [];
  private readonly corner = new Vector3();

  private readonly origin = new Vector3();
  private readonly direction = new Vector3();
  private readonly quaternion = new Quaternion();
  private readonly twistQuaternion = new Quaternion();
  private readonly rollQuaternion: [number, number, number, number] = [0, 0, 0, 1];
  private readonly lastTwist: Record<Hand, number> = { left: 0, right: 0 };
  private readonly point = new Vector3();
  private readonly headPosition = new Vector3();
  private readonly headForward = new Vector3();
  private readonly headQuaternion = new Quaternion();
  private readonly labelTarget = new Vector3();
  private readonly floorPoint: [number, number] = [0, 0];
  private readonly hit: VolumeHit = { index: -1, distance: 0 };
  private readonly evaluation: RoomEvaluation = createRoomEvaluation();
  private readonly scratchBodies: RoomPieceBody[] = [];
  private readonly hoverPiece: Record<Hand, Piece | null> = { left: null, right: null };

  private label: ReasonLabelPanel | null = null;
  private labelText = '';
  private labelFor: Piece | null = null;
  private lastInvalid: Piece | null = null;

  private time = 0;
  private readonly noticeStarted: Record<NoticeKind, number> = { 'scan-empty': -1, 'not-saved': -1, full: -1 };
  private noticeShown: NoticeKind | null = null;
  private wasRoom = false;

  init(): void {
    activeSystem = this;
    const ctx = context;
    if (!ctx) return;
    registerPieceBridge({
      handlePinch: (hand) => this.handlePinch(hand),
      closeCard: (via) => this.closeCard(via),
    });
    this.cleanupFuncs.push(
      () => registerPieceBridge(null),
      onMenuItemPick((catalogId, hand) => this.startFromMenu(catalogId, hand)),
      onPinchStart((hand) => this.onTap(hand)),
      onPinchEnd((hand) => {
        if (this.held && this.held.hand === hand) this.release();
      }),
      pinchClaims.onRevoked('furniture', (hand, reason) => {
        if (this.held && this.held.hand === hand) this.cancelHeld(reason);
      }),
      onRoomViewChange((view) => this.onView(view)),
      onAccessChange(() => {
        ctx.rays.setHighContrast(isHighContrast());
        return 1;
      }),
      onScanEmptyChange((empty) => {
        if (empty && isRoomView()) this.noticeStarted['scan-empty'] = this.time;
      }),
    );
    // The scan changes the floor: read it when a plane comes or goes (and now and then, see `update`).
    this.queries.planes.subscribe('qualify', () => this.refreshFloor());
    this.queries.planes.subscribe('disqualify', () => this.refreshFloor());
    // A new session is a new room: the pieces of the old one are gone.
    const onEnd = (): void => this.clearAll('session-end');
    this.xrManager.addEventListener('sessionend', onEnd);
    this.cleanupFuncs.push(() => this.xrManager.removeEventListener('sessionend', onEnd));
    this.cleanupFuncs.push(() => {
      this.cancelHeld('teardown');
      this.clearAll('teardown');
      this.closeCard('teardown');
      this.label?.dispose();
      this.label = null;
      ctx.card.dispose();
      ctx.notice.dispose();
      ctx.rays.dispose();
      if (activeSystem === this) activeSystem = null;
    });
  }

  update(delta: number, time: number): void {
    const ctx = context;
    if (!ctx) return;
    this.time = time;
    ctx.card.update();
    ctx.notice.prepare();
    this.label?.tryApply();
    const active = isRoomView() && this.world.renderer.xr.isPresenting;
    if (!active) {
      this.wasRoom = false;
      ctx.rays.setVisible(false);
      if (this.noticeShown !== null) this.noticeShown = null;
      ctx.notice.show(false);
      this.hideLabel();
      return;
    }
    if (!this.wasRoom) {
      this.wasRoom = true;
      ctx.rays.setVisible(true);
      this.floorSeconds = FLOOR_REFRESH_SECONDS;
      if (isScanEmpty()) this.noticeStarted['scan-empty'] = time;
    }
    this.floorSeconds += Number.isFinite(delta) && delta > 0 ? delta : 0;
    if (this.floorSeconds >= FLOOR_REFRESH_SECONDS) {
      this.floorSeconds = 0;
      this.refreshFloor();
    }
    this.world.player.head.getWorldPosition(this.headPosition);
    this.world.player.head.getWorldQuaternion(this.headQuaternion);
    this.headForward.set(0, 0, -1).applyQuaternion(this.headQuaternion);

    this.updateHeld();
    this.updateRays();
    this.updateLabel();
    this.updateNotice();
  }

  // --- the floor ---------------------------------------------------------------------------------------------------------------

  /**
   * Reads the floor planes: the lowest height and the scanned parts. Runs every `FLOOR_REFRESH_SECONDS`, so it allocates nothing: the
   * rectangles live in a pool, the heights in a list that is emptied and filled again, and the log line (the only string) is built
   * only when the rounded values changed.
   */
  private refreshFloor(): void {
    this.floorHeights.length = 0;
    let count = 0;
    for (const entity of this.queries.planes.entities) {
      const plane = entity.getValue(XRPlane, '_plane') as
        | { semanticLabel?: unknown; polygon?: ArrayLike<{ x: number; y: number; z: number }> }
        | undefined;
      const object = entity.object3D;
      if (!plane || !object || !isFloorLabel(plane.semanticLabel)) continue;
      object.updateWorldMatrix(true, false);
      object.getWorldPosition(this.point);
      this.floorHeights.push(this.point.y);
      const polygon = plane.polygon;
      if (!polygon || polygon.length === 0 || count >= MAX_FLOOR_BOUNDS) continue;
      const bounds = this.boundsPool[count];
      bounds.minX = Infinity;
      bounds.maxX = -Infinity;
      bounds.minZ = Infinity;
      bounds.maxZ = -Infinity;
      for (let i = 0; i < polygon.length; i += 1) {
        this.corner.set(polygon[i].x, polygon[i].y ?? 0, polygon[i].z).applyMatrix4(object.matrixWorld);
        if (this.corner.x < bounds.minX) bounds.minX = this.corner.x;
        if (this.corner.x > bounds.maxX) bounds.maxX = this.corner.x;
        if (this.corner.z < bounds.minZ) bounds.minZ = this.corner.z;
        if (this.corner.z > bounds.maxZ) bounds.maxZ = this.corner.z;
      }
      if (bounds.maxX > bounds.minX && bounds.maxZ > bounds.minZ) {
        this.floorBounds[count] = bounds;
        count += 1;
      }
    }
    this.floorBounds.length = count;
    const y = chooseFloorHeight(this.floorHeights);
    const changed = Math.abs(y - this.floorY) > FLOOR_EPSILON;
    this.floorY = changed ? y : this.floorY;
    if (changed) {
      for (const piece of this.pieces) this.pose(piece);
    }
    // The log line: the rounded values of this read against the last one logged (no string unless something changed).
    const signature = this.floorSignature;
    let different = signature[0] !== Math.round(this.floorY * 100) || signature[1] !== this.floorHeights.length || signature[2] !== count;
    signature[0] = Math.round(this.floorY * 100);
    signature[1] = this.floorHeights.length;
    signature[2] = count;
    for (let i = 0; i < count; i += 1) {
      const b = this.floorBounds[i];
      const at = 3 + i * 4;
      const values = this.floorValues;
      values[0] = Math.round(b.minX * 10);
      values[1] = Math.round(b.maxX * 10);
      values[2] = Math.round(b.minZ * 10);
      values[3] = Math.round(b.maxZ * 10);
      for (let k = 0; k < 4; k += 1) {
        if (signature[at + k] !== values[k]) different = true;
        signature[at + k] = values[k];
      }
    }
    if (different) slog(formatFloorLine(this.floorY, this.floorHeights.length, this.floorBounds));
  }

  // --- the ray -----------------------------------------------------------------------------------------------------------------

  /** Reads the ray of `hand` into `origin`, `direction` and `quaternion`. False when the hand is not tracked (its ray is hidden). */
  private readRay(hand: Hand): boolean {
    const ray = this.world.player.raySpaces[hand];
    if (!ray || !ray.visible) return false;
    ray.getWorldPosition(this.origin);
    ray.getWorldQuaternion(this.quaternion);
    this.direction.set(0, 0, -1).applyQuaternion(this.quaternion);
    return true;
  }

  /**
   * The virtual piece the ray read by `readRay` takes: the nearest one it points at, unless the real object the hand points at is in front of
   * it (a piece behind a couch is the couch's), while a piece in front of the object, or buried in it, is the piece's. Writes the distance to
   * the piece into `hit`.
   */
  private pickPiece(hand: Hand): Piece | null {
    if (this.pieces.length === 0) return null;
    if (!pickVolume(this.origin, this.direction, this.boxes, RAY_MAX_DISTANCE, this.hit)) return null;
    if (!pieceBeatsVolume(this.origin, this.direction, this.hit.distance, volumeHoverDistance(hand), volumeHoverVolume(hand))) return null;
    return this.pieces[this.hit.index];
  }

  /** Draws the ray of each hand and highlights the piece a free hand points at. */
  private updateRays(): void {
    const ctx = context;
    if (!ctx) return;
    const held = this.held;
    for (const hand of HANDS) {
      const index = HAND_INDEX[hand];
      this.hoverPiece[hand] = null;
      if (!this.readRay(hand)) {
        ctx.rays.hide(index);
        continue;
      }
      let length = RAY_FREE_LENGTH;
      let cursor = false;
      let state: OutlineState = 'idle';
      if (held && held.hand === hand) {
        state = 'selected';
        if (held.floorDistance > 0) {
          length = held.floorDistance;
          cursor = true;
        }
      } else {
        const piece = held ? null : this.pickPiece(hand);
        let best = -1;
        // A piece wins over a real object when it is in front of it or buried in it (a piece left in a couch must stay reachable); behind it, the object wins.
        if (piece) {
          best = this.hit.distance;
          this.hoverPiece[hand] = piece;
        } else {
          best = volumeHoverDistance(hand);
        }
        if (best >= 0) {
          length = best;
          cursor = true;
          state = 'hover';
        } else {
          const floorDistance = rayFloorPoint(this.origin, this.direction, this.floorY, FLOOR_RAY_MAX_DISTANCE, this.floorPoint);
          if (floorDistance > 0) {
            length = floorDistance;
            cursor = true;
          }
        }
      }
      ctx.rays.set(index, this.origin, this.quaternion, length, cursor, state);
    }
    ctx.rays.flush();
    // A piece is green while a hand points at it (or holds it) and red when it is not valid.
    for (const piece of this.pieces) this.paint(piece);
  }

  private paint(piece: Piece): void {
    const ctx = context;
    if (!ctx?.visuals) return;
    const heldNow = this.held?.piece === piece;
    const pointed = this.hoverPiece.left === piece || this.hoverPiece.right === piece;
    const kind = !piece.valid ? 'red' : heldNow || pointed ? 'green' : 'none';
    if (kind === piece.outline) return;
    piece.outline = kind;
    ctx.visuals.setOutline(piece.object, kind);
  }

  // --- making, taking, putting down --------------------------------------------------------------------------------------------

  /** A piece was chosen in the menu: in the room view it is made at 1:1 and held by the hand that picked it. */
  private startFromMenu(catalogId: string, hand: Hand): void {
    const ctx = context;
    if (!ctx || !isRoomView() || !this.world.renderer.xr.isPresenting) return;
    if (this.held || !ctx.visuals) return;
    const item = findItem(ctx.catalog, catalogId);
    if (!item) return;
    if (!canAddRoomPiece(this.pieces.length)) {
      slog(`mr piece limit reached max=${MAX_ROOM_PIECES}`);
      this.noticeStarted.full = this.time;
      return; // the menu keeps this pinch until it ends: nothing is picked
    }
    releaseMenuHand(hand);
    if (!pinchClaims.claim(hand, 'furniture')) return;
    const instance = nextRoomInstance(this.instances.get(catalogId) ?? 0);
    this.instances.set(catalogId, instance);
    const id = stableId.roomPiece(catalogId, instance);
    const object = ctx.visuals.create(item);
    object.visible = false; // until the ray meets the floor
    const entity = this.world.createTransformEntity(object);
    tagEntity(entity, id);
    const piece = this.makePiece(id, item, entity, object);
    closeScanCard('piece');
    this.closeCard('piece');
    this.hold(piece, hand, 'menu');
  }

  private makePiece(id: string, item: CatalogItem, entity: Entity, object: Object3D): Piece {
    return {
      entity,
      object,
      item,
      body: { id, catalogId: item.id, name: item.name, x: 0, z: 0, rotationDeg: 0, size: item.size },
      box: createPieceBox(),
      valid: true,
      reasonText: '',
      outline: 'none',
    };
  }

  private hold(piece: Piece, hand: Hand, source: 'menu' | 'room'): void {
    const wrist = createWristRotation(piece.body.rotationDeg);
    this.held = {
      piece,
      hand,
      source,
      offsetX: 0,
      offsetZ: 0,
      rotationDeg: piece.body.rotationDeg,
      wrist,
      initialTwist: this.wristTwist(hand),
      captured: source === 'menu',
      grabbedAt: performance.now(),
      startX: piece.body.x,
      startZ: piece.body.z,
      startRotation: piece.body.rotationDeg,
      moved: 0,
      rotated: false,
      placedOnce: source === 'room',
      onFloor: source === 'room',
      floorDistance: -1,
      lastX: Number.POSITIVE_INFINITY,
      lastZ: Number.POSITIVE_INFINITY,
    };
    this.noticeStarted['scan-empty'] = -1;
    slog(`mr piece grabbed id=${piece.body.id} source=${source} hand=${hand}`);
  }

  /** The pinch of the room view, offered by the room objects system before it selects an object. True when taken here. */
  private handlePinch(hand: Hand): boolean {
    const ctx = context;
    if (!ctx || this.held) return false;
    // A control of the card of a piece.
    if (ctx.card.hasFrame && this.selected) {
      pinchPoint(hand, this.point);
      const control = pickCardControl(this.point, ctx.card.center, ctx.card.yaw, ctx.card.scale, true);
      if (control !== null) {
        this.pressCard(control);
        return true;
      }
    }
    // A placed piece the hand points at, unless a real object is in front of it (then the object is for the room objects system).
    if (!ctx.visuals || !this.readRay(hand)) return false;
    const piece = this.pickPiece(hand);
    if (!piece) return false;
    releaseMenuHand(hand);
    if (!pinchClaims.claim(hand, 'furniture')) return false;
    closeScanCard('piece');
    this.closeCard('piece');
    this.hold(piece, hand, 'room');
    return true;
  }

  /** The pinch of the other hand while a piece is held: a quarter turn, as on the table. */
  private onTap(hand: Hand): void {
    const held = this.held;
    if (!held || hand === held.hand || !isRoomView()) return;
    if (pinchClaims.ownerOf(hand) !== null || !pinchClaims.claim(hand, 'menu')) return;
    this.setRotation(held, rotateStep(held.rotationDeg));
    held.wrist = createWristRotation(held.rotationDeg);
    held.initialTwist = this.wristTwist(held.hand);
  }

  /**
   * The twist of the holding wrist, degrees (counter-clockwise from above positive, as `twistAboutY` on the table): minus the roll of the
   * hand about its ray (`rayRollDeg`), so turning the ray to another place does not turn the piece, rolling the wrist does. A ray with no
   * horizon (almost straight down) keeps the last value.
   */
  private wristTwist(hand: Hand): number {
    const ray = this.world.player.raySpaces[hand];
    if (ray) {
      ray.getWorldQuaternion(this.twistQuaternion);
      this.rollQuaternion[0] = this.twistQuaternion.x;
      this.rollQuaternion[1] = this.twistQuaternion.y;
      this.rollQuaternion[2] = this.twistQuaternion.z;
      this.rollQuaternion[3] = this.twistQuaternion.w;
      const roll = rayRollDeg(this.rollQuaternion);
      if (Number.isFinite(roll)) this.lastTwist[hand] = -roll;
    }
    return this.lastTwist[hand];
  }

  private setRotation(held: Held, rotationDeg: number): void {
    if (rotationDeg === held.rotationDeg) return;
    held.rotationDeg = rotationDeg;
    held.rotated = true;
    slog(`mr piece rotated id=${held.piece.body.id} rot=${rotationDeg}`);
  }

  /** Once per frame while a piece is held: the pose follows the floor point of the ray. */
  private updateHeld(): void {
    const held = this.held;
    if (!held) return;
    if (!held.captured) {
      if (performance.now() - held.grabbedAt < CAPTURE_DELAY_MS) return;
      this.capture(held);
    }
    const twist = relativeTwist(this.wristTwist(held.hand), held.initialTwist);
    this.setRotation(held, updateWristRotation(held.wrist, twist));

    held.onFloor = false;
    held.floorDistance = -1;
    if (this.readRay(held.hand)) {
      const distance = rayFloorPoint(this.origin, this.direction, this.floorY, FLOOR_RAY_MAX_DISTANCE, this.floorPoint);
      if (distance > 0) {
        held.floorDistance = distance;
        const x = this.floorPoint[0] + held.offsetX;
        const z = this.floorPoint[1] + held.offsetZ;
        if (onFloor(x, z, this.floorBounds, FLOOR_MARGIN)) {
          held.onFloor = true;
          held.placedOnce = true;
          const body = held.piece.body;
          const moved = Math.abs(x - held.lastX) > MOVE_EPSILON || Math.abs(z - held.lastZ) > MOVE_EPSILON;
          if (moved || body.rotationDeg !== held.rotationDeg) {
            held.lastX = x;
            held.lastZ = z;
            body.x = x;
            body.z = z;
            body.rotationDeg = held.rotationDeg;
            held.moved = Math.max(held.moved, Math.hypot(x - held.startX, z - held.startZ));
            this.pose(held.piece);
            this.judge(held.piece, true);
          }
        }
      }
    }
    // A piece with no floor under the ray is not shown: letting go there removes it.
    const visible = held.placedOnce && held.onFloor;
    if (held.piece.object.visible !== visible) held.piece.object.visible = visible;
  }

  /** Takes the offset (piece centre minus the floor point) and the wrist reference once the pinch has settled. */
  private capture(held: Held): void {
    held.captured = true;
    held.initialTwist = this.wristTwist(held.hand);
    held.wrist = createWristRotation(held.rotationDeg);
    if (this.readRay(held.hand) && rayFloorPoint(this.origin, this.direction, this.floorY, FLOOR_RAY_MAX_DISTANCE, this.floorPoint) > 0) {
      held.offsetX = held.piece.body.x - this.floorPoint[0];
      held.offsetZ = held.piece.body.z - this.floorPoint[1];
    }
  }

  /** The hand lets go: the piece stays where the ray met the floor, or is removed when it did not. */
  private release(): void {
    const held = this.held;
    if (!held) return;
    const piece = held.piece;
    this.held = null;
    pinchClaims.release(held.hand, 'furniture');
    const tap = held.source === 'room' && isTap(held.moved, performance.now() - held.grabbedAt, held.rotated);
    if (!held.placedOnce || !held.onFloor) {
      this.drop(piece, 'off-floor');
      return;
    }
    if (tap) {
      // It did not move: a brief pinch on a placed piece opens its card.
      this.openCard(piece);
      this.evaluateAll();
      return;
    }
    if (held.source === 'menu') {
      this.pieces.push(piece);
      this.boxes.push(piece.box);
    }
    this.pose(piece);
    this.evaluateAll();
    slog(formatPiecePlaced(piece.body.id, piece.body.x, piece.body.z, piece.body.rotationDeg, piece.valid));
    if (!piece.valid) this.lastInvalid = piece;
    if (!this.everPlaced) {
      this.everPlaced = true;
      this.noticeStarted['not-saved'] = this.time;
    }
  }

  /** The hand lets go with no floor under the ray (or the piece is removed some other way): the piece goes. */
  private drop(piece: Piece, reason: string): void {
    const index = this.pieces.indexOf(piece);
    if (index >= 0) {
      this.pieces.splice(index, 1);
      this.boxes.splice(index, 1);
    }
    if (this.lastInvalid === piece) this.lastInvalid = null;
    if (this.selected === piece) this.closeCard('removed');
    piece.entity.dispose({ disposeResources: false });
    slog(formatPieceRemoved(piece.body.id, reason));
    this.evaluateAll();
  }

  /** Cancels the piece in the hand without changing the room: a new piece goes, a taken one goes back where it was. */
  cancelHeld(reason: string): boolean {
    const held = this.held;
    if (!held) return false;
    this.held = null;
    pinchClaims.release(held.hand, 'furniture');
    const piece = held.piece;
    slog(`mr piece grab cancelled id=${piece.body.id} reason=${reason}`);
    if (held.source === 'menu') {
      piece.entity.dispose({ disposeResources: false });
    } else {
      piece.body.x = held.startX;
      piece.body.z = held.startZ;
      piece.body.rotationDeg = held.startRotation;
      piece.object.visible = isRoomView();
      this.pose(piece);
      this.evaluateAll();
    }
    return true;
  }

  private clearAll(reason: string): void {
    this.cancelHeld(reason);
    for (const piece of [...this.pieces]) this.drop(piece, reason);
    this.lastInvalid = null;
    this.everPlaced = false;
  }

  // --- the pose and the verdict ---------------------------------------------------------------------------------------------------

  /** Writes the pose of `piece` into its object and its pick box. */
  private pose(piece: Piece): void {
    const body = piece.body;
    piece.object.position.set(body.x, this.floorY, body.z);
    piece.object.rotation.y = -body.rotationDeg * DEG_TO_RAD;
    pieceBox(body, this.floorY, piece.box);
  }

  /** Judges `piece` against the real volumes and `against` pieces: all the others when `all`, the earlier ones otherwise. */
  private judge(piece: Piece, all: boolean): void {
    const bodies = this.scratchBodies;
    bodies.length = 0;
    for (const other of this.pieces) {
      if (other === piece) {
        if (all) continue;
        break;
      }
      bodies.push(other.body);
    }
    const ev = evaluateRoomPiece(piece.body, this.floorY, bodies, getRoomObstacles(), this.evaluation);
    piece.valid = ev.valid;
    if (ev.valid) {
      piece.reasonText = '';
    } else if (ev.overlap.kind === 'volume') {
      piece.reasonText = strings.reasonText('overlaps-furniture', ev.overlap.name);
    } else if (ev.overlap.kind === 'piece') {
      piece.reasonText = strings.reasonText('overlaps-furniture', ev.overlap.name);
    }
    this.paint(piece);
  }

  /** Judges every placed piece against the real volumes and the pieces made before it. */
  private evaluateAll(): void {
    for (const piece of this.pieces) {
      if (this.held?.piece === piece) continue;
      this.judge(piece, false);
    }
    if (this.lastInvalid && (this.lastInvalid.valid || !this.pieces.includes(this.lastInvalid))) this.lastInvalid = null;
  }

  // --- the card of a piece ---------------------------------------------------------------------------------------------------------

  private cardModel(piece: Piece): CardModel {
    const [w, d, h] = piece.item.size;
    const ascii = !panelFontSupports(strings.room.measures(toCm(w), toCm(d), toCm(h)));
    return {
      title: piece.item.name,
      measures: strings.room.measures(toCm(w), toCm(d), toCm(h), ascii),
      action: 'add',
      addText: strings.room.remove,
      closeText: strings.room.close,
      compactTitle: compactTitle(piece.item.name),
    };
  }

  private openCard(piece: Piece): void {
    const ctx = context;
    if (!ctx) return;
    closeScanCard('piece');
    // The card and the pinned menu are pinned at the same place in front of the head: one at a time (the menu comes back with its button).
    closeOpenMenu();
    this.selected = piece;
    this.world.player.head.getWorldPosition(this.headPosition);
    this.world.player.head.getWorldQuaternion(this.headQuaternion);
    this.headForward.set(0, 0, -1).applyQuaternion(this.headQuaternion);
    ctx.card.open(this.cardModel(piece), this.headPosition, this.headForward);
    ctx.card.setModel(this.cardModel(piece));
    const angle = pinnedConeAngleDeg(ctx.card.anchor, ctx.card.yaw, this.headPosition, this.headForward, scaleExtent(CARD_EXTENT, ctx.card.scale));
    slog(`mr piece card opened id=${piece.body.id} coneDeg=${angle.toFixed(1)}`);
  }

  private pressCard(control: CardControl): void {
    const piece = this.selected;
    if (!piece) return;
    if (control === 'close') {
      this.closeCard('button');
      return;
    }
    this.drop(piece, 'card');
  }

  closeCard(via: string): void {
    const ctx = context;
    // The card of a real object is another panel (room-objects.ts): only the card this system opened is closed here.
    if (!ctx || !this.selected) return;
    ctx.card.dispose();
    slog(`mr piece card closed id=${this.selected.body.id} via=${via}`);
    this.selected = null;
  }

  // --- views -----------------------------------------------------------------------------------------------------------------------

  private onView(view: 'model' | 'room'): void {
    const show = view === 'room';
    if (!show) {
      this.cancelHeld('view');
      this.closeCard('view');
      this.hideLabel();
    }
    for (const piece of this.pieces) piece.object.visible = show;
  }

  // --- the label and the notice ---------------------------------------------------------------------------------------------------

  private hideLabel(): void {
    const object = this.label?.object;
    if (object && object.visible) object.visible = false;
    this.labelFor = null;
  }

  /** ONE label in front of the head: the reason of the piece in the hand, else of the last piece put down that is not valid. */
  private updateLabel(): void {
    const ctx = context;
    if (!ctx) return;
    const held = this.held;
    let target: Piece | null = null;
    if (held) target = held.piece.valid ? null : held.piece;
    else target = this.lastInvalid;
    if (!target || target.valid || target.reasonText === '') {
      this.hideLabel();
      return;
    }
    if (!this.label) {
      this.label = new ReasonLabelPanel(this.world, LABEL_ID, target.reasonText);
      this.labelText = target.reasonText;
    } else if (this.labelText !== target.reasonText) {
      this.labelText = target.reasonText;
      this.label.setText(target.reasonText);
    }
    if (this.labelFor !== target) {
      this.labelFor = target;
      slog(`mr piece reason id=${target.body.id} "${target.reasonText}"`);
    }
    this.label.tryApply();
    const object = this.label.object;
    if (!object) return;
    const visible = this.label.ready && target.object.visible;
    if (object.visible !== visible) object.visible = visible;
    if (!visible) return;
    this.labelTarget.set(target.body.x, this.floorY + target.body.size[2] + LABEL_LIFT, target.body.z);
    // Along the line from the head, inside the view cone and not farther than the label of the model may be.
    anchorInCone(this.labelTarget, this.headPosition, this.headForward, reasonLabelExtent(), labelFit(LABEL_FIT), this.labelTarget);
    object.position.copy(this.labelTarget);
    object.rotation.set(0, yawTowardHead(this.labelTarget, this.headPosition), 0);
  }

  /** The notice panel: the sentence of the notice that is on, anchored in front of the head when it appears. */
  private updateNotice(): void {
    const ctx = context;
    if (!ctx) return;
    const kind = activeNotice(this.time, this.noticeStarted);
    if (kind !== this.noticeShown) {
      this.noticeShown = kind;
      if (kind !== null) {
        const yaw = yawOfForward(this.headForward.x, this.headForward.z);
        ctx.notice.setText(kind === 'scan-empty' ? strings.room.scanEmpty : kind === 'full' ? strings.room.roomFull : strings.room.notSaved);
        ctx.notice.place(
          this.headPosition.x - Math.sin(yaw) * NOTICE_AHEAD,
          this.headPosition.y + (kind === 'scan-empty' ? NOTICE_RISE_LONG : NOTICE_RISE_SHORT),
          this.headPosition.z - Math.cos(yaw) * NOTICE_AHEAD,
          yaw,
        );
        slog(`mr notice shown kind=${kind}`);
      }
    }
    ctx.notice.show(kind !== null);
  }
}
