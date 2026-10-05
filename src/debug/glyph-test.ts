// Glyph test panel (`ui:glyph-test`, development aid behind `glyphs=1`): three lines of text in
// the panel font, so that missing glyphs (solid squares plus a `Missing glyph info` warning) are
// easy to see in a screenshot. One line in regular weight, the same in bold, and a control line
// of characters the font must always have. The layout is public/ui/glyph-test.uikitml.

import {
  createSystem,
  FollowBehavior,
  Follower,
  PanelDocument,
  PanelUI,
  type UIKit,
  type World,
} from '@iwsdk/core';
import { StableId } from '../components/stable-id';
import { tagEntity } from '../components/tag-entity';
import { stableId } from '../logic/ids';
import { slog } from '../log';
import { applyPanelFont } from '../ui/fonts';

const PANEL_ASSET = 'glyph-test';
const PANEL_ID = stableId.ui('glyph-test');
/** Distance in front of the head, in metres (inside the 0.5-0.8 m comfort range). */
const PANEL_DISTANCE = 0.6;

/** The candidate characters: superscript two, middle dot, times, degree, minus, plus-minus, arrow, approx. */
export const GLYPH_CANDIDATES = '² · × ° − ± → ≈';
const LINE_SPECIMEN = `m² ${GLYPH_CANDIDATES}`;
const LINE_CONTROL = 'ABC abc 0123456789 %§°';

interface UiDocument {
  getElementById: <T>(id: string) => T | null;
}

/** Creates the panel entity. The system below fills the text when the document is ready. */
export function showGlyphTest(world: World): void {
  const entity = world.createTransformEntity();
  tagEntity(entity, PANEL_ID);
  entity.addComponent(Follower, {
    target: world.camera,
    offsetPosition: [0, 0, -PANEL_DISTANCE],
    behavior: FollowBehavior.PivotY,
    maxAngle: 45,
    tolerance: 0.25,
    speed: 4,
  });
  entity.addComponent(PanelUI, { config: PANEL_ASSET });
  world.registerSystem(GlyphTestSystem);
  slog(`glyph test shown id=${PANEL_ID}`);
}

export class GlyphTestSystem extends createSystem({
  ready: { required: [StableId, PanelDocument] },
}) {
  init(): void {
    this.cleanupFuncs.push(
      this.queries.ready.subscribe('qualify', (entity) => {
        if (entity.getValue(StableId, 'value') !== PANEL_ID) return;
        const doc = entity.getValue(PanelDocument, 'document') as UiDocument | undefined;
        if (!doc) return;
        applyPanelFont(doc, 'glyph-test-root');
        doc.getElementById<UIKit.Text>('glyph-test-regular')?.setProperties({ text: LINE_SPECIMEN });
        doc.getElementById<UIKit.Text>('glyph-test-bold')?.setProperties({ text: LINE_SPECIMEN });
        doc.getElementById<UIKit.Text>('glyph-test-control')?.setProperties({ text: LINE_CONTROL });
      }),
    );
  }
}
