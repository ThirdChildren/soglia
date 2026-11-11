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
  'fit-label': {
    url: `${import.meta.env.BASE_URL}ui/fit-label.uikitml`,
    type: AssetType.UIKitML,
    priority: 'lazy',
  },
  'glyph-test': {
    url: `${import.meta.env.BASE_URL}ui/glyph-test.uikitml`,
    type: AssetType.UIKitML,
    priority: 'lazy',
  },
  'measure-hint': {
    url: `${import.meta.env.BASE_URL}ui/measure-hint.uikitml`,
    type: AssetType.UIKitML,
    priority: 'lazy',
  },
  'measure-label': {
    url: `${import.meta.env.BASE_URL}ui/measure-label.uikitml`,
    type: AssetType.UIKitML,
    priority: 'lazy',
  },
  'issue-button': {
    url: `${import.meta.env.BASE_URL}ui/issue-button.uikitml`,
    type: AssetType.UIKitML,
    priority: 'lazy',
  },
  'issue-panel': {
    url: `${import.meta.env.BASE_URL}ui/issue-panel.uikitml`,
    type: AssetType.UIKitML,
    priority: 'lazy',
  },
  'menu-button': {
    url: `${import.meta.env.BASE_URL}ui/menu-button.uikitml`,
    type: AssetType.UIKitML,
    priority: 'lazy',
  },
  'view-button': {
    url: `${import.meta.env.BASE_URL}ui/view-button.uikitml`,
    type: AssetType.UIKitML,
    priority: 'lazy',
  },
  'coach-panel': {
    url: `${import.meta.env.BASE_URL}ui/coach-panel.uikitml`,
    type: AssetType.UIKitML,
    priority: 'lazy',
  },
  'rotate-button': {
    url: `${import.meta.env.BASE_URL}ui/rotate-button.uikitml`,
    type: AssetType.UIKitML,
    priority: 'lazy',
  },
  'view-panel': {
    url: `${import.meta.env.BASE_URL}ui/view-panel.uikitml`,
    type: AssetType.UIKitML,
    priority: 'lazy',
  },
  'view-panel-large': {
    url: `${import.meta.env.BASE_URL}ui/view-panel-large.uikitml`,
    type: AssetType.UIKitML,
    priority: 'lazy',
  },
  'tabletop-button': {
    url: `${import.meta.env.BASE_URL}ui/tabletop-button.uikitml`,
    type: AssetType.UIKitML,
    priority: 'lazy',
  },
  'room-button': {
    url: `${import.meta.env.BASE_URL}ui/room-button.uikitml`,
    type: AssetType.UIKitML,
    priority: 'lazy',
  },
  'scan-card': {
    url: `${import.meta.env.BASE_URL}ui/scan-card.uikitml`,
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
  'debug-hud': {
    url: `${import.meta.env.BASE_URL}ui/debug-hud.uikitml`,
    type: AssetType.UIKitML,
    priority: 'lazy',
  },
  'room-label': {
    url: `${import.meta.env.BASE_URL}ui/room-label.uikitml`,
    type: AssetType.UIKitML,
    priority: 'lazy',
  },
});
