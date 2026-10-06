// Menu hint (task T2.16): shows `ui:menu-hint` ("Palm up for the menu") above the model while the first-use
// onboarding is over and the palm menu has never been opened (`shouldShowMenuHint`, src/logic/hint.ts), and
// removes it for good once the menu is opened (`prefs.menuOpened`, set by the palm menu system). The
// onboarding of M1 is not touched: this only reads its step from the store.

import { createSystem, Quaternion, Vector3, type World } from '@iwsdk/core';
import { slog } from '../log';
import { placeHint, shouldShowMenuHint } from '../logic/hint';
import type { Store } from '../logic/state';
import { MenuHintPanel } from '../ui/menu-hint-panel';
import { strings } from '../ui/strings';
import { getMiniatureAnchor } from './miniature';
import { getRoomLabelPosition } from './room-label';

interface HintContext {
  store: Store;
  panel: MenuHintPanel;
}

// Shared with the system, which has no constructor arguments: set by `createMenuHint`.
let context: HintContext | null = null;

/** Registers the menu hint system. */
export function createMenuHint(world: World, store: Store): void {
  context = { store, panel: new MenuHintPanel(world, strings.hint.palmMenu) };
  world.registerSystem(MenuHintSystem);
}

export class MenuHintSystem extends createSystem({}) {
  private readonly anchor = { x: 0, y: 0, z: 0 };
  private readonly place = { x: 0, y: 0, z: 0 };
  private readonly label = { x: 0, y: 0, z: 0 };
  private readonly headPosition = new Vector3();
  private readonly headForward = new Vector3();
  private readonly headQuaternion = new Quaternion();

  update(): void {
    const ctx = context;
    if (!ctx) return;
    const state = ctx.store.get();
    const xr = this.world.renderer.xr;
    const want = shouldShowMenuHint(state.prefs.onboardingStep, state.prefs.menuOpened, xr.isPresenting);

    if (want && !ctx.panel.exists) {
      ctx.panel.create();
      slog('hint shown id=menu');
    } else if (!want && ctx.panel.exists) {
      ctx.panel.dispose();
      slog('hint hidden id=menu');
    }
    if (!want) return;

    // In session the XR camera only gets the viewer pose after the systems run, so use the head group.
    const head = this.world.player.head;
    getMiniatureAnchor(this.anchor);
    head.getWorldPosition(this.headPosition);
    head.getWorldQuaternion(this.headQuaternion);
    this.headForward.set(0, 0, -1).applyQuaternion(this.headQuaternion);
    // Above the model, inside the central view cone, and never over the room label (M2 gate W2).
    const labelShown = getRoomLabelPosition(this.label);
    const visible = placeHint(this.anchor, this.headPosition, this.headForward, labelShown ? this.label : null, this.place);
    ctx.panel.update(this.place.x, this.place.y, this.place.z, head, visible);
  }
}
