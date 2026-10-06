# S2.7 · Un mobile lasciato fuori dal plastico torna nel catalogo

**Milestone**: M2 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`)
Prerequisiti di implementazione: T2.7, T2.12, T2.13, T2.15 (vedi `docs/plans/M2.md`, D14 e D17).

## Precondizioni
- Come S2.2: `dev-params.local.txt` = `house=apartment-a&role=visitor&reset=1&seed=1&debug=1`, reload, accept, mani, testa (0; 1,6; 0), O dall'ultima riga `miniature placed`, menu aperto (`hand-left` a `L_MENU` con `Q_UP`, tenuto in alto). `W(px, pz)` come in S2.2.
- Punti (O = (0; 1,35; −0,45), y = 1,39): **P1** = `W(6,8; 1,30)` = (0,065; 1,39; −0,565); **POUT1** = `W(14; 3,6)` = (0,425; 1,39; −0,450) (sulla base ma fuori dalla casa: x di pianta 14 > 11); **POUT2** = (0,60; 1,39; −0,450) (in aria oltre il bordo della base, raggio 0,45 m).

## Passi
1. **Pezzo nuovo rilasciato fuori**: presa di `ui:menu-item-bed-double` (S2.2, passi 2–3), `xr_animate_to` a **POUT1**, attesa 1 s. In volo: `ecs_query_entity` su `furniture:bed-double#1` con `["Furniture"]`; `ecs_find_entities` con `^ui:reason-` e `ecs_query_entity` sull'etichetta con `["Transform"]` (verifica 8). Rilascio, attesa 0,5 s. Log `pattern: "furniture|undo"`; `ecs_find_entities` con `^furniture:`; stato.
2. Pizzico su `ui:menu-undo` (S2.4, passo 3). Log.
3. **Pezzo del plastico portato fuori**: posare il letto a **P1** (S2.2, passi 2–5); presa dal suo centro `W(6,8; 1,125)` = (0,065; 1,39; −0,574), `xr_animate_to` a **POUT1**, attesa 1 s, in volo `Furniture`; rilascio. Log `pattern: "furniture|undo"`; `ecs_find_entities` con `^furniture:`; stato.
4. **Annulla il rientro**: pizzico su `ui:menu-undo`. Log; `ecs_find_entities`; `Furniture` del letto; stato.
5. **Fuori dalla base, in aria**: presa di `ui:menu-item-armchair`, `xr_animate_to` a **POUT2**, rilascio. Log; `ecs_find_entities`; stato.
6. `browser_get_console_logs` senza filtro (cercare `error`). `browser_screenshot` al passo 1 in volo (cornice rossa fuori dalla casa).

## Verifiche (tutte obbligatorie)
1. Passo 1 (in volo, mano sulla base fuori dalla casa): `Furniture.status` = `invalid`, `outline` = `red`, ragione `outside-house` (riga `furniture status furniture:bed-double#1 status=invalid reasons=outside-house`). Dopo il rilascio: riga `[soglia] furniture returned furniture:bed-double#1 from=menu`; **0** entità `^furniture:`; `furniture` `[]`; `nextInstance` **non** consumato (`{}`) e `historyLength` 0; nessuna riga `furniture placed`.
2. Passo 2: `[soglia] undo empty` (un rientro di un pezzo nuovo non è un'azione annullabile).
3. Passo 3: dopo il rilascio fuori `[soglia] furniture returned furniture:bed-double#1 from=model`; **0** entità `^furniture:`; `furniture` `[]`; `historyLength` 2 (posa + rimozione).
4. Passo 4: `[soglia] undo action=remove id=furniture:bed-double#1`; l'entità `furniture:bed-double#1` **esiste di nuovo con lo stesso id**, a (6,80; 1,125) ± 0,01, `status` `valid`; `historyLength` 1.
5. Passo 5: rilascio con la mano oltre il bordo della base (POUT2): `furniture returned furniture:armchair#1 from=menu`; nessuna nuova entità `furniture:armchair#*`; `furniture` contiene solo il letto.
6. Nessuna riga `room selected`, nessun `miniature gesture start`, nessun `furniture limit reached`; nessuna voce `error`.
7. Screenshot del passo 1 allegato e descritto a parole (il pezzo in mano sopra la base, fuori dalla casa, con cornice rossa).

8. **Etichetta del motivo "Outside the house" (D27)**: al passo 1 (in volo) esiste **1** entità `ui:reason-bed-double#1` e la riga `[soglia] reason shown furniture:bed-double#1 "Outside the house"`; a **0,52 m o più dalla testa** (`LABEL_DISTANCE_MARGIN`; nel rerun 2 a ~0,60 m per un pezzo a 14 m di pianta), **tutta nel cono centrale di 30°** (`acos(−dz / |d|)` ≤ 30°, `d` = posizione − (0; 1,6; 0), dal `Transform`: l'etichetta è ancorata nel cono anche se il pezzo è fuori), yaw-only, e nello screenshot il testo è **leggibile per intero** (non tagliato dal bordo destro della vista, come invece nel rerun precedente); dopo il rilascio la riga `reason hidden furniture:bed-double#1` e **0** entità `ui:reason-*`. Deviazioni numeriche = avvisi; testo tagliato = FAIL (regola 8).

## Esito
PASS se le verifiche 1–6 e 8 sono soddisfatte · FAIL altrimenti.

## Da rimandare al visore
Se "lasciare fuori" è un gesto naturale e comprensibile senza spiegazioni, e se la distanza dal bordo del plastico oltre cui il pezzo rientra è comoda (voci M2 in `qa/device/DEBT.md`).

## Changelog
- 2026-10-06 (rerun 2 del gate, `qa/reports/M2-2026-10-06-rerun2.md`): **verifica 8 nuova** (e lettura di `ui:reason-*` al passo 1): l'etichetta "Outside the house" del pezzo tenuto fuori dalla casa è a ≥ 0,52 m, **tutta nel cono di 30°** (ancorata nel cono, a ~0,60 m, bearing ≤ 30°), yaw-only e leggibile per intero — motivo: nel rerun 2 era tagliata dal bordo destro della vista (W2); il codice ora la ancora nel cono. Esito aggiornato a 1–6 e 8.
