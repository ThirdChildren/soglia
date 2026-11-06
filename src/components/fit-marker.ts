import { createComponent, Types } from '@iwsdk/core';

// A light anchor of the FitCheck (`ui:fit-marker-<doorId>`, T3.9, D33 R-B): it sits on a door of the model and
// says what the colour of that door's instance is. The drawing itself is ONE instanced mesh for all markers
// (src/ui/instanced-markers.ts), so these entities carry no geometry. `doorId` is the id of the opening in the house
// file (`d-living`); the stable id of the door entity is `door:<doorId>`.
export const FitMarker = createComponent('FitMarker', {
  doorId: { type: Types.String, default: '', label: 'Door id' },
  /** `pass` (green) or `block` (red). */
  status: { type: Types.String, default: 'pass', label: 'Status' },
});
