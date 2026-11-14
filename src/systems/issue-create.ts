// The long pinch that starts a new issue (task T4.5, decisions D42, D45, D46). A pinch held still for 0.8 s on a valid spot of the
// table-top model (a point over a room, or a fixture) opens the Issues panel on the form `new` with a DRAFT: the anchored place,
// the fixture, the room and the category the fixture proposes. T4.7 fills the form; this system makes and keeps the draft.
//
// HOW IT WORKS. The machine itself is pure (src/logic/long-press.ts). Here:
//   - at a pinch start nothing is decided yet: the grip pose moves about 1 cm while the fingers close and the systems that
//     register after this one (the grab, the viewpoint markers, the drag) take their claim in their own pinch listeners. So
//     the decision waits the `longPressSettle` knob (0.15 s by default); by then the claims are in. A pinch that someone else owns (a menu
//     control, a piece, a marker, the drag, two hands) never starts anything and leaves no trace in the log;
//   - then the hold starts (`issue hold start`) if the role may create issues (only the tenant), the tool is `furnish`, the model
//     is at table-top scale and the pinch point resolves to an anchor (`pinchToHouse` + `resolveAnchor`). The ghost `pin:draft`
//     appears at that anchor and grows from 0 to 1 with the progress (`setPinDraftSize`, no allocation per frame). The anchor is
//     computed ONCE, here, when the grip has settled: it is the spot the user sees and the one the draft keeps;
//   - the hold is cancelled by the end of the pinch, by movement beyond 1.5 cm, by a second pinch and by another owner taking
//     the hand (`issue hold cancelled reason=…`);
//   - at 0.8 s the hand is claimed as `issue` (it takes it from `room`), the selected room is deselected (the room is selected
//     already at the `selectstart`, by its RayInteractable), the draft is kept (`getDraft()`), the panel opens on `new`.
//   A pinch that cannot start (another role, outside the house, a draft already open) is reported ONCE, when it has lasted 0.8 s
//   and nobody owns the hand: `issue denied action=create role=…` or `issue hold ignored reason=…`. A short pinch stays silent.
//
// THE FORM (T4.7). Right after the panel opens on `new`, the system gives it the form of the draft (`createIssueForm`: the category
// the fixture proposes, or the step to choose one) and registers what the form's two buttons do: `Cancel` drops the draft
// (`issue draft cancelled reason=user`), `Report` takes it (`consumeDraft`), builds the issue with the sentence of the chosen phrase
// (src/logic/issue-form.ts), dispatches `addIssue` and logs `issue created …`. If the store refuses (the limit, the role), the draft
// is put back and the form stays open with a log line saying why.
//
// The draft lives until the form consumes it (`consumeDraft`, T4.7) or it is cancelled: `cancelDraft(reason)` (the form's Cancel,
// the life cycle on a suspension: T4.11), a change of the role, the panel being closed.
//
// Register this system AFTER the menu and the panels and BEFORE the grab of the pieces (docs/plans/M4.md, T4.5). Nothing here allocates per frame.

import { createSystem, Vector3, type Entity, type World } from '@iwsdk/core';
import { slog, swarn } from '../log';
import type { House } from '../logic/house';
import type { MiniatureRoot, Vec3Tuple } from '../logic/furniture-pose';
import { resolveAnchor, pinchToHouse, type IssueAnchor } from '../logic/issue-anchor';
import {
  draftFromAnchor,
  formatCreateDenied,
  formatDraftCancelled,
  formatDraftCreated,
  formatHoldIgnored,
  type DraftCancelReason,
  type IssueDraft,
} from '../logic/issue-draft';
import {
  longPressSeconds,
  longPressSettleSeconds,
  cancelLongPress,
  createLongPress,
  formatHoldCancelled,
  formatHoldFired,
  formatHoldStart,
  longPressProgress,
  releaseLongPress,
  resetLongPress,
  secondPinchLongPress,
  startLongPress,
  updateLongPress,
  type LongPressCancelReason,
} from '../logic/long-press';
import {
  buildReport,
  createIssueForm,
  formatCreateLimit,
  formatIssueCreated,
  hasRoomForIssue,
  type IssueForm,
} from '../logic/issue-form';
import type { IssueClock } from '../logic/issue-clock';
import { can } from '../logic/permissions';
import { addIssue, selectRoom, type Store } from '../logic/state';
import { isIssuePanelOpen, onRoleChanged, openIssuePanel, setIssueFormHandlers, showIssueScreen, startIssueForm } from './issue-panel';
import { onPinchEnd, onPinchStart, pinchClaims, pinchPoint, type Hand } from './pinch-input';
import { setPinDraft, setPinDraftSize } from './pins';
import { isTabletopLocked } from './view-mode';

