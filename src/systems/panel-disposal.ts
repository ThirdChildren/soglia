// Frame hook for the deferred disposal of UIKit panels (see `src/ui/panel-lifecycle.ts`). It runs every frame on its
// own, so a panel that was closed while its document was still loading is disposed even when the palm menu (or any
// other panel owner) is closed or has no system running.

import { createSystem } from '@iwsdk/core';
import { flushPanelDisposals } from '../ui/panel-lifecycle';

export class PanelDisposalSystem extends createSystem({}) {
  update(): void {
    flushPanelDisposals();
  }
}
