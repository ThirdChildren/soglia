// Menu hint (task T2.16): shows `ui:menu-hint` ("Palm up for the menu") above the model while the first-use
// onboarding is over and the palm menu has never been opened (`shouldShowMenuHint`, src/logic/hint.ts), and
// removes it for good once the menu is opened (`prefs.menuOpened`, set by the palm menu system). The
// onboarding of M1 is not touched: this only reads its step from the store.

import { createSystem, type World } from '@iwsdk/core';
import { slog } from '../log';
import { HINT_LIFT, shouldShowMenuHint } from '../logic/hint';
import type { Store } from '../logic/state';
import { MenuHintPanel } from '../ui/menu-hint-panel';
import { strings } from '../ui/strings';
import { getMiniatureAnchor } from './miniature';

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
    getMiniatureAnchor(this.anchor);
    ctx.panel.update(this.anchor.x, this.anchor.y + HINT_LIFT, this.anchor.z, this.world.player.head);
  }
}
