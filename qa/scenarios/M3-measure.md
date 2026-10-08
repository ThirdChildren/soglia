# S3.2 · Metro: misura la finestra dello studio

**Milestone**: M3 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`)
Prerequisiti di implementazione: T3.13, T3.14, T3.5 (scheda `measure`, `ui:menu-tab-measure`), T3.10 (claim `measure`). Vedi `docs/plans/M3.md`, D36. Convenzioni comuni (pose, `D_GRIP`, `Q_UP`, `W(...)`, regola di gate): `qa/scenarios/M3-persistence.md`.

## Precondizioni
- `dev-params.local.txt` = `house=apartment-a&role=visitor&reset=1&seed=1&debug=1&pinch=grip`; preparazione standard; testa a (0; 1,6; 0); `O` = (0; 1,35; −0,45); scala 0,05.
- Punti (pianta → mondo, `h` = 0,04, quindi y = Oy + 0,04 = 1,39): **finestra dello studio** `win-study` sul muro `w-north` (z = 0), da x = 9,0 a x = 10,4: `A1` = W(9,0; 0) = (0,175; 1,39; −0,630), `A2` = W(10,4; 0) = (0,245; 1,39; −0,630). **Larghezza interna della camera** (facce interne di `w-living-bedroom`, x = 5,26, e di `w-bedroom-study`, x = 8,34): `B1` = W(5,4; 2,3) = (−0,005; 1,39; −0,515), `B2` = W(8,2; 2,3) = (0,135; 1,39; −0,515) (entro 0,14 m di pianta dalle facce, dentro il raggio di aggancio di 0,24 m). **Punti liberi** nel soggiorno: `F1` = W(2,0; 2,3) = (−0,175; 1,39; −0,515), `F2` = W(3,0; 2,3) = (−0,125; 1,39; −0,515) (nessun angolo, estremo o faccia entro 0,24 m).
- Posa della mano per un punto `T`: `T − D_GRIP` = (Tx + 0,038; Ty + 0,003; Tz − 0,037), orientamento `(0, 0, 0, 1)`; pizzico = `xr_select {device: "hand-right", duration: 0.4}` (il punto si prende 150 ms dopo l'inizio, quindi la mano non deve muoversi per 0,3 s).
- Menu e scheda: `hand-left` a `L_MENU` con `Q_UP`, attesa 0,9 s; la scheda `ui:menu-tab-measure` si legge con `ecs_query_entity` `["Transform"]` e si preme con la destra (correzione del grip).

## Passi
1. **Prima**: `ecs_find_entities` con `^ui:measure-` (→ 0). Posare una sedia `chair` in soggiorno su `W(1,5; 3,0)` (S2.2: prendere dal menu, rilasciare), attesa 0,5 s.
2. **Attivare lo strumento**: aprire il menu, pizzico sulla scheda `measure`; log `pattern: "menu|measure"`. Chiudere il menu (palmo in giù, attesa 1 s). `ecs_find_entities` con `^ui:measure-hint$`, `ecs_query_entity` su `ui:measure-hint` con `["Transform"]`; `ui_inspect` sul pannello per il testo e il `fontSize`.
3. **Finestra dello studio**: pizzico in `A1`, attesa 0,5 s, pizzico in `A2`, attesa 1 s. Log `pattern: "measure"`; `ecs_find_entities` con `^ui:measure-`; `ecs_query_entity` su `ui:measure-label` con `["Transform"]`; `ui_inspect` sull'etichetta (testo, `fontSize`); `browser_screenshot` → allegare.
4. **Camera**: pizzico in `B1`, pizzico in `B2` (stesso ritmo). Log `pattern: "measure"`; `ui_inspect` dell'etichetta.
5. **Punti liberi**: pizzico in `F1`, pizzico in `F2`. Log `pattern: "measure"`.
6. **Il terzo pizzico ricomincia**: dopo il passo 5 (misura completa), un solo pizzico in `A1`: log, `ecs_find_entities` con `^ui:measure-` (il punto 2, il nastro e l'etichetta spariscono).
7. **Priorità con un pezzo e con la stanza**: con lo strumento attivo, pizzico sul **centro della sedia** `W(1,5; 3,0)` (pose del passo 1): log `pattern: "measure|furniture|room"`; pizzico in una stanza (`W(6,8; 2,3)`): nessuna selezione.
8. **Il menu resta sopra**: aprire il menu (sinistra), pizzico della destra su `ui:menu-undo` o su `ui:menu-tab-items` (con strumento attivo): log `pattern: "menu|measure|undo"`.
9. **Uscire**: con la scheda `items` attiva (passo 8) `ecs_find_entities` con `^ui:measure-`; log `pattern: "measure"`; poi prendere un pezzo dal menu e posarlo: la presa funziona di nuovo.
10. **Scala 0,12 (informativo)**: zoom a due mani fino a 0,12 (S1.2 fase C, mani `y = Oy + 0,10`), riattivare `measure`, misurare ancora la finestra con le pose ricalcolate da `W` alla scala letta (`O` + (pianta − centro)·0,12): l'aggancio funziona con raggio più piccolo (0,10 m di pianta); l'esito 140 ± 1 vale ancora.
11. Log senza filtro (`error`, `Cannot read`, `Missing glyph`); pulizia come S3.0.

## Verifiche (tutte obbligatorie)
1. **Passo 1**: 0 entità `ui:measure-*`; la sedia è posata.
2. **Passo 2**: righe `menu tab measure` e `measure start`; dopo la chiusura del menu esiste **1** `ui:measure-hint` con testo `Pinch two points` (da `src/ui/strings.ts`, `fontSize` ≥ 2,4 cm, ≥ 0,52 m dalla testa, ≤ 30° dall'asse, yaw-only) e nessuna entità `ui:measure-point-*`, `-tape`, `-label`. Nessun `room selected` né `furniture grabbed` per il pizzico sulla scheda.
3. **Finestra (S3.2 del ROADMAP)**: `measure point 1 plan=9.00,0.00 snap=opening-end target=window:win-study`, `measure point 2 plan=10.40,0.00 snap=opening-end target=window:win-study` (le coordinate di pianta ±0,01), `measure result cm=140 a=9.00,0.00 b=10.40,0.00` con **139 ≤ cm ≤ 141** (atteso esattamente 140). Esistono `ui:measure-point-1`, `ui:measure-point-2`, `ui:measure-tape` e `ui:measure-label` (una sola), il testo dell'etichetta è `140 cm` con `fontSize` ≥ 2,4 cm; l'etichetta è a ≥ 0,52 m dalla testa e a ≤ 30° dall'asse. Nessuna riga `room selected`, nessuna `furniture grabbed`.
4. **Camera**: due righe `measure point` con `snap=wall-face` (o l'etichetta equivalente scelta dall'implementazione, citata nel report) e `measure result cm=308` con **307 ≤ cm ≤ 309**; il nastro e le etichette precedenti sono sostituiti (al più 1 etichetta, 1 nastro).
5. **Punti liberi**: `snap=free` per entrambi e `cm=100` con **98 ≤ cm ≤ 102**.
6. **Terzo pizzico**: `measure point 1 …` nuovo, **0** `ui:measure-point-2`, **0** `ui:measure-tape`, **0** `ui:measure-label`; esiste solo `ui:measure-point-1`.
7. **Priorità**: il pizzico sulla sedia **non** produce `furniture grabbed` ma una riga `measure point …`; il pizzico nella stanza non produce `room selected`. Nessuna riga `furniture` nuova.
8. **Il menu resta sopra**: il pizzico su `ui:menu-undo` o sulla scheda produce la riga del menu (`undo …` / `menu tab items`) e **nessuna** `measure point`.
9. **Uscita**: dopo `menu tab items` esiste la riga `measure end`, **0** entità `ui:measure-*` (anche `ui:measure-hint`), e una presa dal menu produce `furniture grabbed … source=menu` (nessuna presa "di nascosto" disattivata).
10. **Scala 0,12**: `cm=140` ± 1 (avviso se fuori, perché dipende dalla precisione delle pose; il raggio è in metri del mondo: più si ingrandisce più si è precisi).
11. Nessuna voce `error` e nessun `Missing glyph info`; il valore è sempre un intero (nessun `NaN`, nessun decimale nelle righe `measure result`).

## Esito
PASS se le verifiche 1-9 e 11 sono soddisfatte (la 10 è informativa) · FAIL altrimenti.

## Da rimandare al visore
Misura precisa a mano libera a 1:20 (1 cm sul plastico = 20 cm reali, le dita che si chiudono muovono il punto), aggancio agli spigoli e alle finestre con le dita vere, leggibilità dell'etichetta e del nastro a 0,5-0,8 m, comodità del cambio di strumento (voce M3 in `qa/device/DEBT.md`). In scala reale il metro lavora solo con T3.15 (presa a distanza): senza, "scala reale: solo plastico" è dichiarato.

## Changelog
- 2026-10-09: scenario creato dal piano M3 (D36).
