# S2.0 · Glifi del font dei pannelli

**Milestone**: M2 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`)
Prerequisiti di implementazione: **parte A** T2.1; **parte B** T2.2 (e solo se l'utente ha scelto l'opzione A, altrimenti vale il ramo D). Vedi `docs/plans/M2.md`.

## Precondizioni
- Runtime già avviato (non cambiare la modalità senza annunciarlo). `dev-params.local.txt` (git-ignored) con **una riga**:
  - Parte A e B, prova a schermo: `house=apartment-a&role=visitor&reset=1&seed=1&debug=1&glyphs=1`
  - Parte B, regressione dell'etichetta: `house=apartment-a&role=visitor&reset=1&seed=1&debug=1`
- Ordine dei passi come in M1: `browser_reload_page` → `xr_accept_session` → `xr_set_input_mode` con `mode: "hand"` → attesa 3 s. La testa resta a (0; 1,6; 0) (default di sessione); `ui:glyph-test` sta a 0,6 m davanti alla testa.
- Caratteri candidati (otto): `²` `·` `×` `°` `−` `±` `→` `≈`. Controllo statico del pianificatore sul pacchetto `@pmndrs/msdfonts` 1.0.76 (da confermare qui): disponibile **solo `°`**; mancanti `² · × − ± → ≈`.

## Passi

### Parte A · audit a schermo (T2.1)
1. `ecs_find_entities` con `namePattern: "^ui:glyph-test$"`.
2. `browser_get_console_logs` con `pattern: "Missing glyph info"` e `count: 60` (il buffer accumula i caricamenti: usare solo le righe con timestamp ≥ `params source=` del caricamento corrente). Ricavare l'insieme dei caratteri **distinti** citati nelle righe `Missing glyph info for character "<c>"`.
3. `browser_screenshot` → allegare (le tre righe del pannello di prova: i caratteri mancanti compaiono come quadrati pieni).
4. `browser_get_console_logs` senza filtro (cercare `error`).

### Parte B · dopo T2.2 (opzione A)
5. Ripetere i passi 1–4: **nessuna** riga `Missing glyph info` nel caricamento corrente; riga `[soglia] font ready family=inter weight=bold atlas=<W>x<H> glyphs=<n>`.
6. Cambiare `dev-params.local.txt` (senza `glyphs=1`), `browser_reload_page`, preparazione come sopra, poi la sequenza di `qa/scenarios/M1-room-label.md` per `living` e per `study` (mano destra a (Cx; Oy + 0,25; Cz + 0,02), `xr_look_at`, `xr_select {duration: 0.3}`), con O letto dall'ultima riga `miniature placed`. `browser_get_console_logs` con `pattern: "label shown|Missing glyph"`.
7. `browser_screenshot` dell'etichetta del soggiorno → allegare.
8. `scene_get_render_stats` (campo `textures`) e riga `[soglia:stats]` (campo `textures=`): annotare il valore con e senza `glyphs=1`.

### Ramo D (nessun font nuovo)
9. Non si eseguono i passi 5–8: si esegue `npm test` (il test `font-glyphs` deve passare) e si verifica che `[soglia] label shown "Study: 12.0 m2"` resti la forma ASCII di S1.3.

## Verifiche (tutte obbligatorie)
**Parte A**
1. Passo 1: esattamente **1** entità `ui:glyph-test`.
2. Passo 2: il report contiene una **tabella a otto righe** (carattere → disponibile / mancante) costruita dai log; un carattere è "mancante" se compare almeno una riga `Missing glyph info for character "<c>"`, "disponibile" se nessuna. Se la tabella differisce dal controllo statico (solo `°` disponibile) il report lo dice in chiaro (non è un FAIL: è l'audit).
3. Passo 3: screenshot allegato e descritto a parole (quali righe e quali caratteri si vedono come quadrati pieni).
4. Passo 4: nessuna voce `error` in console.

**Parte B (opzione A)**
5. Passo 5: **0** righe `Missing glyph info` nel caricamento corrente; la riga `font ready` esiste e `W` e `H` sono ≤ 1024.
6. Passo 6: `[soglia] label shown "Living room & kitchen · 23.9 m²"` e `[soglia] label shown "Study · 12.0 m²"` (testo esatto, con `·` U+00B7 e `²` U+00B2); nessuna riga `Missing glyph info`.
7. Passo 7: nello screenshot l'etichetta mostra il punto mediano e l'apice (non quadrati pieni).
8. Passo 8: texture **dell'app** ≤ 4 e ciascuna ≤ 1024 px (gli atlanti si ricavano dal log `font ready`, non per deduzione); nessuna riga `budget exceeded`; nessun `error`.
9. Nessuna richiesta a un CDN per il font: nessuna riga `Failed to load` / `404` nella console (la prova di rete con la sonda temporanea di M1 è facoltativa).

**Ramo D**
10. `npm test` verde; etichetta ASCII invariata; il report scrive "opzione D adottata" e la parte B non si applica.

## Esito
PASS se: parte A, verifiche 1–4 · parte B (se opzione A), verifiche 5–9 · ramo D, verifica 10 · FAIL altrimenti. Se `ui:glyph-test` non compare, controllare che `glyphs=1` sia nel file e riportare il log `params`; ripetere una sola volta.

## Da rimandare al visore
Nitidezza e leggibilità di `² · ×` a 0,5–0,8 m e nel campo visivo stretto dei Meta VR Glasses; nessuna richiesta di rete per il font sul Quest (voci M1 e M2 in `qa/device/DEBT.md`).
