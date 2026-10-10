// Fade to black and back for a change of viewpoint (task T3.11, D35 in docs/plans/M3.md).
// `ui:fade-overlay` is a black sphere seen from the inside (BackSide) around the head: it follows the head, ignores the
// depth buffer and draws last. It EXISTS ONLY during the fade (created at the start, disposed at the end, geometry and
// material included), so it costs one draw call for about 0.4 s and nothing the rest of the time.
// The opacity curve comes from `createFade` (src/logic/fade.ts); here it is only applied. The overlay never moves the
// view (rule 2): the swap callback changes the scene while the frame is fully black.
// No allocation per frame: the vector and the frame object are reused; the sphere is built once per fade.

import {
  BackSide,
  createSystem,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Vector3,
  type Entity,
  type World,
} from '@iwsdk/core';
import { tagEntity } from '../components/tag-entity';
import { slog, swarn } from '../log';
import { createFade, type Fade } from '../logic/fade';
import { stableId } from '../logic/ids';

/** Radius of the sphere (metres): far enough from both eyes, and inside the far plane. */
const RADIUS = 0.6;
/** Above everything else: UI panels, hands, the model. */
const RENDER_ORDER = 1_000_000;

export interface FadeOverlay {
  /** True from `run` until the fade has ended (or was cancelled). */
  readonly active: boolean;
  /**
   * Starts a fade. `onSwap` runs once, in the frame where the screen is fully black. The promise resolves when
   * the fade has ended: with true when it ran to the end, with false when it was cancelled. Returns null (and does
   * nothing) while a fade is running.
   */
  run(onSwap: () => void): Promise<boolean> | null;
  /** Milliseconds from the first frame of the last fade that ran to the end to its last (0 until one has). */
  readonly lastDurationMs: number;
  /** Stops at once and removes the overlay (suspend, end of session). `onSwap` is not called if it was still to come. */
  cancel(): void;
}

// Shared with the system, which has no constructor arguments: set by `createFadeOverlay`.
let current: FadeOverlayImpl | null = null;

class FadeOverlayImpl implements FadeOverlay {
  private readonly fade: Fade = createFade(() => performance.now());
  private readonly head = new Vector3();
  private entity: Entity | null = null;
  private mesh: Mesh<SphereGeometry, MeshBasicMaterial> | null = null;
  private onSwap: (() => void) | null = null;
  private resolve: ((completed: boolean) => void) | null = null;
  private durationMs = 0;

  constructor(private readonly world: World) {}

  get active(): boolean {
    return this.fade.active;
  }

  get lastDurationMs(): number {
    return this.durationMs;
  }

  run(onSwap: () => void): Promise<boolean> | null {
    if (!this.fade.start()) return null;
    this.onSwap = onSwap;
    const geometry = new SphereGeometry(RADIUS, 16, 12);
    const material = new MeshBasicMaterial({
      color: 0x000000,
      side: BackSide,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      fog: false,
    });
    const mesh = new Mesh(geometry, material);
    mesh.renderOrder = RENDER_ORDER;
    mesh.frustumCulled = false;
    mesh.raycast = () => undefined; // never a target of a ray
    this.mesh = mesh;
    this.entity = this.world.createTransformEntity(mesh);
    tagEntity(this.entity, stableId.ui('fade-overlay'));
    return new Promise<boolean>((resolve) => {
      this.resolve = resolve;
    });
  }

  cancel(): void {
    if (!this.entity) return;
    this.fade.cancel();
    slog('viewpoint fade cancelled');
    this.finish(false);
  }

  /** Called every frame by the system; does nothing when no fade runs. */
  update(): void {
    const mesh = this.mesh;
    if (!mesh || !this.fade.active) return;
    const frame = this.fade.update();

    // Follow the head. In session the camera only gets the viewer pose after the systems run, so use the head group.
    const source = this.world.renderer.xr.isPresenting ? this.world.player.head : this.world.camera;
    source.getWorldPosition(this.head);
    mesh.position.copy(this.head);
    mesh.material.opacity = frame.opacity;

    if (frame.swapNow) {
      // The swap frame is rendered black: the scene changes behind the overlay, then the line says it happened.
      const onSwap = this.onSwap;
      this.onSwap = null;
      try {
        onSwap?.();
      } catch (error) {
        swarn(`viewpoint fade swap failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (frame.entered && frame.phase !== 'idle') slog(`viewpoint fade phase=${frame.phase}`);
    if (frame.done) {
      this.durationMs = frame.elapsedMs;
      slog(`viewpoint fade end durationMs=${Math.round(frame.elapsedMs)}`);
      this.finish(true);
    }
  }

  private finish(completed: boolean): void {
    const entity = this.entity;
    const mesh = this.mesh;
    this.entity = null;
    this.mesh = null;
    this.onSwap = null;
    entity?.dispose({ disposeResources: false });
    if (mesh) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    const resolve = this.resolve;
    this.resolve = null;
    resolve?.(completed);
  }
}

class FadeOverlaySystem extends createSystem({}) {
  update(): void {
    current?.update();
  }
}

/** Creates the fade controller and registers the system that drives it every frame. */
export function createFadeOverlay(world: World): FadeOverlay {
  current = new FadeOverlayImpl(world);
  world.registerSystem(FadeOverlaySystem);
  return current;
}
