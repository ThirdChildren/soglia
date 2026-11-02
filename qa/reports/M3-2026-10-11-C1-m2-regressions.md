# Gate PC M3 · parte C1 · regressioni di M2 (S2.0-S2.9)

Data: 2026-10-11 · Ambiente: cloud (Linux, SwiftShader, runtime IWER headless già avviato) · HEAD `1a65465`
Esecutore: emulator-qa (Sonnet 5.5). Rendering software: gli fps non sono significativi.

## Tabella scenari (aggiornata dopo ogni scenario)

| Scenario | Scheda | Modalità pinch | Esito | Note |
|---|---|---|---|---|
| S2.0 | M2-glyphs | n/d (`pinch=grip` nella seconda parte) | **PASS** | 0 `Missing glyph info`, `font ready` 512x512, etichette con `·` e `²`, 0 error/warn, `npm test` 4465 verdi |
| S2.1 | M2-palm-menu | grip (completo) + auto (giro ridotto: vedi sotto) | **PASS** (grip) | passi 1-14 completi con `pinch=grip`; 0 error/warn; AVVISI per cambi intenzionali di M3 (vedi sezione) |
| S2.2 | M2-place-bed | grip (completo) + auto (giro ridotto) | **PASS** | letto in `bedroom` x=6.80 z=1.125 con entrambe le modalita'; AVVISO: etichetta FitCheck (M3) copre il letto in volo |
| S2.3 | M2-collision | grip | **PASS** | armadio 7.44/0.42, letto 6.06/3.00 valido, sull'armadio `invalid` + `Overlaps the wardrobe`, di nuovo valido; AVVISO: etichetta FitCheck coesiste |
| S2.4 | M2-undo | grip | **PASS** | `undo action=move`, `undo action=place`, `undo empty`, nuovo id `furniture:bed-double#2`, `nextInstance {"bed-double":3}` |
| S2.5 | M2-rotate | grip (completo) + auto (giro ridotto) | **PASS** (grip) | -60 deg -> `rot=90`, +60/+90 -> `rot=0`, 4 tocchi 0->90->180->270->0, `placed ... rot=180`; AUTO: vedi sezione |
| S2.6 | M2-door-blocked | grip | **PASS** con AVVISO di procedura | in volo `blocks-door`, `Blocks the door`, 2a poltrona valida, 1a spostata valida 6.80/2.50, vecchio-su-nuovo `overlaps-furniture with=furniture:armchair#2`; AVVISO: con il menu aperto il pizzico al centro della stanza e' preso dal pulsante Recenter |
| S2.7 | M2-return-to-catalog | grip | **PASS** | `returned ... from=menu` / `from=model`, `undo empty`, `undo action=remove`, `Outside the house` a 0,600 m / 11,5 deg |
| S2.8 | M2-budget | grip | **PASS** (con AVVISI numerici) | max 67 chiamate per vista (<= 100), 31,2k triangoli (<= 150k), 0 error; costo del menu +9; blocchi `failmodels=1` 54 chiamate/vista |
| S2.9 | M2-translate-miniature | grip | **PASS** con AVVISI | passi 1-9 PASS; zoom a 0,12 (mani a z = -0,237), trascinamento due mani con clamp 0,30 m, rotazione `yawDeg=90.0 tiltDeg=0.0`; AVVISI: root dopo lo zoom a z = -0,75 e `translated x=0.166 z=-0.250` invece di `x=0.200` (conseguenze della ricetta di zoom, non difetti) |

(Sezioni per scenario, FAIL, avvisi, differenze dovute a M3, limiti e trappole: sotto, riempite man mano.)

## S2.0 · Glifi del font (PASS)

Opzione A (atlante Inter) già adottata in M2: vale la parte B. Caricamento 1: `house=apartment-a&role=visitor&reset=1&seed=1&debug=1&glyphs=1`; caricamento 2 (etichette): senza `glyphs=1`, con `pinch=grip`.

| # | Verifica | Esito | Dato |
|---|---|---|---|
| 1 | 1 entità `ui:glyph-test` | PASS | `ecs_find_entities ^ui:glyph-test$` -> `total: 1` (entityIndex 1; componenti Transform, Visibility, LevelTag, StableId, PanelUI, Follower, PanelDocument) |
| 5 | 0 `Missing glyph info`; `font ready` con W,H <= 1024 | PASS | filtro `Missing glyph` vuoto nel caricamento corrente (ts 1791732635591); `[soglia] font ready family=inter weight=normal atlas=512x512 glyphs=111` e `... weight=bold atlas=512x512 glyphs=111`; `[soglia] glyph test shown id=ui:glyph-test` |
| 6 | testi delle etichette | PASS | `[soglia] label shown "Living room & kitchen · 23.9 m²"` e `[soglia] label shown "Study · 12.0 m²"` (con `room selected living area=23.9` / `room selected study area=12.0`) |
| 7 | screenshot | PASS | `M3-gate-C1-S2.0-glyph-test.png`: pannello con tre righe, `m² ² · × ° − ± → ≈` in regolare e in grassetto e `ABC abc 0123456789 %§°`, nessun quadrato pieno; `M3-gate-C1-S2.0-label-living.png`: etichetta del soggiorno con `·` e `m²` leggibili, sopra il plastico, con il suggerimento "Palm up for the menu" |
| 8 | texture dell'app <= 4, ciascuna <= 1024; niente `budget exceeded`; niente error | PASS | texture dell'app = i due atlanti 512x512; `[soglia:stats] ... textures=7` (con `glyphs=1`, come in M2 rerun3) e `textures=8` con etichetta e suggerimento (UIKit del pannello, framework); 0 righe `budget exceeded`; `level=[error,warn]` vuoto dal caricamento |
| 9 | CDN | PASS | nessuna riga `Failed to load`/`404` (filtro errori/avvisi vuoto) |
| 10 | licenza e crediti | PASS | `public/fonts/` = `OFL.txt`, `inter-bold.{json,png}`, `inter-regular.{json,png}`; `CREDITS.md:11` riga `font-inter-msdf`; `docs/RULES.md` righe 47-53 (seconda eccezione OFL 1.1); `npm test`: 75 file, 4465 test verdi |

Parte A (audit storico): non rieseguita come audit; la tabella degli otto caratteri e' coerente: nessun `Missing glyph info` per `² · × ° − ± → ≈` (tutti disponibili). Nessun cambiamento dovuto a M3.

## S2.1 · Menu del palmo (pinch=grip, scenario completo)

Parametri: `house=apartment-a&role=visitor&reset=1&seed=1&debug=1&pinch=grip` (log `params source=dev-file ... pinch=grip`, ts 1791733036932 per il caricamento dei passi 11-14; ts 1791732741469 per i passi 1-10). Testa (0; 1,6; 0). `Q_UP` = (0, -0.2588, 0.9659, 0). O = (0; 1,35; -0,45). Il file `dev-params.local.txt` non contiene `time=`.

