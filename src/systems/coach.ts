// The coach of the first minute (task T5.15, decision D60 in docs/plans/M5.md): once the pinch onboarding of M1 is done, a ghost hand
// and a few words show the Menu button (step `menu-button`) and then the first piece going into the house (step `grab`). The rules,
// the timing and the animation are pure logic in src/logic/coach.ts; this file reads the clock, the store and the pieces that are
// put down, and creates / removes the ghost hand (`ui:ghost-hand-right`, src/ui/ghost-hand.ts) and the text panel
// (`ui:coach-menu-button` or `ui:coach-grab`, src/ui/coach-panel.ts).
//
// It is not interactive: no pinch is ever claimed here. The step lives in the store (`prefs.coach`, saved). The first menu that opens
// (palm or button: `prefs.menuOpened` turns true) moves `menu-button` on to `grab`; the first piece put down (`onFurnitureReleased`)
// ends it; 20 seconds of a step end it too. While a piece is in a hand, at real scale, or outside a session, the hand and the text wait.
// Register it after the menu buttons and the grab (it reads their entities and their release event). Nothing here allocates per frame.

import { createSystem, Quaternion, Vector3, type Object3D, type World } from '@iwsdk/core';
import { StableId } from '../components/stable-id';
import { slog } from '../log';
import {
  coachNext,
  coachPanelId,
  coachProgress,
  coachResumedStart,
  coachTimedOut,
  coachVisible,
  formatCoachStep,
  grabPose,
  menuButtonPose,
  type CoachEvent,
  type CoachHandPose,
  type CoachReason,
} from '../logic/coach';
import { MINIATURE_ROOT_ID } from '../logic/ids';
import { BUTTON_HALF_WIDTH, MENU_BUTTON_IDS } from '../logic/menu-button';
import { ROOM_LABEL_MIN_DISTANCE, VIEW_CONE_HALF_ANGLE_DEG } from '../logic/menu-thresholds';
import { setCoach, type CoachStep, type Store } from '../logic/state';
import { anchorInCone, type ConeFit } from '../logic/view-fit';
import { CoachPanel, coachPanelWidth } from '../ui/coach-panel';
import { GhostHand } from '../ui/ghost-hand';
import { strings } from '../ui/strings';
import { isLargeText, LARGE_TEXT_FACTOR } from '../ui/theme';
import { onFurnitureReleased } from './furniture-grab';
import { isIssuePanelOpen } from './issue-panel';
import { pinchClaims } from './pinch-input';
import { isRealScale, isViewTransitioning } from './view-mode';
import { isViewPanelOpen } from './view-panel';

/** The text of the Menu step hangs this far under the button, metres (the QA wants it within 0.15 m of the button). */
const TEXT_BELOW = 0.07;
/** The text of the grab step hangs this high above the middle of the model, and at least this high above the eyes (over the pinned menu), metres. */
const TEXT_ABOVE_MODEL = 0.13;
const TEXT_ABOVE_EYES = 0.31;
/** The hand is a little larger than a real hand, so it reads at 0.5 m (the same as the first onboarding). */
const HAND_SIZE = 1.25;
/** From the origin of the ghost hand to the point where its thumb and index meet, along its fingers, at the hand size, metres. */
const PINCH_REACH = 0.125 * HAND_SIZE;
/** The fingers point mostly sideways (to the right of the line of sight) and a little along it. */
const ALONG = 0.35;
const SIDEWAYS = 0.94;
/** The fingers point down a little, toward the thing they pinch. */
const HAND_PITCH = -0.35;
/** Where the hand holds the first piece over the model, above its middle, metres; and where it picks it up if no menu card is there. */
const DROP_HEIGHT = 0.06;
const FALLBACK_SIDE = 0.2;
/** The text keeps inside the cone of the view and never nearer to the head than a label. */
const TEXT_FIT: ConeFit = { halfAngleDeg: VIEW_CONE_HALF_ANGLE_DEG, minDistance: ROOM_LABEL_MIN_DISTANCE, maxDistance: 0.8 };
/** The text of the Menu step hangs by the button, which is outside the cone on purpose (37.6 degrees): only the distances are kept. */
const TEXT_FIT_BY_BUTTON: ConeFit = { halfAngleDeg: 90, minDistance: ROOM_LABEL_MIN_DISTANCE, maxDistance: 0.8 };

