import { AssetType, defineAssets } from '@iwsdk/core';

// Evaluated by both the app runtime and the editor: keep it deterministic and
// side-effect free. No remote URLs: every asset is local (see CREDITS.md).
export default defineAssets({
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
  'palm-menu': {
    url: `${import.meta.env.BASE_URL}ui/palm-menu.uikitml`,
    type: AssetType.UIKitML,
    priority: 'lazy',
  },
  'room-label': {
    url: `${import.meta.env.BASE_URL}ui/room-label.uikitml`,
    type: AssetType.UIKitML,
    priority: 'lazy',
  },
});
