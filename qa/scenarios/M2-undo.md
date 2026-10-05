# S2.4 · Annulla dal menu

**Milestone**: M2 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`)
Prerequisiti di implementazione: T2.7, T2.12, T2.13, T2.15 (vedi `docs/plans/M2.md`, D17).

## Precondizioni
- Come S2.2: `dev-params.local.txt` = `house=apartment-a&role=visitor&reset=1&seed=1&debug=1`, reload, accept, mani, testa (0; 1,6; 0), O dall'ultima riga `miniature placed`, menu aperto (`hand-left` a `L_MENU` con `Q_UP`, tenuto in alto). `W(px, pz)` come in S2.2.
- Punti (O = (0; 1,35; −0,45), y = 1,39): **P1** = `W(6,8; 1,30)` = (0,065; 1,39; −0,565) → letto agganciato a (6,80; 1,125); **PB1** = `W(6,0; 3,0)` = (0,025; 1,39; −0,480) → letto agganciato a (6,06; 3,00).

## Passi
1. Azione 1 (posa): prendere `ui:menu-item-bed-double` e rilasciarlo a **P1** (sequenza di S2.2, passi 2–5). Leggere l'ultima riga `[soglia:state]` e `ecs_find_entities` con `^furniture:`.
2. Azione 2 (spostamento): `hand-right` al centro del letto `W(6,8; 1,125)` = (0,065; 1,39; −0,574), orientamento `(0, 0, 0, 1)`, select 1, `xr_animate_to` a **PB1**, select 0, attesa 0,5 s. Stato e log.
3. **Annulla 1**: `ecs_query_entity` su `ui:menu-undo` (Transform) → `U`; `hand-right` a `U` (orientamento `(0, 0, 0, 1)`), `xr_select {device: "hand-right", duration: 0.2}`; attesa 0,5 s. `browser_get_console_logs` con `pattern: "undo|furniture"`; `ecs_query_entity` su `furniture:bed-double#1` con `["Furniture"]`; stato.
4. **Annulla 2**: stesso pizzico su `ui:menu-undo`. Log, `ecs_find_entities` con `^furniture:`, stato.
5. **Annulla 3** (cronologia vuota): stesso pizzico. Log, `ecs_find_entities`, stato.
6. **Nuova posa dopo l'annulla**: prendere di nuovo `ui:menu-item-bed-double` e rilasciarlo a **P1**. Log `pattern: "furniture placed"`, `ecs_find_entities`, stato.
7. Aprire e rileggere: `browser_get_console_logs` senza filtro (cercare `error`).

## Verifiche (tutte obbligatorie)
1. Passo 1: `furniture` ha 1 elemento (letto a (6,80; 1,125) ± 0,01), `historyLength` 1, `nextInstance` `{"bed-double":2}`.
2. Passo 2: letto a (6,06; 3,00) ± 0,02, `historyLength` 2.
3. Passo 3: riga `[soglia] undo action=move id=furniture:bed-double#1`; il letto è tornato a (6,80; 1,125) ± 0,01 (`Furniture.x`, `z`) e `historyLength` 1; l'entità `furniture:bed-double#1` esiste ancora (stesso id).
4. Passo 4: riga `[soglia] undo action=place id=furniture:bed-double#1`; **0** entità `furniture:*`; `furniture` = `[]`; `historyLength` 0.
5. Passo 5: riga `[soglia] undo empty`; stato invariato (`furniture` `[]`); **nessun errore**.
6. Passo 6: il nuovo letto ha id **`furniture:bed-double#2`** (il contatore `nextInstance` non torna indietro) e `furniture placed furniture:bed-double#2 room=bedroom x=6.80 z=1.13 rot=0 status=valid`; `nextInstance` `{"bed-double":3}`.
7. L'annulla non muove, non scala e non ruota il plastico (scala 0,05, yaw 0 in ogni riga di stato) e non produce `room selected`.
8. Nessuna voce `error`.

## Esito
PASS se le verifiche 1–8 sono soddisfatte · FAIL altrimenti. Se il pizzico su `ui:menu-undo` non produce nessun `undo …` (né `undo empty`), ripetere **una sola volta** con la mano a ≤ 0,02 m dal centro della voce e riportare lo scarto.

## Da rimandare al visore
Bersaglio di `Undo` abbastanza grande per il pizzico reale a 0,5 m, nessun annulla involontario (voci M2 in `qa/device/DEBT.md`).
