// The home panel of the web page (HF1): a plain DOM box, outside the headset. It shows the open home, lets the user
// choose a home (demo or loaded), load a house JSON file (file picker or drop on the page) and remove a loaded home.
// It is hidden while an immersive session runs (the file picker does not exist there) and comes back when the session ends.
// Everything the file contains is shown with `textContent` only, never as HTML. Text comes from `strings.houseFile`.

import type { World } from '@iwsdk/core';
import { slog } from '../log';
import { KNOWN_HOUSES } from '../data/houses';
import type { HouseFiles } from '../data/house-files';
import { houseSwitchSearch, MAX_FILE_BYTES, type HouseFileEntry } from '../logic/house-file';
import type { House } from '../logic/house';
import { houseFileStrings as hf } from './strings';

export interface HouseFilePanel {
  /** The home that is open now (null when it could not be loaded). */
  setCurrent(house: House | null): void;
  dispose(): void;
}

const STYLE = `
.soglia-hf{position:fixed;top:12px;left:12px;z-index:20;box-sizing:border-box;width:min(94vw,480px);max-height:92vh;overflow:auto;
  padding:16px;background:#000;color:#fff;border:3px solid #fff;border-radius:12px;font:20px/1.35 system-ui,sans-serif}
.soglia-hf[hidden]{display:none}
.soglia-hf.soglia-hf-drag{border-color:#ffd400;background:#1a1a00}
.soglia-hf h2{margin:0 0 8px;font-size:24px}
.soglia-hf p{margin:0 0 10px}
.soglia-hf-cur{font-weight:700}
.soglia-hf ul{list-style:none;margin:12px 0 0;padding:0}
.soglia-hf li{margin:0 0 10px;padding:10px;border:2px solid #fff;border-radius:8px}
.soglia-hf-name{display:block;margin-bottom:6px;overflow-wrap:anywhere}
.soglia-hf-tag{display:inline-block;margin-left:6px;padding:0 8px;border:2px solid #ffd400;border-radius:6px;color:#ffd400;font-size:18px}
.soglia-hf button{min-height:48px;min-width:48px;margin:0 8px 0 0;padding:6px 16px;border:3px solid #fff;border-radius:8px;
  background:#fff;color:#000;font:700 20px system-ui,sans-serif;cursor:pointer}
.soglia-hf button.soglia-hf-primary{background:#ffd400;border-color:#ffd400}
.soglia-hf button.soglia-hf-danger{background:#000;color:#fff}
.soglia-hf button[disabled]{opacity:.6;cursor:default}
.soglia-hf button:focus-visible{outline:4px solid #00e5ff;outline-offset:2px}
.soglia-hf-status{min-height:1.35em;margin:10px 0 0}
.soglia-hf-error{margin:10px 0 0;padding:10px;border:3px solid #ff5a5a;border-radius:8px;background:#2a0000}
.soglia-hf-error ul{margin:6px 0 0}
.soglia-hf-error li{margin:0 0 4px;padding:0;border:0;font-size:18px;overflow-wrap:anywhere}
`;