interface IssueCreateContext {
  store: Store;
  house: House;
  /** `miniature:root`: its pose maps the pinch to the house. */
  rootEntity: Entity;
  /** The clock of the history of the issues (D42): read once per issue that is created. */
  clock: IssueClock;
}

// Shared with the system, which has no constructor arguments: set by `createIssueCreate`.
let context: IssueCreateContext | null = null;
let draft: IssueDraft | null = null;
let cancelNow: ((reason: DraftCancelReason) => void) | null = null;
let consumeNow: (() => IssueDraft | null) | null = null;

/** The draft of the new issue the long pinch made, or null (the form of T4.7 reads it; it is never written from outside). */
export function getDraft(): Readonly<IssueDraft> | null {
  return draft;
}

/**
 * Drops the draft and the ghost pin, and stops a long pinch that is still growing. Logs `issue draft cancelled reason=…` when
 * there was a draft. `reason`: `user` (the form's Cancel, the panel closed), `suspend` (the life cycle, T4.11), `role`.
 */
export function cancelDraft(reason: DraftCancelReason): void {
  cancelNow?.(reason);
}

/** Takes the draft away for the form that sends it (T4.7): returns it, removes the ghost and logs nothing. Null when there is none. */
export function consumeDraft(): IssueDraft | null {
  return consumeNow ? consumeNow() : null;
}

/** Registers the long pinch. Register it AFTER the menu and the panels and BEFORE the grab of the pieces. */
export function createIssueCreate(world: World, store: Store, house: House, rootEntity: Entity, clock: IssueClock): void {
  context = { store, house, rootEntity, clock };
  draft = null;
  world.registerSystem(IssueCreateSystem);
}

/** What the system does with the pinch it follows. */
type Mode =
  | 'idle' // no pinch followed
  | 'settling' // waiting for the grip to settle and for the other owners to take their claims
  | 'holding' // the machine runs and the ghost grows
  | 'blocked' // cannot start: reported once at 0.8 s
  | 'off'; // not ours (another owner has it, or it was cancelled): silent

export class IssueCreateSystem extends createSystem({}) {
  private mode: Mode = 'idle';
  private hand: Hand | null = null;
  private startedAt = 0;
  private blockedLine: string | null = null;
  private readonly machine = createLongPress();
  private anchor: IssueAnchor | null = null;
  /** The panel has been seen open since the draft was made (a draft whose panel is gone is dropped). */
  private panelSeen = false;

  private readonly point = new Vector3();
  private readonly worldTuple: Vec3Tuple = [0, 0, 0];
  private readonly houseTuple: Vec3Tuple = [0, 0, 0];
  private readonly rootPose: MiniatureRoot = { x: 0, y: 0, z: 0, yawRad: 0, scale: 1 };

  init(): void {
    cancelNow = (reason) => this.cancelAll(reason);
    consumeNow = () => this.consume();
    this.cleanupFuncs.push(
      onPinchStart((hand) => this.onPinch(hand)),
      onPinchEnd((hand) => this.onPinchEnd(hand)),
      // A role change drops a hold in progress and the draft (D41, D45).
      onRoleChanged(() => this.cancelAll('role')),
      // The two buttons of the form (T4.7).
      setIssueFormHandlers({
        cancel: () => this.cancelAll('user'),
        report: (form) => this.report(form),
      }),
      () => {
        cancelNow = null;
        consumeNow = null;
        this.clearGhost();
        draft = null;
      },
    );
  }

  private now(): number {
    return performance.now() / 1000;
  }

  private onPinch(hand: Hand): void {
    if (this.mode === 'idle') {
      this.hand = hand;
      this.mode = 'settling';
      this.startedAt = this.now();
      return;
    }
    // A second pinch (the other hand, or the same one announced again): two hands are the zoom, never a long pinch.
    if (this.mode === 'holding' && secondPinchLongPress(this.machine) === 'cancelled') this.endCancelled();
    this.mode = 'off';
  }

