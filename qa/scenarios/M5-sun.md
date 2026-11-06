# S5.1 · Il sole: posizione, chiazze di luce e controllo mese/ora

> **Changelog 2026-11-06**: scenario creato dal piano M5 (D54, D55, D56; T5.1–T5.6). I valori di riferimento del sole erano calcolati **a mano** (piano M5, D54).
> **Changelog 2026-11-06 (esiti di T5.8–T5.10 e correzioni di `logic-tester`)**: `time=` è più severo: `sunTimeFromParam` rifiuta codice dopo i minuti, `params.ts` rifiuta un anno fuori 1900–2100 con `param time="…" ignored: year must be between 1900 and 2100` e non lo marca esplicito; l'orologio NaN o fuori 1900–2100 dà il fallback `2026-12-21T10:00`; i passi con NaN/Infinity non avanzano. Nuovo passo 8a e verifica 7a. Calibrazione IWER con `pinch=grip`: mano a `T + (0,029; −0,0015; −0,045)`.
> **Changelog 2026-11-06 (esiti di T5.1–T5.7)**: (1) tabella del sole sostituita dai **golden** del test unitario (confrontati con un'implementazione indipendente delle formule USNO, non col sito NOAA); (2) **alle 15:00 del 21 dic in A non c'è nessuna chiazza** (sole basso, davanzale a 0,9 m: la macchia cade nella stanza accanto e viene ritagliata): lo studio **non** è illuminato (la prima stesura diceva il contrario) e il passo 3 verifica `windows=-`; (3) aree dorate: soggiorno 21 dic 10:00 = **2,3029 m²**, studio 21 giu 18:00 = **1,1616 m²**, camera di B 21 dic 12:00 = **2,4284 m²**; d'estate col sole alto il soggiorno è a **0 m²** (l'imbotte toglie anche l'altezza utile); (4) il pannello View ha per ora **4 righe** (`Zoom`, `Turn`, `Month`, `Hour`; `Contrast` e `Text` arrivano con T5.11) e `Turn` è la rotazione assoluta del plastico, con valore iniziale non sempre 0; (5) a scala reale il quadrante è nascosto, le chiazze restano; (6) il pannello View si chiude da solo se si apre il menu o il pannello Issues; (7) calibrazione IWER per le righe del pannello (vedi Convenzioni).

**Milestone**: M5 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`) · **Regole di `CLAUDE.md`**: 1, 2, 5 (nessuna API di rete o sensori), 7, 8, 9, 10
Prerequisiti di implementazione: T5.1–T5.6. Vedi `docs/plans/M5.md`. Convenzioni comuni (pose, `D_GRIP`, `W(...)`, preparazione standard, lettura del buffer con `since`): `qa/scenarios/M4-issue-create.md`.

## Convenzioni
- **Mani**: pulsanti e controlli si leggono con `ecs_query_entity` `["Transform"]`. I pulsanti fissi sono tre piani per lato, centrati a (±0,4347; 1,495 `Menu` / 1,565 `Issues` / 1,635 `View`; −0,5665); `View` e `Issues` a 0,715 m e 37,6° dalla testa. **Calibrazione IWER (T5.7)**: per pizzicare nel punto `T` con la sorgente `joints` (`pinch=auto`) la mano si imposta a `T + (0; 0,0245; 0,012)`; il log `[soglia:hands] … event=pinch-start point=` dà il punto reale. Serve per le **righe `−`/`+` del pannello View** (3,3 cm); per i pulsanti 8 × 6 cm basta anche `pinch=grip` con `T − D_GRIP` (M4). **Questo scenario gira con `pinch=auto` e la calibrazione**; `xr_select {duration: 0.3}`. Modificare file `.uikitml` o sorgenti durante la sessione ricarica la pagina e fa perdere la sessione XR.
- **Tabella di riferimento** (golden del test di T5.1; Torino 45,07° N 7,69° E; ora **locale** della casa; tolleranza azimut ±1,5°, altezza ±1°):

| `sunTime` | UTC | azimut (da nord, orario) | altezza |
|---|---|---|---|
| 2026-12-21T10:00 | 09:00Z | 145,5° | 13,7° |
| 2026-12-21T15:00 | 14:00Z | 215,6° | 13,2° |
| 2026-06-21T14:00 | 12:00Z (ora legale, UTC+2) | 197,6° | 67,6° |
| 2026-06-21T15:00 | 13:00Z | 227,3° | 61,8° |
| 2026-12-21T22:00 | 21:00Z | – | < 0 (notte) |

- **Aree dorate delle chiazze** (m², ± 0,05): A soggiorno 21 dic 10:00 = **2,3029**; A studio 21 giu 18:00 = **1,1616**; B camera 21 dic 12:00 = **2,4284**. A, 21 dic 15:00: **nessuna** chiazza. A, 21 giu 14:00: soggiorno **0**. Le chiazze sotto 1 dm² non si disegnano.

- **Dove cade il disco del sole** (casa A, `northAngleDeg` = 225, su = −z ha azimut 135°): per un azimut β il versore in pianta è `x = sin(β − 135°)`, `z = −cos(β − 135°)`; il disco sta a `centro + raggio × (x, z)` in coordinate di casa. Controllo: l'angolo tra `(marker − centro)` proiettato in pianta e il versore atteso è ≤ 5°.
- Finestre di A sul lato nord della pianta (`z = 0`, normale uscente azimut 135°): `win-living-1`, `win-living-2`, `win-bedroom`, `win-study`; lato est (`w-east`, azimut 225°): `win-study-east`; lato ovest (azimut 45°): `win-living-west`, `win-bathroom`.

## Precondizioni
- `dev-params.local.txt` = `house=apartment-a&role=visitor&reset=1&seed=1&debug=1&pinch=auto&time=2026-12-21T10:00`.

## Passi
1. **Alle 10:00**: preparazione standard; log `pattern: "sun|state|view"`; `ecs_find_entities` con `^sun:` (→ `sun:dial`, `sun:marker`), `^light:` (→ `light:patches` più le ancore `light:win-*`); `ecs_query_entity` su `sun:marker` e `miniature:root` con `["Transform"]`; `browser_screenshot` → allegare (chiazze di sole nel soggiorno, disco del sole sull'anello, tacca del nord).
2. **Aprire il pannello "View"**: pizzico su `ui:view-button-right`; `ecs_find_entities` `^ui:view-` (→ pannello, chiusura e le **quattro** righe `zoom`, `turn`, `month`, `hour`; `contrast` e `text` solo dopo T5.11), `^ui:palm-menu$` e `^ui:issue-panel$` (→ 0); `ui_inspect` (intestazione `Sun 14° SE`, valori `100%`, il valore di `Turn` **letto** (non sempre `0°`: è la rotazione assoluta del plastico), `Dec`, `10:00`; tutti i `fontSize` ≥ 2,4 cm); log `pattern: "view"`. Poi, per la regola "uno alla volta": pizzico su `ui:menu-button-right` → il pannello View si chiude da solo (`view panel closed via=menu` o `via=panel`: riportare la riga) e il menu `pinned` si apre; richiudere il menu e riaprire il pannello View.
3. **Alle 15:00**: premere 5 volte `ui:view-hour-more` (leggere la posizione a ogni pressione se il pannello si rifà); log `pattern: "view step|sun"`; `ecs_find_entities` `^light:`; `browser_screenshot` → allegare (**nessuna** chiazza in tutta la casa: soggiorno in ombra, sole basso a 13°).
4. **Mese e ora legale**: premere 6 volte `ui:view-month-more` (dicembre → giugno, con il giro dicembre → gennaio) e 1 volta `ui:view-hour-less` (14:00): log `pattern: "sun set|sun light"`. Poi 4 volte `ui:view-hour-more` (18:00): log `pattern: "sun light"`.
5. **Notte**: da 18:00 di giugno portare l'ora a 00:00 (6 pressioni di `ui:view-hour-more`, con il giro 23 → 0): log `pattern: "sun"`; `ecs_find_entities` `^light:`; `browser_screenshot` → allegare (nessuna chiazza, disco assente o spento).
6. **Persistenza e precedenza**: attesa 1,5 s (`state saved … sun=…`); riscrivere il file **senza** `reset=1` e **senza** `time=`, ricaricare: log `pattern: "sun set"`; poi riscrivere **con** `time=2026-12-21T10:00` e ricaricare: log `pattern: "sun set"`.
7. **Scala reale**: entrare in `viewpoint:V1` con la destra (S3.1/S4.6), attesa 2,5 s; `ecs_find_entities` `^light:patches$` e `^ui:view-button-` (visibili? vedi verifica 8); `browser_screenshot` → allegare (dal soggiorno a grandezza reale, le chiazze sul pavimento); tornare con `ui:tabletop-button`.
8. **Default**: riscrivere il file **senza** `time=` e con `reset=1`, ricaricare: log `pattern: "sun set"`.
8a. **`time=` non valido**: riscrivere il file tre volte con `time=2026-12-21T10:00x` (codice dopo i minuti), `time=2200-01-01T10:00` (anno fuori 1900–2100) e `time=2026-13-01T10:00` (mese inesistente); per ognuna ricaricare e leggere `pattern: "param time|sun set"`.
8b. **Casa B**: riscrivere il file con `house=apartment-b&role=visitor&reset=1&seed=1&debug=1&pinch=auto&time=2026-12-21T12:00`, ricaricare: log `pattern: "sun set|sun light"`; `ecs_find_entities` `^light:`.
9. Log senza filtro (`error`, `uncaught`, `Cannot read`, `reading 'add'`, `Missing glyph`); pulizia: select 0 su entrambe, mani a riposo, `xr_end_session`, cancellare `dev-params.local.txt`.

## Verifiche (tutte obbligatorie)
1. **Passo 1**: la riga `[soglia] sun set time=2026-12-21T10:00 source=url utc=2026-12-21T09:00Z az=<a> el=<h>` con `a` = 145,5° ± 1,5 e `h` = 13,7° ± 1; `sun light windows=…` con almeno **`win-living-1`** e **`win-living-2`** e `rooms=` che contiene `living:2.3` (il log scrive le aree con **un solo decimale**: letto 2,2–2,4; il golden esatto **2,3029 m²** è nel test di T5.3 e si legge anche, se serve, dall'area del poligono delle chiazze); le altre finestre illuminate (per esempio `win-bedroom`) si riportano nel report con la loro area (non golden); **nessun** `light:win-living-west`, `light:win-bathroom`, `light:win-study-east`; 1 `sun:dial`, 1 `sun:marker`, 1 `light:patches`; il disco del sole a ≤ 5° dalla direzione attesa (formula sopra); `miniature:root` invariato rispetto all'avvio.
2. **Passo 2**: pannello aperto (1 `ui:view-panel`, 0 menu, 0 pannello Issues); riga `view panel view maxAngleDeg=<a> distance=<d>` con `a` ≤ 30,0 e `d` tra 0,50 e 0,65; i valori e l'intestazione del `ui_inspect` come elencati; nessun testo in italiano.
3. **Passo 3**: dopo 5 pressioni `view step row=hour value=15:00` (e le intermedie 11:00…14:00), `sun set time=2026-12-21T15:00 source=ui utc=2026-12-21T14:00Z az=215,6±1,5 el=13,2±1`; `sun light windows=- rooms=-`: **nessuna** chiazza in A (il soggiorno è in ombra: la macchia cade nella stanza accanto e viene ritagliata); **0** entità `light:win-*`; `light:patches` senza geometria visibile.
4. **Passo 4**: dopo il giro `sun set time=2026-06-21T14:00 … utc=2026-06-21T12:00Z az=197,6±1,5 el=67,6±1` (ora legale: lo scarto UTC è 2 h, non 1 h); i passi intermedi passano per `Jan` … `Jun`, mai oltre dicembre dell'anno; a questa ora il soggiorno ha **0** m² (sole alto d'estate: `rooms=` senza `living`); a 18:00 `sun light` ha `study:1.2` (golden 1,1616 m², un decimale nel log: letto 1,1–1,3).
5. **Passo 5**: a 00:00 (giugno) `sun below horizon time=2026-06-21T00:00`: la regola è "altezza < 0 ⇒ nessun `light:*`, `windows=-`, disco nascosto"; nessun NaN e nessuna riga `error`.
6. **Passo 6**: senza `time=`: `sun set time=<ultimo valore> source=saved`; con `time=` esplicito: `sun set time=2026-12-21T10:00 source=url` (l'esplicito vince sul salvato).
7. **Passo 7** (con `time` tale da avere chiazze: usare per questo passo `time=2026-12-21T10:00` dopo il passo 6): in scala reale `light:patches` esiste ed è visibile (le chiazze sul pavimento nello screenshot) e `[soglia:stats:groups]` dà `sun=1`; il **quadrante** `sun:dial` è nascosto (`Visibility.isVisible` falso); il pannello "View" non si apre (i pulsanti "View" non ci sono, come "Menu" e "Issues", e il ritorno è `ui:tabletop-button`).
7a. **Passo 8a (`time=` non valido)**: in tutti e tre i casi la riga `param time="…" ignored` (warn; per l'anno `ignored: year must be between 1900 and 2100`), `time` **non** è esplicito e la riga `sun set … source=default` (o `saved`) ha minuti `00`; nessuna riga `error`, nessun NaN nel log; l'ora non diventa mai quella scritta nel valore non valido.
7b. **Passo 8b (casa B)**: `sun light` ha la camera con **2,4284 m²** (nel log `<id>:2.4`, letto 2,3–2,5; id della stanza da leggere dal log; nome `Bedroom`); riportare le altre stanze illuminate.
8. **Passo 8**: riga `sun set time=<ISO> source=default` con minuti `00`; se `az`/`el` dicono altezza < 0 allora l'ora è **10:00** (regola del default). Il valore dipende dall'orologio reale: si controlla il **formato**, non il valore.
9. **Budget**: nessuna riga `budget exceeded` in tutto lo scenario.
10. Nessuna voce `error`; nessun `Missing glyph`; nessun `reading 'add'`; nessuna richiesta di rete (il sole è calcolato in locale).
11. **Solo visore** (media): azimut e altezza plausibili rispetto al sole vero all'ora indicata; chiazze leggibili a 1:20; "simplified light" capito.

## Esito
PASS se le verifiche 1–10 (e 7a, 7b) sono soddisfatte · FAIL altrimenti. I valori di azimut, altezza e area sono i golden dei test unitari di T5.1 e T5.3 (confronto con un'implementazione indipendente delle formule USNO, non con il calcolatore NOAA: nessuna rete); un valore fuori tolleranza è un FAIL.

## Da rimandare al visore
Voci "Sole", "Quadrante" e "Pulsanti View" di M5 in `qa/device/DEBT.md`.