interface CoachContext {
  store: Store;
  panel: CoachPanel;
}

// Shared with the system, which has no constructor arguments: set by `createCoach`.
let context: CoachContext | null = null;

/** Registers the coach system. */
export function createCoach(world: World, store: Store): void {
  context = { store, panel: new CoachPanel(world) };
  world.registerSystem(CoachSystem);
}

export class CoachSystem extends createSystem({ named: { required: [StableId] } }) {
  private shownStep: CoachStep = 'done';
  /** When the step that is on began to be on screen (seconds, the clock of `update`), or null before. */
  private startedAt: number | null = null;
  /** Since when a panel (Issues, View) has been open and the clock of the step is paused, or null. */
  private pausedAt: number | null = null;
  /** Why the step that is on was reached, for the first line of the log about it. */
  private arrivedBy: CoachReason = 'start';
  /** The step whose first line was written to the log. */
  private loggedStep: CoachStep | null = null;
  private now = 0;
  private hand: GhostHand | null = null;
  private lastMenuOpened = false;
  /** Objects found by name (an entity is named just AFTER it gets its StableId, so a query cannot read the name when it qualifies). */
  private readonly found = new Map<string, Object3D>();
  private card: Object3D | null = null;
  private readonly pose: CoachHandPose = { openness: 1, travel: 0 };
  private readonly headPosition = new Vector3();
  private readonly headForward = new Vector3();
  private readonly headQuaternion = new Quaternion();
  private readonly target = new Vector3();
  private readonly from = new Vector3();
  private readonly to = new Vector3();
  private readonly spot = new Vector3();
  private readonly text = { x: 0, y: 0, z: 0 };
  /** The text panel around its centre (the width follows its words), reused every frame. */
  private readonly extent = { halfWidth: 0.1, bottom: -0.03, top: 0.03 };
  private readonly direction = { x: 0, z: -1 };

  init(): void {
    const ctx = context;
    this.cleanupFuncs.push(
      onFurnitureReleased(() => this.handle('placed')),
      () => this.clear(),
    );
    if (!ctx) return;
    const start = ctx.store.get().prefs;
    this.lastMenuOpened = start.menuOpened;
    // A saved state that is already past the coach says so once, so the QA sees that nothing is left to show.
    if (start.coach === 'done') slog(formatCoachStep('done', 'saved'));
    else if (start.coach === 'grab') this.arrivedBy = 'saved';
    this.cleanupFuncs.push(
      ctx.store.subscribe((state) => {
        const opened = state.prefs.menuOpened;
        if (opened && !this.lastMenuOpened) this.handle('menu-opened');
        this.lastMenuOpened = opened;
      }),
    );
  }

  /** Feeds an event to the steps; a change is saved in the store and logged. */
  private handle(event: CoachEvent): void {
    const ctx = context;
    if (!ctx) return;
    const step = ctx.store.get().prefs.coach;
    const next = coachNext(step, event);
    if (next === step) return;
    ctx.store.dispatch(setCoach(next));
    slog(formatCoachStep(next, event));
    this.arrivedBy = event;
    this.startedAt = null;
    this.pausedAt = null;
    this.loggedStep = next;
  }

