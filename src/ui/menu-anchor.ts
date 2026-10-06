// A pickable control of the palm menu as a light anchor (task T2.12, M2 rerun 2): an entity with a stable id
// (`ui:menu-item-<catalogId>`, `ui:menu-undo`, `ui:menu-page-prev`, `ui:menu-page-next`, `ui:menu-recenter`)
// and no rendering at all. The menu itself is ONE panel (src/ui/palm-menu.ts); the anchor sits where the card
// or the button is drawn, in the plane of the menu, so that the QA reads its position with `ecs_query_entity`
// and the pick rectangle (src/logic/menu.ts) is derived from the same layout.

import type { Entity, Object3D, World } from '@iwsdk/core';
import { MenuItem } from '../components/menu-item';
import { tagEntity } from '../components/tag-entity';

export class MenuAnchor {
  readonly entity: Entity;

  constructor(
    world: World,
    /** Stable id, for example `ui:menu-item-chair` or `ui:menu-undo`. */
    readonly stableId: string,
    /** For an item of the catalog page: the catalog id of the piece it gives. */
    catalogId?: string,
  ) {
    const entity = world.createTransformEntity();
    tagEntity(entity, stableId);
    if (catalogId !== undefined) entity.addComponent(MenuItem, { catalogId });
    this.entity = entity;
  }

  get object(): Object3D | null {
    return this.entity.object3D ?? null;
  }

  dispose(): void {
    this.entity.dispose();
  }
}
