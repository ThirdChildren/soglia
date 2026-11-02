# S4.6 · Scala reale con una mano sola: il pulsante "Tabletop"

> **Changelog 2026-11-02**: scenario creato dal piano M4 (D49 R1, T4.R1; riporto 1 del gate di M3, avviso del `contest-reviewer` sulla regola 9).
> **Changelog 2026-11-02 (dopo T4.R1, prima di ogni esecuzione)**: l'entità `ui:tabletop-button` esiste sempre e si nasconde fuori dalla scala reale (come `ui:menu-button-*`): al plastico si verifica "1 entità non visibile" (`Visibility.isVisible` falso), non "0 entità"; angolo massimo atteso 24,7° (pulsante 0,13 × 0,05 m). Nessun criterio cambia nel significato.

**Milestone**: M4 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`) · **Regole di `CLAUDE.md`**: 2 (ci si sposta solo tra punti di vista con dissolvenza), 8 (campo visivo), 9 (una mano sola)
Prerequisiti di implementazione: T4.R1 (T3.12 già c'è). Vedi `docs/plans/M4.md`, D49. Convenzioni: `qa/scenarios/M4-issue-create.md`.

## Precondizioni
- `dev-params.local.txt` = `house=apartment-a&role=visitor&reset=1&seed=1&debug=1&pinch=grip`; preparazione standard (testa (0; 1,6; 0), `O` = (0; 1,35; −0,45), scala 0,05).
- **Una mano sola**: in tutti i passi tranne il 5 si muove **solo `hand-right`**; la sinistra resta a riposo `(−0,30; 1,10; 0,10)`, select 0.
- Marcatore `viewpoint:V1` a (−0,130; 1,4375; −0,465) → mano destra a (−0,092; 1,4405; −0,502). Pulsante "Tabletop" atteso a (0; 1,38; −0,55) → mano a (0,038; 1,383; −0,587). In scala reale (V1) il plastico sta in (2,60; 0,40; 0,30) con scala 1 (S3.1).

## Passi
1. **Entrare** in `viewpoint:V1` con la sola destra: `ecs_query_entity` su `viewpoint:V1` e `miniature:root` con `["Transform"]` (→ `M1`, `R0`); `hand-right` a `M1 − D_GRIP`; `xr_set_select_value` a 1, attesa **0,8 s**, a 0 (il pizzico tenuto basta sia con la conferma di T4.R6 sia senza); attesa 2,5 s. Log `pattern: "viewpoint|tabletop|menu button|walls"`; `xr_get_transform` `headset` (→ `H1`).
2. **Il pulsante c'è, i pulsanti di prima no**: `ecs_find_entities` `^ui:tabletop-button$` (→ 1), `^ui:menu-button-` e `^ui:issue-button-` (assenti oppure non visibili: se l'entità c'è, `ecs_query_entity` non deve darle una posizione utile o la riga `menu button view` non compare nella sessione corrente), `^ui:palm-menu$` (→ 0); `ecs_query_entity` su `ui:tabletop-button` con `["Transform"]`; `ui_inspect` (testo `Tabletop`, `fontSize`); `browser_screenshot` → allegare (la vista dal punto di vista con il pulsante nella parte bassa, a ~22° sotto lo sguardo).
3. **Tornare con la sola destra**: `hand-right` a (0,038; 1,383; −0,587) (o alla posa letta dal `Transform` meno `D_GRIP`), `xr_select {device: "hand-right", duration: 0.3}`, attesa 2,5 s. Letture: log `pattern: "tabletop|viewpoint|walls|miniature|pinch left"`; `miniature:root` (→ `R2`); `xr_get_transform` `headset`; `ecs_find_entities` `^ui:tabletop-button$` (→ 1, con `Visibility.isVisible` falso), `^viewpoint:` (→ 3), `^table:plinth`, `^ui:menu-button-` (di nuovo presenti e visibili).
4. **Con un pezzo in mano il pulsante non reagisce**: rientrare in V1 (passo 1); la sinistra a `L_MENU` con `Q_UP` (attesa 0,9 s), la destra prende `ui:menu-item-chair` dal menu e **tiene**; la sinistra (palmo in giù) pizzica il pulsante "Tabletop" (`hand-left` a (0,038; 1,383; −0,587), `xr_select {device: "hand-left", duration: 0.3}`): log `pattern: "tabletop|viewpoint|furniture"`; poi rilascio del pezzo nella stanza (`furniture placed`) e il pizzico di nuovo (con la destra): ritorno. (Questo è l'unico passo che usa la sinistra.)
5. **Riancoraggio**: rientrare in V1; `xr_set_transform` `headset` a (0; 1,6; 0) con orientamento `(0, 0.5, 0, 0.8660)` (rotazione di +60° attorno a Y: lo sguardo punta a −x); attesa 2 s; `ecs_query_entity` su `ui:tabletop-button` con `["Transform"]`; log `pattern: "tabletop"`. Riportare la testa a identità `(0, 0, 0, 1)`, attesa 2 s, ancora il `Transform`. Ritorno con il pulsante.
6. **Sospensione e ripresa**: rientrare in V1; `press` `F8` (`debug=1`), attesa 1 s, `press` `F9`, attesa 1 s: `ecs_find_entities` `^ui:tabletop-button$` (→ 1); pizzico: ritorno.
7. Log senza filtro (`error`, `Cannot read`, `reading 'add'`, `Missing glyph`); pulizia.

## Verifiche (tutte obbligatorie)
1. **Passo 1**: `viewpoint entered id=V1 …` (la durata è un avviso se > 700 ms: frame rate di IWER, vedi S3.1); `miniature:root` a (2,60; 0,40; 0,30) ± 0,01; nessuna riga `pinch left`.
2. **Passo 2**: **1** `ui:tabletop-button`; la riga `[soglia] tabletop button shown distance=<d> maxAngleDeg=<a>` con `d` tra **0,50 e 0,80** (atteso 0,59) e `a` **≤ 30,0** (atteso 24,7: **dentro il cono**, non un ingresso di riserva); `Transform` a (0; 1,38; −0,55) ± 0,03 con rotazione solo attorno a Y (x e z ≈ 0); il testo è `Tabletop` e `fontSize` ≥ 2,4 cm; i pulsanti "Menu" e "Issues" non sono visibili; nessun menu del palmo.
3. **Passo 3**: righe `tabletop button pressed hand=right` e `viewpoint exited id=V1 durationMs=<n>` (250 ≤ n ≤ 700 con 72 fps; **avviso** fino a 1000 per il frame rate di IWER, come S3.1), `walls rebuilt cut=1.00`; `R2` = `R0` ± 0,001 (il plastico torna identico); `H2` = `H1`; 1 `ui:tabletop-button` non visibile; 3 `viewpoint:*`; i pulsanti "Menu" e "Issues" di nuovo presenti (2 + 2); **nessuna** riga `pinch left` né `menu opened hand=left`: tutto fatto con una mano.
4. **Passo 4**: `tabletop button ignored reason=piece-held` (o nessuna uscita) con il pezzo in mano; il pizzico dell'altra mano ruota il pezzo (`furniture rotated furniture:chair#1 …`); dopo la posa, il pulsante funziona.
5. **Passo 5**: dopo la rotazione della testa di 60° il pulsante si riancora entro 2 s davanti allo sguardo: nuova posizione a (−0,476; 1,38; −0,275) ± 0,05 (0,55 m davanti, 0,22 sotto gli occhi) e la riga `tabletop button reanchored`; con la testa di nuovo a identità si riancora a (0; 1,38; −0,55) ± 0,05; mai più lontano di 0,8 m né oltre 30° dall'asse a riposo.
6. **Passo 6**: dopo `F8`/`F9` il pulsante c'è ancora e funziona; il punto di vista non cambia per la sospensione (D35).
7. Nessuna voce `error`; nessun `Missing glyph`; nessun `reading 'add'`.
8. **Solo visore** (alta): il pulsante si raggiunge e si legge da seduti con una mano; non si preme per sbaglio mentre si prende un pezzo; il riancoraggio non disorienta.

## Esito
PASS se le verifiche 1–7 sono soddisfatte · FAIL altrimenti. Prima di M4 questo scenario falliva alla verifica 2 (nessun pulsante di ritorno a una mano in scala reale; avviso del gate di M3).

## Da rimandare al visore
Voce "Scala reale a una mano" di M3/M4 in `qa/device/DEBT.md`.