| # | Verifica | Esito | Dato oggettivo |
|---|---|---|---|
| 1 | Passo 1: 0 `ui:palm-menu` e 0 voci | PASS con AVVISO | 0 `ui:palm-menu`, 0 `ui:menu-item-*`, 0 undo/prev/next/recenter; il pattern `^ui:(palm-menu\|menu-)` trova pero' 2 entita': `ui:menu-button-left` (indice 44) e `ui:menu-button-right` (45), i pulsanti Menu di M3 (intenzionali, hanno `PanelUI`) |
| 2 | Passo 3: 1 `ui:palm-menu`, `menu opened`, `catalog loaded`, 6 voci in ordine, 4 pulsanti | PASS con AVVISO | `[soglia] menu opened hand=left mode=palm` (AVVISO: suffisso `mode=palm` di M3, voluto); `[soglia] catalog loaded items=16 furniture=14 mobility=2` (identico a M2; nel catalogo unito di M3 la scheda `items` ha ancora 14 voci); 1 `ui:palm-menu` (indice 50, con `PanelUI`); 6 voci `ui:menu-item-` con `MenuItem.catalogId` = bed-double, bed-single, sofa-3seat, armchair, table-dining, chair; 1 `ui:menu-undo`, 1 `-page-prev`, 1 `-page-next`, 1 `-recenter`; in piu' (M3) 4 `ui:menu-tab-items/-mine/-fit/-measure`; nessuna voce `wheelchair`/`stroller` nella scheda `items`; le ancore non hanno `PanelUI` (lista componenti: Transform, Visibility, LevelTag, StableId, MenuItem). `src/ui/strings.ts` righe 38-41: `undo: 'Undo'`, `previous: 'Back'`, `next: 'Next'`, `recenter: 'Recenter'`; lo screenshot mostra icona + testo per tutti e quattro |
| 3 | Distanza 0,50-0,65 m e voci distinte | PASS | calcolata dal Transform con testa (0; 1,6; 0): palm-menu 0,534; bed-double 0,585; bed-single 0,585; sofa 0,546; armchair 0,546; table-dining 0,520; chair 0,520; undo 0,520; prev 0,505; next 0,501; recenter 0,515 (tutti 0,50-0,59); schede 0,625-0,629 (AVVISO numerico: le schede di M3 stanno a 0,63 m, entro 0,65). Distanza tra voci vicine: 0,18 m in x, 0,083 m in y (>= 0,06) |
| 3b | Cono centrale 30 deg | PASS | `[soglia] menu view maxAngleDeg=30.0 distance=0.50`; angoli dai Transform: palm-menu 2,0; voci 9,2-14,7; undo 24,8; prev 20,4; next 19,1; recenter 22,9; tab 16,6-18,3 (tutti <= 30) |
| 4 | Pagine | PASS | `menu page 2/3 items=coffee-table,desk,bookcase,wardrobe,nightstand,tv-stand`, poi `menu page 3/3 items=rug,plant`, il terzo `next` non produce nessuna nuova riga, `prev` -> `menu page 2/3 items=coffee-table,desk,bookcase,wardrobe,nightstand,tv-stand`; indice di `ui:palm-menu` = 50 prima e dopo ogni cambio; nessun `menu closed` tra passo 5 e 6; 6 voci (pagina 2), 2 voci `rug`, `plant` (pagina 3) |
| 5 | Chiusura | PASS | `[soglia] menu closed mode=palm via=palm` (ts 1791732808131); 0 `ui:palm-menu`, 0 voci (restano solo i 2 pulsanti Menu) |
| 6 | Destra | PASS | `menu opened hand=right mode=palm` (ts 1791732820758), 1 `ui:palm-menu`; poi chiusura |
| 7 | Entrambe | PASS | 1 sola `ui:palm-menu`, una sola riga `menu opened hand=left mode=palm` (ts 1791732840226) |
| 8a | Stessa mano che pizzica | PASS | T_a1: `pinch left start` (ts ...855456), 0 `ui:palm-menu`, nessun `menu opened` dopo; T_a2: `pinch left end` ts 1791732868906, `menu opened hand=left mode=palm` ts 1791732869696: delta **0,790 s**, 1 entita' |
| 8b | Pizzico dell'altra mano | PASS | `pinch right start` ts ...889020, `menu opened hand=left` ts ...889723 con la destra che pizzica; 1 entita'; dopo `pinch right end` (...901082) ancora 1 entita', nessun `menu closed` |
| 8c | Pezzo in mano | PASS | T_c0: `menu item picked id=bed-double hand=right` (riga nuova di M3), `furniture grabbed furniture:bed-double#1 source=menu hand=right`, `furniture status ... status=invalid reasons=outside-house`, 1 `ui:palm-menu`, nessun `menu closed`; chiusura esplicita: `menu closed mode=palm via=palm` (ts ...918430); T_c1 (palmo su 1,5 s): 0 entita', nessun `menu opened`, `Furniture.phase`=`held`, `hand`=`right`, `roomId`=""; T_c2: `pinch right end` ts 1791732937256, `furniture returned furniture:bed-double#1 from=menu` (stesso ts +1 ms), `menu opened hand=left mode=palm` ts 1791732938135: delta **0,879 s** |
| 8d | `pan` attivo | PASS | `pan start hand=right` ts ...959722, 0 `ui:palm-menu`, nessun `menu opened`, nessun `miniature translated`; `pan end hand=right` ts 1791732978076, `menu opened hand=left` ts 1791732978904: delta **0,828 s** |
| 8e | Palmo breve (informativa) | SALTATA | latenza MCP 1,2-2,1 s per ogni `wait`: > 0,35 s; coperta da `tests/unit/palm.test.ts` |
| 8f | Menu aperto + pizzico stessa mano | PASS | T_f0: 1 entita', `menu opened hand=left mode=palm`; T_f1: `pinch left start` ts ...990988, 1 entita', nessun `menu closed`; T_f2: `pinch left end` ts 1791733001884, 1 entita', nessun `menu closed` ne' seconda apertura; T_f3: una sola `menu closed mode=palm via=palm` (ts 1791733012986), 0 entita'. **Differenza da M2 (F-A chiuso): nessuna riga `room selected` in tutto lo scenario** (in M2 la riga del pizzico della mano del menu selezionava la stanza `living`): miglioramento di M3, non regressione |
| 9 | Plastico invariato, nessun `room selected` | PASS | `[soglia:state]` (ts 1791732798447): `miniature {scale 0.05, yawDeg 0, offset [0,0]}`, `selectedRoomId null`, `furniture []`; 0 righe `room selected/deselected` in tutto il caricamento; 0 `miniature gesture start` |
| 10 | 0 error, 0 `Missing glyph info`, niente rete | PASS | filtro `level=[error,warn]` vuoto dall'inizio del caricamento a fine scenario (ts 1791732741000-1791733360882) |
| 11a | 0 `ui:menu-hint`, onboarding `pinch` | PASS | `onboarding step=pinch` ts 1791733037248, 0 entita' hint |
| 11b | Suggerimento | PASS | `pinch right start` ts ...050075 -> `onboarding step=two-hands` (...050077) -> `onboarding step=done` ts 1791733058995 (9,0 s dopo la prima fase) -> `hint shown id=menu` ts ...058996; 1 `ui:menu-hint` (indice 49); Transform (0; 1,4872; -0,5076), orientamento (0,0,0,1) = solo yaw; distanza dalla testa 0,520 m (>= 0,52, <= 0,65); y 1,487 >= Oy+0,10 = 1,45; screenshot `M3-gate-C1-S2.1-hint.png`: pannello bianco con icona mano e "Palm up for the menu" sopra il plastico |
| 11c | Apertura nasconde il suggerimento | PASS | `menu opened hand=left mode=palm` ts 1791733083268, `hint hidden id=menu` ts ...083376; 0 `ui:menu-hint`; `[soglia:state]`: `"menuOpened":true` |
| 11d | Nessuna ricomparsa | PASS | dopo chiusura (`menu closed mode=palm via=palm` ts ...094944) e riapertura (`menu opened hand=left` ts ...102377): 0 entita', nessun nuovo `hint shown`, nessuna riga `onboarding step=menu` |
| 12 | Screenshot | PASS | `M3-gate-C1-S2.1-menu-open.png`: menu interamente nel campo visivo, sopra il plastico; titolo/schede `Items`(attiva, nera) `Mine` `Fit` `Measure` in alto, griglia 2x3 (Double bed 1.6 x 2.0 m, Single bed 0.9 x 2.0 m, Three-seat sofa 2.1 x 0.9 m, Armchair 0.8 x 0.8 m, Dining table 1.4 x 0.9 m, Chair 0.45 x 0.5 m), barra in basso con quattro pulsanti `Undo` `Back` `Next` `Recenter` con icona e testo, nessun elemento tagliato; i due pulsanti `Menu` di M3 ai lati (fuori dal menu). Mano fantasma dell'onboarding non piu' visibile |
| 13 | SONDA 1: 5 pizzichi con la stessa mano, sinistra e destra | PASS | **Sinistra**: pagine 2/3 (ts ...128171), 3/3 (...132185), 2/3 (...154777), 1/3 (...160052), 2/3 (...176947) = 2,3,2,1,2; **Destra**: 2/3 (...226410), 3/3 (...228583), 2/3 (...250231), 1/3 (...252437), 2/3 (...266278); 0 error/warn dopo ogni lettura e alla fine; 1 `ui:palm-menu` (indice 53 a sinistra, 57 a destra); nessun `menu closed` tra apertura e chiusura esplicita; il menu resta aperto dopo il quinto pizzico. Il menu SEGUE la mano: dopo ogni spostamento i bottoni si spostano di 2-3 cm; ricalcolo della posa con una correzione (a volte due) e rilettura (dichiarato) |
| 14 | SONDA 2: Recenter con pezzo in mano | PASS | 13a: `pan start hand=right` ts ...282174, `miniature translated x=-0.100 z=0.000 source=pan`, T0 = (-0,10; 1,35; -0,45); 13b: bed grab da menu (`furniture grabbed ... source=menu hand=right`), `status=invalid reasons=outside-house` (mano oltre il bordo); 13c: pizzico sinistro su `ui:menu-recenter` (posa (0,1249; 1,5016; -0,5083)): **nessun** `miniature recentered`, nessun error, root T1 = (-0,10; 1,35; -0,45) = T0, `furniture:bed-double#1` `phase`=`held`, `rotationDeg`=90, riga `furniture rotated furniture:bed-double#1 rot=90` (attesa), 1 `ui:palm-menu`, nessun `menu closed`; 13d: `furniture returned furniture:bed-double#1 from=menu` (ts ...345833), pizzico su Recenter -> `miniature recentered scale=0.0500` (ts 1791733360882), root T2 = (0; 1,35; -0,45) |

Console: 0 `error`, 0 `warn` nell'intero scenario. Screenshot: `M3-gate-C1-S2.1-menu-open.png`, `M3-gate-C1-S2.1-hint.png`, `M3-gate-C1-S2.1-menu-after-release.png` (menu con il modello gia' spostato di -0,10 m a sinistra, menu non attenuato).

Avvisi dovuti a M3 (intenzionali, non FAIL): (1) i pulsanti `ui:menu-button-left/-right` fanno comparire 2 entita' nel pattern `^ui:(palm-menu|menu-)` anche a menu chiuso (verifiche 1 e 5 dicono "0 `ui:menu-*`"); (2) le righe `menu opened/closed` portano `mode=palm` e `via=palm`; (3) `ui:menu-tab-*` e il titolo diventano le quattro schede (verifica 12 parla di "titolo"); (4) riga nuova `menu item picked id=bed-double hand=right`; (5) la posizione delle voci e' cambiata (griglia 2x3 nuova): bed-double (-0,0953; 1,6746; -0,5720) invece di (-0,1340; 1,6250; -0,5477) di M2.

### S2.1 · giro ridotto con `pinch=auto`

`dev-params.local.txt`: `house=apartment-a&role=visitor&reset=1&seed=1&debug=1&pinch=auto` (la riga `params` non stampa `pinch=` quando e' `auto`; la modalita' si riconosce da `input source=joints hand=left/right`, ts 1791733506596). Pose = bersaglio + (0; 0,025; 0,012) a identita', `xr_select` 0,5 s. Dati: palmo su sinistra -> `menu opened hand=left mode=palm` (ts 1791733509425), 1 `ui:palm-menu`; pizzico destro su `ui:menu-page-next` (posa (0,0134; 1,4614; -0,4616)): `pinch right start` ts ...525817, `menu page 2/3 items=coffee-table,desk,bookcase,wardrobe,nightstand,tv-stand` ts ...525822; poi su `ui:menu-page-prev` (posa (-0,0636; 1,4614; -0,461)): `menu page 1/3 items=bed-double,bed-single,sofa-3seat,armchair,table-dining,chair` ts ...533207; pizzico della mano del menu (sinistra, `xr_set_select_value` 1 per 2,5 s, menu aperto): `pinch left start` ts ...535906 / `pinch left end` ts ...544451, 1 `ui:palm-menu` per tutta la durata, nessun `menu closed`, **nessun `room selected`** (F-A chiuso anche con `auto`); 0 error/warn. **PASS**.

