// Observer of the room scan (plan MR, task MR.1). Only logs, for now: one line for every volume (`XRMesh`) and plane
// (`XRPlane`) the scene understanding system detects, a summary line when the count stops changing, and `room scan empty`
// when nothing shows up. It exists only in a mixed reality world (`?mr=1`); nothing is allocated per frame.
//
// Sizes: a volume gets its width x depth x height from `XRMesh.dimensions`, the extents (max - min) of its vertices along the
// axes of its mesh space. The height is the extent along the local axis that points up in the world (found from the rotation of
// the mesh: it is local Z in the emulator's rooms, local Y is not guaranteed), width is the longer of the other two and depth
// the shorter (`volumeSize`). The centre is the middle of the vertex bounds in world coordinates (`volumeCenter`).
// A plane gets the extents of its polygon along the local X and Z axes of the plane and the position of its origin.

import { XRMesh, XRPlane, createSystem } from '@iwsdk/core';
import { slog } from '../log';
import { sceneFeatureStatus } from '../logic/mixed-reality';
import { setScanEmpty } from './room-scan-status';
import {
  createScanWatch,
  formatRoomMeshLine,
  formatRoomPlaneLine,
  formatRoomSummaryLine,
  polygonExtent,
  volumeCenter,
  type Quat,
  startScanWatch,
  stepScanWatch,
  stopScanWatch,
} from '../logic/room-scan-log';

interface PlaneLike {
  readonly semanticLabel?: string;
  readonly orientation?: string;
  readonly polygon?: ArrayLike<{ readonly x: number; readonly z: number }>;
}

export class RoomScanSystem extends createSystem({
  meshes: { required: [XRMesh] },
  planes: { required: [XRPlane] },
}) {
  private readonly watch = createScanWatch();
  private readonly origin: [number, number, number] = [0, 0, 0];
  private readonly center: [number, number, number] = [0, 0, 0];
  private readonly rotation: [number, number, number, number] = [0, 0, 0, 1];
  private sessionPending = false;
  private scanning = false;

  init(): void {
    const onStart = (): void => {
      // Without any scene understanding feature there is nothing to watch: the app goes on without a room.
      this.sessionPending = this.checkSessionFeatures();
      setScanEmpty(!this.sessionPending);
    };
    const onEnd = (): void => {
      this.sessionPending = false;
      this.scanning = false;
      setScanEmpty(false);
      stopScanWatch(this.watch);
    };
    this.xrManager.addEventListener('sessionstart', onStart);
    this.xrManager.addEventListener('sessionend', onEnd);
    this.cleanupFuncs.push(
      () => this.xrManager.removeEventListener('sessionstart', onStart),
      () => this.xrManager.removeEventListener('sessionend', onEnd),
    );

    this.queries.meshes.subscribe('qualify', (entity) => {
      this.readOrigin(entity.object3D);
      volumeCenter(
        this.origin,
        this.rotation as Quat,
        entity.getVectorView(XRMesh, 'min'),
        entity.getVectorView(XRMesh, 'max'),
        this.center,
      );
      slog(
        formatRoomMeshLine(
          entity.getValue(XRMesh, 'semanticLabel') ?? '',
          entity.getValue(XRMesh, 'isBounded3D') ?? false,
          entity.getVectorView(XRMesh, 'dimensions'),
          this.rotation as Quat,
          this.center,
        ),
      );
    });
    this.queries.planes.subscribe('qualify', (entity) => {
      const plane = entity.getValue(XRPlane, '_plane') as PlaneLike | undefined;
      this.readOrigin(entity.object3D);
      slog(
        formatRoomPlaneLine(
          plane?.semanticLabel ?? '',
          plane?.orientation ?? '',
          plane?.polygon ? polygonExtent(plane.polygon) : { x: 0, z: 0 },
          this.origin,
        ),
      );
    });
  }

  update(_delta: number, time: number): void {
    if (this.sessionPending) {
      this.sessionPending = false;
      this.scanning = true;
      startScanWatch(this.watch, time);
    }
    if (!this.scanning) return;
    const event = stepScanWatch(this.watch, time, this.queries.meshes.entities.size, this.queries.planes.entities.size);
    if (event === 'settled') {
      slog(formatRoomSummaryLine(this.queries.meshes.entities.size, this.queries.planes.entities.size));
      setScanEmpty(false);
    } else if (event === 'empty') {
      slog('room scan empty');
      setScanEmpty(true);
    }
  }

  /** Position and rotation of the object (the pose of the mesh space) into `origin` and `rotation`. */
  private readOrigin(
    object:
      | {
          readonly position: { readonly x: number; readonly y: number; readonly z: number };
          readonly quaternion: { readonly x: number; readonly y: number; readonly z: number; readonly w: number };
        }
      | null
      | undefined,
  ): void {
    if (!object) return;
    this.origin[0] = object.position.x;
    this.origin[1] = object.position.y;
    this.origin[2] = object.position.z;
    this.rotation[0] = object.quaternion.x;
    this.rotation[1] = object.quaternion.y;
    this.rotation[2] = object.quaternion.z;
    this.rotation[3] = object.quaternion.w;
  }

  /**
   * The features the session granted (feature detection, rule 5). Returns false when none of the scene understanding
   * features was granted: the app then goes on without a room.
   */
  private checkSessionFeatures(): boolean {
    const status = sceneFeatureStatus(this.xrManager.getSession()?.enabledFeatures);
    if (status.kind === 'unknown') {
      slog('mr session features=unknown');
    } else if (status.kind === 'granted') {
      slog('mr session scene-understanding=granted');
    } else if (status.all) {
      slog('feature mr unavailable reason=no-scene-understanding');
      return false;
    } else {
      slog(`mr session scene-understanding=partial missing=${status.missing.join(',')}`);
    }
    return true;
  }
}
