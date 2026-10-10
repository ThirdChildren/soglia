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

/**
 * The FRAME of the menu (its bottom centre) is never farther than this from the head, in metres. Menu v2 (task T3.5,
 * D37) is 0.376 m tall: with the frame at 0.52 m the farthest control (the first tab, 0.138 m to the side and 0.356 m
 * above the frame) is at 0.645 m, inside the 0.65 m the QA scenario S3.8 allows for a control, and a menu centred on
 * the gaze at 0.50 m still fits the 30 degree cone (the test `menu-v2-geometry` computes both). `MENU_MAX_DISTANCE` stays 0.6 for the hint, which is much smaller.
 */
export const MENU_FRAME_MAX_DISTANCE = 0.52;
/** The menu is at most this wide, in metres (D37; the 36 cm of the layout leave a margin). */
export const MENU_MAX_WIDTH = 0.38;

/**
 * The menu (its frame, the bottom centre) is never nearer to the head than this, in metres (rule 8: panels at
 * 0.5-0.8 m). A hand held close to the face pushes the menu away along the line from the head.
 */
export const MENU_MIN_DISTANCE = 0.5;
/**
 * Margin over the 0.50 m of rule 8 for the labels and the hint, in metres: the clamp used to put them at exactly
 * 0.5000 m, so a rounding of a pose could read 0.4999 m. They sit at 0.52 m or more (never beyond their maximum).
 */
export const LABEL_DISTANCE_MARGIN = 0.02;
/** The "Palm up for the menu" hint is never nearer to the head than this, in metres. */
export const HINT_MIN_DISTANCE = 0.5 + LABEL_DISTANCE_MARGIN;
/** The room label is never nearer to the head than this (it slides along the line from the head), in metres. */
export const ROOM_LABEL_MIN_DISTANCE = 0.5 + LABEL_DISTANCE_MARGIN;
/** A reason label is never nearer to the head than this (it slides along the line from the head), in metres. */
export const REASON_LABEL_MIN_DISTANCE = 0.5 + LABEL_DISTANCE_MARGIN;
/**
 * The WHOLE menu (title, items, bar) stays inside a cone of this half angle around the forward direction of
 * the head, in degrees (rule 8: nothing important near the edge of a narrow field of view). Menu v2 is 0.36 m
 * wide and 0.376 m tall: centred on the gaze at 0.5 m its corners are 28.5 degrees from the middle, so only a cone
 * of about 30 degrees holds it (a 25 degree cone would need a distance of 0.6 m and more).
 */
export const VIEW_CONE_HALF_ANGLE_DEG = 30;

// --- The pinned menu (task T3.3a, decision D32) ----------------------------------------------------

/**
 * The pinned menu (one-hand mode) is placed this far in FRONT of the head, along the horizontal direction of the
 * gaze, in metres (rule 8: panels at 0.5-0.8 m). It is the bottom centre of the menu (its frame).
 */
export const PINNED_DISTANCE = 0.55;
/**
 * The bottom centre of the pinned menu is this far BELOW the eyes, in metres, so the 0.35 m tall menu sits between
 * about -20 and +15 degrees vertically and below the far edge of the model.
 */
export const PINNED_DROP = 0.2;

// --- The "Palm up for the menu" hint ---------------------------------------------------------

/** The hint floats this far above the anchor of the model, in metres (about 0.5 m from the head). */
export const HINT_LIFT = 0.15;
/** Space left between the hint and the room label when the hint moves out of its way, in metres. */
export const HINT_LABEL_GAP = 0.02;
