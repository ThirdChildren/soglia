# S3.5 · Sedia a rotelle e passeggino

**Milestone**: M3 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`) · **Regola di `CLAUDE.md`**: 9 (accessibilità)
Prerequisiti di implementazione: T3.5 (scheda `fit`), T3.7, T3.8, T3.9. Vedi `docs/plans/M3.md`, D34. Convenzioni comuni (pose, `D_GRIP`, `Q_UP`, regola di gate): `qa/scenarios/M3-persistence.md`; sequenze di presa e letture: `qa/scenarios/M3-fit-sofa-a.md`.

## Precondizioni
- Casa A: `dev-params.local.txt` = `house=apartment-a&role=visitor&reset=1&seed=1&debug=1&pinch=grip`; preparazione standard; testa a (0; 1,6; 0), `O` = (0; 1,35; −0,45), scala 0,05.
- Dati (D34, `public/catalog/catalog.json`, `kind: mobility`, nessun modello: ripiego a blocco): `wheelchair` larghezza 0,70 → necessari 0,70 + 2 × 0,05 = **0,80 m** (nessun centimetro di tolleranza, solo 1e-9); `stroller` larghezza 0,60 → **0,70 m**. Porte di A: `d-entrance` 0,90, `d-living` 0,80, `d-bedroom` 0,80, `d-study` 0,80, `d-bathroom` 0,75; B: tutte 0,90 tranne `d-bathroom` 0,80.
- Punti A (y = 1,39): `P_BATH` = W(1,3; 5,9) = (−0,210; 1,39; −0,335) (bagno); `P_LIV` = W(2,0; 1,5) = (−0,175; 1,39; −0,555); `P_STUDY` = W(9,7; 2,3) = (0,210; 1,39; −0,515). Punto B: `P_BATH_B` = W_B(1,3; 5,5) = (−0,135; 1,39; −0,3475) (centro di B (4,0; 3,45), vedi S3.4).
- Menu: scheda `fit` (pizzico su `ui:menu-tab-fit`).

## Passi
1. **Scheda "fit"**: menu aperto, pizzico su `ui:menu-tab-fit`; `ecs_find_entities` con `^ui:menu-item-`; log `pattern: "menu"`. Verificare che la scheda `items` ha ancora 14 voci in 3 pagine (`ui:menu-tab-items`).
2. **Sedia a rotelle verso il bagno di A (S3.5 del ROADMAP)**: presa di `ui:menu-item-wheelchair`, trasporto a `P_BATH − D_GRIP`, attesa 0,6 s, senza rilasciare. Letture: log `pattern: "fit|furniture"`; `ecs_find_entities` con `^ui:fit-`; `FitMarker` di ogni marcatore; `Furniture` del pezzo; `ui_inspect` su `ui:fit-label`; `browser_screenshot` → allegare. Rilascio nel bagno (`furniture placed … room=bathroom`), poi `ecs_find_entities` con `^furniture:`.
3. **Passeggino verso lo stesso bagno**: scheda "fit", presa di `ui:menu-item-stroller`, trasporto a `P_BATH − D_GRIP` spostato di +0,06 m in x (per non sovrapporsi alla sedia), attesa 0,6 s, senza rilasciare: log `pattern: "fit"`, etichetta, marcatori. Rilascio fuori dalla casa (POUT1 = (0,463; 1,393; −0,487)).
4. **Sedia a rotelle verso il soggiorno e lo studio (bordo esatto)**: presa di nuovo `wheelchair`, `P_LIV − D_GRIP`, attesa 0,6 s: log; poi (stessa presa) `xr_animate_to` a `P_STUDY − D_GRIP`, attesa 0,6 s: log. Rilascio fuori.
5. **Casa B**: riscrivere `dev-params.local.txt` con `house=apartment-b`, reload, accept, mani; presa di `wheelchair`, `P_BATH_B − D_GRIP`, attesa 0,6 s: log, etichetta; rilascio fuori.
6. **Pezzi normali**: tornare in A (file con `house=apartment-a`, `reset=1`), posare `wheelchair` nel bagno e `stroller` in soggiorno: `ecs_find_entities` con `^furniture:` (id `furniture:wheelchair#1`, `furniture:stroller#1`); prova di collisione: portare la sedia a rotelle sopra il passeggino già posato → riga `furniture status … reasons=overlaps-furniture with=furniture:stroller#1` (le sedute rispettano la regola dei pezzi, D34).
7. Log senza filtro (`error`, `Missing glyph`); pulizia come S3.0.

## Verifiche (tutte obbligatorie)
1. **Passo 1**: `menu tab fit` e `menu page 1/1 tab=fit items=wheelchair,stroller`; **2** entità `ui:menu-item-wheelchair` e `ui:menu-item-stroller`; la scheda `items` mantiene 14 voci (`menu page 1/3 …` come in S2.1).
2. **Passo 2**: `[soglia] fit furniture:wheelchair#1 room=bathroom status=blocked door=door:d-bathroom reason=door-too-narrow route=door:d-entrance,door:d-bathroom` e `fit label shown furniture:wheelchair#1 "Won't fit: the door is 75 cm wide, the wheelchair needs 80 cm"` (testo esatto); seconda riga `Simplified check`; marcatore `ui:fit-marker-d-bathroom` `block`, `ui:fit-marker-d-entrance` `pass`; etichetta a 0,52-0,80 m dalla testa, entro 30°, yaw-only, testo ≥ 2,4 cm. Il pezzo è un pezzo normale: dopo il rilascio `furniture placed furniture:wheelchair#1 room=bathroom … status=valid`.
3. **Passo 3**: `fit furniture:stroller#1 room=bathroom status=fits route=door:d-entrance,door:d-bathroom` e `Fits: the narrowest door on the way is 75 cm wide` (0,60 + 0,10 = 0,70 ≤ 0,75).
4. **Passo 4 (bordo esatto)**: la sedia a rotelle verso il soggiorno e verso lo studio dà `status=fits` con `Fits: the narrowest door on the way is 80 cm wide` (0,70 + 0,10 = 0,80 ≤ 0,80 con tolleranza numerica; **non** una tolleranza di 1 cm: quella vale solo per i mobili, e il test unitario `fit-check.test.ts` verifica 0,79 → blocca).
5. **Passo 5 (B)**: `fit furniture:wheelchair#… room=bathroom status=fits` con `Fits: the narrowest door on the way is 80 cm wide` (`d-bathroom` di B è 0,80).
6. **Passo 6**: `furniture:wheelchair#1` e `furniture:stroller#1` presenti; la sovrapposizione produce `overlaps-furniture` con l'etichetta del motivo "Overlaps the stroller" (D27) **in aggiunta** a quella del FitCheck (non la nasconde): le due etichette coesistono (`ui:reason-wheelchair#…` e `ui:fit-label`), a ≥ 0,52 m e entro 30°.
7. Nessuna riga `fit` con `blocks-door`; nessuna voce `error`; nessun `Missing glyph info`.
8. Screenshot del passo 2 allegato e descritto a parole.
9. **Solo visore**: la sedia a rotelle e il passeggino sono blocchi (nessun modello CC0 verificato): riconoscibili dal nome e dal messaggio, non dal disegno (voce M3 in `qa/device/DEBT.md`, priorità media).

## Esito
PASS se le verifiche 1-8 sono soddisfatte · FAIL altrimenti.

## Da rimandare al visore
Come S3.3; in più, la leggibilità del blocco della sedia a rotelle a 1:20 e se serve un modello (decisione dell'utente, nessun asset non CC0).

## Changelog
- 2026-10-09: scenario creato dal piano M3 (D34).
