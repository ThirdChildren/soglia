# S5.4 · Una mano sola: zoom, rotazione, pezzi, "Rotate", segnalazione, ritorno

> **Changelog 2026-11-06**: scenario creato dal piano M5 (D56, D59; T5.5, T5.6, T5.14; chiude T1.15 nella versione ridotta). Estende S4.6 e S3.7.
> **Changelog 2026-11-06 (esiti di T5.1–T5.7)**: (1) il pannello View ha per ora **4 righe** (`Zoom`, `Turn`, `Month`, `Hour`); (2) `Turn` è la rotazione **assoluta** del plastico e il suo valore iniziale non è sempre 0: i passi 2–3 e le verifiche 2–3 sono **relativi** a `Y0` letto al passo 1 (+30° e ritorno a `Y0`, non "0°"); (3) il pannello View si chiude da solo se si apre il menu o il pannello Issues: va riaperto prima di ogni gruppo di righe; (4) **due fasi per la calibrazione IWER**: la **fase A** (passi 1–3, pannello View) gira con `pinch=auto` e la mano a `T + (0; 0,0245; 0,012)` (le righe `−`/`+` da 3,3 cm non si centrano con la ricetta `T − D_GRIP`; il punto reale è nel log `[soglia:hands] … event=pinch-start point=`); la **fase B** (passi 4–9: pezzi, Rotate, segnalazione, scala reale) gira con `pinch=grip` dopo aver riscritto `dev-params.local.txt` e ricaricato (si perde la sessione XR: `xr_accept_session` di nuovo). Zoom e rotazione non si salvano, quindi il passaggio tra le fasi riparte da scala 0,05.