## S2.2 · Posa il letto (PASS)

### pinch=grip (scenario completo)
Parametri `house=apartment-a&role=visitor&reset=1&seed=1&debug=1&pinch=grip`; O letto da `miniature placed x=0.000 y=1.350 z=-0.450 yawDeg=0.0 scale=0.0500` (ts 1791733420327). Posa del menu: sinistra (-0,25; 1,15; -0,2) `Q_UP`; voce `ui:menu-item-bed-double` letta (-0,0953; 1,6746; -0,5720); pose destre: presa (-0,0573; 1,6776; -0,609), P1 (0,103; 1,393; -0,602).

| # | Verifica | Esito | Dato |
|---|---|---|---|
| 1 | 0 `furniture:*` con il menu aperto | PASS | `ecs_find_entities ^(furniture:|ui:menu-item-bed-double$|ui:palm-menu$)` -> solo `ui:palm-menu` (50) e la voce (59); `menu opened hand=left mode=palm` ts 1791733424596 |
| 2 | Presa | PASS | `[soglia] furniture grabbed furniture:bed-double#1 source=menu hand=right` (ts 1791733440403; in piu' `menu item picked id=bed-double hand=right` come in S2.1); 1 entita' `furniture:bed-double#1` (indice 65); `Furniture.catalogId`=`bed-double`, `instance`=1, `phase`=`held`, `hand`=`right` |
| 3 | In volo | PASS | `status`=`valid`, `outline`=`green`, `phase`=`held`, `roomId`=`bedroom`, `x`=6,8, `z`=1,125; log intermedi `status=invalid reasons=outside-house` (al menu), `status=invalid reasons=overlaps-wall wall=w-living-bedroom` (ts ...446735, transitorio durante il trasporto) e `status=valid reasons=-` (ts ...447175); nessun `miniature gesture start`, nessun `room selected`, nessun `pan start` |
| 4 | Rilascio | PASS | `[soglia] furniture placed furniture:bed-double#1 room=bedroom x=6.80 z=1.13 rot=0 status=valid` (ts 1791733467365, 3 ms dopo `pinch right end`); `Furniture.phase`=`placed`, `status`=`valid`, `outline`=`none`, `roomId`=`bedroom`; `Transform` locale a `house:apartment-a` = (6,8; 0; 1,125) |
| 5 | Store | PASS | `[soglia:state]`: `"furniture":[{"id":"furniture:bed-double#1","catalogId":"bed-double","instance":1,"x":6.8,"z":1.125,"rotationDeg":0,"roomId":"bedroom"}]`, `"nextInstance":{"bed-double":2}`, `"historyLength":1`, `miniature {scale 0.05, yawDeg 0, offset [0,0]}`, `selectedRoomId null` |
| 6 | Niente `room selected`, `pan start`, `translated` | PASS | filtro `room (de)?selected|miniature (gesture|translated)|pan ` vuoto dal caricamento; `offset [0,0]` |
| 7 | 0 error, 0 `Missing glyph info` | PASS | `level=[error,warn]` vuoto |
| 8 | Screenshot | PASS con AVVISO | `M3-gate-C1-S2.2-bed-in-hand.png`: il menu e' attenuato (voci in grigio chiaro, non selezionabile), la cornice verde sul pavimento della camera da letto e' visibile (riquadro verde), e **un'etichetta arancione di M3 (FitCheck)** copre la parte alta del letto: "Fits when disassembled: the door is 90 cm wide, the double bed's shortest side is 95 cm / Simplified check". `M3-gate-C1-S2.2-bed-placed.png`: il menu e' di nuovo pieno; il letto beige, appoggiato al muro nord della camera, e' in parte coperto dal menu (come in M2); nessuna cornice |

Differenze dovute a M3: (a) `Furniture` ha i campi `fit` (`disassembled`) e `fitDoor` (`door:d-entrance`) e compare `[soglia] fit label hidden furniture:bed-double#1` (ts 1791733475366, 8 s dopo il rilascio) — FitCheck, intenzionale; (b) l'etichetta del FitCheck mostra "Fits when disassembled..." per il letto matrimoniale (porta d'ingresso da 90 cm, lato corto 95 cm), che sul passo 4 copre il letto nello screenshot.

### pinch=auto (giro ridotto)
Pose: presa = voce + (0; 0,025; 0,012) = (-0,0953; 1,6996; -0,56) con `set_select_value` 1 + attesa 0,7 s; P1 pose = (0,065; 1,415; -0,553), `animate_to` 0,8 s; rilascio con `set_select_value` 0. Dati: `menu item picked id=bed-double hand=right` e `furniture grabbed furniture:bed-double#1 source=menu hand=right` (ts 1791733550878), stati `invalid reasons=outside-house` -> `invalid reasons=overlaps-wall wall=w-living-bedroom` -> `valid`; `[soglia] furniture placed furniture:bed-double#1 room=bedroom x=6.80 z=1.13 rot=0 status=valid` (ts 1791733571431); `Furniture` `phase`=`placed`, `roomId`=`bedroom`, `x`=6,8, `z`=1,125; 0 error/warn. **PASS**.

## S2.3 · Collisione tra mobili (PASS, pinch=grip)

Parametri `house=apartment-a&role=visitor&reset=1&seed=1&debug=1&pinch=grip`; O = (0; 1,35; -0,45); menu aperto con la sinistra su `L_MENU`/`Q_UP` e tenuto in alto. Voce `ui:menu-item-wardrobe` letta a pagina 2: (0,0869; 1,5915; -0,5388) (stesso slot dell'armadio di M2: indice 3 della griglia 2x3). Pose: presa wardrobe (0,1249; 1,5945; -0,5758) -> PW pose (0,133; 1,393; -0,6395); letto (-0,0573; 1,6776; -0,609) -> PB1 pose (0,063; 1,393; -0,517); presa dal modello (0,066; 1,393; -0,517) -> PB2 pose (0,113; 1,393; -0,607).

| # | Verifica | Esito | Dato |
|---|---|---|---|
| 1 | Armadio | PASS | `[soglia] furniture placed furniture:wardrobe#1 room=bedroom x=7.44 z=0.42 rot=0 status=valid` (ts 1791733646828; `Furniture.z`=0,425); `status`=`valid`, `outline`=`none`; `menu page 2/3 items=coffee-table,desk,bookcase,wardrobe,nightstand,tv-stand` (ts ...628892) |
| 2 | Letto valido | PASS | `furniture placed furniture:bed-double#1 room=bedroom x=6.06 z=3.00 rot=0 status=valid` (ts 1791733673338); `outline` none. In volo (durante il trasporto dal menu) compaiono righe transitorie `status=invalid reasons=outside-house` (ts ...662799) e `status=invalid reasons=overlaps-wall wall=w-living-bedroom` (ts ...664892) e le etichette `reason shown furniture:bed-double#1 "Outside the house"` / `"Overlaps a wall"`, poi `status=valid reasons=-` e `reason hidden`: sono stati di volo, il pezzo posato e' valido |
| 3 | In volo sopra l'armadio | PASS | presa dal modello `furniture grabbed furniture:bed-double#1 source=model hand=right` (ts ...688039); `Furniture` `status`=`invalid`, `outline`=`red`, `phase`=`held`, `reasons`=`overlaps-furniture`, x=7, z=1,125; riga `[soglia] furniture status furniture:bed-double#1 status=invalid reasons=overlaps-furniture with=furniture:wardrobe#1` (ts ...697383); nessun `overlaps-wall` |
| 4 | Rilascio | PASS | `[soglia] furniture placed furniture:bed-double#1 room=bedroom x=7.00 z=1.13 rot=0 status=invalid` (ts 1791733720821); letto `phase`=`placed`, `status`=`invalid`, `outline`=`red` persistente, `reasons`=`overlaps-furniture`; armadio `valid`, `outline` none; `[soglia:state]`: `furniture` ha 2 elementi (wardrobe 7,44/0,425; bed 7/1,125), `historyLength` 3 |
| 5 | Di nuovo valido | PASS | ripresa del letto (`furniture grabbed ... source=model`, ts ...744211), `status=valid reasons=-` (ts 1791733751512), `reason hidden furniture:bed-double#1` (ts ...751654), `furniture placed furniture:bed-double#1 room=bedroom x=6.06 z=3.00 rot=0 status=valid` (ts ...753937) |
| 6 | Conteggio finale | PASS | 2 entita' `furniture:*` (`furniture:wardrobe#1` indice 66, `furniture:bed-double#1` indice 68), 0 `ui:reason-*`; `[soglia:state]`: `"nextInstance":{"wardrobe":2,"bed-double":2}`, `"historyLength":4` |
| 7 | Niente room/gesture; scala e yaw | PASS | `miniature {scale 0.05, yawDeg 0, offset [0,0]}`, `selectedRoomId null`; nessuna riga `room selected`/`miniature gesture` |
| 8 | 0 error | PASS | `level=[error,warn]` vuoto da ts 1791733600000 |
| 9 | Screenshot passi 3 e 4 | PASS | `M3-gate-C1-S2.3-reason-overlap.png` (in volo): cornice **rossa** sul pavimento della camera attorno al letto sovrapposto all'armadio, etichetta bianca con bordo rosso "Overlaps the wardrobe" leggibile per intero, e sopra di essa l'etichetta arancione del FitCheck di M3 ("Fits when disassembled: the door is 90 cm wide, the double bed's shortest side is 95 cm / Simplified check") che copre le prime righe del menu attenuato; `M3-gate-C1-S2.3-bed-placed-invalid.png` (dopo il rilascio): letto beige con cornice rossa persistente sul pavimento, etichetta "Overlaps the wardrobe" ancora visibile; l'etichetta del FitCheck e' sparita (ha il suo timer). Dopo il ritorno valido (log `reason hidden`) la cornice scompare (`outline` none) |
| 10a | Etichetta del motivo in volo | PASS | 1 entita' `ui:reason-bed-double#1` (indice 49); `[soglia] reason shown furniture:bed-double#1 "Overlaps the wardrobe"` (ts ...697525, testo esatto); `Transform` (0,0692; 1,4651; -0,5735): distanza dalla testa **0,593 m** (>= 0,52, <= 0,65), `y` 1,465 >= Oy+0,04 = 1,39, angolo **14,8 deg** (<= 30), orientamento (0; -0,0600; 0; 0,9982) = yaw-only, testo intero e senza italiano |
| 10b | Dopo il rilascio | PASS | etichetta ancora 1 entita', nessun `reason hidden`; `Transform` (0,0668; 1,4553; -0,5785): 0,599 m, 15,1 deg; `ui:reason-wardrobe#1` assente; motivi nel log solo `overlaps-furniture` |
| 10c | Ritorno valido | PASS | 0 entita' `ui:reason-*`, `[soglia] reason hidden furniture:bed-double#1` |
| 10d | Alla fine 0 etichette; max 3 | PASS | 0 `ui:reason-*` alla fine; mai piu' di 1 etichetta del motivo |

Differenze dovute a M3 (AVVISI): (a) il FitCheck mostra l'etichetta arancione quando si prende il letto (qui anche sul letto gia' posato), quindi nello screenshot del passo 3 coesistono due etichette (motivo + FitCheck) e quella arancione copre il menu attenuato; (b) `Furniture` ha i campi `fit`/`fitDoor` (armadio `fits`, letto `disassembled` via `door:d-entrance`); (c) in volo dal menu verso il letto passano brevemente `outside-house` e `overlaps-wall` (come in M2: i log intermedi non cambiano il pezzo posato).

