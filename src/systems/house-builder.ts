// Builds the house model from a validated `House` (T1.8): one node `house:<id>` with a floor per
// room, a cut wall per wall, a threshold strip per door and an empty marker per window.
// Geometry is in real metres; the scale of the table-top model comes from `miniature:root`.
// Origins (checked by QA with `scene_get_object_transform`):
//   house   data origin (plan 0,0), offset by minus the plan centre inside its parent
//   room    area centroid of the polygon, y = 0
//   wall    wall midpoint, y = 0, rotation.y = -angleRad
//   door    centre of the opening on the wall line, y = 0
//   window  centre of the opening on the wall line, y = sill (no mesh)
// This is a plain function, not an ECS system: it runs once per loaded house and allocates freely.

import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  RayInteractable,
  Shape,
  ShapeGeometry,
  Vector2,
  type Entity,
  type World,
} from '@iwsdk/core';
import { tagEntity } from '../components/tag-entity';
import { slog } from '../log';
import { CUT_HEIGHT } from '../logic/constants';
import type { House, Wall } from '../logic/house';
import { openingPlacement, planCenter, polygonRelativeTo, roomOrigin } from '../logic/house-layout';
import { stableId } from '../logic/ids';
import { boxesToBuffers, buildWallBoxes } from '../logic/wall-mesh';
import { floorColor, palette } from '../ui/theme';

/** Door strips sit this far above the floor (metres) to avoid z-fighting with it. */
const DOOR_LIFT = 0.01;

export interface BuiltHouse {
  /** The `house:<id>` entity. */
  entity: Entity;
  counts: { rooms: number; walls: number; doors: number; windows: number };
  /** Removes every entity of the house and disposes its geometries and materials. */
  dispose(): void;
}

function floorGeometry(polygon: readonly [number, number][]): BufferGeometry {
  // The shape lives in the XY plane with y = -z; rotating by -90 degrees about X maps
  // (x, y, 0) to (x, 0, -y) = (x, 0, z) and turns the face normal up.
  const shape = new Shape(polygon.map(([x, z]) => new Vector2(x, -z)));
  const geometry = new ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function wallGeometry(wall: Wall, height: number): BufferGeometry {
  const length = Math.hypot(wall.to[0] - wall.from[0], wall.to[1] - wall.from[1]);
  const boxes = buildWallBoxes({
    length,
    thickness: wall.thickness,
    height,
    openings: wall.openings,
    cutHeight: CUT_HEIGHT,
  });
  const buffers = boxesToBuffers(boxes);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(buffers.positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(buffers.normals, 3));
  geometry.setIndex(new BufferAttribute(buffers.indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

export function buildHouse(world: World, house: House, parent: Entity): BuiltHouse {
  const geometries: BufferGeometry[] = [];
  const materials: MeshStandardMaterial[] = [];
  const entities: Entity[] = []; // children first, the house node last in the end

  const material = (color: number, extra?: Partial<MeshStandardMaterial>): MeshStandardMaterial => {
    const m = new MeshStandardMaterial({ color, roughness: 1, metalness: 0, ...extra });
    materials.push(m);
    return m;
  };

  // Shared materials: one per floor type used, one for all walls, one for all door strips.
  const floorMaterials = new Map<string, MeshStandardMaterial>();
  const wallMaterial = material(palette.wall);
  const doorMaterial = material(palette.door, {
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  const [cx, cz] = planCenter(house);
  const houseObject = new Object3D();
  houseObject.position.set(-cx, 0, -cz);
  const houseEntity = world.createTransformEntity(houseObject, parent);
  tagEntity(houseEntity, stableId.house(house.id));

  const child = (object: Object3D, id: string): Entity => {
    const entity = world.createTransformEntity(object, houseEntity);
    tagEntity(entity, id);
    entities.push(entity);
    return entity;
  };

  for (const room of house.rooms) {
    const [ox, oz] = roomOrigin(room.polygon);
    const geometry = floorGeometry(polygonRelativeTo(room.polygon, [ox, oz]));
    geometries.push(geometry);
    const key = room.floorMaterial ?? 'concrete';
    let floorMaterial = floorMaterials.get(key);
    if (!floorMaterial) {
      floorMaterial = material(floorColor(room.floorMaterial), { side: DoubleSide });
      floorMaterials.set(key, floorMaterial);
    }
    const mesh = new Mesh(geometry, floorMaterial);
    mesh.position.set(ox, 0, oz);
    child(mesh, stableId.room(room.id)).addComponent(RayInteractable);
  }

  let doors = 0;
  let windows = 0;
  for (const wall of house.walls) {
    const length = Math.hypot(wall.to[0] - wall.from[0], wall.to[1] - wall.from[1]);
    const angleRad = Math.atan2(wall.to[1] - wall.from[1], wall.to[0] - wall.from[0]);
    const geometry = wallGeometry(wall, house.ceilingHeight);
    geometries.push(geometry);
    const mesh = new Mesh(geometry, wallMaterial);
    // Wall-local x = 0 is the `from` end; the node sits at the midpoint, so shift the geometry.
    mesh.position.set((wall.from[0] + wall.to[0]) / 2, 0, (wall.from[1] + wall.to[1]) / 2);
    mesh.rotation.y = -angleRad;
    geometry.translate(-length / 2, 0, 0);
    child(mesh, stableId.wall(wall.id));

    for (const opening of wall.openings) {
      const at = openingPlacement(wall, opening);
      if (opening.type === 'door') {
        const strip = new PlaneGeometry(opening.width, wall.thickness);
        strip.rotateX(-Math.PI / 2);
        strip.translate(0, DOOR_LIFT, 0);
        geometries.push(strip);
        const doorMesh = new Mesh(strip, doorMaterial);
        doorMesh.position.set(at.x, 0, at.z);
        doorMesh.rotation.y = -at.angleRad;
        child(doorMesh, stableId.door(opening.id));
        doors++;
      } else {
        const marker = new Object3D();
        marker.position.set(at.x, opening.sill ?? 0, at.z);
        marker.rotation.y = -at.angleRad;
        child(marker, stableId.window(opening.id));
        windows++;
      }
    }
  }

  const counts = { rooms: house.rooms.length, walls: house.walls.length, doors, windows };
  slog(
    `house loaded ${house.id} rooms=${counts.rooms} walls=${counts.walls} doors=${counts.doors} windows=${counts.windows}`,
  );

  return {
    entity: houseEntity,
    counts,
    dispose(): void {
      for (const entity of entities.reverse()) entity.dispose({ disposeResources: false });
      houseEntity.dispose({ disposeResources: false });
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
