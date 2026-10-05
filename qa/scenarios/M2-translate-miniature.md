# S2.9 · Spostare il plastico: due mani e una mano (OBBLIGATORIO)

**Milestone**: M2 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`)
**Obbligatorio al gate di M2** (decisione dell'utente, 2026-10-05: T2.17 è dentro M2; non è più condizionale). Prerequisiti di implementazione: T2.7 (`miniature.offset`, `recenterMiniature`), T2.10b (arbitraggio), T2.12 (`ui:menu-recenter`), T2.13 (presa dei pezzi, per i non-conflitti), T2.17a (due mani), T2.17b (una mano, `pan`). Vedi `docs/plans/M2.md`, decisioni D15 e D28.

## Regole che lo scenario verifica
- **Una mano (`pan`)**: pizzico sulla **base libera** (disco `table:plinth`, fuori da ogni stanza e da ogni pezzo, oltre `PAN_GUARD` = 0,45 m reali dai poligoni delle stanze) e trascinamento: il centro segue lo spostamento orizzontale della mano.
- **Due mani**: il punto medio è il perno (formula di D28).
- **Limite**: centro entro **0,30 m** dall'ancora, in orizzontale (si proietta sul cerchio), **quota (y) mai cambiata**, nessuna inclinazione.
- **Priorità dei pizzichi** (D15): menu > mobile > due mani > `pan` > stanza. Un pizzico su un pezzo o su una stanza **non** muove il plastico; un pizzico sulla base **non** prende pezzi né seleziona stanze; un secondo pizzico durante un `pan` lo promuove a gesto a due mani; con un pezzo in mano il `pan` non parte.
- **Recenter**: `ui:menu-recenter` → offset `[0, 0]`, scala 0,05, `yawDeg` invariato; non entra nella cronologia dell'annulla.
- **Limite dichiarato**: con una sola mano il menu non si può usare (Recenter a una mano è di M5): i passi 1–4 e 6–8 usano **solo `hand-right`** (la sinistra a riposo), il passo 5 (Recenter) usa le due mani.

## Precondizioni
- `dev-params.local.txt` = `house=apartment-a&role=visitor&reset=1&seed=1&debug=1&furnish=scandinavian` (il preset serve ai passi 6 e 8; vale il preset **corretto** di T2.5); `browser_reload_page`; `xr_accept_session`; `xr_set_input_mode` con `mode: "hand"`; attesa 3 s; testa a (0; 1,6; 0). **O** = (Ox; Oy; Oz) dall'ultima riga `miniature placed` (atteso (0; 1,35; −0,45), scala 0,05, yaw 0). `W(px, pz) = (Ox + (px − 5,5)·0,05; Oy + 0,04; Oz + (pz − 3,6)·0,05)`.
- Mani a riposo: `hand-left` a (−0,30; 1,10; 0,10), `hand-right` a (0,30; 1,10; 0,10), orientamento `(0, 0, 0, 1)`, select 0. Ogni `xr_set_transform` passa **sempre** `orientation` esplicita. `xr_animate_to` accoda le animazioni; conta la posa finale di ogni tappa (come in S1.2).
- Punti (con O = (0; 1,35; −0,45), scala 0,05; quota di pizzico sulla base **Oy + 0,03**; da confermare nello spike di T2.17b, "Esiti degli spike" del piano):
  - **B1** = (Ox + 0,35; Oy + 0,03; Oz): base libera a est (pianta x = 12,5 m, 1,5 m reali oltre il muro est; a ~0,61 m dalla testa); **B2** = (Ox − 0,35; Oy + 0,03; Oz): base libera a ovest (pianta x = −1,5 m).
  - **PL** = `W(1,1; 4,25)` = (−0,22; 1,39; −0,4175): centro della pianta `furniture:plant#1` (preset, tutto dentro `living`).
  - **LV** = `W(2,0; 3,6)` = (−0,175; 1,39; −0,45): punto vuoto del soggiorno (nessun pezzo).