  update(_delta: number, time: number): void {
    const ctx = context;
    if (!ctx) return;
    this.now = time;
    const state = ctx.store.get();
    const step = state.prefs.coach;
    if (step !== this.shownStep) {
      // The step changed (an event, or a restore): the old text and the hand go, the new ones come when the step is on screen.
      this.shownStep = step;
      this.dispose();
    }
    if (step === 'done') {
      this.dispose();
      return;
    }
    const panelOpen = isIssuePanelOpen() || isViewPanelOpen();
    const visible = coachVisible(step, {
      onboardingStep: state.prefs.onboardingStep,
      presenting: this.world.renderer.xr.isPresenting,
      realScale: isRealScale() || isViewTransitioning(),
      // A piece in a hand: the coach waits out of sight, the clock runs.
      holding: pinchClaims.anyClaimed('furniture'),
      // The Issues or View panel open (they stand where the text and the hand are): the coach waits out of sight, the clock stops.
      panelOpen,
    });
    if (state.prefs.onboardingStep === 'done' && this.world.renderer.xr.isPresenting && this.world.player.head.position.lengthSq() > 0) {
      // The twenty seconds count from the first moment the step could be seen, and keep running while it waits for a free hand. They
      // stop while a panel is open: the start of the step moves forward by the time of the pause, so the coach comes back in the same step.
      if (this.startedAt === null) {
        this.startedAt = time;
        if (this.loggedStep !== step) {
          slog(formatCoachStep(step, this.arrivedBy));
          this.loggedStep = step;
        }
      } else if (panelOpen) {
        if (this.pausedAt === null) this.pausedAt = time;
      } else {
        if (this.pausedAt !== null) {
          this.startedAt = coachResumedStart(this.startedAt, this.pausedAt, time);
          this.pausedAt = null;
        }
        if (coachTimedOut(this.startedAt, time)) {
          this.handle('timeout');
          this.dispose();
          return;
        }
      }
    }
    if (!visible || this.startedAt === null) {
      this.dispose();
      return;
    }
    this.show(ctx, step);
  }

  private show(ctx: CoachContext, step: CoachStep): void {
    const head = this.world.player.head;
    head.getWorldPosition(this.headPosition);
    head.getWorldQuaternion(this.headQuaternion);
    this.headForward.set(0, 0, -1).applyQuaternion(this.headQuaternion);
    const root = this.find(MINIATURE_ROOT_ID);
    if (!root) return;
    root.getWorldPosition(this.spot);

    if (step === 'menu-button') {
      const button = this.find(MENU_BUTTON_IDS.right);
      // The button is not placed yet (or hidden): nothing to point at.
      if (!button || !button.visible) {
        this.dispose();
        return;
      }
      button.getWorldPosition(this.target);
      this.aim(this.target);
      // The text hangs right under the button (the buttons are a column, and the words are wider than a button: beside it they would
      // cover it), where the air beside the table is free.
      this.text.x = this.target.x;
      this.text.y = this.target.y - TEXT_BELOW;
      this.text.z = this.target.z;
      // ... and pulled toward the model until its outer edge is level with the outer edge of the button, so it is not cut by the
      // edge of the view (the buttons are at 38 degrees).
      const inwardX = this.spot.x - this.target.x;
      const inwardZ = this.spot.z - this.target.z;
      const inward = Math.hypot(inwardX, inwardZ) || 1;
      const pull = Math.max(0, this.textHalfWidth(strings.coach.menuButton) - BUTTON_HALF_WIDTH);
      this.text.x += (inwardX / inward) * pull;
      this.text.z += (inwardZ / inward) * pull;
      menuButtonPose(coachProgress(this.startedAt ?? this.now, this.now), this.pose);
      this.to.copy(this.target);
      this.from.copy(this.target);
    } else {
      // Over the middle of the model: the piece comes from a card of the open menu, or from beside the model.
      this.to.set(this.spot.x, this.spot.y + DROP_HEIGHT, this.spot.z);
      const card = this.firstCard();
      if (card) card.getWorldPosition(this.from);
      else this.from.set(this.spot.x + FALLBACK_SIDE, this.spot.y + DROP_HEIGHT + 0.05, this.spot.z);
      grabPose(coachProgress(this.startedAt ?? this.now, this.now), this.pose);
      this.target.lerpVectors(this.from, this.to, this.pose.travel);
      this.aim(this.to);
      // The words go above the menu (a banner over the open menu, which covers the model), not over its cards.
      this.text.x = this.to.x;
      this.text.y = Math.max(this.to.y + TEXT_ABOVE_MODEL, this.headPosition.y + TEXT_ABOVE_EYES);
      this.text.z = this.to.z;
    }

    // The hand: its fingers point along the line from the head to the thing, its thumb and index meet on it.
    if (!this.hand) this.hand = new GhostHand(this.world, 'right');
    const yaw = Math.atan2(-this.direction.x, -this.direction.z);
    this.hand.group.position.set(
      this.target.x - this.direction.x * PINCH_REACH,
      this.target.y + 0.012,
      this.target.z - this.direction.z * PINCH_REACH,
    );
    this.hand.group.rotation.set(HAND_PITCH, yaw, 0);
    this.hand.group.scale.setScalar(HAND_SIZE);
    this.hand.setOpenness(this.pose.openness);

    // The text.
    const id = coachPanelId(step);
    if (id === null) return;
    const label = step === 'menu-button' ? strings.coach.menuButton : strings.coach.grab;
    if (!ctx.panel.exists) ctx.panel.create(id, label);
    this.extent.halfWidth = this.textHalfWidth(label);
    anchorInCone(this.text, this.headPosition, this.headForward, this.extent, step === 'menu-button' ? TEXT_FIT_BY_BUTTON : TEXT_FIT, this.text, true);
    ctx.panel.update(this.text.x, this.text.y, this.text.z, head, true);
  }

