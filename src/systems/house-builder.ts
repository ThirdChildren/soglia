// Builds the house model from a validated `House` (T1.8): one node `house:<id>` with a floor per
// room, an anchor per wall, an anchor per door and an anchor per window; the walls are ONE mesh (`merged:walls`) and the
// threshold strips of the doors are ONE mesh (`merged:thresholds`) (T5.RA: 18 draw calls became 2, the walls and the strips share a
// material each, and their pose is baked into the vertices).
// Geometry is in real metres; the scale of the table-top model comes from `miniature:root`.
// Origins (checked by QA with `scene_get_object_transform`):
//   house   data origin (plan 0,0), offset by minus the plan centre inside its parent
//   room    area centroid of the polygon, y = 0
//   wall    wall midpoint, y = 0, rotation.y = -angleRad (anchor, no mesh: its box geometry is in `merged:walls`)
//   door    centre of the opening on the wall line, y = 0 (anchor, no mesh: its strip is in `merged:thresholds`)
//   window  centre of the opening on the wall line, y = sill (anchor, no mesh)
//   merged:walls, merged:thresholds   at the house origin, vertices in house plan coordinates
// This is a plain function, not an ECS system: it runs once per loaded house and allocates freely.

import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Mesh,
  MeshStandardMaterial,
  Object3D,
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
import type { FloorMaterial, House, Wall } from '../logic/house';
import { openingPlacement, planCenter, polygonRelativeTo, roomOrigin } from '../logic/house-layout';
import { stableId } from '../logic/ids';
import {
  boxesToBuffers,
  buildWallBoxes,
  mergeBuffers,
  placeBuffers,
  thresholdBuffers,
  type MeshBuffers,
} from '../logic/wall-mesh';
import { floorColor, getPalette, onAccessChange } from '../ui/theme';

/** Door strips sit this far above the floor (metres) to avoid z-fighting with it. */
const DOOR_LIFT = 0.01;

