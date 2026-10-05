# S2.5 · Rotazione a scatti di 90° (polso e tocco con l'altra mano)

**Milestone**: M2 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`)
Prerequisiti di implementazione: T2.6, T2.13, T2.14 (vedi `docs/plans/M2.md`, D13 e D19).

## Precondizioni
- Come S2.2: `dev-params.local.txt` = `house=apartment-a&role=visitor&reset=1&seed=1&debug=1`, reload, accept, mani, testa (0; 1,6; 0), O dall'ultima riga `miniature placed`, menu aperto (`hand-left` a `L_MENU` con `Q_UP`, tenuto in alto). `W(px, pz)` come in S2.2.
- Letto posato come in S2.2 a **P1** = (0,065; 1,39; −0,565) → (6,80; 1,125) rot 0. Centro del letto in mondo: `C0` = (0,065; 1,39; −0,574).
- Convenzione (D13/D19): `rotationDeg` orario visto dall'alto; la mano che gira come il pezzo; relativa alla presa (`rotationDeg = iniziale − torsione quantizzata`, torsione + = antiorario). Quaternioni di sola imbardata: −30° `(0, −0.2588190, 0, 0.9659258)`, −60° `(0, −0.5, 0, 0.8660254)`, −90° `(0, −0.7071068, 0, 0.7071068)`, +90° `(0, 0.7071068, 0, 0.7071068)`.
- Nota: `xr_set_transform` richiede sempre `orientation`; se `xr_animate_to` accetta `orientation` (da verificare, `docs/plans/M2.md` "Esiti degli spike") usarlo con 0,4 s a tappa al posto dei tre `xr_set_transform`.

## Passi
1. Posare il letto a **P1** (S2.2, passi 2–5). Leggere `furniture placed`.
2. **Polso, senso orario**: `hand-right` a `C0` con orientamento `(0, 0, 0, 1)`, select 1, attesa 0,3 s (log `furniture grabbed … source=model`). Poi, **senza spostare la posizione**, tre `xr_set_transform` di `hand-right` con le orientazioni −30°, −60°, −90°, con 0,3 s di attesa dopo ciascuno. Dopo ciascuno: `browser_get_console_logs` con `pattern: "furniture rotated"` e `ecs_query_entity` sul letto con `["Furniture"]`. `browser_screenshot` dopo −90° (letto ruotato, cornice di anteprima).
3. Rilascio (select 0, attesa 0,5 s). Log `furniture placed`, `ecs_query_entity` con `["Furniture"]`, stato.
4. **Polso, senso antiorario**: riprendere il letto al suo centro attuale `W(6,8; 0,925)` = (0,065; 1,39; −0,584), orientamento `(0, 0, 0, 1)`, select 1; `xr_set_transform` con +30°, +60°, +90° (stessa posizione, 0,3 s ciascuno); rilascio. Log e `Furniture`.
5. **Tocco con l'altra mano**: riprendere il letto (centro `W(6,8; 1,125)`), select 1 con la destra; `xr_select {device: "hand-left", duration: 0.2}`, attesa 0,4 s, log `furniture rotated`; secondo `xr_select` della sinistra, attesa 0,4 s, log; rilascio della destra. Log `furniture placed`, `Furniture`, stato.
6. Con il letto rilasciato: **controllo** che il tocco a mano libera non sia una presa: `xr_select {device: "hand-left", duration: 0.2}` sulla posizione del letto con la destra a riposo → `furniture grabbed` **compare** (è una presa normale con la sinistra, source=model) e va rilasciato con select 0 senza spostarlo; annotare il comportamento (non decide l'esito).
7. `browser_get_console_logs` senza filtro (cercare `error`).

## Verifiche (tutte obbligatorie)
1. Passo 2: dopo −30° **nessuna** riga `furniture rotated` (sotto la soglia di 50°); dopo −60° `[soglia] furniture rotated furniture:bed-double#1 rot=90`; dopo −90° nessun'altra riga (resta 90); in volo `Furniture.rotationDeg` = 90 e `outline` = `green`.
2. Passo 3: `furniture placed furniture:bed-double#1 room=bedroom x=6.80 z=0.93 rot=90 status=valid` (z = 0,925 ± 0,02: con l'impronta ruotata 2,0 × 1,6 il lato nord si aggancia al muro a z = 0,125 con centro a 0,925); `Furniture.rotationDeg` = 90 e `status` = `valid`; `historyLength` 2.
3. Passo 4: da 90° con la mano antioraria di 90° la rotazione torna a **0**: riga `furniture rotated … rot=0` dopo +60° e `furniture placed … x=6.80 z=1.13 rot=0 status=valid`.
4. Passo 5: primo tocco `rot=90`, secondo tocco `rot=180`; `furniture placed … x=6.80 z=1.13 rot=180 status=valid` (l'impronta di 180° è uguale a quella di 0°); **nessun** `furniture grabbed` prodotto dai tocchi dell'altra mano, nessun `miniature gesture start`, nessun `room selected`.
4b. Quattro tocchi consecutivi riportano alla rotazione di partenza (0 → 90 → 180 → 270 → 0): ripetere i tocchi con la destra che tiene e leggere le righe `rot=…` (verifica facoltativa se il tempo manca; va dichiarata nel report).
5. Passo 6: la presa con la sinistra è una presa normale (l'esito è annotato); il rilascio senza spostamento non cambia lo stato e non crea una voce di cronologia inutile (`historyLength` invariato oppure +1 con lo stesso stato: il report riporta quale).
6. Nessuna voce `error`; scala 0,05 e yaw 0 invariati nello store.
7. Screenshot del passo 2 allegato; il report descrive a parole l'orientamento del letto (lungo l'asse x quando ruotato di 90°) e la cornice verde.

## Esito
PASS se le verifiche 1–4 e 6 sono soddisfatte · FAIL altrimenti. Se `furniture rotated` non compare dopo −60°, ripetere **una sola volta** con −75° prima di −90° e riportare il valore effettivo della soglia (non decide l'esito se il tocco dell'altra mano passa).

## Da rimandare al visore
Affidabilità del polso (isteresi 50°/40°) con la mano vera, confronto con il tocco dell'altra mano, comodità della rotazione da seduti (voci M2 in `qa/device/DEBT.md`).