  /** Half width of the text panel of `label`, metres (it grows with large text). */
  private textHalfWidth(label: string): number {
    return (coachPanelWidth(label) * (isLargeText() ? LARGE_TEXT_FACTOR : 1)) / 200;
  }

  /**
   * The direction the fingers of the hand point, flat on the floor: mostly to the right of the line from the head to `point`, a little
   * along it. The hand comes in from the model's side, so it is seen from the side (thumb and index meeting) and does not hide what it
   * pinches (looking straight along the fingers, the hand is a bar).
   */
  private aim(point: Vector3): void {
    let fx = point.x - this.headPosition.x;
    let fz = point.z - this.headPosition.z;
    const length = Math.hypot(fx, fz);
    if (length < 1e-6) {
      fx = 0;
      fz = -1;
    } else {
      fx /= length;
      fz /= length;
    }
    // Right of the forward direction (x right, z toward the user): (-fz, 0, fx).
    const dx = fx * ALONG + -fz * SIDEWAYS;
    const dz = fz * ALONG + fx * SIDEWAYS;
    const d = Math.hypot(dx, dz);
    this.direction.x = dx / d;
    this.direction.z = dz / d;
  }

  /** The object of the entity named `name`, or null. Looked up once and kept while it is alive. */
  private find(name: string): Object3D | null {
    const known = this.found.get(name);
    if (known && known.name === name && known.parent !== null) return known;
    this.found.delete(name);
    for (const entity of this.queries.named.entities) {
      const object = entity.object3D;
      if (object && object.name === name) {
        this.found.set(name, object);
        return object;
      }
    }
    return null;
  }

  /** A card of the open menu (`ui:menu-item-*`) that is on screen, or null when no menu is open. Searched again only when the last one is gone. */
  private firstCard(): Object3D | null {
    const known = this.card;
    if (known && known.parent !== null && known.visible) return known;
    this.card = null;
    for (const entity of this.queries.named.entities) {
      const object = entity.object3D;
      if (object && object.visible && object.name.startsWith('ui:menu-item-')) {
        this.card = object;
        return object;
      }
    }
    return null;
  }

  private dispose(): void {
    if (this.hand) {
      this.hand.dispose();
      this.hand = null;
    }
    if (context?.panel.exists) context.panel.dispose();
  }

  private clear(): void {
    this.dispose();
    this.found.clear();
    this.card = null;
  }
}
