// Loads and validates the user's own furniture (`public/demo/my-furniture.json`, T3.8, D34). Never throws: on any
// problem it warns once and returns a failure, and the `mine` tab of the menu stays hidden. An invalid entry is left
// out with a warning (the FitCheck needs a valid `size`); the valid ones are used.

import { checkOwnFurniture, type CatalogItem } from '../logic/catalog';
import { slog, swarn } from '../log';

export type LoadMyFurnitureResult = { ok: true; items: CatalogItem[] } | { ok: false; reason: string };

export function myFurnitureUrl(): string {
  return `${import.meta.env.BASE_URL}demo/my-furniture.json`;
}

export async function loadMyFurniture(): Promise<LoadMyFurnitureResult> {
  const fail = (reason: string): LoadMyFurnitureResult => {
    swarn(`my furniture unavailable reason=${reason}`);
    return { ok: false, reason };
  };

  if (typeof fetch !== 'function') {
    slog('feature fetch unavailable');
    return fail('no-fetch');
  }

  let text: string;
  try {
    const response = await fetch(myFurnitureUrl());
    if (!response.ok) return fail(`http-${response.status}`);
    text = await response.text();
  } catch {
    return fail('network');
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return fail('invalid-json');
  }

  const check = checkOwnFurniture(data);
  if (!check.ok) return fail(`invalid-file ${check.errors.join('; ')}`);
  for (const line of check.discarded) swarn(`my furniture item discarded ${line}`);
  if (check.items.length === 0) return fail('no-valid-items');

  slog(`my furniture loaded items=${check.items.length}`);
  return { ok: true, items: check.items };
}
