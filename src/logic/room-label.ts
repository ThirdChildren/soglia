// Pure text of the room label (T1.10): no imports from @iwsdk/core or three.

import { formatArea } from './geometry';

/**
 * Label text of a selected room: `${name} · ${area} m²` with one decimal digit
 * (`formatRoomLabel("Study", 11.96)` is "Study · 12.0 m²"). An empty or blank name leaves only the
 * area ("12.0 m²"); an area that is not a positive number shows as "0.0" (never "NaN").
 *
 * With `ascii` the same text is written with plain ASCII only: "Study: 12.0 m2". The UI font
 * (Inter MSDF bundled with UIKit) has no glyphs for the middle dot or the superscript two, so the
 * panel uses this form. A colon (not a dash) separates the parts: when the panel wraps the line it
 * stays at the end of the first line.
 */
export function formatRoomLabel(name: string, areaM2: number, ascii = false): string {
  const area = `${formatArea(areaM2)} ${ascii ? 'm2' : 'm²'}`;
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (trimmed === '') return area;
  return ascii ? `${trimmed}: ${area}` : `${trimmed} · ${area}`;
}
