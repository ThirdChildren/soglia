// Error panel (`ui:error-panel`): a UIKit panel about 0.6 m in front of the head, shown only
// when something fails (for example a house cannot be loaded). The entity exists only while
// the panel is visible: create it with `showErrorPanel`, remove it with `entity.dispose()`.
// The layout lives in public/ui/error-panel.uikitml; the text comes from src/ui/strings.ts.

import {
  createSystem,
  FollowBehavior,
  Follower,
  PanelDocument,
  PanelUI,
  type Entity,
  type UIKit,
  type World,
} from '@iwsdk/core';
import { ErrorPanelContent } from '../components/error-panel-content';
import { tagEntity } from '../components/tag-entity';
import { stableId } from '../logic/ids';

/** Manifest id of the layout (see src/assets.ts). */
const PANEL_ASSET = 'error-panel';
/** Distance in front of the head, and offset below eye level, in metres. */
const PANEL_DISTANCE = 0.6;
const PANEL_DROP = 0.05;

export interface ErrorPanelText {
  message: string;
  hint: string;
}

export function showErrorPanel(world: World, text: ErrorPanelText): Entity {
  const entity = world.createTransformEntity();
  tagEntity(entity, stableId.ui('error-panel'));
  entity.addComponent(ErrorPanelContent, { message: text.message, hint: text.hint });
  entity.addComponent(Follower, {
    target: world.camera,
    offsetPosition: [0, -PANEL_DROP, -PANEL_DISTANCE],
    behavior: FollowBehavior.PivotY,
    maxAngle: 45,
    tolerance: 0.25,
    speed: 4,
  });
  entity.addComponent(PanelUI, { config: PANEL_ASSET });
  return entity;
}

/** Copies the text of `ErrorPanelContent` into the UIKit document as soon as it is ready. */
export class ErrorPanelSystem extends createSystem({
  ready: { required: [ErrorPanelContent, PanelDocument] },
}) {
  init(): void {
    this.cleanupFuncs.push(
      this.queries.ready.subscribe('qualify', (entity) => {
        const doc = entity.getValue(PanelDocument, 'document') as
          | { getElementById: <T>(id: string) => T | null }
          | undefined;
        if (!doc) return;
        const message = doc.getElementById<UIKit.Text>('error-message');
        const hint = doc.getElementById<UIKit.Text>('error-hint');
        message?.setProperties({ text: entity.getValue(ErrorPanelContent, 'message') as string });
        hint?.setProperties({ text: entity.getValue(ErrorPanelContent, 'hint') as string });
      }),
    );
  }
}
