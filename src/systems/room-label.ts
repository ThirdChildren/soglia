// Room selection and its label (T1.10). A pinch on a room floor (`room:<id>`, `Pressed` through its
// `RayInteractable`) dispatches `selectRoom` on the application store; a store listener then logs
// and shows or hides the `ui:room-label` panel. The press is ignored while a two-hand gesture runs
// or both hands pinch (a two-hand gesture must not select a room). The text is `strings.roomLabel`;
// the area comes from the room polygon (`polygonArea`), because rooms have no area field in the data.

import {
  createSystem,
  Pressed,
  RayInteractable,
  type Entity,
  type Object3D,
  type World,
} from '@iwsdk/core';
import { StableId } from '../components/stable-id';
import { slog } from '../log';
import { formatArea, polygonArea } from '../logic/geometry';
import type { House } from '../logic/house';
import { stableId } from '../logic/ids';
import { selectRoom, type Store } from '../logic/state';
import { RoomLabelPanel } from '../ui/room-label-panel';
import { strings } from '../ui/strings';
import { isMiniatureGestureActive } from './miniature-gesture';

const ROOM_PREFIX = 'room:';

interface RoomLabelContext {
  store: Store;
  house: House;
  panel: RoomLabelPanel;
}

// Shared with the system, which has no constructor arguments: set by `createRoomLabel`.
let context: RoomLabelContext | null = null;

/** Wires the room selection to `store` for `house` and registers the system. */
export function createRoomLabel(world: World, store: Store, house: House): void {
  context = { store, house, panel: new RoomLabelPanel(world) };
  world.registerSystem(RoomLabelSystem);
}

export class RoomLabelSystem extends createSystem({
  pressed: { required: [StableId, RayInteractable, Pressed] },
  rooms: { required: [StableId, RayInteractable] },
}) {
  private shownRoomId: string | null = null;

  init(): void {
    const ctx = context;
    if (!ctx) return;
    const { store, house, panel } = ctx;
    this.shownRoomId = store.get().selectedRoomId;

    this.cleanupFuncs.push(
      this.queries.pressed.subscribe('qualify', (entity) => {
        const name = entity.object3D?.name ?? '';
        if (!name.startsWith(ROOM_PREFIX)) return;
        if (isMiniatureGestureActive()) return;
        const roomId = name.slice(ROOM_PREFIX.length);
        if (!house.rooms.some((room) => room.id === roomId)) return;
        store.dispatch(selectRoom(roomId));
      }),
    );

    this.cleanupFuncs.push(
      store.subscribe((state) => {
        const previous = this.shownRoomId;
        const current = state.selectedRoomId;
        if (current === previous) return;
        this.shownRoomId = current;
        if (current === null) {
          panel.hide();
          if (previous !== null) slog(`room deselected ${previous}`);
          return;
        }
        const room = house.rooms.find((r) => r.id === current);
        const floor = room ? this.findRoomObject(current) : null;
        if (!room || !floor) return;
        const area = polygonArea(room.polygon);
        slog(`room selected ${room.id} area=${formatArea(area)}`);
        const text = strings.roomLabel(room.name, area);
        panel.show(text, floor);
        slog(`label shown "${text}"`);
      }),
    );
  }

  update(): void {
    const ctx = context;
    if (!ctx) return;
    // In session the XR camera only gets the viewer pose after the systems run, so use the head group.
    const head = this.world.renderer.xr.isPresenting ? this.world.player.head : this.world.camera;
    ctx.panel.update(head);
  }

  private findRoomObject(roomId: string): Object3D | null {
    const wanted = stableId.room(roomId);
    for (const entity of this.queries.rooms.entities as Iterable<Entity>) {
      if (entity.object3D?.name === wanted) return entity.object3D;
    }
    return null;
  }
}
