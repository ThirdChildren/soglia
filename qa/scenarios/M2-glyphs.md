# S2.0 · Glifi del font dei pannelli

**Milestone**: M2 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`)
Prerequisiti di implementazione: **parte A** T2.1; **parte B** T2.2. **L'opzione A (atlante esteso da Inter) è già approvata dall'utente (2026-10-05)**: la parte B si esegue se lo spike di 45 minuti di T2.1 è riuscito; se lo spike è fallito si adotta **senza altre domande** l'opzione D e vale il ramo D. Il report scrive quale delle due è stata adottata (la scelta è in `docs/plans/M2.md`, "Esiti degli spike"). Vedi `docs/plans/M2.md`.

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

### Parte B · dopo T2.2 (se A è stata adottata)
5. Ripetere i passi 1–4: **nessuna** riga `Missing glyph info` nel caricamento corrente; riga `[soglia] font ready family=inter weight=bold atlas=<W>x<H> glyphs=<n>`.
6. Cambiare `dev-params.local.txt` (senza `glyphs=1`), `browser_reload_page`, preparazione come sopra, poi la sequenza di `qa/scenarios/M1-room-label.md` per `living` e per `study` (mano destra a (Cx; Oy + 0,25; Cz + 0,02), `xr_look_at`, `xr_select {duration: 0.3}`), con O letto dall'ultima riga `miniature placed`. `browser_get_console_logs` con `pattern: "label shown|Missing glyph"`.
7. `browser_screenshot` dell'etichetta del soggiorno → allegare.
8. `scene_get_render_stats` (campo `textures`) e riga `[soglia:stats]` (campo `textures=`): annotare il valore con e senza `glyphs=1`.

9. **Licenza e crediti (solo con A)**, da riga di comando: `ls public/fonts/` (deve contenere `OFL.txt` e i file dell'atlante), `grep -n "font-inter-msdf" CREDITS.md`, `grep -n -i "Open Font License\|OFL" docs/RULES.md`, `npm test` (il test di igiene su `CREDITS.md` per i font in `public/`).

### Ramo D (nessun font nuovo: spike fallito)
10. Non si eseguono i passi 5–9: si esegue `npm test` (il test `font-glyphs` deve passare) e si verifica che `[soglia] label shown "Study: 12.0 m2"` resti la forma ASCII di S1.3. Verificare anche che **nessun** file di font sia stato aggiunto a `public/` (`ls public/fonts` non esiste o è vuota) e che `docs/RULES.md` e `CREDITS.md` **non** citino l'eccezione OFL.

## Verifiche (tutte obbligatorie)
**Parte A**
1. Passo 1: esattamente **1** entità `ui:glyph-test`.
2. Passo 2: il report contiene una **tabella a otto righe** (carattere → disponibile / mancante) costruita dai log; un carattere è "mancante" se compare almeno una riga `Missing glyph info for character "<c>"`, "disponibile" se nessuna. Se la tabella differisce dal controllo statico (solo `°` disponibile) il report lo dice in chiaro (non è un FAIL: è l'audit).
3. Passo 3: screenshot allegato e descritto a parole (quali righe e quali caratteri si vedono come quadrati pieni).
4. Passo 4: nessuna voce `error` in console.

**Parte B (A adottata)**
5. Passo 5: **0** righe `Missing glyph info` nel caricamento corrente; la riga `font ready` esiste e `W` e `H` sono ≤ 1024.
6. Passo 6: `[soglia] label shown "Living room & kitchen · 23.9 m²"` e `[soglia] label shown "Study · 12.0 m²"` (testo esatto, con `·` U+00B7 e `²` U+00B2); nessuna riga `Missing glyph info`.
7. Passo 7: nello screenshot l'etichetta mostra il punto mediano e l'apice (non quadrati pieni).
8. Passo 8: texture **dell'app** ≤ 4 e ciascuna ≤ 1024 px (gli atlanti si ricavano dal log `font ready`, non per deduzione); nessuna riga `budget exceeded`; nessun `error`.
9. Nessuna richiesta a un CDN per il font: nessuna riga `Failed to load` / `404` nella console (la prova di rete con la sonda temporanea di M1 è facoltativa).
10. Passo 9: `public/fonts/OFL.txt` esiste; `CREDITS.md` contiene una riga con id `font-inter-msdf` (autore, URL, licenza OFL 1.1, modifiche); `docs/RULES.md` contiene l'eccezione scritta per Inter/OFL; `npm test` verde (compreso `tests/unit/repo-hygiene.test.ts`).

**Ramo D**
11. Passo 10: `npm test` verde; etichetta ASCII invariata; nessun file di font in `public/`; nessuna eccezione OFL scritta; il report scrive "opzione D adottata (spike fallito: <motivo>)" e la parte B non si applica.

## Esito
PASS se: parte A, verifiche 1–4 · parte B (se A adottata), verifiche 5–10 · ramo D, verifica 11 · FAIL altrimenti. Se `ui:glyph-test` non compare, controllare che `glyphs=1` sia nel file e riportare il log `params`; ripetere una sola volta.

## Da rimandare al visore
Nitidezza e leggibilità di `² · ×` a 0,5–0,8 m e nel campo visivo stretto dei Meta VR Glasses; nessuna richiesta di rete per il font sul Quest (voci M1 e M2 in `qa/device/DEBT.md`).

## Changelog
- 2026-10-05: decisione dell'utente sul font: l'opzione A è già approvata (nessuna attesa dopo lo spike), lo spike dura 45 minuti e, se non riesce, si adotta D senza altre domande; la parte B si esegue "se A è stata adottata" (non più "se l'utente ha scelto A"); aggiunta la verifica 10 (licenza e crediti: `public/fonts/OFL.txt`, riga `font-inter-msdf`, eccezione in `docs/RULES.md`, test di igiene) e rinumerate le verifiche del ramo D (ora 11, con controllo che non ci siano file di font né eccezioni scritte) — motivo: recepire le risposte dell'utente alle domande aperte 1 del piano M2.