**Milestone**: M5 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`) · **Regole di `CLAUDE.md`**: 1, 2, 8, 9
Prerequisiti di implementazione: T5.5, T5.6, T5.14 (e M4). Vedi `docs/plans/M5.md`, D56 e D59. Convenzioni: `qa/scenarios/M4-issue-create.md`.

## Precondizioni
- **Fase A** (passi 1–3): `dev-params.local.txt` = `house=apartment-a&role=tenant&reset=1&seed=1&debug=1&pinch=auto&time=2026-12-21T10:00`; mano a `T + (0; 0,0245; 0,012)` per ogni bersaglio `T`.
- **Fase B** (passi 4–9): stesso file con `pinch=grip` (e `reset=1`), `browser_reload_page`, `xr_accept_session`, `xr_set_input_mode {mode: "hand"}`; mano a `T − D_GRIP`.
- **Una mano sola, davvero**: si muove **solo `hand-right`**; la sinistra resta a riposo `(−0,30; 1,10; 0,10)` con select 0 per tutto lo scenario. Pulsanti destri: `ui:menu-button-right` (0,4347; 1,495; −0,5665), `ui:issue-button-right` (…; 1,565; …), `ui:view-button-right` (…; 1,635; …): mano a `posizione − D_GRIP`; i controlli dei pannelli si leggono dai `Transform`.

## Passi
1. **Segnare l'inizio**: log `pattern: "pinch left|menu opened hand=left"` deve restare vuoto per tutto lo scenario (si rilegge alla fine con `since` dall'inizio); `ecs_query_entity` su `miniature:root` (→ `S0`, `Y0`).
2. **Zoom a una mano** (fase A): pizzico su `ui:view-button-right`; pizzico su `ui:view-zoom-more` due volte; log `pattern: "view step|miniature"`; `ecs_query_entity` su `miniature:root` (scala).
3. **Rotazione a una mano** (fase A): pizzico su `ui:view-turn-more` due volte (+30° rispetto a `Y0`); log; `ecs_query_entity` su `miniature:root` (rotazione); `ui:view-zoom-less` tre volte e `ui:view-turn-less` due volte (ritorno a 100 % e a `Y0`); chiudere con `ui:view-close`. **Passaggio alla fase B**: riscrivere il file con `pinch=grip` e ricaricare (vedi Precondizioni).
4. **Un pezzo** (fase B): pizzico su `ui:menu-button-right`; scheda `Items`; prendere `ui:menu-item-chair` con la destra e posarlo in soggiorno a `W(1,5; 3,0)`; log `pattern: "furniture|menu"`.
5. **Rotate**: attesa 1 s; `ecs_find_entities` `^ui:rotate-button$` (→ 1); `ecs_query_entity` sulla sua posizione; pizzico su `ui:rotate-button`; log `pattern: "rotate|furniture"`; ripetere una seconda volta; poi `ui:menu-undo` (se il menu è chiuso, riaprire con `ui:menu-button-right`).
6. **Segnalazione**: pizzico su `ui:issue-button-right`; (ruolo `tenant`) chiudere il pannello; pizzico prolungato sulla lavatrice come in S4.1 passo 2 (select 1 per 1,5 s, poi 0), `ui:issue-phrase-leaks`, `ui:issue-report`: log `pattern: "issue|pins"`.
7. **Scala reale e ritorno**: pizzico prolungato (0,8 s) su `viewpoint:V1`; attesa 2,5 s; pizzico su `ui:tabletop-button`: log `pattern: "viewpoint|tabletop"`.
8. **Il ruolo**: pizzico su `ui:issue-button-right`, `ui:issue-role-landlord` e chiudere; log `pattern: "role"`.
9. **Controllo finale**: log `pattern: "pinch left|menu opened hand=left|error"` e senza filtro (`error`, `uncaught`, `Cannot read`, `reading 'add'`, `Missing glyph`); pulizia.

## Verifiche (tutte obbligatorie)
1. **Passo 1–9, la mano sinistra**: **nessuna** riga `pinch left`, nessuna `menu opened hand=left`; `ecs_query_entity` della posa di `hand-left` non cambia mai.
2. **Passo 2**: `view step row=zoom value=130% scale=0.065` (ancora `160%` / 0.08 alla seconda); la scala di `miniature:root` = 0,08 ± 0,001 e l'offset invariato (`recenter` non serve).
3. **Passo 3**: `view step row=turn value=<Y0+15>` e `<Y0+30>` (`Turn` è la rotazione assoluta del plastico, valore iniziale `Y0` letto al passo 1, non sempre 0); la rotazione di `miniature:root` = `Y0` + 30° ± 0,5 attorno a Y; dopo il ritorno scala 0,05 e rotazione `Y0` (± 0,001; i pezzi e il resto della scena invariati).
4. **Passo 4**: `menu opened … mode=pinned` e `furniture placed furniture:chair#1 room=living … status=valid`.
5. **Passo 5**: `rotate button shown id=furniture:chair#1`; 1 `ui:rotate-button` a ≥ 0,50 m dalla testa; dopo le due pressioni `furniture rotated furniture:chair#1 rot=90 source=button` poi `rot=180 source=button`; lo store ha `rotationDeg` 180 e la cronologia due voci in più; il pulsante **non esiste** mentre un pezzo è in mano (`rotate button hidden reason=grab`); dopo `ui:menu-undo` il pezzo torna a 90°.
6. **Passo 6**: `issue created id=issue-014 … text="The washing machine leaks."`, `pin:issue-014` rosso; il pulsante "Rotate" non si apre per sbaglio in quel momento.
7. **Passo 7**: `viewpoint entered id=V1 …` e, dopo `ui:tabletop-button`, `viewpoint exited id=V1 …`; `miniature:root` torna alla scala e alla rotazione di prima (± 0,001).
8. **Passo 8**: `role changed from=tenant to=landlord source=ui`.
9. Nessuna voce `error`; nessun `Missing glyph`; nessun `reading 'add'`; tutto fatto da seduti, a ≤ 0,72 m dalla testa, senza locomozione.
10. **Solo visore** (alta): sei pulsanti fissi raggiungibili e distinguibili con una mano; "Rotate" non si preme per sbaglio; i passi di zoom e rotazione sono comodi rispetto ai due gesti a due mani.

## Esito
PASS se le verifiche 1–9 sono soddisfatte · FAIL altrimenti.

## Da rimandare al visore
Voci "Pulsanti View", "Rotate", "Zoom e rotazione a pulsanti" di M5.
