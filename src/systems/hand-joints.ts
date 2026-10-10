// Hand joints system (task T3.2b, decision D31): reads the wrist, two metacarpals and the thumb / index tips of each
// hand once per frame and keeps a preallocated sample per hand. The palm menu takes the palm normal from it
// and `pinchPoint` takes the midpoint of the two tips; the grip space of the hand is the reserve when the
// sample is not tracked (no `hand`, no `fillPoses`, a pose that is missing or not finite, `pinch=grip`).
// The pinch STATE is not read here: it stays the `selectstart` / `selectend` events (pinch-input.ts).
//
// How it reads (spike T3.2a, IWER): `inputSource.hand.get(name)` gives the same XRSpace every time; ONE call
// `frame.fillPoses(spaces, referenceSpace, Float32Array(80))` writes five 4x4 matrices. The spaces array and the
// buffer are created once per hand slot and refilled only when the input source object changes. The reference
// space is the world (the rig stays at the identity: the app has no locomotion). Never `getJointPose`
// (one object per call) and no `Array.from(session.inputSources)` per frame.
// The logic (palm normal, midpoint, coherence, source log) is in src/logic/hand-joints.ts.

import { createSystem, type Object3D, type Quaternion, type World } from '@iwsdk/core';
import { slog, swarn } from '../log';
import {
  JOINT_BUFFER_LENGTH,
  JOINT_NAMES,
  chooseInputSource,
  clearHandSample,
  createHandSample,
  createSourceLog,
  formatInputSourceLine,
  observeSource,
  resetSourceLog,
  updateHandSample,
  type HandSample,
  type InputSource,
  type SourceLog,
} from '../logic/hand-joints';
import { palmNormalY } from '../logic/palm';
import type { PinchMode } from '../logic/params';

export type Hand = 'left' | 'right';

/** `XRFrame.fillPoses` is declared by IWSDK as optional but the app's own `tsc` does not see it: typed here. */
type FillPoses = (spaces: ArrayLike<XRSpace>, baseSpace: XRSpace, transforms: Float32Array) => boolean;
interface FrameWithFillPoses {
  readonly fillPoses?: FillPoses;
}

/** Everything kept for one hand. Created once; rewritten in place. */
interface HandSlot {
  readonly hand: Hand;
  readonly sample: HandSample;
  readonly sourceLog: SourceLog;
  /** The input source the `spaces` belong to. */
  bound: XRInputSource | null;
  /** True when all five joint spaces of `bound` exist. */
  complete: boolean;
  readonly spaces: XRSpace[];
  readonly joints: Float32Array;
}

function createSlot(hand: Hand): HandSlot {
  return {
    hand,
    sample: createHandSample(),
    sourceLog: createSourceLog(),
    bound: null,
    complete: false,
    spaces: new Array<XRSpace>(JOINT_NAMES.length),
    joints: new Float32Array(JOINT_BUFFER_LENGTH),
  };
}

const slots: Record<Hand, HandSlot> = { left: createSlot('left'), right: createSlot('right') };
let worldRef: World | null = null;
let mode: PinchMode = 'auto';
let warnedFillPoses = false;
const HANDS: readonly Hand[] = ['left', 'right'];

/** Registers the system. Register it before the systems that read the samples (pinch input, palm menu). */
export function installHandJoints(world: World, pinchMode: PinchMode): void {
  worldRef = world;
  mode = pinchMode;
  world.registerSystem(HandJointsSystem);
}

/**
 * The joint sample of `hand` while it can be used: tracked this frame and `pinch` is not `grip`. Null means
 * "use the grip space". The returned object is rewritten in place every frame: read it, do not keep it.
 */
export function getJointSample(hand: Hand): HandSample | null {
  if (mode === 'grip') return null;
  const sample = slots[hand].sample;
  return sample.pointValid ? sample : null;
}

/** Where the palm of `hand` comes from right now. */
export function palmSource(hand: Hand): InputSource {
  return getJointSample(hand)?.palmValid ? 'joints' : 'grip';
}

/**
 * World Y component of the palm normal of `hand`: from the joints (-Y of the wrist) when the sample has a
 * coherent palm, otherwise from the grip space (`PALM_NORMAL_LOCAL`). `quat` is a scratch quaternion.
 */
export function palmNormalYOf(hand: Hand, grip: Object3D, quat: Quaternion): number {
  const sample = getJointSample(hand);
  if (sample !== null && sample.palmValid) return Math.max(-1, Math.min(1, sample.palmNormal.y));
  grip.getWorldQuaternion(quat);
  return palmNormalY(quat.x, quat.y, quat.z, quat.w);
}

