// Safe disposal of UIKit panel entities. IWSDK loads the layout of a `PanelUI` asynchronously and, when it is
// done, adds the document to `entity.object3D`; an entity disposed in between has no object3D any more and the
// loader logs `[PanelUISystem] Failed to load panel ... undefined (reading 'add')` (M2 rerun 2, F1). So a panel
// whose document is not in yet is hidden and disposed later, when the document has arrived.

import { PanelDocument, type Entity } from '@iwsdk/core';
import { swarn } from '../log';

/** A panel that never gets its document is disposed anyway after this long, in milliseconds. */
const MAX_WAIT_MS = 5000;

interface Pending {
  entity: Entity;
  since: number;
}

const pending: Pending[] = [];

/** Disposes `entity` now when its panel document is loaded, otherwise hides it and disposes it as soon as it is. */
export function disposePanelEntity(entity: Entity): void {
  if (entity.hasComponent(PanelDocument) || !entity.object3D) {
    entity.dispose();
    return;
  }
  entity.object3D.visible = false;
  pending.push({ entity, since: performance.now() });
}

/** Once per frame: disposes the panels that were waiting for their document. Allocates nothing. */
export function flushPanelDisposals(): void {
  if (pending.length === 0) return;
  const now = performance.now();
  for (let i = pending.length - 1; i >= 0; i -= 1) {
    const item = pending[i];
    const loaded = item.entity.hasComponent(PanelDocument);
    const expired = now - item.since > MAX_WAIT_MS;
    if (!loaded && !expired) continue;
    if (expired && !loaded) swarn('panel document never loaded: disposing the entity anyway');
    pending[i] = pending[pending.length - 1];
    pending.pop();
    item.entity.dispose();
  }
}
