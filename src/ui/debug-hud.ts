// The debug statistics panel (`ui:debug-hud`, M6 T6.A8, D68): one UIKit panel with one text per line, created the first time a session
// shows it and then only shown, hidden and moved. World anchored (not head locked, which would tire the eyes and falsify the
// comfort tests); it is a measuring tool, so it is exempt from the 30 degree view cone. Layout: public/ui/debug-hud.uikitml; the
// words come from src/ui/strings.ts. Nothing here allocates once the panel exists, apart from the text itself (once a second).

import { PanelDocument, PanelUI, type Entity, type UIKit, type World } from '@iwsdk/core';
import { tagEntity } from '../components/tag-entity';
import { HUD_MAX_LINES } from '../logic/debug-hud';
import { stableId } from '../logic/ids';
import { applyPanelLook } from './panel-theme';

const PANEL_ASSET = 'debug-hud';
const LINE_PREFIX = 'debug-hud-line-';
const ROOT_ELEMENT = 'debug-hud-root';

/**
 * Drawn above the narrow-view mask (`debug:fov-mask`, 2 000 000), so that a person judging the field of view can still read the
 * numbers (the panel is a measuring tool, not part of what the mask judges). The depth test stays on.
 */
export const DEBUG_HUD_RENDER_ORDER = 3_000_000;

interface UiDocument {
  getElementById: <T>(id: string) => T | null;
}

export class DebugHudPanel {
  private entity: Entity | null = null;
  private wanted: readonly string[] = [];
  private applied = false;
  /** New lines wait to be written (the document may not be loaded yet). */
  private dirty = false;
  private readonly written: string[] = new Array<string>(HUD_MAX_LINES).fill('\u0000');
  private lookApplied = false;
  private placed = false;
  private shown = false;

  constructor(private readonly world: World) {}

  get exists(): boolean {
    return this.entity !== null;
  }

  /** True while the panel is on screen. */
  get visible(): boolean {
    return this.entity?.object3D?.visible === true;
  }

  /** Creates the panel on first use, then makes it wanted (it shows when its text is in and it has a place). */
  show(): void {
    this.shown = true;
    if (this.entity) return;
    const entity = this.world.createTransformEntity();
    tagEntity(entity, stableId.ui('debug-hud'));
    entity.addComponent(PanelUI, { config: PANEL_ASSET });
    if (entity.object3D) entity.object3D.visible = false;
    this.entity = entity;
  }

  hide(): void {
    this.shown = false;
    this.placed = false;
    if (this.entity?.object3D) this.entity.object3D.visible = false;
  }

  /** The lines to show (written at the next `update`; only the lines that differ from what is there are touched). */
  setLines(lines: readonly string[]): void {
    this.wanted = lines;
    this.dirty = lines.length > 0;
  }

  /** Puts the panel at a world position, turned about the vertical axis. */
  place(x: number, y: number, z: number, yawRad: number): void {
    const object = this.entity?.object3D;
    if (!object) return;
    object.position.set(x, y, z);
    object.rotation.set(0, yawRad, 0);
    this.placed = true;
  }

  /** Once per frame (cheap): loads the document when it is ready, writes a changed text, decides visibility. */
  update(): void {
    const entity = this.entity;
    const object = entity?.object3D;
    if (!entity || !object) return;
    if (this.dirty) {
      const doc = entity.getValue(PanelDocument, 'document') as UiDocument | undefined;
      if (doc?.getElementById<UIKit.Text>(LINE_PREFIX + '0')) {
        if (!this.lookApplied) {
          // The font and the contrast theme only: a measuring tool does not grow with the large-text preference.
          applyPanelLook(doc, ROOT_ELEMENT, 'none');
          doc?.getElementById<UIKit.Container>(ROOT_ELEMENT)?.setProperties({ renderOrder: DEBUG_HUD_RENDER_ORDER });
          for (let i = 0; i < HUD_MAX_LINES; i++) {
            doc.getElementById<UIKit.Text>(LINE_PREFIX + i)?.setProperties({ renderOrder: DEBUG_HUD_RENDER_ORDER + 1 });
          }
          this.lookApplied = true;
        }
        for (let i = 0; i < HUD_MAX_LINES; i++) {
          const text = i < this.wanted.length ? this.wanted[i] : '';
          if (this.written[i] === text) continue;
          const element = doc.getElementById<UIKit.Text>(LINE_PREFIX + i);
          if (!element) continue;
          // An empty line takes no room.
          element.setProperties(text === '' ? { text: '', display: 'none' } : { text, display: 'flex' });
          this.written[i] = text;
        }
        this.applied = true;
        this.dirty = false;
      }
    }
    object.visible = this.shown && this.placed && this.applied;
  }
}
