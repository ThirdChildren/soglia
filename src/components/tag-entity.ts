import type { Entity } from '@iwsdk/core';
import { isValidStableId } from '../logic/ids';
import { StableId } from './stable-id';

/**
 * Give an entity its stable id: sets the StableId component and mirrors the
 * value in object3D.name (QA finds entities by name with `ecs_find_entities`).
 * Throws if the id is malformed. Safe to call again to rename.
 */
export function tagEntity(entity: Entity, id: string): Entity {
  if (!isValidStableId(id)) {
    throw new Error(`Invalid stable id: ${JSON.stringify(id)}`);
  }
  if (entity.hasComponent(StableId)) {
    entity.setValue(StableId, 'value', id);
  } else {
    entity.addComponent(StableId, { value: id });
  }
  if (entity.object3D) {
    entity.object3D.name = id;
  }
  return entity;
}
