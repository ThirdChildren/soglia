// Debug-only (`?debug=1`): every 2 seconds, while an XR session runs, one line per hand:
//   [soglia:hands] hand=left source=joints palmDeg=1.2 pinchDist=0.094 point=-0.250,1.150,-0.200 palm=joints
// and one line at the start of every pinch (the point the pinch uses, ` event=pinch-start` at the end).
// `source` is where the pinch point comes from (joints or grip), `palm` where the palm normal comes from.
// The QA tools cannot read JS variables, so this is how they check the hand data (task T3.2b, D31).
// No allocation per frame: the line is built once every 2 seconds.

import { createSystem, Quaternion, Vector3, type World } from '@iwsdk/core';
import { formatHandsLine, type HandsLineInput } from '../logic/hand-joints';
import { getJointSample, palmNormalYOf, palmSource, type Hand } from '../systems/hand-joints';
import { onPinchStart, pinchPoint } from '../systems/pinch-input';

const PREFIX = '[soglia:hands] ';
const INTERVAL_SECONDS = 2;
const HANDS: readonly Hand[] = ['left', 'right'];

/** Registers the hands log. Call only when `params.debug` is true. */
export function attachHandsLog(world: World): void {
  world.registerSystem(HandsLogSystem);
}

export class HandsLogSystem extends createSystem({}) {
  private elapsed = 0;
  private readonly quat = new Quaternion();
  private readonly point = new Vector3();
  private readonly line: HandsLineInput = {
    hand: 'left',
    source: 'grip',
    palmNormalY: 0,
    palmFrom: 'grip',
    pinchDistance: Number.POSITIVE_INFINITY,
    point: { x: 0, y: 0, z: 0 },
  };

  init(): void {
    this.cleanupFuncs.push(onPinchStart((hand) => console.log(`${PREFIX}${this.describe(hand)} event=pinch-start`)));
  }

  update(delta: number): void {
    if (!this.world.renderer.xr.isPresenting) {
      this.elapsed = 0;
      return;
    }
    this.elapsed += delta;
    if (this.elapsed < INTERVAL_SECONDS) return;
    this.elapsed = 0;
    for (const hand of HANDS) console.log(PREFIX + this.describe(hand));
  }

  private describe(hand: Hand): string {
    const world = this.world;
    const sample = getJointSample(hand);
    const line = this.line;
    pinchPoint(hand, this.point);
    line.hand = hand;
    line.source = sample ? 'joints' : 'grip';
    line.palmFrom = palmSource(hand);
    line.palmNormalY = palmNormalYOf(hand, world.player.gripSpaces[hand], this.quat);
    line.pinchDistance = sample ? sample.pinchDistance : Number.POSITIVE_INFINITY;
    line.point.x = this.point.x;
    line.point.y = this.point.y;
    line.point.z = this.point.z;
    return formatHandsLine(line);
  }
}
