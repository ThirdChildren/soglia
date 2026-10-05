// Pure text helpers for furniture: sizes in metres for the menu. No imports from @iwsdk/core or three.

/**
 * A length in metres for a label: one decimal when that is exact (`2` -> "2.0", `1.6` -> "1.6"),
 * otherwise two (`0.45` -> "0.45"). Not finite or negative values give "0.0".
 */
export function formatMeters(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '0.0';
  const oneDecimal = Math.round(meters * 10) / 10;
  if (Math.abs(oneDecimal - meters) < 1e-9) return oneDecimal.toFixed(1);
  return (Math.round(meters * 100) / 100).toFixed(2);
}

/**
 * Width and depth for a label: "1.6 × 2.0 m". With `ascii` the sign is a plain x ("1.6 x 2.0 m"), for when
 * the local panel font (which has the multiplication sign) could not be loaded.
 */
export function formatSize(width: number, depth: number, ascii = false): string {
  return `${formatMeters(width)} ${ascii ? 'x' : '×'} ${formatMeters(depth)} m`;
}
