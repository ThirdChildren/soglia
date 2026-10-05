# S2.3 · Collisione tra mobili: contorno rosso e ritorno al valido

**Milestone**: M2 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`)
Prerequisiti di implementazione: tutti quelli di S2.2 (`qa/scenarios/M2-place-bed.md`) più T2.4 (collisioni), la presa di un pezzo già nel plastico (T2.13) e **T2.9b** (etichetta del motivo, verifica 10). Decisioni D14, D16, D27 di `docs/plans/M2.md`: un pezzo non valido **resta nel plastico** con la cornice rossa e un'etichetta che spiega il motivo.

## Precondizioni
- Come S2.2: `dev-params.local.txt` = `house=apartment-a&role=visitor&reset=1&seed=1&debug=1`, reload, accept, mani, testa (0; 1,6; 0), O dall'ultima riga `miniature placed` (atteso (0; 1,35; −0,45)), menu aperto con `hand-left` a `L_MENU` e `Q_UP` e **tenuto in alto per tutto lo scenario**. `W(px, pz) = (Ox + (px − 5,5)·0,05; Oy + 0,04; Oz + (pz − 3,6)·0,05)`.
- Punti (O = (0; 1,35; −0,45), y = 1,39):
  - **PW** (armadio) = `W(7,4; 0,55)` = (0,095; 1,39; −0,6025) → atteso agganciato a (7,44; 0,425) nell'angolo nord-est della camera.
  - **PB1** (letto, posa valida) = `W(6,0; 3,0)` = (0,025; 1,39; −0,480) → atteso (6,06; 3,00) a filo con il muro ovest della camera.
  - **PB2** (letto, sull'armadio) = `W(7,0; 1,2)` = (0,075; 1,39; −0,570) → atteso (7,00; 1,125), sovrapposto all'armadio.
- Le voci `wardrobe` (pagina 2) e `bed-double` (pagina 1) si raggiungono con `ui:menu-page-next` / `ui:menu-page-prev` (pizzico breve `xr_select {device: "hand-right", duration: 0.2}` sulla loro posizione).

## Passi
1. Menu aperto. `ui:menu-page-next` → pagina 2. **Armadio**: `ecs_query_entity` su `ui:menu-item-wardrobe` (Transform) → `I`; `hand-right` a `I` (orientamento `(0, 0, 0, 1)`), `xr_set_select_value` 1, attesa 0,3 s, `xr_animate_to` a **PW** (0,8 s), attesa 1 s, `xr_set_select_value` 0, attesa 0,5 s. Log `pattern: "furniture"` e `ecs_query_entity` su `furniture:wardrobe#1` con `["Furniture"]`.
2. `ui:menu-page-prev` → pagina 1. **Letto in posa valida**: stessa procedura con `ui:menu-item-bed-double` fino a **PB1**. Log e `ecs_query_entity` su `furniture:bed-double#1`.
3. **Spingere il letto contro l'armadio**: `hand-right` al centro del letto, `W(6,06; 3,0)` = (0,028; 1,39; −0,480), orientamento `(0, 0, 0, 1)`, select 1, attesa 0,3 s (log `furniture grabbed … source=model`). `xr_animate_to` a **PB2** (0,8 s), attesa 1 s. **In volo**: `ecs_query_entity` su `furniture:bed-double#1` con `["Furniture"]`; log `pattern: "furniture status|reason"`; `ecs_find_entities` con `namePattern: "^ui:reason-"` e `ecs_query_entity` sull'etichetta trovata con `["Transform"]`. `browser_screenshot` (cornice rossa **e etichetta del motivo**).
4. Rilascio (`xr_set_select_value` `hand-right` = 0, attesa 0,5 s). Log `pattern: "furniture placed|furniture status|reason"`; `ecs_query_entity` con `["Furniture"]` sul letto e sull'armadio; riga `[soglia:state]` più recente; `ecs_find_entities` con `^ui:reason-`. `browser_screenshot` (letto appoggiato con cornice rossa persistente e etichetta del motivo ancora visibile).
5. **Spostalo → valido**: ripetere la presa del letto (centro attuale `W(7,0; 1,125)` = (0,075; 1,39; −0,574)), `xr_animate_to` a **PB1**, rilascio. Log `pattern: "furniture placed|furniture status|reason"`; `ecs_query_entity` sul letto; `ecs_find_entities` con `^ui:reason-`.
6. Controllo finale: `ecs_find_entities` con `namePattern: "^furniture:"` e `"^ui:reason-"`; `browser_get_console_logs` senza filtro (cercare `error`).

