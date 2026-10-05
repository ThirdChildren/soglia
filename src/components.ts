import { defineComponents } from '@iwsdk/core';
import { ErrorPanelContent } from './components/error-panel-content';
import { Furniture } from './components/furniture';
import { StableId } from './components/stable-id';

// Component declarations live in system-free modules and are listed here so
// the editor can author them.
export default defineComponents([StableId, ErrorPanelContent, Furniture]);
