# S2.1 · Menu del palmo

**Milestone**: M2 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`)
Prerequisiti di implementazione: T2.3, T2.10, T2.11, T2.12 (T2.16 per la verifica 11). Vedi `docs/plans/M2.md`, decisione D18.

## Precondizioni
- `dev-params.local.txt` = `house=apartment-a&role=visitor&reset=1&seed=1&debug=1`; `browser_reload_page`; `xr_accept_session`; `xr_set_input_mode` con `mode: "hand"`; attesa 2 s. La testa resta a (0; 1,6; 0). O = (Ox; Oy; Oz) dall'ultima riga `miniature placed` (atteso (0; 1,35; −0,45)).
- **`Q_UP`** = quaternione del `gripSpace` con il palmo verso l'alto, **fissato dallo spike di T2.11** e scritto in `docs/plans/M2.md`, sezione "Esiti degli spike". **Lo scenario non si esegue finché `Q_UP` non è scritto.** Per il primo tentativo dello spike: l'orientamento identità `(0, 0, 0, 1)` di IWER probabilmente ha il palmo in giù (da verificare); candidati per il palmo in su: rotazione di 180° attorno all'asse z della mano `(0, 0, 1, 0)` oppure attorno all'asse x `(1, 0, 0, 0)`. `Q_UP_RIGHT` = lo stesso quaternione specchiato per la destra, se lo spike lo richiede.
- Posizioni delle mani: `L_MENU` = (−0,25; 1,15; −0,20) (sotto il piano del plastico, a ~0,55 m dalla testa); `R_MENU` = (0,25; 1,15; −0,20). Mani "a riposo" (nessun menu): `(∓0,30; 1,10; 0,10)` con orientamento `(0, 0, 0, 1)`.
- Conversione e sequenze comuni: sezione "Strategia QA" di `docs/plans/M2.md`. Ogni `xr_set_transform` passa **sempre** `orientation` esplicita.

## Passi
1. Prima del menu: `ecs_find_entities` con `namePattern: "^ui:(palm-menu|menu-)"`.
2. `xr_set_transform` `hand-left` a `L_MENU` con orientamento `Q_UP`; attesa 0,6 s (`browser_interact`, `wait` 600 ms).
3. `ecs_find_entities` con `namePattern: "^ui:palm-menu$"` e poi con `"^ui:menu-"`; per ogni voce, `ecs_query_entity` con `components: ["Transform", "MenuItem"]`. `browser_get_console_logs` con `pattern: "menu|catalog"`.
4. `browser_screenshot` → allegare (menu aperto, a sinistra sotto il plastico, voci leggibili).
5. Pagine: `xr_set_transform` `hand-right` sulla posizione di `ui:menu-page-next` (orientamento `(0, 0, 0, 1)`), `xr_select {device: "hand-right", duration: 0.2}`; attesa 0,5 s; `ecs_find_entities` con `^ui:menu-item-`; log. Ripetere una volta (pagina 3); poi una terza volta (resta alla 3/3); poi `ui:menu-page-prev` (torna alla 2/3).
6. Chiusura: `xr_set_transform` `hand-left` a `L_MENU` con orientamento `(0, 0, 0, 1)` (palmo in giù); attesa 1 s; `ecs_find_entities` con `^ui:(palm-menu|menu-)`; log.
7. Destra: `xr_set_transform` `hand-right` a `R_MENU` con `Q_UP_RIGHT` (o `Q_UP` se coincide); attesa 0,6 s; `ecs_find_entities` con `^ui:palm-menu$`; log; poi palmo in giù e attesa 1 s.
8. Entrambe: `hand-left` a `L_MENU` con `Q_UP` e, dopo 0,2 s, `hand-right` a `R_MENU` con `Q_UP_RIGHT`; attesa 0,8 s; `ecs_find_entities` con `^ui:palm-menu$`; log; poi entrambe a riposo.
9. Palmo in su ma pizzicando: `xr_set_select_value` `hand-left` = 1 poi `hand-left` a `L_MENU` con `Q_UP`; attesa 0,8 s; `ecs_find_entities` con `^ui:palm-menu$`; poi `xr_set_select_value` `hand-left` = 0 e mano a riposo.
10. `browser_get_console_logs` senza filtro (cercare `error` e `Missing glyph`).
11. (Solo se T2.16 è stato fatto) Ricaricare con gli stessi parametri, `xr_accept_session`, `xr_set_input_mode`, **nessun** altro gesto; leggere `onboarding step=` ; poi un pizzico qualunque (`xr_select` `hand-right` sulla base vuota a (Ox + 0,38; Oy + 0,25; Oz)) e `gesture`/`room`: ripetere il passo 2 e leggere `onboarding step=`.

## Verifiche (tutte obbligatorie)
1. Passo 1: **0** entità `ui:palm-menu` e **0** `ui:menu-*`.
2. Passo 3: esattamente **1** `ui:palm-menu`; log `[soglia] menu opened hand=left`; `[soglia] catalog loaded items=16 furniture=14 mobility=2` presente nel caricamento; **6** entità `ui:menu-item-*` con id, in questo ordine di catalogo: `bed-double`, `bed-single`, `sofa-3seat`, `armchair`, `table-dining`, `chair` (`MenuItem.catalogId` uguale all'id), più **1** ciascuno di `ui:menu-undo`, `ui:menu-page-prev`, `ui:menu-page-next`. Nessuna voce `wheelchair` né `stroller`.
3. Passo 3: ogni voce e `ui:palm-menu` a **≤ 0,65 m dalla testa** (0,6 m di progetto + tolleranza; regola 8) e le voci sotto o accanto al pannello (distanza tra le voci ≥ 0,06 m).
4. Passo 5: dopo il primo `next` la riga `[soglia] menu page 2/3 items=coffee-table,desk,bookcase,wardrobe,nightstand,tv-stand` e **6** voci con quegli id (le precedenti non esistono più); dopo il secondo `[soglia] menu page 3/3 items=rug,plant` e **2** voci; il terzo `next` non cambia pagina (nessuna nuova riga `menu page` diversa da 3/3); `prev` → `menu page 2/3 …`.
5. Passo 6: **0** `ui:palm-menu` e **0** `ui:menu-*`; riga `[soglia] menu closed`.
6. Passo 7: 1 `ui:palm-menu` e `menu opened hand=right`; poi chiusura (`menu closed`).
7. Passo 8: **1** sola entità `ui:palm-menu` (la prima mano che si alza), una sola riga `menu opened`.
8. Passo 9: con il pizzico attivo **0** entità `ui:palm-menu` e nessuna riga `menu opened`.
9. Il plastico non si è mosso, né scalato né ruotato (ultima riga `[soglia:state]`: `miniature.scale` 0,05, `yawDeg` 0) e nessuna riga `room selected`/`room deselected` è stata prodotta dal menu.
10. Nessuna voce `error`, nessun `Missing glyph info` per i testi del menu (se T2.2 non è fatto, i testi usano la forma ASCII `x`).
11. (T2.16) Prima di ogni gesto `onboarding step=pinch`; dopo il pizzico e il gesto/la selezione `step=menu`; all'apertura del menu `onboarding step=done`.
12. Screenshot allegato e descritto a parole (posizione del menu rispetto al plastico e alla testa, leggibilità del testo, bersagli distinti).

## Esito
PASS se le verifiche 1–10 (e 11 se T2.16 è fatto) sono soddisfatte · FAIL altrimenti. Se il menu non si apre con `Q_UP`, ripetere **una sola volta** provando l'orientamento candidato successivo dello spike (e scriverlo in "Esiti"); poi FAIL.

## Da rimandare al visore
Rilevamento affidabile del palmo in su con le mani vere e su entrambe le mani, nessuna apertura involontaria, distanza e dimensione del menu a 0,5 m e nel campo visivo stretto, semantica del `gripSpace` delle mani (voci M2 in `qa/device/DEBT.md`).
