# S3.6 · Palmo in su e punto di pizzico dalle articolazioni della mano

**Milestone**: M3 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`) · **Regole di `CLAUDE.md`**: 1, 5 (feature detection), 9
Prerequisiti di implementazione: T3.2a (spike: costanti misurate), T3.2b (logica, sistema, integrazione). Vedi `docs/plans/M3.md`, D31 e "Esiti degli spike". Convenzioni comuni (pose, regola di gate): `qa/scenarios/M3-persistence.md`.

**Che cosa si prova qui**: la **sorgente** dei dati della mano (giunti `wrist`, metacarpi, punte di pollice e indice via `XRFrame.fillPoses`; riserva: `gripSpace`), il **palmo in su** calcolato dai giunti e il **punto di pizzico** (punto medio delle punte). Lo **stato** del pizzico resta quello degli eventi `selectstart/selectend` (D31). Questo scenario è l'unico che usa `pinch=auto` e `pinch=joints`; tutti gli altri scenari M3 usano `pinch=grip`.

## Precondizioni
- Costanti scritte dallo spike T3.2a in `docs/plans/M3.md` ("Esiti degli spike") e nella memoria `reference_hand_pose_sequences` di `emulator-qa`: `Q_UP_J` = orientamento della mano per cui la normale del palmo dai giunti è verticale (se coincide con `Q_UP` = `(0, −0,2588, 0,9659, 0)`, usare `Q_UP`); `D_JOINTS` = offset del punto medio delle punte rispetto alla posa impostata a orientamento identità (con `D_GRIP` = (−0,038; −0,003; +0,037) per `pinch=grip`); `PINCH_DIST_OPEN` e `PINCH_DIST_CLOSED` = distanze tra le punte con `select` 0 e 1. **Lo scenario non si esegue finché non sono scritte.** Se lo spike ha dichiarato il ripiego (giunti non leggibili in IWER, D31) si esegue solo il ramo B dei passi 1 e 7 e il resto è "non applicabile, ripiego dichiarato".
- `dev-params.local.txt` = `house=apartment-a&role=visitor&reset=1&seed=1&debug=1&pinch=auto`; preparazione standard; testa a (0; 1,6; 0); `O` = (0; 1,35; −0,45).
- Pose di menu come S2.1: `L_MENU` = (−0,25; 1,15; −0,20), `R_MENU` = (0,25; 1,15; −0,20).

## Passi
1. **Sorgente**: appena avviata la sessione con le mani, `browser_get_console_logs` con `pattern: "input source|feature|hands"` (con `since` del caricamento).
2. **Palmo in su dai giunti**: `hand-left` a `L_MENU` con `Q_UP_J`, attesa 0,9 s: `menu opened hand=left`; riga `[soglia:hands]` (ogni 2 s con `debug=1`) più recente: `source`, `palmDeg`. Palmo in giù (`(0, 0, 0, 1)`), attesa 1 s: `menu closed`. Stesso con `hand-right` a `R_MENU`.
3. **Punto di pizzico dai giunti**: menu aperto (sinistra), `ecs_query_entity` su `ui:menu-item-chair` con `["Transform"]` → `I`; destra a `I − D_JOINTS` con `(0, 0, 0, 1)`, `xr_select {device: "hand-right", duration: 0.3}` durante la quale si legge una riga `[soglia:hands]` (`point=`); log `pattern: "menu item picked|furniture grabbed|hands"`. Ripetere per `ui:menu-undo` (una voce della barra) e per un pezzo del plastico (posare un letto con `pinch=auto`: S2.2 con la costante `D_JOINTS`).
4. **Isteresi della distanza**: con `select` 0 e poi 1 su `hand-right` ferma, due letture di `[soglia:hands]` (campo `pinchDist`): aperta e chiusa. Nessun cambio di stato dell'app dipende dalla distanza (lo stato resta `selectstart/selectend`): `pinch right start/end` coincidono con `xr_set_select_value`.
5. **Riserva `pinch=grip`**: riscrivere `dev-params.local.txt` con `pinch=grip` (resto uguale), reload, accept, mani; `input source=grip hand=left reason=param`; aprire il menu con `Q_UP` e prendere `ui:menu-item-chair` con la costante `D_GRIP` come in S2.2: tutto come in M2.
6. **Riserva senza giunti**: con `pinch=auto`, `xr_set_connected` della mano destra a `false` (se lo strumento la scollega): nessuna `error`; riconnessione `true`: ritorna `input source=joints hand=right` (una volta per mano e sessione) e il menu funziona. Se `xr_set_connected` non rimuove la mano, il passo è "non applicabile" e `pinch=grip` (passo 5) copre il percorso.
7. **Regressione rapida con `pinch=auto`**: S2.1 verifiche 2, 3 e 8a; S2.2 (posare il letto in camera, `furniture placed … status=valid`); S2.5 (rotazione col tocco e col polso, **verificare le pose del polso con `D_JOINTS`**); S1.3 (etichetta stanza). Valgono le costanti di questo scenario; il report dichiara quale delle due serie (`D_GRIP` o `D_JOINTS`) è stata usata dove.
8. **Nessuna allocazione per fotogramma (revisione del codice)**: `grep -n "getJointPose\|new Float32Array\|new Vector3\|new Quaternion" src/systems/hand-joints.ts src/systems/pinch-input.ts src/systems/palm-menu.ts` da riga di comando: nessuna occorrenza dentro `update()`/`onXRFrame` (solo `fillPoses` con array preallocati); `grep -n "fillPoses" src/` almeno 1 occorrenza.
9. Log senza filtro (`error`, `Cannot read`, `feature`); pulizia come S3.0.

## Verifiche (tutte obbligatorie)
1. **Passo 1 (ramo A, giunti disponibili)**: `[soglia] input source=joints hand=left` e `… hand=right` (una volta per mano e sessione, nessuna ripetizione ogni fotogramma). **Ramo B (ripiego dichiarato)**: `[soglia] input source=grip hand=left reason=no-joints` e `right`, e nel report la dichiarazione "giunti non esercitati nell'emulatore" con la voce in `qa/device/DEBT.md`; in questo caso le verifiche 2-4 sono "non applicabili" e le 5, 7, 8 e 9 valgono.
2. **Palmo (ramo A)**: il menu si apre su entrambe le mani con `Q_UP_J` (`menu opened hand=left`, `hand=right`), e si chiude con il palmo in giù; `palmDeg` ≤ 10° nella posa in su (valore del campione, avviso se fino a 15°) e ≥ 120° in quella in giù; la riga `source=joints`. Aperture e chiusure rispettano le soglie (0,4 s, 0,25 s, 300 ms) come in S2.1 verifica 8.
3. **Punto di pizzico (ramo A)**: la voce `ui:menu-item-chair` è presa con la costante `D_JOINTS` (`furniture grabbed furniture:chair#1 source=menu hand=right`), il campo `point=` della riga `[soglia:hands]` dista **≤ 0,02 m** da `I` (entro il raggio di 5 cm per la presa) e lo scarto con la posa impostata è la costante `D_JOINTS` ± 0,005 m. Per la voce `ui:menu-undo` e per un pezzo del plastico (cornice entro 1,5 cm dall'impronta) la presa riesce con la stessa costante.
4. **Distanza (ramo A)**: `pinchDist` con `select` 0 > 0,03 m e con `select` 1 < 0,03 m (soglie 0,02/0,03 dell'isteresi); lo stato `pinch right start/end` non cambia fonte.
5. **`pinch=grip`**: `input source=grip hand=left reason=param`; il menu si apre con `Q_UP`; la presa con `D_GRIP` riesce come in M2 (`furniture grabbed …`). La riserva è identica al comportamento di M2.
6. **Disconnessione**: nessuna `error` né eccezione; alla riconnessione la sorgente torna `joints` (ramo A) e il menu risponde. Se non applicabile, il report lo dice.
7. **Regressione `pinch=auto`**: S2.1 verifiche 2, 3, 8a PASS; S2.2 PASS (letto in camera, `status=valid`); S2.5 PASS con le pose del polso ricalcolate; S1.3: `Living room & kitchen · 23.9 m²` (testo invariato).
8. **Revisione del codice**: nessuna occorrenza di `getJointPose` né allocazioni dentro `update()`/`onXRFrame` nei sistemi della mano; almeno una chiamata a `fillPoses` protetta da feature detection (`typeof frame.fillPoses === 'function'`, `inputSource.hand`).
9. Nessuna voce `error`; nessun `Missing glyph info`; nessun avviso `feature … unavailable` oltre a quelli previsti dal ramo B.
10. **Solo visore** (alta): `inputSource.hand` e `fillPoses` sul Quest; palmo in su affidabile dalla normale dei giunti; punto di pizzico preciso a 1:20; riserva sul `gripSpace` quando la mano si perde; le costanti di IWER non valgono sul visore.

## Esito
PASS se le verifiche 1-9 del ramo applicabile sono soddisfatte e il report dichiara il ramo (A o B) · FAIL altrimenti. Il ramo B non è un FAIL: è il ripiego previsto dallo spike di 45 minuti.

## Da rimandare al visore
Voce "Giunti" di M3 in `qa/device/DEBT.md` (alta). Aggiornare anche la voce di M2 sul `gripSpace` (R2) con l'esito.

## Changelog
- 2026-10-09: scenario creato dal piano M3 (D31).
