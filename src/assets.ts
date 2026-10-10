import { AssetType, defineAssets } from '@iwsdk/core';

// Evaluated by both the app runtime and the editor: keep it deterministic and
// side-effect free. No remote URLs: every asset is local (see CREDITS.md).
// The 14 furniture models of the catalog (CC0, see CREDITS.md): `furniture-<catalogId>`.
const FURNITURE_MODELS = [
  'armchair',
  'bed-double',
  'bed-single',
  'bookcase',
  'chair',
  'coffee-table',
  'desk',
  'nightstand',
  'plant',
  'rug',
  'sofa-3seat',
  'table-dining',
  'tv-stand',
  'wardrobe',
] as const;

const furnitureAssets = Object.fromEntries(
  FURNITURE_MODELS.map((id) => [
    `furniture-${id}`,
    {
      url: `${import.meta.env.BASE_URL}catalog/models/${id}.glb`,
      type: AssetType.GLTF,
      priority: 'lazy' as const,
    },
  ]),
);

export default defineAssets({
  ...furnitureAssets,
  'error-panel': {
    url: `${import.meta.env.BASE_URL}ui/error-panel.uikitml`,
    type: AssetType.UIKitML,
    priority: 'lazy',
  },
  'glyph-test': {
    url: `${import.meta.env.BASE_URL}ui/glyph-test.uikitml`,
    type: AssetType.UIKitML,
    priority: 'lazy',
  },
  'menu-button': {
    url: `${import.meta.env.BASE_URL}ui/menu-button.uikitml`,
    type: AssetType.UIKitML,
    priority: 'lazy',
  },
  'menu-hint': {
    url: `${import.meta.env.BASE_URL}ui/menu-hint.uikitml`,
    type: AssetType.UIKitML,
    priority: 'lazy',
  },
  'palm-menu': {
    url: `${import.meta.env.BASE_URL}ui/palm-menu.uikitml`,
    type: AssetType.UIKitML,
    priority: 'lazy',
  },
  'reason-label': {
    url: `${import.meta.env.BASE_URL}ui/reason-label.uikitml`,
    type: AssetType.UIKitML,
    priority: 'lazy',
  },
  'room-label': {
    url: `${import.meta.env.BASE_URL}ui/room-label.uikitml`,
    type: AssetType.UIKitML,
    priority: 'lazy',
  },
});