## S2.4 · Annulla dal menu (PASS, pinch=grip)

Parametri `house=apartment-a&role=visitor&reset=1&seed=1&debug=1&pinch=grip`. Menu aperto (sinistra su `L_MENU`/`Q_UP`). `ui:menu-undo` letto a (-0,1441; 1,4364; -0,4724); posa destra (-0,1061; 1,4394; -0,5094), `xr_select` 0,2 s.

| # | Verifica | Esito | Dato |
|---|---|---|---|
| 1 | Passo 1 | PASS | `furniture placed furniture:bed-double#1 room=bedroom x=6.80 z=1.13 rot=0 status=valid` (ts 1791733820893); `[soglia:state]`: 1 elemento a x 6,8 / z 1,125, `historyLength` 1, `nextInstance` `{"bed-double":2}` |
| 2 | Passo 2 | PASS | `furniture placed furniture:bed-double#1 room=bedroom x=6.06 z=3.00 rot=0 status=valid` (ts ...845051), `historyLength` 2 |
| 3 | Annulla 1 | PASS | `[soglia] undo action=move id=furniture:bed-double#1` (ts 1791733858690); stato: x 6,8 / z 1,125, `historyLength` 1; stessa entita' (`furniture:bed-double#1`) |
| 4 | Annulla 2 | PASS | `[soglia] undo action=place id=furniture:bed-double#1` (ts ...865092); 0 entita' `furniture:*`; `furniture` `[]`, `historyLength` 0, `nextInstance` `{"bed-double":2}` |
| 5 | Annulla 3 | PASS | `[soglia] undo empty` (ts ...871951); 0 entita'; 0 error |
| 6 | Nuova posa | PASS | `furniture placed furniture:bed-double#2 room=bedroom x=6.80 z=1.13 rot=0 status=valid` (ts ...894166); `[soglia:state]`: `furniture:bed-double#2`, `instance` 2, `nextInstance` `{"bed-double":3}`, `historyLength` 1 |
| 7 | Plastico invariato | PASS | ogni riga di stato: `miniature {scale 0.05, yawDeg 0, offset [0,0]}`, `selectedRoomId null`; 0 `room selected`/`miniature gesture` |
| 8 | 0 error | PASS | `level=[error,warn]` vuoto da ts 1791733790000 |

