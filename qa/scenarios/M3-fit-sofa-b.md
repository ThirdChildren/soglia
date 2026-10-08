# S3.4 · Lo stesso divano passa in casa B

**Milestone**: M3 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`)
Prerequisiti di implementazione: gli stessi di S3.3 (T3.5, T3.7, T3.8, T3.9). Vedi `docs/plans/M3.md`, D34. Convenzioni comuni (pose, `D_GRIP`, `Q_UP`, regola di gate): `qa/scenarios/M3-persistence.md`; sequenze di presa e letture: `qa/scenarios/M3-fit-sofa-a.md`.

## Precondizioni
- `dev-params.local.txt` = `house=apartment-b&role=visitor&reset=1&seed=1&debug=1&pinch=grip`; preparazione standard; testa a (0; 1,6; 0), `O` = (0; 1,35; −0,45), scala 0,05.
- **Conversione per la casa B**: `W_B(px, pz, h)` = (Ox + (px − 4,0)·0,05; Oy + h; Oz + (pz − 3,45)·0,05), con il centro (4,0; 3,45) della pianta di B (muri da (0,0) a (8; 6,9)); **da confermare** leggendo il `Transform` locale di `house:apartment-b` (deve valere −centro, cioè (−4,0; ·; −3,45)): se differisce, il report dà il centro letto e usa quello.
- Dati reali (D34): porte di B tutte 0,90 m (`d-entrance`, `d-living`, `d-bedroom`) tranne `d-bathroom` 0,80 m; percorso `door:d-entrance` → `door:<stanza>`; `my-sofa` lato minimo 0,85; `my-bed` 0,95.
- Punti (y = 1,39): `P_LIV_B` = W_B(2,0; 1,5) = (−0,100; 1,39; −0,5475); `P_HALL_B` = W_B(5,3; 5,5) = (0,065; 1,39; −0,3475); `P_BEDR_B` = W_B(6,4; 2,1) = (0,120; 1,39; −0,5175); `P_BATH_B` = W_B(1,3; 5,5) = (−0,135; 1,39; −0,3475). Pose della mano `P − D_GRIP`.

## Passi
1. Menu aperto, scheda "mine" (S3.3 passo 1). `ecs_find_entities` con `^ui:menu-item-`; `ecs_query_entity` su `house:apartment-b` con `["Transform"]`.
2. **Divano nel soggiorno**: presa di `ui:menu-item-my-sofa`, trasporto a `P_LIV_B − D_GRIP`, attesa 0,6 s, senza rilasciare. Letture: log `pattern: "fit|furniture"`; `ecs_find_entities` con `^ui:fit-`; `FitMarker` di ogni marcatore; `Furniture` del pezzo; `ui_inspect` su `ui:fit-label`; `browser_screenshot` → allegare. Rilascio (`furniture placed … status=valid`).
3. **Divano nel corridoio**: nuova presa, `P_HALL_B`, attesa 0,6 s: log `pattern: "fit"`. Rilascio fuori dalla casa (POUT1 = (0,463; 1,393; −0,487), `furniture returned`).
4. **Divano nel bagno (porta di 80 cm)**: nuova presa, `P_BATH_B`, attesa 0,6 s: log `pattern: "fit"`, etichetta, marcatori. Rilascio fuori dalla casa.
5. **Letto verso la camera**: presa di `my-bed`, `P_BEDR_B`, attesa 0,6 s: log, etichetta. Rilascio fuori.
6. **Confronto A/B**: riscrivere `dev-params.local.txt` con `house=apartment-a`, stessi parametri, reload, accept, mani; ripetere solo il passo 2 con `P_LIV` di S3.3 (soggiorno di A): log `pattern: "fit"`. Il report mette le due righe `fit furniture:my-sofa#1 …` una accanto all'altra.
7. Log senza filtro (`error`, `Missing glyph`); pulizia come S3.0.

## Verifiche (tutte obbligatorie)
1. **Passo 2 (S3.4 del ROADMAP)**: `[soglia] fit furniture:my-sofa#1 room=living status=fits route=door:d-entrance,door:d-living` e `fit label shown furniture:my-sofa#1 "Fits: the narrowest door on the way is 90 cm wide"`; `Furniture.fit` = `fits`, `fitDoor` vuoto; marcatori `ui:fit-marker-d-entrance` e `ui:fit-marker-d-living` **entrambi** `pass`; seconda riga `Simplified check`; testo ≥ 2,4 cm, etichetta a 0,52-0,80 m dalla testa e entro 30°. **Nessuna** riga `fit … status=blocked` per questo pezzo.
2. **Passo 3**: `fit furniture:my-sofa#2 room=hall status=fits route=door:d-entrance`, etichetta `Fits: the narrowest door on the way is 90 cm wide`.
3. **Passo 4**: `fit furniture:my-sofa#… room=bathroom status=blocked door=door:d-bathroom reason=door-too-narrow route=door:d-entrance,door:d-bathroom` con etichetta `Won't fit: the door is 80 cm wide, the sofa's shortest side is 85 cm`; marcatore `d-bathroom` `block`, `d-entrance` `pass`.
4. **Passo 5**: `fit furniture:my-bed#1 room=bedroom status=disassembled door=door:d-entrance …` e `Fits when disassembled: the door is 90 cm wide, the bed's shortest side is 95 cm`.
5. **Passo 6 (stesso pezzo, due case)**: in A la riga ha `status=blocked door=door:d-living`, in B `status=fits`: il FitCheck dipende dai dati della casa, non dal pezzo (S3.3 verifica 2 e S3.4 verifica 1).
6. Nessuna riga `fit` contiene `blocks-door`; nessuna voce `error`; nessun `Missing glyph info`.
7. Screenshot del passo 2 allegato e descritto a parole (marcatori verdi, etichetta leggibile).

## Esito
PASS se le verifiche 1-7 sono soddisfatte · FAIL altrimenti.

## Da rimandare al visore
Come S3.3 (leggibilità a 0,5-0,8 m e nel campo visivo stretto).

## Changelog
- 2026-10-09: scenario creato dal piano M3 (D34).
