// Every threshold of the palm menu and its hint in ONE place (decision D18 and the M2 gate fixes).
// Pure: no imports from @iwsdk/core or three.
//
// ALL OF THESE ARE FIRST GUESSES THAT MUST BE TUNED ON THE HEADSET (qa/device/DEBT.md): the emulator
// has no hand jitter, no tracking latency and no accidental gestures, so it cannot say whether they are
// right. When a value changes here, the logic and the tests follow it.

// --- Palm detection ---------------------------------------------------------------------------

/** The palm opens the menu when its normal is within this angle of straight up, in degrees. */
export const PALM_OPEN_DEG = 35;
/** An open menu closes when the normal is farther than this angle from straight up, in degrees. */
export const PALM_CLOSE_DEG = 55;
/**
 * The palm must stay up (and the menu must be allowed to open) this long before the menu opens, in
 * seconds. Longer than the 0.25 s of M2 so a palm that only passes through the "up" pose, or a palm
 * raised just after a pinch, never opens it.
 */
export const PALM_OPEN_HOLD_SECONDS = 0.4;
/** The palm must stay turned away this long before an open menu closes, in seconds. */
export const PALM_CLOSE_HOLD_SECONDS = 0.25;

// --- When the menu must NOT open -----------------------------------------------------------------

/**
 * After a pinch of the same hand, a held piece, a two-hand gesture or a one-hand drag ends, the menu
 * cannot open for this long, in seconds (the hand is still coming out of the gesture and its palm
 * passes through "up").
 */
export const MENU_RELEASE_GUARD_SECONDS = 0.3;

// --- Where the menu sits -----------------------------------------------------------------------

/** The menu floats this high above the palm, in metres. */
export const MENU_LIFT = 0.1;
/** The menu is never farther than this from the head, in metres (rule 8: panels at 0.5-0.8 m). */
export const MENU_MAX_DISTANCE = 0.6;

/** The menu is never nearer to the head than this when it is pulled toward the centre of the view, in metres. */
export const MENU_MIN_DISTANCE = 0.45;
/**
 * The WHOLE menu (title, items, bar) stays inside a cone of this half angle around the forward direction of
 * the head, in degrees (rule 8: nothing important near the edge of a narrow field of view). The menu is
 * 0.37 m wide and 0.35 m tall: at 0.5 m its corners are 27 degrees from its centre, so a 25 degree cone
 * only fits at 0.55 m or more; 30 degrees leaves room to keep the menu near the hand.
 */
export const VIEW_CONE_HALF_ANGLE_DEG = 30;

// --- The "Palm up for the menu" hint ---------------------------------------------------------

/** The hint floats this far above the anchor of the model, in metres (about 0.5 m from the head). */
export const HINT_LIFT = 0.15;
/** Space left between the hint and the room label when the hint moves out of its way, in metres. */
export const HINT_LABEL_GAP = 0.02;