- Letture ripetute: `browser_get_console_logs` con `pattern: "gesture start|gesture end|pan|translated|recentered|room|furniture"` (solo le righe dopo la riga `params source=` del caricamento corrente); `ecs_query_entity` su `miniature:root` con `["Transform"]`; riga `[soglia:state]` più recente (`miniature.offset`, `miniature.scale`, `yawDeg`, `historyLength`).

## Passi
1. **Una mano, trascinare** (la sinistra non si muove): `hand-right` a **B1**, `xr_set_select_value` `hand-right` = 1, attesa 0,3 s; `xr_animate_to` `hand-right` a (Ox + 0,20; Oy + 0,03; Oz) (0,8 s), attesa 0,3 s; `xr_set_select_value` = 0, attesa 0,5 s. Letture. `browser_screenshot` → allegare (plastico spostato verso sinistra, ancora al centro della vista).
2. **Nessuna deriva verticale**: `hand-right` a (Ox + 0,20; Oy + 0,03; Oz) (sulla base libera rispetto al centro attuale), select 1, attesa 0,3 s; `xr_animate_to` a (Ox + 0,20; Oy + 0,13; Oz) (solo salita di 0,10 m), select 0. Letture.
3. **Limite in orizzontale**: `hand-right` a (Ox + 0,20; Oy + 0,03; Oz), select 1; `xr_animate_to` a (Ox − 0,30; Oy + 0,03; Oz) (spostamento −0,50 m: il bersaglio sarebbe a −0,65 dall'ancora); select 0. Letture.
4. **Limite in diagonale**: `hand-right` a (Ox + 0,05; Oy + 0,03; Oz) (base libera rispetto al centro, ora a −0,30), select 1; `xr_animate_to` a (Ox + 0,05; Oy + 0,03; Oz + 0,60); select 0. Letture.
5. **Recenter** (usa le due mani: limite dichiarato): `hand-left` a `L_MENU` con `Q_UP` (menu aperto, come S2.1); `ecs_query_entity` su `ui:menu-recenter` con `["Transform"]` → `R`; `hand-right` a `R` (orientamento `(0, 0, 0, 1)`), `xr_select {device: "hand-right", duration: 0.2}`; attesa 0,5 s; chiudere il menu (`hand-left` palmo in giù, attesa 1 s). Letture; `ecs_query_entity` su `miniature:root`.
6. **Non-conflitto con la presa dei pezzi**: `hand-right` a **PL** (centro di `furniture:plant#1`), select 1, attesa 0,3 s (nessun movimento); letture; `xr_set_select_value` = 0, attesa 0,5 s; letture; `ecs_query_entity` su `furniture:plant#1` con `["Furniture"]`.
7. **Non-conflitto con la selezione delle stanze e con le stanze in generale**:
   a. Stanza selezionata come in S1.6 passo 10: `hand-right` a (Ox − 0,145; Oy + 0,25; Oz − 0,065 + 0,02), `xr_look_at` verso (Ox − 0,145; Oy; Oz − 0,065), `xr_select {device: "hand-right", duration: 0.3}`; attesa 1 s. Letture.
   b. Pizzico **dentro** una stanza, al livello della base ma **non** sulla base libera: `hand-right` a **LV**, `xr_select {device: "hand-right", duration: 0.3}`; attesa 1 s. Letture.
8. **Pezzo in mano + secondo pizzico sulla base** (il secondo pizzico ruota, non fa `pan`): `hand-right` a il centro attuale di `furniture:plant#1` (da `ecs_query_entity`, pianta → `W`), select 1, attesa 0,3 s; poi `hand-left` a **B2** (orientamento `(0, 0, 0, 1)`), `xr_select {device: "hand-left", duration: 0.2}`; attesa 0,5 s; letture; `hand-right` select 0, attesa 0,5 s; letture.
9. **Promozione `pan` → due mani**: `hand-right` a **B1**, select 1, attesa 0,3 s (`pan start`); `hand-left` a **B2**, `xr_set_select_value` `hand-left` = 1, attesa 0,5 s; letture; rilasciare entrambe (select 0), attesa 0,5 s; letture. Se la promozione non parte, ripetere **una sola volta** con la sinistra 0,05 m più vicina al plastico e riportare lo scarto.
10. **Due mani, ingrandire e trascinare**: Recenter (come passo 5, per ripartire da O), poi **ingrandire a 0,12** (S1.2 fase C, passo 10): mani a (Ox ∓ 0,15; Oy + 0,05; Oz), select 1/1, `xr_animate_to` a (Ox ∓ 0,60; Oy + 0,05; Oz), select 0/0; poi mani a (Ox ∓ 0,15; Oy + 0,05; Oz), select 1/1; `xr_animate_to` `hand-left` a (Ox + 0,05; …) e poi `hand-right` a (Ox + 0,35; …) (span invariato 0,30, punto medio + 0,20); select 0/0. Letture.
11. **Rotazione e traslazione insieme (nessun ribaltamento)**: mani a (Ox ∓ 0,20; Oy + 0,05; Oz), select 1/1, tre tappe di 30°/60°/90° come S1.2 fase B con in più lo spostamento del punto medio di + 0,10 in x nell'ultima tappa; select 0/0; letture; `ecs_query_entity` su `miniature:root`.
12. `browser_get_console_logs` senza filtro (cercare `error`); `xr_get_transform` della testa; `browser_screenshot` dopo il passo 10 (casa ingrandita e spostata, ancora in parte nel campo visivo) → allegare.

## Verifiche (tutte obbligatorie)
**Una mano (`pan`)**
1. Passo 1: `[soglia] pan start hand=right`, `[soglia] miniature translated x=-0.150 z=0.000 source=pan` (± 0,01), `[soglia] pan end hand=right`; `miniature:root` a (Ox − 0,15; Oy; Oz) ± 0,01; scala 0,05 e yaw 0 invariati; **nessuna** riga `miniature gesture start` (la sinistra non è stata toccata: è un gesto a **una** mano), nessuna `room selected`, nessuna `furniture grabbed`; screenshot allegato e descritto a parole (plastico spostato verso sinistra e ancora al centro della vista).
2. Passo 2: `Oy` invariato (± 0,001) anche con la mano 0,10 m più in alto; offset invariato (`translated`, se compare, ha x = −0,150 e z = 0,000 ± 0,01).
3. Passo 3: `translated x=-0.300 z=0.000` (± 0,01): il raggio del centro dall'ancora è ≤ 0,301 m (limite 0,30, **non** −0,65).
4. Passo 4: la distanza orizzontale tra `miniature:root` e l'ancora (Ox, Oz) è 0,30 ± 0,01 e ≤ 0,301; direzione proiettata (x ≈ −0,134 ± 0,02, z ≈ +0,268 ± 0,02); quota = Oy (± 0,001); la riga `translated` ha `sqrt(x² + z²)` ≤ 0,301.
**Recenter**
5. Passo 5: `[soglia] miniature recentered scale=0.0500`; `miniature:root` torna a O ± 0,01 con scala 0,05 e yaw 0; `[soglia:state]`: `miniature.offset` `[0,0]`; `historyLength` **invariato** (il Recenter non è un'azione di arredo e non entra nell'annulla).
**Non-conflitti**
6. Passo 6: `[soglia] furniture grabbed furniture:plant#1 source=model hand=right` e **nessuna** riga `pan start`, **nessuna** `translated`, nessuna `room selected`; offset invariato `[0,0]`; dopo il rilascio `furniture placed furniture:plant#1 room=living x=1.10 z=4.37 rot=0 status=valid` (x = 1,10 ± 0,01; z = 4,37 ± 0,02: aggancio al muro `w-living-bath`, 4,54 − 0,175 = 4,365).
7. Passo 7a: `[soglia] room selected living area=23.9` e **nessuna** `pan start`/`translated`; 7b: **nessuna** riga `pan start`, **nessuna** `translated`, offset ancora `[0,0]` (un pizzico dentro una stanza non muove il plastico), nessuna `furniture grabbed` (punto senza pezzi).
8. Passo 8: con la destra che tiene `furniture:plant#1` (`furniture grabbed … hand=right`), il pizzico della sinistra sulla base **B2** produce `[soglia] furniture rotated furniture:plant#1 rot=90` e **nessuna** riga `pan start` né `miniature gesture start`; dopo il rilascio `furniture placed furniture:plant#1 … rot=90 … status=valid` e offset ancora `[0,0]` (con un pezzo in mano il `pan` non parte).
9. Passo 9: `pan start hand=right`; dopo il pizzico della sinistra `[soglia] pan upgrade hand=right to=two-hands` e `[soglia] miniature gesture start`; al rilascio `miniature gesture end …`; il centro resta entro 0,301 m dall'ancora; nessuna `room selected`; nessun `error`.
**Due mani**
10. Passo 10: dopo l'ingrandimento `miniature gesture end scale=0.1200 yawDeg=0.0 tiltDeg=0.0` con `miniature:root` a O ± 0,01 (le mani simmetriche non spostano il centro, come S1.2 verifica 4); dopo il trascinamento `[soglia] miniature translated x=0.200 z=0.000 source=two-hands` (± 0,01); `miniature:root` a (Ox + 0,20; Oy; Oz) ± 0,01; scala 0,12 e yaw 0 invariati; `tiltDeg=0.0`; nessuna `room selected`; screenshot allegato (casa ingrandita e spostata a destra, ancora in parte nel campo visivo).
11. Passo 11: `yawDeg` = +90 ± 10, `tiltDeg` ≤ 3, scala invariata ± 3 %, offset entro 0,30 m.
**Generali**
12. Nessuna riga `room selected` oltre a quella del passo 7a, nessuna voce `error`, nessuna locomozione (`xr_get_transform` della testa invariato: (0; 1,6; 0)).
13. Da riga di comando: `npm test` verde, compresi i test di `miniature-pan` (zone di pizzico disgiunte: base libera / stanza / pezzo; `PAN_GUARD`; clamp) e `pinch-claims` (priorità e promozione).

## Esito
PASS se le verifiche 1–13 sono soddisfatte · FAIL altrimenti. Se la presa non parte, ripetere **una sola volta** con la mano a ≤ 0,05 m verso il centro del plastico e riportare lo scarto (come in S1.2). Se **B1/B2** non risultano base libera (il passo 1 non produce `pan start`), leggere la geometria reale del `table:plinth` e dei poligoni e correggere i punti nel report e in questo file (lo scenario ammette un solo aggiornamento di punti, annotato nel changelog).

## Da rimandare al visore
Afferrare e trascinare il plastico con mani vere, a **due mani** e a **una mano** (pizzico sulla base), senza scatti né deriva; la corona libera della base afferrabile con facilità a scala 0,05–0,08 (a 0,12 può essere fuori portata: R16); il pizzico sulla base non si confonde con una stanza o un pezzo vicini; comodità del limite di 0,30 m; "Recenter" raggiungibile; campo visivo stretto con il plastico decentrato (voci M2 in `qa/device/DEBT.md`).

## Changelog
- 2026-10-05: scenario riscritto per le decisioni dell'utente sul piano M2: (1) **non è più condizionale**: T2.17 è dentro M2 e S2.9 è obbligatorio al gate; (2) aggiunto il **gesto a una mano** (`pan` sulla base libera) con i passi 1–4 eseguiti solo con `hand-right` e le verifiche 1–4 (traslazione, quota invariata, limite 0,30 m, proiezione in diagonale); (3) aggiunti i **non-conflitti** con la presa dei pezzi (passo 6), con la selezione delle stanze (passo 7), con un pezzo in mano (passo 8, il secondo pizzico ruota e non fa `pan`) e la promozione `pan` → due mani (passo 9), con le righe di log `pan start`, `pan end`, `pan upgrade`; (4) il `translated` ora riporta `source=pan|two-hands`; (5) il Recenter verifica anche che la cronologia dell'annulla non cambi (verifica 5); (6) i parametri URL includono `furnish=scandinavian` (passi 6 e 8); (7) dichiarato il limite "Recenter a una mano è di M5" — motivo: risposta dell'utente alla domanda 2 (traslazione dentro M2, anche con una sola mano, senza conflitti con presa dei mobili e selezione delle stanze, limite 0,30 m, `ui:menu-recenter`).