Nessuna differenza dovuta a M3 rilevata (le uniche novita' sono le stesse di S2.2: `menu item picked`, campi `fit`).

## S2.5 · Rotazione a scatti (pinch=grip, scenario completo)

Parametri `house=apartment-a&role=visitor&reset=1&seed=1&debug=1&pinch=grip`. Il letto di questo scenario e' `furniture:bed-double#2` (posato a P1 dopo lo scenario S2.4 nello stesso caricamento: id #2 invece di #1, nessun effetto sulle verifiche). Pose del polso (con `G` = centro del letto (0,065; 1,39; -0,574), calcolate con python): -30 (0,1164; 1,393; -0,587), -60 (0,116; 1,393; -0,5596), -90 (0,102; 1,393; -0,536); +30 (0,0794; 1,393; -0,635), +60 (0,052; 1,393; -0,6354), +90 (0,028; 1,393; -0,622) (con `G` z = -0,584 per il letto a z 0,925).

| # | Verifica | Esito | Dato |
|---|---|---|---|
| 1 | Polso orario | PASS | presa `furniture grabbed furniture:bed-double#2 source=model hand=right` (ts 1791733925702); dopo -30: nessuna riga `furniture rotated`; dopo -60: `[soglia] furniture rotated furniture:bed-double#2 rot=90` (ts ...937736); dopo -90: nessuna altra riga; in volo `Furniture.rotationDeg`=90, `outline`=`green`, `status`=`valid`, `x`=6,8, `z`=0,925 |
| 2 | Rilascio | PASS | `[soglia] furniture placed furniture:bed-double#2 room=bedroom x=6.80 z=0.93 rot=90 status=valid` (ts 1791733955845); `[soglia:state]`: `rotationDeg` 90, `z` 0,925, `historyLength` 2 |
| 3 | Polso antiorario | PASS | ripresa a (0,103; 1,393; -0,621): `furniture rotated furniture:bed-double#2 rot=0` (ts ...979937, durante la sequenza +30/+60/+90) e `furniture placed furniture:bed-double#2 room=bedroom x=6.80 z=1.13 rot=0 status=valid` (ts ...984269) |
| 4 | Tocchi con l'altra mano | PASS | con la destra che tiene (`furniture grabbed ... source=model hand=right`, ts ...999478): tocco 1 `rot=90` (ts ...006590), tocco 2 `rot=180` (ts ...010213); **nessun** `furniture grabbed` dai tocchi, nessun `miniature gesture start`, nessun `room selected`; rilascio dopo altri due tocchi (rot 90, 180): `furniture placed furniture:bed-double#2 room=bedroom x=6.80 z=1.13 rot=180 status=valid` (ts ...025055); `[soglia:state]`: `rotationDeg` 180, `historyLength` 4 |
| 4b | Quattro tocchi | PASS | tocchi consecutivi con la destra che tiene: `rot=180` -> `rot=270` (ts ...012845) -> `rot=0` (ts ...014977): 0 -> 90 -> 180 -> 270 -> 0 |
| 5 | Presa con la sinistra a vuoto | PASS (annotazione) | con la destra a riposo e la sinistra a palmo in giu' sulla posizione del letto (menu chiuso: `menu closed mode=palm via=palm` ts ...039774): `furniture grabbed furniture:bed-double#2 source=model hand=left` (ts ...048064), `furniture hand left world=0.065,1.390,-0.574 plan=6.80,1.12`, rilascio `furniture placed ... x=6.80 z=1.13 rot=180 status=valid` senza spostamento; nessuna nuova riga `[soglia:state]` => stato e `historyLength` (4) invariati |
| 6 | 0 error; scala e yaw | PASS | `level=[error,warn]` vuoto da ts 1791733790000; `miniature {scale 0.05, yawDeg 0, offset [0,0]}` |
| 7 | Screenshot passo 2 | PASS con AVVISO | `M3-gate-C1-S2.5-rotated-in-hand.png`: il letto ruotato (lungo l'asse x, piu' largo che alto) con cornice verde sul pavimento della camera da letto; il pannello arancione del FitCheck (M3) copre in parte il menu attenuato e la zona sopra il letto; la mano fantasma bianca e' vicina al letto |

Differenze dovute a M3: stesse di S2.2 (etichetta FitCheck in volo, campi `fit`/`fitDoor`). `Furniture.fit`=`disassembled` anche con il letto ruotato di 90 deg.

### S2.5 · giro ridotto con `pinch=auto`

`pinch=auto`; costanti: posa = bersaglio - R(q)*o con o = (0,0005; -0,0249; -0,0119) per la destra (python): identita' (0,0645; 1,4149; -0,5621), -30 (0,0586; 1,4149; -0,5639), -60 (0,0544; 1,4149; -0,5685), -90 (0,0531; 1,4149; -0,5745); `set_select_value` 1 + attesa 0,7 s; tocco della sinistra con `xr_select` 0,5 s. Dati: letto dal menu posato `furniture placed furniture:bed-double#1 room=bedroom x=6.80 z=1.13 rot=0 status=valid` (ts 1791734114441); ripreso (`furniture grabbed ... source=model hand=right`, ts ...128008), -30/-60/-90: `furniture rotated furniture:bed-double#1 rot=90` (ts ...138056); tocco sinistro: `furniture rotated furniture:bed-double#1 rot=180` (ts ...144821); rilascio: `furniture placed furniture:bed-double#1 room=bedroom x=6.80 z=1.13 rot=180 status=valid` (ts ...147688); nessun `room selected`/`pan`/`miniature gesture`; 0 error/warn. **PASS**.

## S2.6 · Porta bloccata da un mobile (PASS, pinch=grip)

Parametri `house=apartment-a&role=visitor&reset=1&seed=1&debug=1&pinch=grip`. Menu aperto (sinistra `L_MENU`/`Q_UP`). `ui:menu-item-armchair` (pagina 1) a (0,0869; 1,5915; -0,5388): presa (0,1249; 1,5945; -0,5758). Pose di trasporto: PD (0,083; 1,393; -0,467), PS (0,138; 1,393; -0,467), centro 1a poltrona (0,083; 1,393; -0,460) -> PC (0,103; 1,393; -0,542).

| # | Verifica | Esito | Dato |
|---|---|---|---|
| 1 | In volo sulla porta | PASS | `Furniture` (indice 65): `status`=`invalid`, `outline`=`red`, `reasons`=`blocks-door`, x 6,4, z 4,14; riga `[soglia] furniture status furniture:armchair#1 status=invalid reasons=blocks-door door=door:d-bedroom` (ts 1791734191758; nessun `overlaps-wall`) |
| 2 | Rilascio | PASS | `[soglia] furniture placed furniture:armchair#1 room=bedroom x=6.40 z=4.14 rot=0 status=invalid` (ts ...218505); `outline` `red` persistente, `reasons` `blocks-door`, nello store |
| 3 | 2a poltrona accanto | PASS | `furniture placed furniture:armchair#2 room=bedroom x=7.50 z=4.14 rot=0 status=valid` (ts ...250837); `status` `valid`, `outline` `none`; solo `ui:reason-armchair#1` esiste |
| 4 | 1a poltrona via dalla porta | PASS | `furniture status furniture:armchair#1 status=valid reasons=-` (ts ...272662), `reason hidden furniture:armchair#1` (ts ...272795), `furniture placed furniture:armchair#1 room=bedroom x=6.80 z=2.50 rot=0 status=valid` (ts ...275383); `outline` `none` |
| 5 | Conteggio | PASS | 2 entita' `furniture:*` (65, 70), 0 `ui:reason-*`; `[soglia:state]`: `nextInstance` `{"armchair":3}` |
| 6 | Niente room/gesture; 0 error | PASS | nessun `room selected`/`miniature gesture start`; `level=[error,warn]` vuoto da ts 1791734160000 |
| 7 | Screenshot passo 1 | PASS con AVVISO | `M3-gate-C1-S2.6-blocks-door.png`: la poltrona (rosa) sul vano della porta con cornice **rossa** sul pavimento; due pannelli: "Blocks the door" (bianco, bordo rosso, leggibile per intero) e sopra, **verde**, "Fits: the narrowest door on the way is 80 cm wide / Simplified check" (FitCheck di M3: la poltrona passa dalla porta, ma ne blocca la zona libera: i due messaggi non si contraddicono perche' misurano cose diverse); le soglie delle porte sul percorso hanno i segnalini **verdi** del FitCheck (in M2 erano arancioni); menu attenuato dietro |
| 8 | Etichetta del motivo | PASS | 1 entita' `ui:reason-armchair#1`; `reason shown furniture:armchair#1 "Blocks the door"` (ts ...191883, testo esatto); in volo Transform (0,0364; 1,4795; -0,5045): **0,520 m** (identico a M2 rerun3), **14,0 deg**, orientamento (0; -0,0360; 0; 0,9994) yaw-only; dopo il rilascio (0,0335; 1,4751; -0,5037): 0,520 m, 14 deg; resta dopo il rilascio; `ui:reason-armchair#2` assente; `reason hidden` dopo lo spostamento (0 `ui:reason-*` al passo 5) |
| 9 | Vecchio su nuovo | PASS | `[soglia] furniture status furniture:armchair#1 status=invalid reasons=overlaps-furniture with=furniture:armchair#2` (ts 1791734365892) e `reason shown furniture:armchair#1 "Overlaps the armchair"` (ts ...365904); in volo `#1` `invalid`/`red`/`overlaps-furniture`, `#2` `valid`/`none` e **nessuna** riga `furniture status furniture:armchair#2 ... invalid`; etichetta in volo (0,0609; 1,4782; -0,5498): 0,565 m, 12,4 deg, yaw-only; dopo il rilascio `furniture placed furniture:armchair#1 room=bedroom x=7.50 z=4.14 rot=0 status=invalid` (ts ...385499); alla fine 2 `furniture:*`, 1 `ui:reason-armchair#1`, `nextInstance` `{"armchair":3}`, `historyLength` 4; screenshot finale `M3-gate-C1-S2.6-final-invalid-armchair.png` (menu chiuso): etichetta "Overlaps the armchair" intera sopra il plastico |

**AVVISO di procedura (non FAIL, cambio intenzionale di M3 nelle coordinate del menu)**: al passo 6 con il menu aperto e tenuto in alto, la presa della 1a poltrona dal suo centro (posa (0,103; 1,393; -0,542) = punto di pizzico (0,065; 1,39; -0,505)) e' stata presa dal pulsante `ui:menu-recenter` (`[soglia] pinch right start` e `[soglia] miniature recentered scale=0.0500` nello stesso ms, ts 1791734292144): nessun `furniture grabbed`, plastico gia' centrato quindi nessun danno. Causa: nel menu v2 `ui:menu-recenter` sta a (0,1149; 1,4364; -0,4744) invece di (0,1301; 1,4490; -0,4805) di M2: la distanza dal punto di pizzico e' 0,075 m (0,092 m in M2) ed e' dentro il raggio del pulsante. Per proseguire il menu e' stato chiuso (palmo giu', `menu closed mode=palm via=palm`) prima di ripetere la presa, che a quel punto e' riuscita (`furniture grabbed furniture:armchair#1 source=model hand=right`). Quindi lo scenario scritto cosi' (menu aperto "per tutto lo scenario") non e' piu' eseguibile alla lettera al passo 6; la funzione (un pulsante vicino prevale sul pezzo) e' una scelta di priorita' del menu, non una perdita di pezzi.

## S2.7 · Un mobile lasciato fuori torna nel catalogo (PASS, pinch=grip)

Parametri `house=apartment-a&role=visitor&reset=1&seed=1&debug=1&pinch=grip`. Menu aperto. POUT1 pose (0,463; 1,393; -0,487), POUT2 pose (0,638; 1,393; -0,487); undo pose (-0,1061; 1,4394; -0,5094).

| # | Verifica | Esito | Dato |
|---|---|---|---|
| 1 | Pezzo nuovo rilasciato fuori | PASS | in volo (indice 65): `status` `invalid`, `outline` `red`, `reasons` `outside-house`, x 14, z 3,6, `roomId` "", `fit` `none`; riga `furniture status furniture:bed-double#1 status=invalid reasons=outside-house` (ts 1791734458276); rilascio: `[soglia] furniture returned furniture:bed-double#1 from=menu` (ts ...485753); 0 `furniture:*`; `[soglia:state]`: `furniture` `[]`, `nextInstance` `{}`, `historyLength` 0; nessuna riga `furniture placed` |
| 2 | Annulla | PASS | `[soglia] undo empty` (ts ...499406) |
| 3 | Pezzo del plastico portato fuori | PASS | posa a P1 `furniture placed furniture:bed-double#1 room=bedroom x=6.80 z=1.13 rot=0 status=valid` (ts ...524589); ripresa (`source=model`), rilascio a POUT1: `[soglia] furniture returned furniture:bed-double#1 from=model` (ts ...550791); 0 entita'; `furniture` `[]`, `nextInstance` `{"bed-double":2}`, `historyLength` 2 |
| 4 | Annulla il rientro | PASS | `[soglia] undo action=remove id=furniture:bed-double#1` (ts ...563345); `furniture:bed-double#1` esiste di nuovo con lo stesso id (indice 65), `[soglia:state]`: x 6,8, z 1,125, `roomId` `bedroom`, `historyLength` 1 |
| 5 | Poltrona rilasciata in aria (POUT2) | PASS | `furniture grabbed furniture:armchair#1 source=menu hand=right` (ts ...573362), `furniture returned furniture:armchair#1 from=menu` (ts ...583054); nessuna entita' `furniture:armchair#*`, resta solo il letto |
| 6 | Niente room/gesture/limit; 0 error | PASS | nessuna riga `room selected`, `miniature gesture`, `furniture limit reached`; `level=[error,warn]` vuoto da ts 1791734400000 |
| 7 | Screenshot passo 1 | PASS | `M3-gate-C1-S2.7-outside-house.png`: il letto con cornice rossa e' in mano sulla base, in basso a destra, parzialmente fuori dal bordo destro della vista (il pezzo sta a 0,43 m di lato: e' normale); l'etichetta bianca con bordo rosso "Outside the house" e' al centro, tutta nel campo visivo, sopra il menu attenuato |
| 8 | Etichetta "Outside the house" | PASS | 1 entita' `ui:reason-bed-double#1` (indice 68); `[soglia] reason shown furniture:bed-double#1 "Outside the house"` (ts ...458408); Transform (0,1130; 1,5611; -0,5880): **0,600 m**, **11,5 deg** (<= 30), orientamento (0; -0,0948; 0; 0,9955) yaw-only; testo intero e leggibile; dopo il rilascio `reason hidden furniture:bed-double#1` (ts ...485757, 4 ms dopo `furniture returned`) e 0 `ui:reason-*` |

Differenze dovute a M3: nessuna rilevata per questo scenario (nessuna etichetta FitCheck per i pezzi fuori dalla casa: `fit` `none`).

## S2.8 · Budget con 14 arredi (PASS, pinch=grip)

Esecuzione 1: `house=apartment-a&role=visitor&reset=1&seed=1&debug=1&furnish=scandinavian&pinch=grip`.

- Log: `[soglia] furniture models loaded=14 fallback=0`, `[soglia] furnish applied style=scandinavian pieces=14 invalid=0` (ts 1791734613109); 14 entita' `furniture:*` (sofa-3seat#1, coffee-table#1, table-dining#1, chair#1-#4, bed-double#1, nightstand#1-#2, wardrobe#1, desk#1, bookcase#1, plant#1), tutte `status valid reasons -` (14 righe `furniture status ... status=valid reasons=-`), 0 `ui:reason-*`; sofa-3seat `x` 4,62 `z` 3,10 (<= 3,19), bookcase `x` 10,69 `z` 2,5 (<= 10,70); `[soglia] font ready family=inter weight=normal|bold atlas=512x512`; 0 `budget exceeded`/`framework:`/`Missing glyph`/`uncaught`/`unhandled`; `level=[error,warn]` vuoto.
- Nuovo in M3 sui pezzi del preset: `Furniture.fit` (sofa-3seat `blocked` per `door:d-living`, bookcase `fits`): non cambia lo stato `valid`.