/**
 * Reads the joints again from the frame of a `selectstart` event. The pinch point is used right inside that
 * event, and the sample of the previous frame may still show the open hand. If the event has no frame or the read
 * fails, the sample of the last frame stays (it is replaced at the next frame).
 */
export function refreshHandFromEvent(event: XRInputSourceEvent): void {
  const world = worldRef;
  if (!world || mode === 'grip') return;
  const inputSource = event.inputSource;
  const handedness = inputSource?.handedness;
  if ((handedness !== 'left' && handedness !== 'right') || !event.frame) return;
  const reference = world.xrReferenceSpace;
  if (!reference) return;
  readJoints(slots[handedness], inputSource, event.frame, reference);
}

/** Fills `slot.spaces` for a new input source. Returns whether all five joints exist. */
function bindSource(slot: HandSlot, inputSource: XRInputSource): boolean {
  slot.bound = inputSource;
  slot.complete = false;
  const hand = inputSource.hand;
  if (!hand || typeof hand.get !== 'function') return false;
  for (let i = 0; i < JOINT_NAMES.length; i++) {
    const space = hand.get(JOINT_NAMES[i]);
    if (!space) {
      swarn(`feature hand joint ${JOINT_NAMES[i]} unavailable`);
      return false;
    }
    slot.spaces[i] = space;
  }
  slot.complete = true;
  return true;
}

/**
 * Reads the five joints of `inputSource` from `frame` into the slot. Returns true when the sample was rewritten
 * from valid poses; false (the sample is not touched) when there is nothing to read. No allocation per call.
 */
function readJoints(
  slot: HandSlot,
  inputSource: XRInputSource,
  frame: XRFrame,
  reference: XRReferenceSpace,
): boolean {
  if (!inputSource.hand) return false;
  const fill = (frame as unknown as FrameWithFillPoses).fillPoses;
  if (typeof fill !== 'function') {
    if (!warnedFillPoses) {
      warnedFillPoses = true;
      swarn('feature XRFrame.fillPoses unavailable; using the grip space');
    }
    return false;
  }
  if (slot.bound !== inputSource) bindSource(slot, inputSource);
  if (!slot.complete) return false;
  let filled = false;
  try {
    filled = fill.call(frame, slot.spaces, reference, slot.joints) === true;
  } catch (error) {
    // An unusable frame (for example one that is not active any more): the grip space takes over.
    if (!warnedFillPoses) {
      warnedFillPoses = true;
      swarn(`feature XRFrame.fillPoses failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    return false;
  }
  if (!filled) return false;
  updateHandSample(slot.sample, slot.joints, slot.hand);
  return true;
}

function resetSlot(slot: HandSlot): void {
  clearHandSample(slot.sample);
  resetSourceLog(slot.sourceLog);
  slot.bound = null;
  slot.complete = false;
}

/** The input source of `hand`: the one with joints if there is one, else any with that handedness. */
function findInputSource(sources: XRInputSourceArray, hand: Hand): XRInputSource | null {
  let found: XRInputSource | null = null;
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    if (source.handedness !== hand) continue;
    if (source.hand) return source;
    if (found === null) found = source;
  }
  return found;
}

export class HandJointsSystem extends createSystem({}) {
  private session: XRSession | null = null;

  update(): void {
    const world = this.world;
    const xr = world.renderer.xr;
    const session = xr.isPresenting ? xr.getSession() : null;
    if (session !== this.session) {
      this.session = session;
      resetSlot(slots.left);
      resetSlot(slots.right);
    }
    if (!session) return;
    const frame = world.xrFrame;
    const reference = world.xrReferenceSpace;
    const now = performance.now() / 1000; // not the `time` of the frame callbacks: that one is not in milliseconds
    for (const hand of HANDS) {
      const slot = slots[hand];
      let tracked = false;
      if (mode !== 'grip' && frame && reference) {
        const inputSource = findInputSource(session.inputSources, hand);
        if (inputSource) tracked = readJoints(slot, inputSource, frame, reference) && slot.sample.pointValid;
      }
      if (!tracked) clearHandSample(slot.sample);
      const choice = chooseInputSource(mode, tracked);
      if (observeSource(slot.sourceLog, choice, now)) slog(formatInputSourceLine(hand, choice));
    }
  }
}
