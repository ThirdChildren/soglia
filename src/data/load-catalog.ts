// Loads and validates the furniture catalog. Never throws: on any problem it warns once and
// returns a failure, and the menu shows `menu.catalogUnavailable`.

import { checkCatalog, furnitureItems, type CatalogItem } from '../logic/catalog';
import { slog, swarn } from '../log';

export type LoadCatalogResult =
  | { ok: true; items: CatalogItem[] }
  | { ok: false; errors: string[] };

export function catalogUrl(): string {
  return `${import.meta.env.BASE_URL}catalog/catalog.json`;
}

export async function loadCatalog(): Promise<LoadCatalogResult> {
  const fail = (errors: string[]): LoadCatalogResult => {
    swarn(`catalog invalid: ${errors.join('; ')}`);
    return { ok: false, errors };
  };

  if (typeof fetch !== 'function') {
    slog('feature fetch unavailable');
    return fail(['(root): fetch is not available']);
  }

  let text: string;
  try {
    const response = await fetch(catalogUrl());
    if (!response.ok) return fail([`(root): the file could not be loaded (HTTP ${response.status})`]);
    text = await response.text();
  } catch {
    return fail(['(root): the file could not be loaded']);
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return fail(['(root): the file is not valid JSON']);
  }

  const check = checkCatalog(data);
  if (!check.ok) return fail(check.errors);

  const furniture = furnitureItems(check.items).length;
  slog(`catalog loaded items=${check.items.length} furniture=${furniture} mobility=${check.items.length - furniture}`);
  return { ok: true, items: check.items };
}