| Misura | scala | `callsPerView` | calls (2 viste) | triangoli | texture | fps (sw) | note |
|---|---|---|---|---|---|---|---|
| Esecuzione 1 subito (M-closed, 1a lettura) | 0,05 | **54** | 108 | 27.116 | 6 | 8 | con mano fantasma dell'onboarding (+4) e suggerimento del menu; `scene_get_render_stats` `calls` 108 = riga |
| M-open | 0,05 | **63** | 126 | 30.472 | 8 | 7 | costo del menu **+9** (63 - 54) |
| M-worst (menu aperto + poltrona in mano sopra il letto + etichetta motivo + etichetta FitCheck) | 0,05 | **67** | 134 | 31.188 | 8 | 7 | `ui:reason-armchair#1` + `reason shown furniture:armchair#1 "Overlaps the double bed"` (ts ...700015), `ui:fit-label` + `fit label shown ... "Fits: the narrowest door on the way is 80 cm wide"`, 2 `ui:fit-marker-*`; rilascio fuori `furniture returned furniture:armchair#1 from=menu` |
| M-closed a regime (dopo la mano fantasma e il suggerimento) | 0,05 | **50** | 100 | 27.020 | 8 | 7-8 | tool `calls` 100 = riga, `shadowCasters` 0 |
| M-closed | 0,12 | **50** | 100 | 27.020 | 8 | 6 | tool `calls` 100 = riga |
| M-open | 0,12 | **59** | 118 | 30.376 | 8 | 6 | costo del menu **+9** |
| M-worst | 0,12 | **67** | 134 | 31.148 | 8 | 5 | `ui:reason-armchair#1` + `reason shown ... "Overlaps the double bed"` (ts ...836533), `ui:fit-label`; `furniture returned ... from=menu` (ts ...861224) |

Zoom 0,05 -> 0,12 con le mani a z = -0,237 (non -0,487, trappola nota: `viewpoint:V1`): `miniature translated x=0.000 z=-0.300 source=two-hands`, `[soglia:state]`: `miniature {scale 0.12, offset [0.000065,-0.3]}`, root (0,000065; 1,35; -0,75). **La ricetta di zoom differisce da quella di M2 (z = -0,487): a 0,12 il modello e' spostato di 0,3 m e le misure non sono confrontabili uno a uno con il rerun3 di M2 (40 / 49 / 53)**.
Profilo `browser_profile` (rendering, informativo, SwiftShader): frame p50 133 ms, p95 250 ms, 84 frame persi su 96: nessun significato per il Quest.

### Esecuzioni 2, 3, 4

| Esecuzione | parametri (oltre a `role=visitor&reset=1&seed=1&debug=1&pinch=grip`) | `callsPerView` | calls | triangoli | geometrie | texture | fps (sw) | log |
|---|---|---|---|---|---|---|---|---|
| 1 (A + 14 pezzi) | `house=apartment-a&furnish=scandinavian` | 54 (regime 50) | 108 | 27.116 | 62 | 6-8 | 8 | vedi sopra |
| 2 (casa B) | `house=apartment-b&furnish=scandinavian` | **34** | 68 | **21.456** | 46 | 6 | 9-10 | `[soglia] furnish: no staging in apartment-b` (livello `warn`, ts 1791734888988), 0 entita' `furniture:*`, nessun `error` |
| 3 (A senza arredi) | `house=apartment-a` | **40** | 80 | **21.776** | 54 | 7 | 8 | 0 error/warn |
| 4 (blocchi) | `house=apartment-a&failmodels=1&furnish=scandinavian` | **54** | 108 | **22.448** | 64 | 7 | 7 | `[soglia] debug failmodels=1: every furniture model fails to load` (ts 1791734947205); `[soglia] furniture models loaded=0 fallback=14`; 14 righe `warn` `[soglia] furniture model unavailable <id>: using a block` (bed-double, bed-single, sofa-3seat, armchair, table-dining, chair, coffee-table, desk, bookcase, wardrobe, nightstand, tv-stand, rug, plant: una per voce di catalogo con modello); `[soglia] furnish applied style=scandinavian pieces=14 invalid=0`; sofa `x` 4,62 `z` 3,10, bookcase `x` 10,69, tutti `valid`; tool `calls` 108 = riga; `shadowCasters` 0; 0 `error`, 0 `Missing glyph`, 0 `budget exceeded` |

Screenshot: `M3-gate-C1-S2.8-worst-case-0.05.png` (esecuzione 1, caso peggiore: modelli beige riconoscibili (divano, tavolo, sedie, letto, armadio, libreria), il menu attenuato, due pannelli: verde "Fits: the narrowest door on the way is 80 cm wide / Simplified check" e rosso "Overlaps the double bed", segnalini verdi sulle porte; la casa sembra arredata) e `M3-gate-C1-S2.8-failmodels-blocks.png` (esecuzione 4: gli stessi pezzi come blocchi beige con una striscia frontale scura (finestrella) riconoscibili per dimensione; due mani fantasma e due pulsanti `Menu`).

### Verifiche

| # | Verifica | Esito | Dato |
|---|---|---|---|
| 1 | Esecuzione 1: `furnish applied ... pieces=14 invalid=0`, 14 entita', tutte `valid`, nessun `ui:reason-*`, sofa z <= 3,19, bookcase x <= 10,70 | PASS | vedi sopra |
| 2 | Esecuzione 2 casa B | PASS | `furnish: no staging in apartment-b` (warn), 0 `furniture:*`, 0 error |
| 3 | `callsPerView` <= 100 e triangoli <= 150.000 in OGNI misura | PASS | massimo **67** (M-worst a 0,05 e 0,12), triangoli massimi 31.188 |
| 4a | Obiettivi interni: <= 70 chiamate per vista e <= 60.000 triangoli | PASS | max 67 / 31.188 (nessun avviso) |
| 4b | Costo del menu (atteso ~ +9, avviso se > 12) | PASS | 0,05: 54 -> 63 = **+9**; 0,12: 50 -> 59 = **+9** |
| 4c | Differenza rispetto all'esecuzione 3 | informativa | 54 (regime 50) - 40 = +14 (+10 a regime) per 14 pezzi (M2 rerun3: 49 - 35 = +14); triangoli 27.116 - 21.776 = +5.340 |
| 5 | Texture dell'app <= 4 e ciascuna <= 1024; 0 `budget exceeded` | PASS | le due atlanti font 512x512 (`font ready ... atlas=512x512`); 0 contenuto (i glb non hanno texture); totale renderer 6-8 (framework + UIKit); 0 `budget exceeded`/`framework:` |
| 6 | `shadowCasters` 0, 0 error, 0 `Missing glyph` | PASS | `scene_get_render_stats` `shadowCasters` 0 (esecuzioni 1 e 4); `level=[error,warn]` vuoto in tutte le esecuzioni (a parte il warn atteso della casa B e i 14 warn dei blocchi) |
| 7 | `calls` del tool = riga `[soglia:stats]` con il menu chiuso | PASS | 108 = 108 (A, prima lettura), 100 = 100 (regime 0,05), 100 = 100 (0,12), 108 = 108 (blocchi). Con il menu aperto lo strumento non e' stato usato (nota nota di M2: `reading 'x'`), la fonte e' la riga |
| 8 | Tabella delle sei misure | PASS | sopra, con la prova dell'etichetta: `ui:reason-armchair#1` + `reason shown furniture:armchair#1 "Overlaps the double bed"` (0,05: ts ...700015; 0,12: ts ...836533) |
| 9 | Screenshot | PASS | sopra |
| 10 | Esecuzione 4 (blocchi) | PASS | `failmodels=1: every furniture model fails to load`, `loaded=0 fallback=14`, 14 warn, `furnish applied ... invalid=0`, 14 entita' tutte `valid`; sofa z 3,10 / bookcase x 10,69; callsPerView **54** (M2: 63; nota del 2026-10-10 dello scenario: 49-54 con una mesh per blocco); 22.448 triangoli (M2: 22.264) |

**Confronto con il rerun3 di M2** (`qa/reports/M2-2026-10-06-rerun3.md`: 66 chiamate/vista a 0,05 nel caso peggiore, 53 a 0,12, 30,7k triangoli): a 0,05 M-worst **67** (+1: l'etichetta FitCheck e i segnalini porta di M3 compensano la riduzione della mesh dei blocchi e il menu piu' leggero) e triangoli 31.188 (+0,5k); M-closed regime 50 (M2: 49, +1 per i due pulsanti `Menu` di M3 meno la mano fantasma che sparisce); M-open 0,05 63 con la mano fantasma dell'onboarding ancora presente (M2: 58: la differenza e' la mano fantasma +4 e i pulsanti Menu +1). A 0,12: 50 / 59 / 67 contro 40 / 49 / 53 di M2: **+10 / +10 / +14, AVVISO non confrontabile**: M2 zoomava con le mani a z = -0,487 (centro invariato), M3 usa z = -0,237 per non toccare `viewpoint:V1` (trappola nota), quindi il modello si sposta di 0,3 m (`translated z=-0.300`) e la scena che entra nel cono visivo cambia; resta comunque <= 70 (a 0,12 il caso peggiore e' 67, quindi sotto l'avviso a 70).
Gli fps sul PC (SwiftShader, 5-10 fps) non rappresentano il Quest.

## S2.9 · Spostare il plastico (PASS con AVVISI, pinch=grip)

Parametri `house=apartment-a&role=visitor&reset=1&seed=1&debug=1&furnish=scandinavian&pinch=grip`; O = (0; 1,35; -0,45), scala 0,05; mani a riposo sinistra (-0,30; 1,10; 0,10), destra (0,30; 1,10; 0,10). Pose (grip corretto): B1 (0,388; 1,383; -0,487), B2 (-0,312; 1,383; -0,487).

