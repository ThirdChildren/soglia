# S5.6 · Alto contrasto e testo grande

> **Changelog 2026-11-06**: scenario creato dal piano M5 (D58; T5.11–T5.13, T5.16 opzionale).

**Milestone**: M5 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`) · **Regole di `CLAUDE.md`**: 8 (campo visivo), 9 (accessibilità)
Prerequisiti di implementazione: T5.11–T5.13. Il menu v2 a testo grande richiede T5.16: senza, vale la verifica 7 "B". Convenzioni: `qa/scenarios/M4-issue-create.md`.

## Convenzioni
- Colori attesi con **alto contrasto**: sfondo `#000000`, testo `#ffffff`, bordo `#ffd400`; senza: sfondo `#ffffff`, testo `#1a1a1a`. Si leggono con `ui_inspect`.
- Testo: normale ≥ 2,4 cm; **grande** ≥ 3,0 cm.

## Precondizioni
- `dev-params.local.txt` = `house=apartment-a&role=tenant&reset=1&seed=1&debug=1&pinch=grip&time=2026-12-21T10:00` (stato di partenza, senza `contrast` né `text`).

## Passi
1. **Riferimento normale**: preparazione standard; pizzico su `ui:menu-button-right`; `ui_inspect` del menu (colori, `fontSize`); `browser_screenshot` → allegare; chiudere (`ui:menu-button-right`). Aprire il pannello View (`ui:view-button-right`), `ui_inspect`.
2. **Alto contrasto dal pannello**: pizzico su `ui:view-contrast`; log `pattern: "access"`; `ui_inspect` del pannello View; chiudere e aprire il menu `pinned` e il pannello Issues: `ui_inspect` dei due; `ui_inspect` dei pulsanti `ui:menu-button-right`, `ui:issue-button-right`, `ui:view-button-right`; `browser_screenshot` del plastico → allegare (muri bianchi, pavimenti scuri, soglie chiare, segnaposto più grandi).
3. **Testo grande dal pannello**: `ui:view-text`; log `pattern: "access|view panel"`; `ui_inspect` del pannello View (stesso pannello, ricostruito); riaprire Issues e il menu `pinned`; `ui_inspect`; selezionare una stanza con un pizzico breve: etichetta (`ui_inspect`); `browser_screenshot` → allegare.
4. **Persistenza e parametri**: attesa 1,5 s; riscrivere il file **senza** `reset=1` e **senza** `contrast`/`text`, ricaricare: log `pattern: "access|state restored"`; poi riscrivere con `contrast=0&text=normal` (espliciti): log `pattern: "access"`.
5. **Tutta l'interfaccia**: con contrasto e testo grande attivi: ruolo `tenant`, pizzico prolungato sulla lavatrice (S4.1 passo 2), `ui_inspect` del pannello di nuova segnalazione; `ui:issue-cancel`; scala reale e ritorno (`ui:tabletop-button`, `ui_inspect`).
6. **Una sola mano**: tutti i pannelli e i pulsanti sopra sono stati aperti con la sola destra; la sinistra a riposo.
7. Log senza filtro (`error`, `uncaught`, `Cannot read`, `reading 'add'`, `Missing glyph`); pulizia.

## Verifiche (tutte obbligatorie)
1. **Passo 1**: riferimento: pannelli bianchi con testo `#1a1a1a`; `fontSize` ≥ 2,4 cm.
2. **Passo 2**: `access contrast=on source=ui`, `access applied recolored=<n>` con n ≥ 1; tutti i pannelli e i pulsanti aperti dopo hanno sfondo `#000000`, testo `#ffffff`, bordo `#ffd400`; i **pulsanti fissi già presenti** sono ricolorati (o ricreati, vedi D58) senza errori; il plastico: colore dei muri `#ffffff` (0xffffff) e pavimenti più scuri di prima (confronto degli screenshot e, se disponibile, `Material` letto via `ecs_query_entity`); i segnaposto ≥ 30 % più grandi. **Il test unitario** `theme-contrast.test.ts` garantisce rapporto ≥ 7:1 per ogni coppia; il gate lo cita (`npm test`).
3. **Passo 3**: `access text=large source=ui menu=<large|normal>`; nei pannelli View e Issues, nei pulsanti fissi, nel pulsante Tabletop e nell'etichetta della stanza tutti i `fontSize` ≥ **3,0 cm**; `view panel view maxAngleDeg` ≤ 30,0 e distanza 0,50–0,65 m (riga del pannello, ricalcolata a testo grande); il menu: vedi 7.
4. **Passo 4**: alla ricarica senza parametri `access contrast=on source=saved` e `access text=large source=saved`; con `contrast=0&text=normal` espliciti `source=url` e tutto torna normale (l'esplicito vince sul salvato).
5. **Passo 5**: il pannello di nuova segnalazione e il pulsante Tabletop rispettano alto contrasto e testo grande; nessun testo tagliato fuori dal pannello (`ui_inspect`: nessun figlio oltre il bordo).
6. **Passo 6**: nessuna riga `pinch left`, nessuna `menu opened hand=left`.
7. **Menu v2**: **A (T5.16 fatto)**: `menu text=large` con griglia 2 × 2 (4 schede per pagina), `fontSize` ≥ 3,0 cm, 4 pagine per i 14 pezzi, cono ≤ 30° (`menu view maxAngleDeg`); **B (T5.16 tagliato)**: la riga `access text=large menu=normal` e il menu resta a ≥ 2,4 cm: **non è un FAIL**, ma la voce va in `DEBT.md` e nel Devpost (`submission-writer`).
8. Nessuna voce `error`; nessun `Missing glyph`; nessun `reading 'add'`.
9. **Solo visore** (alta): leggibilità reale nel campo visivo stretto; il bianco puro dei muri non abbaglia; il testo da 3,0 cm basta.

## Esito
PASS se le verifiche 1–6, 8 e 7 (A o B) sono soddisfatte · FAIL altrimenti.

## Da rimandare al visore
Voci "Alto contrasto" e "Testo grande" di M5 in `qa/device/DEBT.md`.