export interface BuiltHouse {
  /** The `house:<id>` entity. */
  entity: Entity;
  counts: { rooms: number; walls: number; doors: number; windows: number };
  /**
   * Rebuilds the geometry of every wall cut at `cut` metres (T3.11, D35): CUT_HEIGHT for the table-top model, the
   * ceiling height at real scale. The `wall:*` anchors, the `merged:walls` mesh and the shared material stay; the old geometry
   * is disposed. Floors, thresholds, doors and windows are not touched. Does nothing when `cut` is the current one.
   */
  setWallCut(cut: number): void;
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

/** The boxes of one wall cut at `cutHeight`, as buffers placed in house plan coordinates (the wall midpoint, turned along the wall). */
function wallBuffers(wall: Wall, height: number, cutHeight: number): MeshBuffers {
  const length = Math.hypot(wall.to[0] - wall.from[0], wall.to[1] - wall.from[1]);
  const boxes = buildWallBoxes({
    length,
    thickness: wall.thickness,
    height,
    openings: wall.openings,
    cutHeight,
  });
  const angleRad = Math.atan2(wall.to[1] - wall.from[1], wall.to[0] - wall.from[0]);
  // Wall-local x = 0 is the `from` end; the wall node sits at the midpoint and turns by -angleRad, so shift, turn, move.
  return placeBuffers(boxesToBuffers(boxes), {
    shiftX: -length / 2,
    rotationY: -angleRad,
    x: (wall.from[0] + wall.to[0]) / 2,
    z: (wall.from[1] + wall.to[1]) / 2,
  });
}

/** One geometry for all the walls of the house cut at `cutHeight`. */
function wallsGeometry(walls: readonly Wall[], height: number, cutHeight: number): BufferGeometry {
  return toGeometry(mergeBuffers(walls.map((wall) => wallBuffers(wall, height, cutHeight))));
}

function toGeometry(buffers: MeshBuffers): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(buffers.positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(buffers.normals, 3));
  geometry.setIndex(new BufferAttribute(buffers.indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

// The house that `setHouseWallCut` acts on (the Viewpoint system has no handle on it). One house at a time.
let activeHouse: BuiltHouse | null = null;

/** Rebuilds the walls of the loaded house cut at `cut` metres (see `BuiltHouse.setWallCut`). No house: no-op. */
export function setHouseWallCut(cut: number): void {
  activeHouse?.setWallCut(cut);
}

export function buildHouse(world: World, house: House, parent: Entity): BuiltHouse {
  const geometries: BufferGeometry[] = [];
  const materials: MeshStandardMaterial[] = [];
  const entities: Entity[] = []; // children first, the house node last in the end
  // Walls: their geometry is owned by the merged mesh (not by `geometries`) because it is replaced by `setWallCut`.
  let wallCut = CUT_HEIGHT;

  const material = (color: number, extra?: Partial<MeshStandardMaterial>): MeshStandardMaterial => {
    const m = new MeshStandardMaterial({ color, roughness: 1, metalness: 0, ...extra });
    materials.push(m);
    return m;
  };

  // Shared materials: one per floor type used, one for all walls, one for all door strips.
  const floorMaterials = new Map<string, MeshStandardMaterial>();
  const wallMaterial = material(getPalette().wall);
  const doorMaterial = material(getPalette().door, {
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  // The contrast preference recolours the shared materials where they are (white walls, darker floors, lighter thresholds).
  const stopAccess = onAccessChange(() => {
    wallMaterial.color.setHex(getPalette().wall);
    doorMaterial.color.setHex(getPalette().door);
    for (const [key, floorMaterial] of floorMaterials) floorMaterial.color.setHex(floorColor(key as FloorMaterial));
    return 2 + floorMaterials.size;
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

  // The walls and the strips of the doors are drawn by two meshes (`merged:walls`, `merged:thresholds`); the `wall:*` and
  // `door:*` entities stay as anchors with the pose they always had (they are what the QA and the other systems find).
  const wallsMesh = new Mesh(wallsGeometry(house.walls, house.ceilingHeight, wallCut), wallMaterial);
  child(wallsMesh, stableId.merged('walls'));
  const strips: MeshBuffers[] = [];

  let doors = 0;
  let windows = 0;
  for (const wall of house.walls) {
    const angleRad = Math.atan2(wall.to[1] - wall.from[1], wall.to[0] - wall.from[0]);
    const wallAnchor = new Object3D();
    wallAnchor.position.set((wall.from[0] + wall.to[0]) / 2, 0, (wall.from[1] + wall.to[1]) / 2);
    wallAnchor.rotation.y = -angleRad;
    child(wallAnchor, stableId.wall(wall.id));

    for (const opening of wall.openings) {
      const at = openingPlacement(wall, opening);
      if (opening.type === 'door') {
        strips.push(
          placeBuffers(thresholdBuffers(opening.width, wall.thickness, DOOR_LIFT), { rotationY: -at.angleRad, x: at.x, z: at.z }),
        );
        const doorAnchor = new Object3D();
        doorAnchor.position.set(at.x, 0, at.z);
        doorAnchor.rotation.y = -at.angleRad;
        child(doorAnchor, stableId.door(opening.id));
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

  if (strips.length > 0) {
    const thresholdsGeometry = toGeometry(mergeBuffers(strips));
    geometries.push(thresholdsGeometry);
    child(new Mesh(thresholdsGeometry, doorMaterial), stableId.merged('thresholds'));
  }

  const counts = { rooms: house.rooms.length, walls: house.walls.length, doors, windows };
  slog(
    `house loaded ${house.id} rooms=${counts.rooms} walls=${counts.walls} doors=${counts.doors} windows=${counts.windows}`,
  );

  const built: BuiltHouse = {
    entity: houseEntity,
    counts,
    setWallCut(cut: number): void {
      if (!(cut > 0) || cut === wallCut) return;
      wallCut = cut;
      const old = wallsMesh.geometry;
      wallsMesh.geometry = wallsGeometry(house.walls, house.ceilingHeight, cut);
      old.dispose();
      slog(`walls rebuilt cut=${cut.toFixed(2)}`);
    },
    dispose(): void {
      for (const entity of entities.reverse()) entity.dispose({ disposeResources: false });
      houseEntity.dispose({ disposeResources: false });
      for (const g of geometries) g.dispose();
      wallsMesh.geometry.dispose();
      for (const m of materials) m.dispose();
      stopAccess();
      if (activeHouse === built) activeHouse = null;
    },
  };
  activeHouse = built;
  return built;
}
