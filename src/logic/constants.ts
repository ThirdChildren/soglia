// Shared constants of the table-top model. Pure: no imports from @iwsdk/core or three.
// `SCALE`, `ZOOM_MIN` and `ZOOM_MAX` live in state.ts (they are part of the stored state).

/**
 * Walls are cut at this height above the floor, in real metres (decision D5 in
 * docs/plans/M1.md): 1 m of wall is 0.05 m on the table.
 */
export const CUT_HEIGHT = 1.0;

/** Radius of the base disc under the model, in real metres (0.45 m in the world at the initial scale 1:20). */
export const BASE_RADIUS = 9;
/** The base top sits just under the floor of the model so the two never z-fight (real metres). */
export const BASE_TOP = -0.02;