/** "apartment-a" -> "Apartment A": the demo homes are named from their id, so the page makes no request for a title. */
function demoName(id: string): string {
  return id
    .split('-')
    .map((w) => (w === '' ? w : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}

function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  if (typeof FileReader === 'function') {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => reject(reader.error ?? new Error('read failed'));
      reader.readAsText(file);
    });
  }
  slog('feature file-read unavailable');
  return Promise.reject(new Error('no file reader'));
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function createHouseFilePanel(world: World, houseFiles: HouseFiles, currentId: string): HouseFilePanel {
  const style = el('style');
  style.textContent = STYLE;

  const root = el('section', 'soglia-hf');
  root.setAttribute('aria-label', hf.title);
  root.dataset.soglia = 'house-file-panel';
  const heading = el('h2', undefined, hf.title);
  const current = el('p', 'soglia-hf-cur', hf.noneOpen);
  const details = el('p');
  const list = el('ul');
  list.setAttribute('aria-label', hf.listLabel);
  const loadButton = el('button', 'soglia-hf-primary', hf.load);
  loadButton.type = 'button';
  const dropHint = el('p', undefined, hf.dropHint);
  const status = el('p', 'soglia-hf-status');
  status.setAttribute('aria-live', 'polite');
  const errorBox = el('div', 'soglia-hf-error');
  errorBox.setAttribute('role', 'alert');
  errorBox.hidden = true;
  const input = el('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.hidden = true;
  // The feedback sits right under the Load button: in a small window it is seen without scrolling the list.
  root.append(heading, current, details, loadButton, dropHint, input, status, errorBox, list);
  document.head.append(style);
  document.body.append(root);

  let openHouse: House | null = null;
  let pendingRemove: string | null = null;
  let pendingTimer: ReturnType<typeof setTimeout> | undefined;

  const clearMessages = (): void => {
    status.textContent = '';
    errorBox.hidden = true;
    errorBox.replaceChildren();
  };

  const showError = (headline: string, lines: readonly string[]): void => {
    status.textContent = '';
    errorBox.replaceChildren();
    errorBox.append(el('p', undefined, headline));
    if (lines.length > 0) {
      const ul = el('ul');
      for (const line of lines) ul.append(el('li', undefined, line));
      errorBox.append(ul);
    }
    errorBox.hidden = false;
  };

  const navigate = (id: string): void => {
    const search = houseSwitchSearch(window.location.search, id);
    window.location.assign(`${window.location.pathname}${search}${window.location.hash}`);
  };

  const row = (id: string, name: string, tag: string, entry: HouseFileEntry | null): HTMLLIElement => {
    const li = el('li');
    li.dataset.houseId = id;
    const label = el('span', 'soglia-hf-name', name);
    label.append(el('span', 'soglia-hf-tag', tag));
    li.append(label);
    const isOpen = id === currentId;
    const memoryOnly = entry !== null && houseFiles.memoryOnly(id);
    const open = el('button', isOpen ? undefined : 'soglia-hf-primary', isOpen ? hf.opened : hf.open);
    open.type = 'button';
    open.disabled = isOpen || memoryOnly;
    open.addEventListener('click', () => navigate(id));
    li.append(open);
    if (entry !== null) {
      const confirming = pendingRemove === id;
      const remove = el('button', 'soglia-hf-danger', confirming ? hf.confirmRemove : hf.remove);
      remove.type = 'button';
      remove.addEventListener('click', () => onRemove(entry));
      li.append(remove);
    }
    return li;
  };

  const render = (): void => {
    current.textContent = openHouse ? `${hf.current}: ${openHouse.title}` : hf.noneOpen;
    details.textContent = openHouse ? hf.details(openHouse.areaM2, openHouse.rooms.length) : '';
    list.replaceChildren();
    for (const id of KNOWN_HOUSES) list.append(row(id, demoName(id), hf.demoTag, null));
    for (const entry of houseFiles.entries()) {
      const tag = houseFiles.memoryOnly(entry.id) ? hf.memoryTag : hf.loadedTag;
      list.append(row(entry.id, hf.choice(entry.title, entry.areaM2), tag, entry));
    }
  };

  function onRemove(entry: HouseFileEntry): void {
    if (pendingRemove !== entry.id) {
      // Removing also deletes the layout and issues saved for that home, so it takes two presses.
      pendingRemove = entry.id;
      if (pendingTimer !== undefined) clearTimeout(pendingTimer);
      pendingTimer = setTimeout(() => {
        pendingRemove = null;
        render();
      }, 4000);
      render();
      return;
    }
    pendingRemove = null;
    if (pendingTimer !== undefined) clearTimeout(pendingTimer);
    houseFiles.remove(entry.id);
    slog(`house file removed id=${entry.id}`);
    if (entry.id === currentId) {
      navigate(KNOWN_HOUSES[0]);
      return;
    }
    clearMessages();
    status.textContent = hf.removed(entry.title);
    render();
  }

  const handleFile = async (file: File): Promise<void> => {
    clearMessages();
    let text = '';
    try {
      // A file over the limit is not read: the check of the size comes first and rejects it.
      if (file.size <= MAX_FILE_BYTES) text = await readFileText(file);
    } catch {
      slog('house file rejected reason=unreadable');
      showError(hf.rejected('unreadable'), []);
      return;
    }
    const result = houseFiles.add(text, file.size, new Date().toISOString());
    if (!result.ok) {
      slog(`house file rejected reason=${result.reason}`);
      showError(hf.rejected(result.reason), result.lines);
      return;
    }
    const { entry } = result;
    slog(`house file loaded id=${entry.id} rooms=${entry.rooms} areaM2=${entry.areaM2}`);
    if (result.persisted) {
      status.textContent = result.replaced ? hf.replaced(entry.title) : hf.loaded(entry.title);
    } else {
      showError(hf.notSaved, []);
    }
    render();
  };

  const pick = (file: File | undefined | null): void => {
    if (file) void handleFile(file);
  };

  loadButton.addEventListener('click', () => {
    if (typeof File !== 'function') {
      slog('feature File unavailable');
      showError(hf.noFileApi, []);
      return;
    }
    input.click();
  });
  input.addEventListener('change', () => {
    pick(input.files?.[0]);
    input.value = '';
  });

  // Drop a file anywhere on the page (feature detection: not every browser has drag and drop).
  const cleanups: Array<() => void> = [];
  if (typeof window.addEventListener === 'function' && 'ondrop' in window) {
    const hasFiles = (e: DragEvent): boolean => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const onDragOver = (e: DragEvent): void => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      root.classList.add('soglia-hf-drag');
    };
    const onDragLeave = (): void => root.classList.remove('soglia-hf-drag');
    const onDrop = (e: DragEvent): void => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      root.classList.remove('soglia-hf-drag');
      pick(e.dataTransfer?.files?.[0]);
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    cleanups.push(
      () => window.removeEventListener('dragover', onDragOver),
      () => window.removeEventListener('dragleave', onDragLeave),
      () => window.removeEventListener('drop', onDrop),
    );
  } else {
    slog('feature drag-and-drop unavailable');
  }

  // Hidden while the session is immersive: the file picker cannot open there, and the box would not be seen anyway.
  const xr = world.renderer.xr;
  const hide = (): void => {
    root.hidden = true;
  };
  const show = (): void => {
    root.hidden = false;
  };
  xr.addEventListener('sessionstart', hide);
  xr.addEventListener('sessionend', show);
  if (xr.isPresenting) hide();

  render();

  return {
    setCurrent(house) {
      openHouse = house;
      render();
    },
    dispose() {
      for (const undo of cleanups) undo();
      xr.removeEventListener('sessionstart', hide);
      xr.removeEventListener('sessionend', show);
      if (pendingTimer !== undefined) clearTimeout(pendingTimer);
      root.remove();
      style.remove();
    },
  };
}
