import { createComponent, Types } from '@iwsdk/core';

// An item of the palm menu: the catalog id of the piece it gives (`ui:menu-item-<catalogId>`).
export const MenuItem = createComponent('MenuItem', {
  catalogId: { type: Types.String, default: '', label: 'Catalog id' },
});
