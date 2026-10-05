import { createComponent, Types } from '@iwsdk/core';

// Text shown by the error panel (`ui:error-panel`). The panel system copies it into the UIKit
// document once the document has loaded.
export const ErrorPanelContent = createComponent('ErrorPanelContent', {
  message: { type: Types.String, default: '', label: 'Message' },
  hint: { type: Types.String, default: '', label: 'Hint' },
});