## Verifiche (tutte obbligatorie)
1. Passo 1: `furniture placed furniture:wardrobe#1 room=bedroom x=7.44 z=0.43 rot=0 status=valid` (x = 7,44 ± 0,02, z = 0,425 ± 0,02: dal passo di aggancio all'angolo); `Furniture.status` = `valid`.
2. Passo 2: `furniture placed furniture:bed-double#1 room=bedroom x=6.06 z=3.00 rot=0 status=valid` (x = 6,06 ± 0,02, z = 3,00 ± 0,02); `outline` = `none`; nessuna riga `furniture status … invalid` finora.
3. Passo 3 (in volo): `Furniture.status` = `invalid`, `outline` = `red`; riga `[soglia] furniture status furniture:bed-double#1 status=invalid reasons=overlaps-furniture with=furniture:wardrobe#1` (i motivi **non** contengono `overlaps-wall`).
4. Passo 4: `furniture placed furniture:bed-double#1 room=bedroom x=7.00 z=1.13 rot=0 status=invalid` (x = 7,00 ± 0,02, z = 1,125 ± 0,02); `phase` = `placed`, `status` = `invalid`, `outline` = `red` **persistente** dopo il rilascio; il letto resta nello store (`furniture` ha 2 elementi). L'armadio resta `valid`.
5. Passo 5: `furniture status furniture:bed-double#1 status=valid reasons=-` e `furniture placed … x=6.06 z=3.00 … status=valid`; `Furniture.status` = `valid`, `outline` = `none`.
6. Passo 6: esattamente **2** entità `furniture:*` (`furniture:wardrobe#1`, `furniture:bed-double#1`); `[soglia:state]`: `nextInstance` `{"wardrobe":2,"bed-double":2}` e `historyLength` 4 (due pose e due spostamenti).
7. Nessuna riga `room selected`/`room deselected`, nessun `miniature gesture start`; scala 0,05 e yaw 0 invariati nello store.
8. Nessuna voce `error`.
9. Screenshot dei passi 3 e 4 allegati; il report dice a parole che il contorno è **rosso** quando il letto si sovrappone all'armadio e che scompare quando il letto torna in posa valida.
10. **Motivo leggibile (D27, T2.9b)**:
    a. Passo 3 (in volo): esiste **1** entità `ui:reason-bed-double#1` e la riga `[soglia] reason shown furniture:bed-double#1 "Overlaps the wardrobe"` (testo **esatto**, in inglese, nome minuscolo dal catalogo); la sua posizione è a **≤ 0,65 m dalla testa** e a `y ≥ Oy + 0,04` (sopra il pezzo); lo screenshot mostra l'etichetta vicino al letto, leggibile, **senza testo italiano**.
    b. Passo 4 (dopo il rilascio): l'etichetta resta (**1** entità `ui:reason-bed-double#1`, nessuna nuova riga `reason hidden`) finché il pezzo è `invalid`; l'armadio, valido, non ne ha (`ui:reason-wardrobe#1` assente); i motivi nel log di stato sono solo `overlaps-furniture` (il testo non dice mai "wall").
    c. Passo 5 (di nuovo valido): **0** entità `ui:reason-*` e la riga `[soglia] reason hidden furniture:bed-double#1`.
    d. Passo 6: **0** entità `ui:reason-*` alla fine; mai più di **3** etichette contemporanee in tutto lo scenario (qui ne esiste al massimo 1).

## Esito
PASS se le verifiche 1–8 e 10 sono soddisfatte · FAIL altrimenti. Se la presa del letto già posato non parte, ripetere **una sola volta** con la mano a ≤ 0,02 m dal centro e riportare lo scarto.

## Da rimandare al visore
Visibilità del contorno rosso/verde a 0,5–0,8 m, leggibilità dell'etichetta del motivo su un pezzo a scala 1:20, presa di un pezzo già posato con le dita vere, precisione dell'aggancio ai muri e tra pezzi a scala 1:20 (voci M2 in `qa/device/DEBT.md`).

## Changelog
- 2026-10-05: aggiunta la **verifica 10** (motivo leggibile dei pezzi non validi, D27) con i passi 3–6 estesi (`ui:reason-*`, riga `reason shown … "Overlaps the wardrobe"`, distanza ≤ 0,65 m dalla testa, persistenza dopo il rilascio, scomparsa al ritorno valido, tetto di 3 etichette) e la sezione Esito aggiornata — motivo: decisione dell'utente 7 (i pezzi non validi restano nel plastico con cornice rossa e il motivo deve essere leggibile).