  private onPinchEnd(hand: Hand): void {
    if (hand !== this.hand) return;
    if (this.mode === 'holding') {
      releaseLongPress(this.machine);
      this.logHoldCancelled('released');
    }
    resetLongPress(this.machine);
    this.mode = 'idle';
    this.hand = null;
    this.blockedLine = null;
    this.anchor = null;
  }

  update(): void {
    this.watchPanel();
    const hand = this.hand;
    if (hand === null) return;
    const now = this.now();
    switch (this.mode) {
      case 'settling':
        if (now - this.startedAt >= longPressSettleSeconds()) this.decide(hand, now);
        break;
      case 'holding':
        this.step(hand, now);
        break;
      case 'blocked':
        this.reportBlocked(hand, now);
        break;
      default:
        break;
    }
  }

  /** A draft needs its panel: when the panel was open and is closed now, the draft goes (`reason=user`). */
  private watchPanel(): void {
    if (draft === null) return;
    const open = isIssuePanelOpen();
    if (open) this.panelSeen = true;
    else if (this.panelSeen) this.cancelAll('user');
  }

  /** The grip has settled and the other owners have taken their claims: start the hold, or decide it cannot start. */
  private decide(hand: Hand, now: number): void {
    const ctx = context;
    if (!ctx) {
      this.mode = 'off';
      return;
    }
    const owner = pinchClaims.ownerOf(hand);
    // Someone else uses this pinch (a menu control, a piece, a marker, the drag, two hands): not ours, no trace.
    if ((owner !== null && owner !== 'room') || pinchClaims.anyClaimed('furniture')) {
      this.mode = 'off';
      return;
    }
    const state = ctx.store.get();
    if (isTabletopLocked()) {
      this.mode = 'off';
      return;
    }
    if (!can(state.role, 'create')) {
      this.block(formatCreateDenied(state.role));
      return;
    }
    if (draft !== null) {
      this.block(formatHoldIgnored('draft-open'));
      return;
    }
    const anchor = this.anchorAt(hand);
    if (anchor === null) {
      this.block(formatHoldIgnored('no-anchor'));
      return;
    }
    this.anchor = anchor;
    startLongPress(this.machine, this.startedAt, this.point.x, this.point.y, this.point.z);
    this.mode = 'holding';
    slog(formatHoldStart(hand));
    setPinDraft(anchor.position, longPressProgress(this.machine, now));
  }

  /** The anchor of the pinch point of `hand` now (the point is left in `this.point`), or null outside the model or the house. */
  private anchorAt(hand: Hand): IssueAnchor | null {
    const ctx = context;
    const object = ctx?.rootEntity.object3D;
    if (!ctx || !object) return null;
    pinchPoint(hand, this.point);
    this.worldTuple[0] = this.point.x;
    this.worldTuple[1] = this.point.y;
    this.worldTuple[2] = this.point.z;
    const r = this.rootPose;
    r.x = object.position.x;
    r.y = object.position.y;
    r.z = object.position.z;
    r.yawRad = object.rotation.y;
    r.scale = object.scale.x;
    const raw = pinchToHouse(this.worldTuple, r, ctx.house, this.houseTuple);
    return raw === null ? null : resolveAnchor(raw, ctx.house, r.scale);
  }

  private block(line: string): void {
    this.mode = 'blocked';
    this.blockedLine = line;
  }

  /** A pinch that cannot start is reported once, when it has lasted as long as a long pinch and nobody owns the hand. */
  private reportBlocked(hand: Hand, now: number): void {
    if (this.blockedLine === null || now - this.startedAt < longPressSeconds()) return;
    const owner = pinchClaims.ownerOf(hand);
    if (owner === null || owner === 'room') slog(this.blockedLine);
    this.blockedLine = null;
  }

  private step(hand: Hand, now: number): void {
    const owner = pinchClaims.ownerOf(hand);
    if ((owner !== null && owner !== 'room') || pinchClaims.anyClaimed('furniture') || isTabletopLocked()) {
      cancelLongPress(this.machine, 'claimed');
      this.endCancelled();
      return;
    }
    pinchPoint(hand, this.point);
    const phase = updateLongPress(this.machine, now, this.point.x, this.point.y, this.point.z);
    if (phase === 'cancelled') {
      this.endCancelled();
    } else if (phase === 'fired') {
      this.fire(hand, now);
    } else {
      setPinDraftSize(longPressProgress(this.machine, now));
    }
  }

  /** The machine ended `cancelled`: log its reason, remove the ghost, stop following this pinch. */
  private endCancelled(): void {
    this.logHoldCancelled(this.machine.reason ?? 'moved');
  }

