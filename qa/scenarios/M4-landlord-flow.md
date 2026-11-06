# S4.3 · Dal proprietario all'inquilino: elenco per urgenza, "Take on", "Resolved", "Confirm", storico

> **Changelog 2026-11-06** (decisione dell'utente sul riporto 6 del gate di M4; piano M5, T5.R5): passo 4 e verifica 3: il dettaglio si apre con **un solo** pizzico sulla riga (la lettera dello scenario era già questa; al gate di M4 servivano due pressioni, selezione e poi apertura: scopribilità, riporto 5). Ora è esplicito: dopo il **primo** pizzico compare `issues screen=detail id=…`, senza righe intermedie di sola selezione. Vale dopo T5.R5.
> **Changelog 2026-11-02**: scenario creato dal piano M4 (D41, D43, D47, D48). L'ordine dell'elenco è quello di D48 (attive per urgenza, poi `resolved`, poi `archived` sotto "History").

**Milestone**: M4 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`) · **Regole di `CLAUDE.md`**: 1, 7 ("Sample data"), 9 (una mano), 10
Prerequisiti di implementazione: T4.1–T4.9 (anche T4.R3, T4.6b). Vedi `docs/plans/M4.md`, D43 (permessi), D48. Convenzioni (pose, pulsanti, pizzico prolungato, orologio): `qa/scenarios/M4-issue-create.md`.

**Una mano sola**: in tutto lo scenario si muove **solo `hand-right`** (la sinistra resta a riposo `(−0,30; 1,10; 0,10)`, select 0); nessuna riga `pinch left`, nessuna `menu opened hand=left`.

## Precondizioni
- `dev-params.local.txt` = `house=apartment-a&role=tenant&reset=1&seed=1&debug=1&pinch=grip&time=2026-11-04T10:00`; preparazione standard (testa (0; 1,6; 0), `O` = (0; 1,35; −0,45)).
- Il seme porta `issue-010` (low, resolved, studio), `issue-012` (low, open, soggiorno), `issue-013` (medium, in_progress, camera) e `baseline-001`. Tutti `sample`.
- Lettura dei controlli: `ecs_query_entity` `["Transform"]` a ogni schermata; pizzico = `xr_select {duration: 0.3}` a `posizione − D_GRIP`.

## Passi
1. **Creare `issue-014`** (lavatrice, `Leaks`, Medium) come S4.1 passi 2–4: log `issue created id=issue-014 … text="The washing machine leaks."`.
2. **Aprire e chiudere il pannello in fretta**: pizzico su `ui:issue-button-right` (mano a (0,4727; 1,568; −0,6035)), attesa 0,2 s, pizzico sullo stesso pulsante (chiude), ripetere 3 volte senza pausa, poi lasciarlo aperto. Log `pattern: "issues panel|reading|error"`; `ecs_find_entities` `^ui:issue-panel$` (→ 1). `ui_inspect` sul pannello: schermata `home` (chip `Visitor`, `Tenant`, `Landlord`, i pulsanti `Issues (4)` e `Move-in report`, il testo `Hold a pinch on an appliance or a spot to report an issue.`, il piè `Demo roles, no accounts`).
3. **Diventare proprietario**: pizzico su `ui:issue-role-landlord`: log `role changed from=tenant to=landlord source=ui`; `ui_inspect` (il testo del suggerimento dell'inquilino non c'è più). Pizzico su `ui:issue-open-list`: log `issues screen=list page=1/1 items=…`; `ui_inspect` (righe, intestazione `Sample data`, testi ≥ 2,4 cm); `browser_screenshot` → allegare.
4. **Dettaglio e "Take on"**: **un solo** pizzico su `ui:issue-row-0` (→ `issue-014`): log `issues screen=detail id=issue-014` subito dopo quel pizzico (nessuna pressione di sola selezione prima); `ui_inspect` (stato `Open`, urgenza `Medium`, categoria `Appliances`, stanza `Bathroom`, il testo, una riga di storico `4 Nov · tenant · Created`, **nessun** `Sample data`); `ecs_find_entities` `^ui:issue-action-` (→ solo `ui:issue-action-take-on`). Pizzico su `ui:issue-action-take-on`: log `issue transition …`, `pin color id=issue-014 color=orange`, `issue history …`; `ecs_find_entities` `^ui:issue-action-` (→ solo `ui:issue-action-resolved`).
5. **"Resolved"**: pizzico su `ui:issue-action-resolved`: log `issue transition id=issue-014 from=in_progress to=resolved …`, `pin color … color=green`; `ecs_find_entities` `^ui:issue-action-` (→ 0 per il proprietario); `browser_screenshot` (pin verde in bagno) → allegare.
6. **Divieti del proprietario**: `ui:issue-back`, riga di `issue-010` (resolved, seme): `ecs_find_entities` `^ui:issue-action-` (→ 0: solo l'inquilino conferma o riapre); detto da `ui_inspect` il dettaglio mostra `Sample data`.
7. **Tornare inquilino**: `ui:issue-role-tenant` (il pannello torna a `home`), `ui:issue-open-list`: log `items=` nell'ordine atteso. Riga di `issue-012` (open, seme): `^ui:issue-action-` (→ 0: un'inquilina non prende in carico né risolve). `ui:issue-back`.
8. **"Confirm"**: riga di `issue-014` (resolved): `^ui:issue-action-` (→ `ui:issue-action-confirm` e `ui:issue-action-reopen`, **nessuno** tra `take-on`/`resolved`); pizzico su `ui:issue-action-confirm`: log `issue transition id=issue-014 from=resolved to=archived by=tenant event=archived`; `ecs_find_entities` `^pin:` (→ `pin:issue-010`, `-012`, `-013`; **non** `pin:issue-014`); il pannello torna all'elenco: log `items=` con `issue-014` in coda sotto `History`; riga di `issue-014`: `ui_inspect` (stato `Archived`, tre righe di storico `Resolved`, `In progress`… le ultime 3 delle 4 voci; la riga `+1 more` o equivalente se il testo è troncato).
9. **"Reopen"**: riga di `issue-010` (resolved, seme): pizzico su `ui:issue-action-reopen`: log `issue transition id=issue-010 from=resolved to=in_progress by=tenant event=reopened`, `pin color id=issue-010 color=orange`; storico `reopened`.
10. **Uno alla volta con il menu**: con il pannello aperto, pizzico su `ui:menu-button-right`: `issues panel closed via=menu`, `menu opened hand=right mode=pinned`; poi di nuovo `ui:issue-button-right`: `menu closed …` e pannello aperto; `ecs_find_entities` `^ui:palm-menu$` (→ 1 in ogni lettura, mai 2 pannelli insieme).
11. Log senza filtro (`error`, `reading 'add'`, `Cannot read`, `Missing glyph`); screenshot della lista finale → allegare; pulizia.

## Verifiche (tutte obbligatorie)
1. **Passi 1–2**: `issue created id=issue-014`; il pannello si apre e si chiude 3 volte senza `error` né `reading 'add'`; le schermate `home` mostrano i controlli e i testi esatti; `ui:issue-open-list` ha la scritta `Issues (4)` (tre del seme + `issue-014`; il verbale non conta).
2. **Passo 3**: `role changed from=tenant to=landlord source=ui`; riga `issues screen=list page=1/1 items=issue-014,issue-013,issue-012,issue-010` (**ordine esatto**: attive per urgenza `014 medium open`, `013 medium in_progress`, `012 low open`, poi `010 resolved`); l'intestazione contiene `Sample data`; tutte le righe ≥ 2,4 cm e il pannello nel cono (riga `menu view` o `issues panel view maxAngleDeg` ≤ 30,0, distanza 0,50–0,65 m).
3. **Passo 4**: `issues screen=detail id=issue-014` dopo il primo (e unico) pizzico sulla riga; stato `Open`, urgenza `Medium`, categoria `Appliances`, stanza `Bathroom` (nomi inglesi dei dati); **un solo** controllo d'azione (`take-on`); dopo il pizzico `issue transition id=issue-014 from=open to=in_progress by=landlord event=in_progress`, `pin color id=issue-014 color=orange`, `issue history id=issue-014 events=created@2026-11-04T10:00:00.000Z/tenant,in_progress@2026-11-04T10:01:00.000Z/landlord`; il solo controllo ora è `resolved`.
4. **Passo 5**: `issue transition … from=in_progress to=resolved by=landlord event=resolved`, `pin color … color=green`, `…resolved@2026-11-04T10:02:00.000Z/landlord`; **0** controlli d'azione per il proprietario su una segnalazione `resolved`.
5. **Passo 6**: il proprietario non ha azioni su `issue-010` (0 controlli); il dettaglio di una voce del seme mostra `Sample data`, quello di `issue-014` no.
6. **Passo 7**: elenco da inquilino `items=issue-013,issue-012,issue-014,issue-010` (attive per urgenza `013`, `012`; poi `resolved` per urgenza `014` medium, `010` low); l'inquilino non ha azioni su una segnalazione `open`.
7. **Passo 8**: `^ui:issue-action-` = `confirm` e `reopen`; dopo `confirm`: `issue transition id=issue-014 from=resolved to=archived by=tenant event=archived`; **3** `pin:*` (010, 012, 013), `pin:issue-014` assente; elenco `items=issue-013,issue-012,issue-010,issue-014` con `History` sopra `issue-014`; storico di **4** voci (`created`, `in_progress`, `resolved`, `archived` con `at` 10:00, 10:01, 10:02, 10:03).
8. **Passo 9**: `reopened` con `by=tenant`, `pin color id=issue-010 color=orange`, `…reopened@2026-11-04T10:04:00.000Z/tenant`.
9. **Passo 10**: mai due `ui:palm-menu`/`ui:issue-panel` insieme; righe `issues panel closed via=menu`, `menu closed`.
10. **Una mano**: nessuna riga `pinch left` né `menu opened hand=left` in tutto lo scenario.
11. Nessuna voce `error`; nessun `Missing glyph`; nessun `reading 'add'`.
12. Le transizioni vietate (per esempio `open → resolved`, o `confirm` del proprietario) sono coperte dai test unitari `tests/unit/issue-state.test.ts` e `permissions.test.ts` (4 ruoli × 4 azioni × 4 stati): il report li cita; nell'interfaccia il controllo non esiste, quindi non si può premere.
13. **Solo visore** (alta): leggibilità e selezione delle righe e dei pulsanti a 0,55 m; i due pulsanti "Issues"/"Menu" non si scambiano con le dita vere.

## Esito
PASS se le verifiche 1–12 sono soddisfatte · FAIL altrimenti (l'ordine dell'elenco, un controllo d'azione che non dovrebbe esistere o un `error` sono FAIL).

## Da rimandare al visore
Voci "Pulsanti Issues" e "Pannello Issues" di M4 in `qa/device/DEBT.md`.
