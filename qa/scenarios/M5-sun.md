# S5.1 · Il sole: posizione, chiazze di luce e controllo mese/ora

> **Changelog 2026-11-06**: scenario creato dal piano M5 (D54, D55, D56; T5.1–T5.6). I valori di riferimento del sole sono calcolati **a mano** (piano M5, D54) e il task T5.1 li conferma col calcolatore NOAA nel test unitario: se il test fissa valori diversi, `emulator-qa` usa quelli del test (tolleranze invariate) e lo scrive nel report.

**Milestone**: M5 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`) · **Regole di `CLAUDE.md`**: 1, 2, 5 (nessuna API di rete o sensori), 7, 8, 9, 10
Prerequisiti di implementazione: T5.1–T5.6. Vedi `docs/plans/M5.md`. Convenzioni comuni (pose, `D_GRIP`, `W(...)`, preparazione standard, lettura del buffer con `since`): `qa/scenarios/M4-issue-create.md`.

## Convenzioni
- `pinch=grip`; pulsanti e controlli si leggono con `ecs_query_entity` `["Transform"]` e si premono con la destra a `posizione − D_GRIP`, `xr_select {duration: 0.3}`. Pulsante `ui:view-button-right` atteso a circa (0,4347; 1,635; −0,5665) (valore di progetto: **si legge**).
- **Tabella di riferimento** (Torino 45,07° N 7,69° E; ora **locale** della casa; tolleranza azimut ±1,5°, altezza ±1°):

| `sunTime` | UTC | azimut (da nord, orario) | altezza |
|---|---|---|---|
| 2026-12-21T10:00 | 09:00Z | ≈ 145° | ≈ 13,7° |
| 2026-12-21T15:00 | 14:00Z | ≈ 216° | ≈ 13° |
| 2026-06-21T14:00 | 12:00Z (ora legale, UTC+2) | ≈ 198° | ≈ 67,6° |
| 2026-06-21T15:00 | 13:00Z | ≈ 227° | ≈ 62° |
| 2026-12-21T22:00 | 21:00Z | – | < 0 (notte) |

- **Dove cade il disco del sole** (casa A, `northAngleDeg` = 225, su = −z ha azimut 135°): per un azimut β il versore in pianta è `x = sin(β − 135°)`, `z = −cos(β − 135°)`; il disco sta a `centro + raggio × (x, z)` in coordinate di casa. Controllo: l'angolo tra `(marker − centro)` proiettato in pianta e il versore atteso è ≤ 5°.
- Finestre di A sul lato nord della pianta (`z = 0`, normale uscente azimut 135°): `win-living-1`, `win-living-2`, `win-bedroom`, `win-study`; lato est (`w-east`, azimut 225°): `win-study-east`; lato ovest (azimut 45°): `win-living-west`, `win-bathroom`.

## Precondizioni
- `dev-params.local.txt` = `house=apartment-a&role=visitor&reset=1&seed=1&debug=1&pinch=grip&time=2026-12-21T10:00`.

## Passi
1. **Alle 10:00**: preparazione standard; log `pattern: "sun|state|view"`; `ecs_find_entities` con `^sun:` (→ `sun:dial`, `sun:marker`), `^light:` (→ `light:patches` più le ancore `light:win-*`); `ecs_query_entity` su `sun:marker` e `miniature:root` con `["Transform"]`; `browser_screenshot` → allegare (chiazze di sole nel soggiorno e in camera, disco del sole sull'anello, tacca del nord).
2. **Aprire il pannello "View"**: pizzico su `ui:view-button-right`; `ecs_find_entities` `^ui:view-` (→ pannello, chiusura e le righe `zoom`, `turn`, `month`, `hour`, `contrast`, `text`), `^ui:palm-menu$` e `^ui:issue-panel$` (→ 0); `ui_inspect` (intestazione `Sun 14° SE`, valori `100%`, `0°`, `Dec`, `10:00`, `Off`, `Normal`; tutti i `fontSize` ≥ 2,4 cm); log `pattern: "view"`.
3. **Alle 15:00**: premere 5 volte `ui:view-hour-more` (leggere la posizione a ogni pressione se il pannello si rifà); log `pattern: "view step|sun"`; `ecs_find_entities` `^light:`; `browser_screenshot` → allegare (soggiorno **senza** chiazze, studio con la chiazza della finestra est).
4. **Mese e ora legale**: premere 6 volte `ui:view-month-more` (dicembre → giugno, con il giro dicembre → gennaio) e 1 volta `ui:view-hour-less` (14:00): log `pattern: "sun set|sun light"`.
5. **Notte**: portare l'ora a 22:00 (8 pressioni di `ui:view-hour-more` da 14:00): log `pattern: "sun"`; `ecs_find_entities` `^light:`; `browser_screenshot` → allegare (nessuna chiazza, disco assente o spento).
6. **Persistenza e precedenza**: attesa 1,5 s (`state saved … sun=…`); riscrivere il file **senza** `reset=1` e **senza** `time=`, ricaricare: log `pattern: "sun set"`; poi riscrivere **con** `time=2026-12-21T10:00` e ricaricare: log `pattern: "sun set"`.
7. **Scala reale**: entrare in `viewpoint:V1` con la destra (S3.1/S4.6), attesa 2,5 s; `ecs_find_entities` `^light:patches$` e `^ui:view-button-` (visibili? vedi verifica 8); `browser_screenshot` → allegare (dal soggiorno a grandezza reale, le chiazze sul pavimento); tornare con `ui:tabletop-button`.
8. **Default**: riscrivere il file **senza** `time=` e con `reset=1`, ricaricare: log `pattern: "sun set"`.
9. Log senza filtro (`error`, `uncaught`, `Cannot read`, `reading 'add'`, `Missing glyph`); pulizia: select 0 su entrambe, mani a riposo, `xr_end_session`, cancellare `dev-params.local.txt`.

## Verifiche (tutte obbligatorie)
1. **Passo 1**: la riga `[soglia] sun set time=2026-12-21T10:00 source=url utc=2026-12-21T09:00Z az=<a> el=<h>` con `a` = 145° ± 1,5 e `h` = 13,7° ± 1; `sun light windows=…` con **`win-living-1`, `win-living-2`, `win-bedroom`** e `rooms=` che contiene `living:<m²>` con **1,0 ≤ m² ≤ 4,0** (valore dorato in "Esiti" del piano) e `bedroom:<m²>` > 0; **nessun** `light:win-living-west`, `light:win-bathroom`, `light:win-study-east`; 1 `sun:dial`, 1 `sun:marker`, 1 `light:patches`; il disco del sole a ≤ 5° dalla direzione attesa (formula sopra); `miniature:root` invariato rispetto all'avvio.
2. **Passo 2**: pannello aperto (1 `ui:view-panel`, 0 menu, 0 pannello Issues); riga `view panel view maxAngleDeg=<a> distance=<d>` con `a` ≤ 30,0 e `d` tra 0,50 e 0,65; i valori e l'intestazione del `ui_inspect` come elencati; nessun testo in italiano.
3. **Passo 3**: dopo 5 pressioni `view step row=hour value=15:00` (e le intermedie 11:00…14:00), `sun set time=2026-12-21T15:00 source=ui utc=2026-12-21T14:00Z az=216±1,5 el=13±1`; `sun light` **non** contiene `living` né `win-living-*`; contiene `study` con `win-study-east` (e area > 0); `light:win-study-east` presente, nessun `light:win-living-*`.
4. **Passo 4**: dopo il giro `sun set time=2026-06-21T14:00 … utc=2026-06-21T12:00Z az=198±1,5 el=67,6±1` (ora legale: lo scarto UTC è 2 h, non 1 h); i passi intermedi passano per `Jan` … `Jun`, mai oltre dicembre dell'anno.
5. **Passo 5**: `sun below horizon time=2026-06-21T22:00` **oppure**, se a giugno alle 22:00 il sole è ancora alto, usare `2026-12-21T22:00`: la regola è "altezza < 0 ⇒ nessun `light:*`, `windows=-`, disco nascosto"; nessun NaN e nessuna riga `error`.
6. **Passo 6**: senza `time=`: `sun set time=<ultimo valore> source=saved`; con `time=` esplicito: `sun set time=2026-12-21T10:00 source=url` (l'esplicito vince sul salvato).
7. **Passo 7**: in scala reale `light:patches` esiste ed è visibile (le chiazze sul pavimento nello screenshot); il pannello "View" non si apre (i pulsanti "View" non ci sono, come "Menu" e "Issues", e il ritorno è `ui:tabletop-button`).
8. **Passo 8**: riga `sun set time=<ISO> source=default` con minuti `00`; se `az`/`el` dicono altezza < 0 allora l'ora è **10:00** (regola del default). Il valore dipende dall'orologio reale: si controlla il **formato**, non il valore.
9. **Budget**: nessuna riga `budget exceeded` in tutto lo scenario.
10. Nessuna voce `error`; nessun `Missing glyph`; nessun `reading 'add'`; nessuna richiesta di rete (il sole è calcolato in locale).
11. **Solo visore** (media): azimut e altezza plausibili rispetto al sole vero all'ora indicata; chiazze leggibili a 1:20; "simplified light" capito.

## Esito
PASS se le verifiche 1–10 sono soddisfatte · FAIL altrimenti. Un valore di azimut/altezza fuori tolleranza è FAIL solo se il test unitario di T5.1 dà un valore diverso; altrimenti è un errore della tabella a mano e va corretto qui.

## Da rimandare al visore
Voci "Sole", "Quadrante" e "Pulsanti View" di M5 in `qa/device/DEBT.md`.