  private logHoldCancelled(reason: LongPressCancelReason): void {
    slog(formatHoldCancelled(reason));
    this.clearGhost();
    this.anchor = null;
    resetLongPress(this.machine);
    this.mode = this.hand === null ? 'idle' : 'off';
  }

  private fire(hand: Hand, now: number): void {
    const anchor = this.anchor;
    const ctx = context;
    if (!anchor || !ctx) {
      cancelLongPress(this.machine, 'claimed');
      this.endCancelled();
      return;
    }
    // The hand is ours from now on; it is taken from `room` and released with the pinch (pinch-input).
    if (!pinchClaims.claim(hand, 'issue')) {
      this.machine.phase = 'cancelled';
      this.machine.reason = 'claimed';
      this.endCancelled();
      return;
    }
    slog(formatHoldFired(hand, now - this.startedAt));
    draft = draftFromAnchor(anchor);
    this.panelSeen = false;
    setPinDraft(draft.position, 1);
    slog(formatDraftCreated(draft));
    // The room was selected at the `selectstart` (its RayInteractable): the new issue is about a spot, not a room.
    const selected = ctx.store.get().selectedRoomId;
    if (selected !== null) ctx.store.dispatch(selectRoom(selected));
    openIssuePanel(hand);
    if (isIssuePanelOpen()) startIssueForm(createIssueForm(draft, this.subjectOf(draft, ctx.house)));
    showIssueScreen('new');
    if (!isIssuePanelOpen()) {
      // The panel could not open (no session, suspended): there is nowhere to fill the draft.
      this.cancelAll('user');
    }
    resetLongPress(this.machine);
    this.anchor = null;
    // The pinch goes on until the user lets go; it is not followed any more (the claim keeps the others away).
    this.mode = 'off';
  }

  /** The names the form shows: the fixture of the draft (its sentence says `The washing machine ...`) and the room. */
  private subjectOf(d: IssueDraft, house: House): { fixtureName: string | null; roomName: string } {
    const fixture = d.fixtureId === null ? undefined : house.fixtures?.find((f) => f.id === d.fixtureId);
    const room = house.rooms.find((r) => r.id === d.roomId);
    return { fixtureName: fixture?.name ?? null, roomName: room?.name ?? d.roomId };
  }

  /**
   * `Report`: takes the draft away, makes the issue and puts it in the store. Returns true when the store has it (the panel
   * closes); false when something refused, with the draft still there and the form still open.
   */
  private report(form: IssueForm): boolean {
    const ctx = context;
    const current = draft;
    if (!ctx || current === null) return false;
    const state = ctx.store.get();
    if (!hasRoomForIssue(state.issues.length)) {
      swarn(formatCreateLimit());
      return false;
    }
    if (!can(state.role, 'create')) {
      slog(formatCreateDenied(state.role));
      return false;
    }
    const result = buildReport(form, current, {
      houseId: state.houseId,
      nextIssue: state.nextIssue,
      role: state.role,
      nowIso: ctx.clock.now(),
    });
    if (!result.ok) {
      swarn(`issue report rejected reason=${result.reason}`);
      return false;
    }
    ctx.store.dispatch(addIssue(result.issue));
    if (!ctx.store.get().issues.some((i) => i.id === result.issue.id)) {
      swarn(`issue report rejected id=${result.issue.id} reason=store`);
      return false;
    }
    // The draft is the form's now: it goes with its ghost, without a `cancelled` line.
    this.consume();
    slog(formatIssueCreated(result.issue));
    return true;
  }

  private clearGhost(): void {
    setPinDraft(null);
  }

  /** Stops a hold in progress and drops the draft (the ghost goes either way). */
  private cancelAll(reason: DraftCancelReason): void {
    if (this.mode === 'holding') {
      cancelLongPress(this.machine, 'claimed');
      this.logHoldCancelled('claimed');
    } else if (this.mode === 'settling' || this.mode === 'blocked') {
      this.mode = 'off';
    }
    if (draft !== null) {
      draft = null;
      this.clearGhost();
      this.panelSeen = false;
      slog(formatDraftCancelled(reason));
    }
  }

  private consume(): IssueDraft | null {
    const taken = draft;
    if (taken === null) return null;
    draft = null;
    this.panelSeen = false;
    this.clearGhost();
    return taken;
  }
}
