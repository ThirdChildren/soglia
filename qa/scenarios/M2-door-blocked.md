# S2.6 · Porta bloccata da un mobile

**Milestone**: M2 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`)
Prerequisiti di implementazione: T2.4, T2.5, T2.9, T2.13 (vedi `docs/plans/M2.md`, D16: zona libera di 0,30 m davanti e dietro a ogni porta).

## Precondizioni
- Come S2.2: `dev-params.local.txt` = `house=apartment-a&role=visitor&reset=1&seed=1&debug=1`, reload, accept, mani, testa (0; 1,6; 0), O dall'ultima riga `miniature placed`, menu aperto (`hand-left` a `L_MENU` con `Q_UP`, tenuto in alto). `W(px, pz)` come in S2.2.
- La porta `door:d-bedroom` è nel muro `w-bedroom-hall` (z = 4,6, spessore 0,12), luce da x = 6,0 a 6,8; la sua zona libera è x 6,0–6,8, z da 4,24 a 4,96.
- Punti (O = (0; 1,35; −0,45), y = 1,39): **PD** = `W(6,4; 4,0)` = (0,045; 1,39; −0,430) → poltrona 0,8 × 0,8 agganciata a (6,40; 4,14), esattamente davanti alla porta; **PS** = `W(7,5; 4,0)` = (0,100; 1,39; −0,430) → agganciata a (7,50; 4,14), accanto alla porta (x 7,1–7,9); **PC** = `W(6,8; 2,5)` = (0,065; 1,39; −0,505) → centro della stanza.

## Passi
1. Menu aperto. **Poltrona sulla porta**: `ui:menu-item-armchair` (pagina 1) → `I`; presa a `I` (orientamento `(0, 0, 0, 1)`, select 1), `xr_animate_to` a **PD**, attesa 1 s. **In volo**: `ecs_query_entity` su `furniture:armchair#1` con `["Furniture"]`; log `pattern: "furniture status"`. `browser_screenshot` (cornice rossa davanti alla porta, la soglia della porta in arancio sotto).
2. Rilascio. Log `pattern: "furniture placed|furniture status"`; `ecs_query_entity` con `["Furniture"]`; stato.
3. **Poltrona accanto alla porta**: seconda poltrona (`ui:menu-item-armchair`), presa e rilascio a **PS**. Log e `ecs_query_entity` su `furniture:armchair#2`.
4. **Spostare la prima poltrona via dalla porta**: presa di `furniture:armchair#1` dal suo centro `W(6,4; 4,14)` = (0,045; 1,39; −0,428), `xr_animate_to` a **PC**, rilascio. Log e `Furniture`.
5. `ecs_find_entities` con `^furniture:`; `browser_get_console_logs` senza filtro (cercare `error`).

## Verifiche (tutte obbligatorie)
1. Passo 1 (in volo): `Furniture.status` = `invalid`, `outline` = `red`; riga `[soglia] furniture status furniture:armchair#1 status=invalid reasons=blocks-door door=door:d-bedroom` (i motivi **non** contengono `overlaps-wall`: la poltrona è a filo con la faccia interna del muro, non dentro).
2. Passo 2: `furniture placed furniture:armchair#1 room=bedroom x=6.40 z=4.14 rot=0 status=invalid` (x = 6,40 ± 0,02, z = 4,14 ± 0,02); `outline` = `red` persistente; il pezzo resta nello store.
3. Passo 3: `furniture placed furniture:armchair#2 room=bedroom x=7.50 z=4.14 rot=0 status=valid`; `outline` = `none` (accanto al vano, fuori dalla zona).
4. Passo 4: `furniture status furniture:armchair#1 status=valid reasons=-`; `furniture placed furniture:armchair#1 room=bedroom x=6.80 z=2.50 rot=0 status=valid`; `outline` = `none`.
5. Passo 5: esattamente **2** entità `furniture:*`; `[soglia:state]`: `nextInstance` `{"armchair":3}`.
6. Nessuna riga `room selected`, nessun `miniature gesture start`; nessuna voce `error`.
7. Screenshot del passo 1 allegato e descritto a parole.

## Esito
PASS se le verifiche 1–6 sono soddisfatte · FAIL altrimenti. Se la poltrona è marcata `invalid` per `overlaps-wall` invece che per `blocks-door`, FAIL (l'aggancio a filo deve dare compenetrazione ≤ 0,005 m).

## Da rimandare al visore
Se la zona libera di 0,30 m e il motivo `blocks-door` sono comprensibili per chi prova (testo di spiegazione: M3, FitCheck); visibilità del rosso sopra la soglia arancione della porta (voci M2 in `qa/device/DEBT.md`).
