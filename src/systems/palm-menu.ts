// Palm menu system (task T2.11, decision D18): opens `ui:palm-menu` when a palm faces up and
// closes it when the palm turns away or the hand pinches. Works with both hands; if both are up,
// the first one wins. The maths is in src/logic/palm.ts; the pinch state comes from pinch-input.
//
// The palm normal is a local axis of the grip space of the hand (PALM_NORMAL_LOCAL, spike T2.11).
// Only the grip pose is used: it is available for hands and for controllers alike.

import { createSystem, Quaternion, Vector3, type World } from '@iwsdk/core';
import { slog } from '../log';
import {
  chooseMenuHand,
  createPalmDetector,
  palmNormalY,
  updatePalmDetector,
  type PalmHand,
} from '../logic/palm';
import { PalmMenuPanel } from '../ui/palm-menu';
import { isPinching } from './pinch-input';

let context: { panel: PalmMenuPanel } | null = null;

/** True while the palm menu is open (other systems use it to avoid conflicting pinches). */
export function isPalmMenuOpen(): boolean {
  return context?.panel.isOpen ?? false;
}

/** Registers the palm menu system. */
export function createPalmMenu(world: World): void {
  context = { panel: new PalmMenuPanel(world) };
  world.registerSystem(PalmMenuSystem);
}

const clock = (): number => performance.now() / 1000;

export class PalmMenuSystem extends createSystem({}) {
  private readonly left = createPalmDetector(clock);
  private readonly right = createPalmDetector(clock);
  private owner: PalmHand | null = null;
  private readonly quat = new Quaternion();
  private readonly handPosition = new Vector3();

  update(): void {
    const ctx = context;
    if (!ctx) return;
    const world = this.world;
    const xr = world.renderer.xr;

    if (!xr.isPresenting) {
      // No session: no hand is up. Close the menu if it was open.
      if (this.owner !== null) this.setOwner(ctx.panel, null);
      return;
    }

    const grips = world.player.gripSpaces;
    grips.left.getWorldQuaternion(this.quat);
    const leftY = palmNormalY(this.quat.x, this.quat.y, this.quat.z, this.quat.w);
    const leftOpen = updatePalmDetector(this.left, leftY, isPinching('left')) === 'open';
    grips.right.getWorldQuaternion(this.quat);
    const rightY = palmNormalY(this.quat.x, this.quat.y, this.quat.z, this.quat.w);
    const rightOpen = updatePalmDetector(this.right, rightY, isPinching('right')) === 'open';

    const next = chooseMenuHand(this.owner, leftOpen, rightOpen);
    if (next !== this.owner) this.setOwner(ctx.panel, next);
    if (this.owner === null) return;

    grips[this.owner].getWorldPosition(this.handPosition);
    ctx.panel.update(this.handPosition, world.player.head);
  }

  private setOwner(panel: PalmMenuPanel, next: PalmHand | null): void {
    this.owner = next;
    if (next) {
      panel.open();
      slog(`menu opened hand=${next}`);
    } else {
      panel.close();
      slog('menu closed');
    }
  }
}