| # | Verifica | Esito | Dato |
|---|---|---|---|
| 1 | Una mano, trascinare (pose B1 -> (0,238; 1,383; -0,487)) | PASS | `pan start hand=right` (ts 1791735046637), `miniature translated x=-0.150 z=0.000 source=pan`, `pan end hand=right` (ts ...056822); `miniature:root` (-0,15; 1,35; -0,45), scala 0,05; nessun `miniature gesture start`/`room selected`/`furniture grabbed`; screenshot `M3-gate-C1-S2.9-pan-left.png`: plastico spostato a sinistra e ancora nel campo visivo, suggerimento "Palm up for the menu" sopra, due pulsanti `Menu` ai lati, nessuna sovrapposizione con i pulsanti |
| 2 | Nessuna deriva verticale | PASS | salita di 0,10 m: `pan start`/`pan end` senza riga `translated`; root y 1,35 (1,3500000238) |
| 3 | Limite in orizzontale | PASS | `miniature translated x=-0.300 z=0.000 source=pan`, root (-0,30; 1,35; -0,45) |
| 4 | Limite in diagonale (pose (0,088; 1,383; -0,487) -> (0,088; 1,383; 0,113)) | PASS | `miniature translated x=-0.134 z=0.268 source=pan`; root (-0,1342; 1,35; -0,1817): raggio 0,300, y 1,35 |
| 5 | Recenter (due mani: sinistra Q_UP, destra pizzico su `ui:menu-recenter` (0,1149; 1,4364; -0,4744) con posa (0,1529; 1,4394; -0,5114), `xr_select` 0,2 s) | PASS | `[soglia] miniature recentered scale=0.0500` (ts ...160324); `menu closed mode=palm via=palm` (ts ...161285); root (0; 1,35; -0,45), scala 0,05; `[soglia:state]` `"offset":[0,0]`, `"scale":0.05`, `historyLength` 0 |
| 6 | Pizzico sul pezzo (plant, posa (-0,182; 1,393; -0,4545)) | PASS | `furniture grabbed furniture:plant#1 source=model hand=right` (ts ...171911), nessun `pan start`/`translated`/`room selected`; rilascio: `[soglia] furniture placed furniture:plant#1 room=living x=1.10 z=4.37 rot=0 status=valid` (ts ...181280); in piu' (M3) `fit label shown furniture:plant#1 "Fits: the narrowest door on the way is 80 cm wide"` e `fit label hidden` 8 s dopo |
| 7a | Stanza selezionata | PASS | `[soglia] room selected living area=23.9` (ts ...198106), nessun `pan`/`translated` |
| 7b | Pizzico dentro una stanza (LV, posa (-0,137; 1,393; -0,487)) | PASS | nessuna riga `pan start`/`translated`/`furniture grabbed`; root ancora (0; 1,35; -0,45) |
| 8 | Pezzo in mano + pizzico sinistro sulla base | PASS | destra tiene (`furniture grabbed furniture:plant#1 source=model hand=right`, ts ...228937), sinistra su B2 con `xr_select` 0,2: `furniture rotated furniture:plant#1 rot=90` (ts ...239379), nessun `pan start`/`miniature gesture start`; rilascio `furniture placed furniture:plant#1 room=living x=1.10 z=4.37 rot=90 status=valid` (ts ...249730); root invariato |
| 9 | Promozione pan -> due mani | PASS | `pan start hand=right` (ts ...265137) a B1, poi pizzico della sinistra a B2: `[soglia] pan upgrade hand=right to=two-hands` e `[soglia] miniature gesture start` (ts ...272550, stesso ms); al rilascio `miniature gesture end scale=0.0500 yawDeg=0.0 tiltDeg=0.0` (ts ...281931); root (0; 1,35; -0,45), nessun `room selected` |

### S2.9 · ripresa dopo l'interruzione (429): passi 10-12

La sessione e' stata riavviata (nuova pagina, nuova sessione XR): ripartenza da zero con `house=apartment-a&role=visitor&reset=1&seed=1&debug=1&furnish=scandinavian&pinch=grip` (load ts 1793622338693; `furnish applied style=scandinavian pieces=14 invalid=0`), pagina ricaricata con offset 0 e scala 0,05 (`miniature placed x=0.000 y=1.350 z=-0.450 yawDeg=0.0 scale=0.0500`): il Recenter di partenza del passo 10 non serve (root gia' a O). Mani a riposo come nello scenario.

