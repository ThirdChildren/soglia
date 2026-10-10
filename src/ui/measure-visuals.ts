// The points and the tape of the tape measure in the scene (task T3.14, decision D36, reduction R-B of D33).
//
// All the geometry is ONE instanced mesh (`ui:measure-instances`, src/ui/instanced-markers.ts): instance 0 and 1 are the
// two points, instance 2 is the tape, each with its own colour: ONE draw call whatever is on screen. The mesh and the
// light anchors are children of the house entity, so their frame is the plan (metres of the plan) and they follow
// the model when it is zoomed, turned or dragged. The anchors have no geometry; they carry the stable ids
// `ui:measure-point-1`, `ui:measure-point-2` and `ui:measure-tape` (QA finds them with `ecs_find_entities`) and exist
// only while their part of the measure exists.

import { Object3D, Vector3, type Entity, type World } from '@iwsdk/core';
import { tagEntity } from '../components/tag-entity';
import { stableId } from '../logic/ids';
import {
  MEASURE_INDEX,
  MEASURE_INSTANCES,
  MEASURE_POINT_SIZE,
  MEASURE_TAPE_DROP,
  MEASURE_TAPE_THICKNESS,
  MEASURE_Y,
  tapePose,
  type MeasureFlow,
  type TapePose,
} from '../logic/measure-tool';
import { createInstancedMarkers, type InstancedMarkers, type InstancePose } from './instanced-markers';
import { palette } from './theme';

const MESH_NAME = 'ui:measure-instances';

export class MeasureVisuals {
  private readonly markers: InstancedMarkers;
  private point1: Entity | null = null;
  private point2: Entity | null = null;
  private tape: Entity | null = null;
  private readonly pose: InstancePose = { x: 0, y: 0, z: 0, yawRad: 0, sx: 1, sy: 1, sz: 1 };
  private readonly tapeScratch: TapePose = { cx: 0, cz: 0, length: 0, yawRad: 0 };

  constructor(
    private readonly world: World,
    private readonly houseEntity: Entity,
  ) {
    this.markers = createInstancedMarkers({ capacity: MEASURE_INSTANCES, name: MESH_NAME });
    houseEntity.object3D?.add(this.markers.mesh);
  }

  /** The anchor of the tape while a measure is complete, else null. */
  get tapeObject(): Object3D | null {
    return this.tape?.object3D ?? null;
  }

  /** Draws `flow`: the points and the tape that exist, nothing else. Call it when the flow changes, not every frame. */
  show(flow: MeasureFlow): void {
    this.point1 = this.syncPoint(this.point1, flow.a, MEASURE_INDEX.point1, 'measure-point-1');
    this.point2 = this.syncPoint(this.point2, flow.b, MEASURE_INDEX.point2, 'measure-point-2');

    if (flow.a === null || flow.b === null) {
      this.markers.hide(MEASURE_INDEX.tape);
      this.disposeEntity(this.tape);
      this.tape = null;
      return;
    }
    const tape = tapePose(flow.a, flow.b, this.tapeScratch);
    const pose = this.pose;
    pose.x = tape.cx;
    pose.y = MEASURE_Y - MEASURE_TAPE_DROP;
    pose.z = tape.cz;
    pose.yawRad = tape.yawRad;
    pose.sx = Math.max(tape.length, 0.001);
    pose.sy = MEASURE_TAPE_THICKNESS;
    pose.sz = MEASURE_TAPE_THICKNESS;
    this.markers.set(MEASURE_INDEX.tape, pose, palette.measureTape);
    this.tape = this.placeAnchor(this.tape, 'measure-tape', tape.cx, tape.cz, tape.yawRad);
  }

  /** Takes everything away (the tool was left, the session was suspended). */
  clear(): void {
    this.markers.hideAll();
    this.disposeEntity(this.point1);
    this.disposeEntity(this.point2);
    this.disposeEntity(this.tape);
    this.point1 = null;
    this.point2 = null;
    this.tape = null;
  }

  dispose(): void {
    this.clear();
    this.markers.dispose();
  }

  /** Writes the world position of the tape anchor into `out` and returns true while there is a tape. */
  tapeWorldPosition(out: Vector3): boolean {
    const object = this.tape?.object3D;
    if (!object) return false;
    object.getWorldPosition(out);
    return true;
  }

  private syncPoint(
    entity: Entity | null,
    point: { x: number; z: number } | null,
    index: number,
    id: string,
  ): Entity | null {
    if (point === null) {
      this.markers.hide(index);
      this.disposeEntity(entity);
      return null;
    }
    const pose = this.pose;
    pose.x = point.x;
    pose.y = MEASURE_Y;
    pose.z = point.z;
    pose.yawRad = 0;
    pose.sx = MEASURE_POINT_SIZE;
    pose.sy = MEASURE_POINT_SIZE;
    pose.sz = MEASURE_POINT_SIZE;
    this.markers.set(index, pose, palette.measurePoint);
    return this.placeAnchor(entity, id, point.x, point.z, 0);
  }

  /** The anchor `ui:<id>` at the plan point (x, z) at the height of the tape: created if it is missing, else moved. */
  private placeAnchor(entity: Entity | null, id: string, x: number, z: number, yawRad: number): Entity {
    let anchor = entity;
    if (anchor === null) {
      anchor = this.world.createTransformEntity(new Object3D(), this.houseEntity);
      tagEntity(anchor, stableId.ui(id));
    }
    const object = anchor.object3D;
    if (object) {
      object.position.set(x, MEASURE_Y, z);
      object.rotation.set(0, yawRad, 0);
    }
    return anchor;
  }

  private disposeEntity(entity: Entity | null): void {
    // Light anchors with no geometry or material of their own: nothing to free but the entity.
    if (entity) entity.dispose({ disposeResources: false });
  }
}
