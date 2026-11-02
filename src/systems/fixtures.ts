// Fixture anchors (task T4.3): one light entity `fixture:<id>` per fixture of `house.json`, a child of the house node like
// `door:*` and `window:*`. It has a `StableId` and a local `Transform` (the fixture position in house coordinates, so the
// QA reads the same numbers as the file) and no mesh: it costs no draw call. The anchors are there for the QA and, later,
// for the pins that point at a fixture. The snap itself is pure logic (src/logic/issue-anchor.ts).
// Like `buildHouse` this is a plain function that runs once per loaded house: it allocates freely.

import { Object3D, type Entity, type World } from '@iwsdk/core';
import { tagEntity } from '../components/tag-entity';
import { slog } from '../log';
import type { House } from '../logic/house';
import { stableId } from '../logic/ids';

export interface FixtureAnchors {
  /** The `fixture:<id>` entities, in the order of `house.fixtures`. */
  entities: readonly Entity[];
  /** Removes every anchor entity. */
  dispose(): void;
}

/** Creates the `fixture:*` entities under `houseEntity` (the entity that `buildHouse` returns). A house with no fixtures gets none. */
export function createFixtureAnchors(world: World, house: House, houseEntity: Entity): FixtureAnchors {
  const entities: Entity[] = [];
  for (const fixture of house.fixtures ?? []) {
    const object = new Object3D();
    object.position.set(fixture.position[0], fixture.position[1], fixture.position[2]);
    const entity = world.createTransformEntity(object, houseEntity);
    tagEntity(entity, stableId.fixture(fixture.id));
    entities.push(entity);
  }
  slog(`fixtures loaded ${house.id} count=${entities.length}`);
  return {
    entities,
    dispose(): void {
      for (const entity of entities.splice(0).reverse()) entity.dispose({ disposeResources: false });
    },
  };
}
