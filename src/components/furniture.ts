import { createComponent, Types } from '@iwsdk/core';

// State of one furniture piece (`furniture:<catalogId>#<n>`). The furniture system writes it; QA
// reads it with `ecs_query_entity`. `status`, `outline` and `reasons` are derived from the pose and
// are never saved. Declared in a system-free module; see src/logic/placement-rules.ts for the rules.
export const Furniture = createComponent('Furniture', {
  catalogId: { type: Types.String, default: '', label: 'Catalog id' },
  instance: { type: Types.Int32, default: 0, label: 'Instance' },
  /** `held` (in a hand) or `placed` (in the model). */
  phase: { type: Types.String, default: 'placed', label: 'Phase' },
  /** `left`, `right` or empty. */
  hand: { type: Types.String, default: '', label: 'Hand' },
  /** `valid` or `invalid`. */
  status: { type: Types.String, default: 'valid', label: 'Status' },
  /** `none`, `green` or `red`. */
  outline: { type: Types.String, default: 'none', label: 'Outline' },
  /** Comma-separated reasons, `-` when valid. */
  reasons: { type: Types.String, default: '-', label: 'Reasons' },
  /** Snapped position on the plan, metres. */
  x: { type: Types.Float32, default: 0, label: 'X' },
  z: { type: Types.Float32, default: 0, label: 'Z' },
  rotationDeg: { type: Types.Int32, default: 0, label: 'Rotation' },
  roomId: { type: Types.String, default: '', label: 'Room' },
  /**
   * FitCheck outcome for the room the piece is in (T3.9, D34): `none` (not in a room), `fits`, `blocked`,
   * `disassembled` or `no-route`. Derived from `roomId`, never saved.
   */
  fit: { type: Types.String, default: 'none', label: 'Fit' },
  /** Stable id of the door that blocks the piece (`door:d-living`), empty when nothing blocks it. */
  fitDoor: { type: Types.String, default: '', label: 'Fit door' },
});
