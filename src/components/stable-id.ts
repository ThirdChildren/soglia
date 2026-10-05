import { createComponent, Types } from '@iwsdk/core';

// Readable, stable identifier of an interactive entity (e.g. `wall:w-north`).
// Declared in a system-free module; see src/logic/ids.ts for the constructors.
export const StableId = createComponent('StableId', {
  value: { type: Types.String, default: '', label: 'Stable id' },
});