| # | Verifica | Esito | Dato |
|---|---|---|---|
| 10a | Ingrandire a 0,12 (mani a z = -0,237 invece di -0,487, trappola nota: con z = -0,487 il pizzico entra in `viewpoint:V1`) | PASS con AVVISO | pose sinistra (-0,112; 1,453; -0,237) -> (-0,562; ...), destra (0,188; ...) -> (0,638; ...), 0,5 s ciascuna; `[soglia] miniature gesture start` (ts 1793622371527), `[soglia] miniature gesture end scale=0.1200 yawDeg=0.0 tiltDeg=0.0` (ts ...379857) e `miniature translated x=0.000 z=-0.300 source=two-hands`; nessun `furniture grabbed`/`room selected`/`viewpoint`. **AVVISO**: `miniature:root` = (0,000065; 1,35; -0,75), cioe' z = -0,75 e non O (-0,45) come chiedeva la verifica 10 ("O +- 0,01"): con le mani a z = -0,237 il punto medio (perno) e' 0,21 m piu' vicino alla testa della posizione di M2 e il plastico si sposta di 0,30 m (limite di 0,30 m raggiunto). La scala 0,12, yaw 0 e tilt 0 sono corretti. Screenshot `M3-gate-C1-S2.9-scaled-moved.png`: la casa ingrandita riempie la parte bassa della vista (bordi del plinto e stanze, mobili beige a destra, segnalini dei punti di vista blu), il suggerimento "Palm up for the menu" e i due pulsanti `Menu` restano visibili e non sono coperti |
| 10b (1o tentativo) | Trascinare a 0,12 dai punti dello scenario spostati col modello (pianta (5,55; 3,6) e (7,25; 3,6) -> mondo (0,006; 1,45; -0,75) e (0,210; 1,45; -0,75), pose (0,044; 1,453; -0,787) / (0,248; 1,453; -0,787)) | **NON VALIDO (punto non idoneo, regola 10b)** | i due pizzichi partono (`pinch left start` ts 1793622424515, `pinch right start` ts ...425248) ma **non compare nessun** `miniature gesture start`/`pan start`/`translated` e il root resta (0,000065; 1,35; -0,75): nessun `furniture grabbed`/`room selected`. Causa probabile: con il plastico spostato a z = -0,75 i punti sono a 0,76 m dalla testa, oltre la portata utile dei pizzichi per il gesto (le interazioni del progetto sono entro ~0,6 m). Il passo non vale e si sceglie un altro punto (sotto) |
| 10b (2o tentativo, punti scelti nella base libera piu' vicina) | stesso schema con le mani a z = -0,337 (pinch z = -0,30, pianta z = 7,35, fuori dalla casa e sulla base: margine > 1 m dalle impronte): sinistra (0,044; 1,453; -0,337) -> (0,244; ...), destra (0,248; 1,453; -0,337) -> (0,448; ...) | PASS con AVVISO | `miniature gesture start` (ts 1793622486111), `miniature gesture end scale=0.1200 yawDeg=0.0 tiltDeg=0.0` (ts ...502663), `[soglia] miniature translated x=0.166 z=-0.250 source=two-hands` (ts ...502668); root (0,1664; 1,35; -0,6996), quota invariata, scala 0,12, yaw 0, tilt 0; nessun `furniture grabbed`/`room selected`. **AVVISO**: l'offset atteso `x=0.200 z=0.000` non e' raggiunto perche' il plastico era gia' a offset (0; -0,30) dopo il passo 10a (mani a z = -0,237): l'offset richiesto (0,20; -0,30) ha raggio 0,36 > 0,30 e viene proiettato sul cerchio, esattamente (0,166; -0,250) (raggio 0,300). Quindi il clamp di 0,30 m funziona; lo scostamento e' una conseguenza della ricetta di zoom a z = -0,237, non di un difetto. Screenshot `M3-gate-C1-S2.9-scaled-dragged.png` |
| 11 | Rotazione e traslazione insieme, senza Recenter (dagli stessi punti liberi del 10b spostati col modello: pinch a pianta z = 7,35, perno M = (0,308; 1,45; -0,30), r = 0,102; tappe 30 / 60 / 90 deg + 0,10 in x; pose 30: L (0,2577; 1,453; -0,286) R (0,4343; ...; -0,388), 60: L (0,295; ...; -0,2487) R (0,397; ...; -0,4253), 90: L (0,446; ...; -0,235) R (0,446; ...; -0,439)) | PASS | `miniature gesture start` (ts 1793622560275), `[soglia] miniature gesture end scale=0.1200 yawDeg=90.0 tiltDeg=0.0` (ts ...588422), `miniature translated x=0.008 z=0.292 source=two-hands` (raggio 0,292 <= 0,301); `miniature:root` (0,0081; 1,35; -0,1583), orientamento (0; 0,7071; 0; 0,7071) = solo yaw, scala 0,12 (invariata), quota 1,35; nessun `furniture grabbed`/`room selected`/`viewpoint`. Screenshot `M3-gate-C1-S2.9-rotated.png`: il modello ruotato di 90 deg e avvicinato alla testa (visto dall'alto-lato: parete, mobili beige e un letto rosa a sinistra, segnalino blu dei punti di vista), suggerimento e pulsanti `Menu` non coperti |
| 12 | Console senza filtro, testa | PASS | `level=[error,warn]` vuoto da ts 1793622338000 (inizio del caricamento di ripresa) e filtro `uncaught|unhandled|Cannot read|undefined|Missing glyph|budget exceeded` vuoto; `xr_get_transform` della testa: (0; 1,6; 0), orientamento identita': nessuna locomozione; nessuna riga `room selected` nel caricamento di ripresa |
| 13 | `npm test` / test del pan e dei claim | PASS | `npm test` (eseguito a inizio lavoro): 75 file, 4465 test verdi; `vitest run miniature-pan pinch-claims pinch-claims-matrix`: 203 test verdi |

**Differenze rispetto a M2 dovute a M3 e avvisi per S2.9**
1. (AVVISO, ricetta) Zoom a z = -0,237 invece di -0,487 (e di conseguenza root a z = -0,75 e offset (0; -0,30) dopo il passo 10a): in M3 i marcatori dei punti di vista (`viewpoint:V1` a ~0,02 m dal pizzico) catturano il pizzico a z = -0,487. Verifica 10 ("root a O +- 0,01 dopo l'ingrandimento") non rispettata alla lettera; scala, yaw e tilt corretti.
2. (AVVISO, conseguenza) `translated x=0.166 z=-0.250` invece di `x=0.200 z=0.000` al 10b: il clamp di 0,30 m proietta (0,20; -0,30) sul cerchio; e' il comportamento corretto del limite. Per ottenere la cifra attesa servirebbe un Recenter (che pero' riporta la scala a 0,05) seguito da uno zoom con centro invariato, non possibile senza toccare un marcatore con la ricetta dello scenario.
3. (AVVISO, punti) I punti del 10b dello scenario (pianta (5,55; 3,6) / (7,25; 3,6)) con il plastico a z = -0,75 stanno a ~0,76 m dalla testa e il gesto a due mani non parte (nessun log); regola 10b applicata: punti sulla base libera piu' vicini (pianta z = 7,35, a 0,34 m dalla testa), riportati sopra; nient'altro cambiato. 
4. (differenza M3, positiva) Il pulsante `Menu` e i marcatori dei punti di vista restano a distanza dai pizzichi dei passi 1-9 (B1, B2, passi 6-9: nessun pizzico catturato da loro); il Recenter (passo 5) con il menu v2 funziona come in M2 (`miniature recentered scale=0.0500`, offset `[0,0]`, `historyLength` 0).
5. (differenza M3) Il pizzico che prende `furniture:plant#1` mostra anche l'etichetta del FitCheck (`fit label shown ... "Fits: the narrowest door on the way is 80 cm wide"`), che sparisce 8 s dopo il rilascio.

---

## Riepilogo C1: regressioni di M2 nell'emulatore (HEAD 123f4e4)

**Verdetto C1: PASS** (tutti gli scenari S2.0-S2.9 restano PASS dopo le modifiche di M3; nessun FAIL; nessun errore in console; budget rispettato).

| Scenario | Esito | Pinch usato |
|---|---|---|
| S2.0 glifi | PASS | n/d |
| S2.1 menu del palmo | PASS (AVVISI di M3) | grip completo + auto ridotto |
| S2.2 posa il letto | PASS | grip completo + auto ridotto |
| S2.3 collisione | PASS | grip |
| S2.4 annulla | PASS | grip |
| S2.5 rotazione | PASS | grip completo + auto ridotto |
| S2.6 porta bloccata | PASS (AVVISO di procedura) | grip |
| S2.7 ritorno al catalogo | PASS | grip |
| S2.8 budget | PASS (AVVISI numerici) | grip |
| S2.9 spostare il plastico | PASS (AVVISI) | grip |

Criteri bloccanti (regola utente 2026-10-06): (a) errori in console: **0** in tutti gli scenari (`level=[error,warn]` vuoto, tranne i warn attesi di S2.8: `furnish: no staging in apartment-b` e 14 `furniture model unavailable ... using a block`); (b) test/build: `npm test` 4465 verdi (build non rieseguita in questa parte); (c) violazioni di `CLAUDE.md`: nessuna rilevata (solo mani, nessuna locomozione: testa sempre (0; 1,6; 0); testi in inglese; nessun `Missing glyph info`); (d) > 100 chiamate per vista: **no**, massimo **67** (S2.8 M-worst a 0,05 e 0,12), triangoli massimi 31.188 (<= 150.000), texture dell'app: 2 atlanti da 512 px.
Chiusura di F-A (M2): il pizzico della mano del menu con il menu aperto non seleziona piu' la stanza (S2.1 8f, anche con `pinch=auto`): 0 `room selected` in tutto S2.1.

## Avvisi

1. S2.1 (cambi intenzionali di M3): `ui:menu-button-left/-right` (2 entita' con `PanelUI`) nel pattern `^ui:(palm-menu|menu-)` anche a menu chiuso; righe `menu opened hand=left mode=palm` / `menu closed mode=palm via=palm`; schede `ui:menu-tab-*` al posto del titolo; riga nuova `menu item picked id=... hand=right`; schede a 0,63 m dalla testa (entro 0,65); coordinate della griglia 2x3 cambiate (bed-double (-0,0953; 1,6746; -0,5720)).
2. S2.2/S2.3/S2.5/S2.6/S2.8: etichetta arancione/verde del FitCheck (M3) che coesiste con l'etichetta del motivo e copre parte del menu attenuato e del letto in volo; `Furniture.fit`/`fitDoor`; segnalini verdi sulle porte (in M2 arancioni).
3. S2.6 (procedura): con il menu aperto il pizzico al centro della stanza (punto di pizzico (0,065; 1,39; -0,505)) e' preso dal pulsante `ui:menu-recenter` (0,075 m; in M2 0,092 m): lo scenario scritto con il menu "tenuto in alto per tutto lo scenario" non e' eseguibile alla lettera al passo 6; menu chiuso per completare il passo.
4. S2.8: M-worst 67 chiamate/vista (M2 rerun3: 66) a 0,05; a 0,12 50 / 59 / 67 contro 40 / 49 / 53 di M2 (+10 / +10 / +14) perche' la ricetta di zoom a z = -0,237 sposta il modello; costo del menu +9 (atteso); esecuzione 4 (blocchi) 54 chiamate/vista (M2: 63); onboarding: mano fantasma (+4) e suggerimento presenti nella prima misura (54), regime 50.
5. S2.9: vedi i punti 1-3 della sezione S2.9 (root a z = -0,75, `translated x=0.166 z=-0.250`, punti 10b spostati).
6. S2.1 passo 8e (palmo troppo breve) saltato: latenza MCP 1,2-2,1 s per ogni attesa > 0,35 s; coperto da `tests/unit/palm.test.ts`.
7. Un `menu opened hand=right` spurio di 0,12 s e' comparso in S2.1 durante l'abbassamento sequenziale delle due mani (artefatto noto delle chiamate MCP sequenziali).

## Cosa l'emulatore non dimostra (da aggiungere a `qa/device/DEBT.md`)

- Precisione e comfort dei pizzichi con mani vere: punto di pizzico `auto` (punto medio delle punte, ~6,5 cm dal grip) rispetto al punto del `gripSpace`; raggio di cattura dei pulsanti `Menu`, `Recenter` e dei marcatori dei punti di vista vicino ai pezzi (S2.6) con le dita reali a 0,5 m.
- Rilevamento del palmo in su/giu' (0,4 s / 0,25 s, soglie 35/55 gradi) e chiusura involontaria del menu con tremore, con mani vere.
- Comfort del menu v2 (testo >= 2,4 cm, griglia 2x3, schede) nel campo visivo stretto e a 0,5-0,63 m; sovrapposizione delle etichette (FitCheck + motivo) sul menu attenuato.
- fps e tempo per frame reali (il PC e' SwiftShader a 5-10 fps; p50 133 ms nel profilo di S2.8): il budget di draw call (max 67 per vista) e triangoli (31,2k) va misurato sul Quest con il menu aperto, un pezzo in mano e le due etichette.
- Raggio di portata dei pizzichi a due mani con il plastico a 0,12 spostato a 0,75 m (S2.9 10b: nessun gesto a 0,76 m dalla testa), comodita' del limite di 0,30 m.
- Resa dei testi, dei glifi `² · × °` e dei colori sui display del visore; percezione di scala in stereo; microfono e passthrough (non esercitati qui).

## Trappole di procedura (per la memoria dell'orchestratore)

- Dopo un riavvio del runtime/sessione la CLI/MCP ha un nuovo tab (`generation` riparte): ripetere reload -> `xr_accept_session` -> `xr_set_input_mode hand`.
- `browser_interact`: una attesa singola dopo `browser_profile start` e `3000 + 2000` nello stesso batch vengono rifiutate; usare una sola attesa <= 3000 ms. Ogni `wait` dura ~1-1,7 s in piu' del valore (latenza).
- Con il menu aperto e la mano destra sul punto di pizzico del centro stanza (0,065; 1,39; -0,505) il pulsante `ui:menu-recenter` vince sul pezzo (S2.6 passo 6): chiudere il menu (palmo giu') prima di riprendere il pezzo.
- Il menu v2 segue la mano del palmo: per i cambi pagina con la stessa mano ricalcolare la posa dopo ogni spostamento (1-2 correzioni), posa = voce + (-0,038; +0,0159; -0,0335) con `Q_UP`.
- Posa per pizzicare con `pinch=auto`: bersaglio + (0; 0,025; 0,012), `xr_select` >= 0,4-0,5 s; rotazione del polso: posa = G - R_y(a)*o con o = (0,0005; -0,0249; -0,0119) (destra).
- Evitare i pattern di log che catturano `[soglia:state]` (con il preset arredi e' enorme) o `furniture status` (14 righe) con `count` alto; usare `since` e filtri stretti (`soglia\] (...)`).
- S2.9 10b a 0,12: dopo lo zoom a z = -0,237 il plastico e' a z = -0,75 (0,76 m dalla testa) e il gesto a due mani non parte: usare i punti sulla base piu' vicini alla testa (pianta z = 7,35, mani a z = -0,337) e accettare che il clamp (0,30 m) dia `translated x=0.166 z=-0.250`.
- `dev-params.local.txt` va riscritto con `pinch=grip` (la riga `params` stampa `pinch=grip`; con `auto` il campo non compare e `input source=joints` conferma la modalita').
- Tempo: sessione 1 dalle 15:30 UTC dell'11/10 per circa 2 h 15 min (S2.0-S2.9 passo 9), sessione di ripresa (dopo il 429) circa 15 min.
