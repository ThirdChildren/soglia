# Gate PC M3 · parte C2 · regressioni di M1 (S1.1-S1.6)

Data: 2026-11-02 · Ambiente: cloud (Linux, SwiftShader, runtime IWER headless già avviato) · ramo `m3`
Esecutore: emulator-qa (Sonnet 5.5). Rendering software: gli fps non sono significativi.
Testa a (0; 1,6; 0) (default della sessione, quindi O = (0; 1,35; -0,45), non (0; 0,95; -0,45) degli scenari scritti per testa a 1,2 m).

## Tabella scenari (aggiornata dopo ogni scenario)

| Scenario | Scheda | Modalità pinch | Esito | Note |
|---|---|---|---|---|
| S1.1 | M1-open-house | grip (completo) + auto (giro ridotto) | **PASS** (V7b/V7c solo in parte: vedi Avvisi) | O = (0; 1,350; -0,450), 33 entità con StableId, `house:apartment-a` a (-0,275; 1,350; -0,630), `room:living` a (-0,145; 1,350; -0,515), 0 error/warn |
| S1.2 | M1-two-hands | grip (completo A-D) + auto (giro ridotto A+B) | **PASS** (con AVVISI di procedura 2 e 3) | zoom 0,0833, yaw +90,0, limiti 0,1200 / 0,0300, traslazione +0,200 e clamp 0,300, 0 `room selected`, 0 error/warn |
| S1.3 | M1-room-label | grip | **PASS** (AVVISO 4: pilastro V2 interseca l'etichetta del corridoio) | 5 stanze con `room selected <id> area=<x>` + `label shown "..."` esatti, 1 sola entità `ui:room-label`, `room deselected hall`, 0 eventi sulla base vuota, 0 error/warn |
| S1.4 | M1-budget | grip | **PASS** (AVVISO 5: triangoli totali 21,8k > obiettivo interno 20k) | callsPerView 40 (A), 35 (A a 0,12), 34 (B) <= 100; triangoli 21 776 / 23 200 / 21 456 (totale 2 viste) << 150 000; ombre 0; 0 `budget exceeded`; 0 error/warn |
| S1.5 | M1-house-b-and-errors | grip (B, N, T) | **PASS** | B: 4/4/9/4/4 entità e log esatti; N: `warn [soglia] house not found: nope`, 0 entità, `ui:error-panel` 1; T: id ignorato, casa A con 33 entità, 0 pannelli d'errore; 0 error; `tests/unit/house.test.ts` verde |
| S1.6 | M1-onboarding | grip (completo) + auto (giro ridotto) | **PASS** | `step=pinch` x1 dopo `miniature placed`, 1 mano fantasma -> 2 dopo il pizzico -> 0 dopo `gesture start` (`step=done`); uscita con una mano: stanza `living` e timeout a T0 + 8,864 s; 0 error/warn |

## S1.1 · Apri la casa A (`M1-open-house`)

Parametri: `house=apartment-a&role=visitor&reset=1&seed=1&debug=1&pinch=grip` (poi giro ridotto con `pinch=auto`). Testa lasciata a (0; 1,6; 0) (default della sessione, `xr_get_transform` = y 1.6000000238), per cui O ha `y` = 1,350 e non 0,95.

| Verifica | Esito | Dati |
|---|---|---|
| V1 log in ordine | PASS | `1793622812257 [soglia] params source=dev-file house=apartment-a role=visitor reset=true seed=1 debug=true time=- pinch=grip` (campo `pinch=grip` nuovo, M3), poi `[soglia] house loaded apartment-a rooms=5 walls=13 doors=5 windows=7` (812550) |
| V2 `miniature placed` | PASS | pre-sessione `x=0.000 y=0.950 z=-0.450 yawDeg=0.0 scale=0.0500`; in sessione `x=0.000 y=1.350 z=-0.450 yawDeg=0.0 scale=0.0500` (1793622817121). y - (1,6 - 0,25) = 0,000 |
| V3 conteggi/id | PASS | `^house:` 1 (`house:apartment-a`); `^room:` 5 (living, bedroom, study, bathroom, hall); `^wall:` 13 (tutti gli id attesi, stesso ordine di costruzione); `^door:` 5; `^window:` 7; `^(miniature:root\|table:plinth)$` 2. Totale 33 entità, **0** senza componente `StableId`; `ecs_query_entity` su `house:apartment-a` -> `StableId.value = "house:apartment-a"` |
| V4 trasformazioni globali | PASS | `house:apartment-a` posizione (-0.275; 1.350; -0.630) scala 0.0500; `room:living` (-0.145; 1.350; -0.515) scala 0.05 (via `scene_get_object_transform`) |
| V5 console | PASS | `level=error`: 0, `level=warn`: 0 dal timestamp 1793622812257; nessun `house invalid`/`house not found`/`Failed to load`; nessuna riga fuori da `[soglia]` oltre a quelle attese (99 righe `log`) |
| V6 screenshot | PASS | `qa/reports/M3-gate-C2-S1.1-open-house.png`: plastico davanti alla testa (testa inclinata -29 gradi verso O), pavimenti di due colori (legno marrone e piastrelle azzurro-grigie), muri bassi grigio chiaro con varchi per le porte, tre pilastri blu (marcatori `viewpoint:V*`, M3), mano fantasma azzurra sopra il plastico (onboarding), due pulsanti `Menu` bianchi con gli outline delle mani (M3) |
| V7a mani visibili | PASS | `qa/reports/M3-gate-C2-S1.1-hands-visible.png`: mani a (∓0,15; 1,40; -0,15): gli outline bianchi di entrambe le mani sono visibili in primo piano; i pulsanti `Menu` seguono i polsi |
| V7b modelli mani locali | PASS parziale (AVVISO 1) | log `[soglia] hand visuals: local models` e `[soglia] controller visuals: local shape`; `curl -sk https://localhost:8081/models/hands/left.glb` -> 200, 94572 byte; `right.glb` -> 200, 94004 byte (uguali ai file in `public/models/hands/`). La richiesta DEL BROWSER non è dimostrata (nessuna sonda) |
| V7c nessuna richiesta esterna per le mani | non misurabile (AVVISO 1) | nessuno strumento valuta JS e il codice dell'app non si può toccare (regola 8); `browser run` richiede `--allow-browser-automation` al `dev up`, non attivo. Indizi: 0 righe con `generic-hand`/`jsdelivr`/`xr-input`; nessun `Failed to load` |
| V7d nessun `Failed to load visual asset` | PASS | pattern `Failed to load\|xr-input\|generic-hand\|jsdelivr` -> 0 righe nel caricamento corrente |

Giro ridotto `pinch=auto` (carico 1793623021394, testa 1,6): `miniature placed y=0.950` poi `y=1.350`, `house loaded apartment-a rooms=5 walls=13 doors=5 windows=7`, `input source=joints hand=left/right` (3 s dopo l'avvio), entità 1/5/13/5/7/2 = 33, 0 senza `StableId`, error 0, warn 0. **PASS**.

AVVISO: differenze intenzionali di M3 (riga `params` con `pinch=grip`, pulsanti `Menu`, marcatori `viewpoint:V*`) non influiscono sui criteri della scheda.

## S1.2 · Pizzico a due mani (`M1-two-hands`)

Carico con `pinch=grip`: inizio 1793623087167; O = (0; 1,35; -0,45); pose = bersaglio + (0,038; 0,003; -0,037), orientamento (0,0,0,1), y mani = 1,40 (pose 1,403).
**Deviazione di procedura (AVVISO 2)**: i marcatori `viewpoint:V1..V3` stanno (con scala 0,05) a (-0,130; -0,465), (0,065; -0,470), (0,215; -0,535). Il pizzico della mano sinistra a (-0,15; -0,45) cade a 0,025 m da V1 (entro i 0,04 m del cambio di punto di vista). Invece di spostare le mani in z (che sposta il perno e rompe la verifica 4), ho **allargato le distanze iniziali mantenendo i rapporti** e le mani simmetriche attorno a O: fase A span 0,36 -> 0,60 (rapporto 1,667), fase B raggio 0,27 (invece di 0,20; V1 dopo lo zoom sta a (-0,217; -0,475), mano a 0,059), fasi C/D come da scheda (±0,15, dopo la rotazione e lo zoom i marcatori sono lontani). Nessun `viewpoint` nei log: i pizzichi sono stati presi dal gesto a due mani.

| Verifica | Esito | Dati |
|---|---|---|
| V1 fase A | PASS | `[soglia] miniature gesture start` (1793623135549); `miniature gesture end scale=0.0833 yawDeg=0.0 tiltDeg=0.0` (1793623148982): 0,0833, tiltDeg 0 |
| V2 fase B | PASS | `gesture end scale=0.0833 yawDeg=90.0 tiltDeg=0.0` (1793623186817): yaw +90,0, scala = s1 |
| V3 fase C | PASS | passo 10: `scale=0.1200` (<= 0,1201); passo 11: `scale=0.0300` (>= 0,0299); nessun NaN in nessuna riga |
| V4 posizione | PASS | dopo A-C `miniature:root` a (-0,0002; 1,350; -0,4499) (O ± 0,001); fase A/C senza `translated`, B `translated x=0.000 z=0.000` |
| V5 `room selected` | PASS | 0 righe `room selected` in tutto il caricamento |
| V6 stato | PASS | ultima riga `[soglia:state]`: `miniature":{"scale":0.06038647939499923,"yawDeg":90,"offset":[0.3,0.000119]}` = ultimo `gesture end scale=0.0604 yawDeg=90.0` (offset nuovo di M3: la traslazione vive nello store) |
| V7 console/locomozione | PASS | error 0, warn 0; `xr_get_transform` testa (0; 1,6; 0) a fine scenario (invariata) |
| V8 screenshot | PASS | `qa/reports/M3-gate-C2-S1.2-zoomed-rotated.png`: il plastico occupa il campo visivo (scala 0,12 e ruotato di 90 gradi: il lato lungo della pianta è ora in profondità), nessun ribaltamento; in alto il suggerimento `Palm up for the menu` (M3) e i pulsanti `Menu` ai lati; la testa è a livello (la `look_at` successiva non è comparsa nel fotogramma) |
| V9 fase D | PASS | D2: `[soglia] miniature translated x=0.200 z=0.000 source=two-hands` (1793623289901), `miniature:root` (0,1998; 1,350; -0,4499), scala 0,0300 e yaw 90 invariati; D4: `translated x=0.300 z=0.000` (hypot 0,300 <= 0,301), root (0,3000; 1,350; -0,4499), quota 1,350 invariata |

AVVISO 3 (D4, non una regressione): dopo D2 il centro del plastico sta a x = +0,20 e a scala 0,03 il raggio di presa (raggio modello x scala + 0,10 m, `REACH_MARGIN` in `src/logic/two-hand.ts`) non comprende i pizzichi a (∓0,15; Oz), che la scheda ripete per D4: i due pizzichi sono arrivati a 1793623304477/304756, ma `miniature gesture start` solo a 1793623307787, quando durante `xr_animate_to` le mani sono entrate nel raggio con una distanza di ~0,15 m. Per questo `gesture end` di D4 ha `scale=0.0604` (ratio 2,0) invece di 0,0300: la verifica 9 riguarda solo `translated` (0,300) ed è rispettata. Per un D4 pulito andrebbero centrate le mani sul nuovo centro.

Giro ridotto `pinch=auto` (carico 1793623390000 circa; pose = bersaglio + (0; 0,025; 0,012)): zoom 0,36 -> 0,60: `gesture end scale=0.0832 yawDeg=0.0 tiltDeg=0.0`; rotazione raggio 0,27 a 30/60/90 gradi: `scale=0.0832 yawDeg=89.9 tiltDeg=0.0`; root (-0,0001; 1,350; -0,4499); 0 `room selected`, error 0, warn 0. **PASS**.

## S1.3 · Pizzico su una stanza (`M1-room-label`)

Carico con `pinch=grip`, inizio 1793623485311; testa (0; 1,6; 0) orientata con `xr_look_at` verso O (pitch -29 gradi, come negli screenshot); `hand-right` a (Cx; 1,60; Cz+0,02), `xr_look_at` su C, `xr_select` 0,3 s. Centri C (O + dx, dz): living (-0,145; -0,515), bedroom (0,065; -0,515), study (0,210; -0,515), bathroom (-0,210; -0,335), hall (0,065; -0,360). Nessuno scarto aggiuntivo: tutte le selezioni al primo tentativo.

| Verifica | Esito | Dati |
|---|---|---|
| V1 living | PASS | `1793623504179 [soglia] room selected living area=23.9`, poi `1793623504181 [soglia] label shown "Living room & kitchen · 23.9 m²"` (testo con `·` e `²` identico) |
| V2 entità | PASS | `^ui:room-label$` -> 1 entità (`ui:room-label`, entityIndex 50) |
| V3 altre stanze | PASS | `room selected bedroom area=14.7` / `label shown "Bedroom · 14.7 m²"`; `study area=12.0` / `"Study · 12.0 m²"`; `bathroom area=6.8` / `"Bathroom · 6.8 m²"`; `hall area=13.4` / `"Hallway · 13.4 m²"`. Dopo ogni cambio la ricerca dà ancora 1 sola `ui:room-label` (pannello riutilizzato) |
| V4 secondo select su `hall` | PASS | `1793623574543 [soglia] room deselected hall`, nessuna nuova `label shown` |
| V5 base vuota | PASS | mano a (0,38; 1,60; -0,45) sopra la base: `pinch right start/end` ma nessuna riga `room selected`/`deselected`. (`xr_look_at` a perpendicolo ha dato la quaternione degenere (0,5;0,5;0,5;-0,5) già nota; non influisce) |
| V6 aree | PASS | 23,9 / 14,7 / 12,0 / 6,8 / 13,4 |
| V7 stato | PASS | riga `[soglia:state]` dopo il passo 1 con `"selectedRoomId":"living"`; dopo il passo 6 `"selectedRoomId":null`; `miniature` `{"scale":0.05,"yawDeg":0,"offset":[0,0]}` a fine scenario |
| V8 console | PASS | error 0, warn 0; plastico non mosso (scala 0,05, yaw 0, offset 0) |
| V9 screenshot | PASS | `qa/reports/M3-gate-C2-S1.3-label-living.png`: etichetta bianca `Living room & kitchen · 23.9 m²` in testo nero grande e leggibile, sopra il plastico e rivolta alla testa, con sotto il suggerimento `Palm up for the menu` (M3). `qa/reports/M3-gate-C2-S1.3-label-hall.png`: `Hallway · 13.4 m²` (vedi AVVISO 4) |

AVVISO 4 (M3, visivo): per il corridoio (più vicino alla testa) l'etichetta sta più in basso (M3, cono 30 gradi) e i pilastri blu dei punti di vista la attraversano: in `qa/reports/M3-gate-C2-S1.3-label-hall.png` il pilastro `viewpoint:V2` copre la cifra del testo (si legge `Hallway · 13_ m²`). Posizioni globali: `ui:room-label` (0,020; 1,426; -0,490), `viewpoint:V2` (0,065; 1,4375; -0,470), `viewpoint:V1` (-0,130; 1,4375; -0,465). Il log è corretto (`label shown "Hallway · 13.4 m²"`); è un difetto di leggibilità, non funzionale, e non rientra nei criteri della scheda. Da segnalare a `xr-engineer` (distanza dell'ancoraggio dell'etichetta dai marcatori / `renderOrder`).
Nota: dopo la verifica 6 ho ripetuto un terzo `xr_select` su `hall` solo per leggere le posizioni (riga `room selected hall` e `label shown` a 1793623602015); lo stato finale ha `selectedRoomId":"hall"` per questo motivo.

## S1.4 · Budget grafico (`M1-budget`)

Tutte le esecuzioni con `pinch=grip`; testa (0; 1,6; 0), mani. **Gli fps sul PC non rappresentano il Quest** (SwiftShader: `gpuRenderer` = `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) ...)`).

| Esecuzione | callsPerView | calls (2 viste) | triangles (totale 2 viste) | geometries | textures | fps | tempo per fotogramma |
|---|---|---|---|---|---|---|---|
| 0 · casa A senza `debug` (carico 1793623672453) | n/d (nessuna riga) | - | - | - | - | - | - |
| 1 · casa A `debug=1`, 12 s dopo l'avvio (1793623736105 ... 746686, 6 righe a ~2,1 s) | **40** | 80 | **21 776** (10,9k/vista) | 54 | 7 | 5-6 | profilo: p50 150,1 ms, p95 233,3 ms, max 350 ms (79 campioni, `droppedFrameCount` 76; diagnostico, non calibrato) |
| 1b · casa A a scala 0,12 (`gesture end scale=0.1200`, 1793623802200; righe 809927 ... 814183) | **35** | 70 | **23 200** | 57 | 7 | 5-6 | - |
| 2 · casa B `debug=1` (carico 1793623842085; righe 855771 ... 862025) | **34** | 68 | **21 456** | 48 | 7 | 6 | - |

Riga di gruppi (nuova in M3): `[soglia:stats:groups] house=24 furniture=0 hands=6 ui=8 markers=1 other=1` (casa A, scala 0,05); `... ui=7 ...` a 0,12. In un carico precedente (S1.3, con l'etichetta della stanza e il suggerimento visibili, `debug=1`) `calls=82 callsPerView=41 triangles=23324 textures=8`, `ui=9`.
`scene_get_render_stats` (casa A, 0,05): `calls 80, triangles 21776, geometries 54, textures 7, programs 14, meshCount 52, materialCount 28, shadowCasters 0`; (casa B) `calls 68, triangles 21456, geometries 48, textures 7, programs 14, shadowCasters 0`.

| Verifica | Esito | Dati |
|---|---|---|
| V1 esecuzione 0 | PASS | 0 righe `[soglia:stats]`/`[soglia:state]` dopo `params source=dev-file ... debug=false` (1793623672453); le 4 righe trovate con `since` più largo erano del carico precedente (1793623666-668) |
| V2 formato/numero righe | PASS | >= 6 righe per esecuzione a ~2,1 s, formato `[soglia:stats] fps=<n> calls=<n> views=2 callsPerView=<n> triangles=<n> geometries=<n> textures=<n>` |
| V3 budget | PASS | `callsPerView` 40 / 35 / 34 <= 100; `triangles` 21 776 / 23 200 / 21 456 <= 150 000 |
| V4 obiettivo interno | AVVISO | `callsPerView` <= 50 rispettato; `triangles` totali 21 776 / 23 200 / 21 456 > 20 000 (AVVISO 5; per vista ~10,9k, ~11,6k, ~10,7k; stesso ordine di M1: 21,3k-21,6k) |
| V5 coerenza | PASS | `calls` di `scene_get_render_stats` (80 / 68) = `calls` della riga `[soglia:stats]` (80 / 68) |
| V6 texture | PASS (censimento parziale) | 6a: texture dell'app = 2 atlanti font (`[soglia] font ready family=inter weight=normal atlas=512x512 glyphs=111` e `weight=bold atlas=512x512 glyphs=111`), <= 4, ciascuna 512 <= 1024; 0 texture di contenuto. 6b: framework non enumerato (nessuna sonda: codice dell'app non modificabile, regola 8); `textures` = 7 (casa A e B). 6c: valore di riferimento 3/5/8 (M2) -> 7 in sessione con le mani (informativo). 6d: **0** righe `budget exceeded`. 6e: **0** righe `framework:` |
| V7 console / ombre | PASS | error 0, warn 0 in tutte le esecuzioni; `shadowCasters` 0 |
| V8 tabella | PASS | tabella sopra; **gli fps sul PC non rappresentano il Quest** |

AVVISO 5: l'obiettivo interno di M1 (<= 20 000 triangoli, totale 2 viste) è superato di poco (+9 % a 0,05; +16 % a 0,12), non decide l'esito. Va in DEBT.md come "misurare sul Quest". Rispetto a M1 (~21,5k) i triangoli sono invariati.
Screenshot: `qa/reports/M3-gate-C2-S1.4-house-b-stats.png` (casa B, esecuzione 2).

## S1.5 · Casa B e gestione degli errori (`M1-house-b-and-errors`)

Tutte le esecuzioni con `pinch=grip`; testa (0; 1,6; 0). Nelle esecuzioni N e T la sessione è stata solo accettata (`xr_accept_session`) senza passare alle mani, come ai passi 5 e 9 della scheda: negli screenshot compaiono quindi le forme dei controller connessi da IWER a inizio sessione.

**Esecuzione B** (`house=apartment-b`, carico 1793623842085)

| Verifica | Esito | Dati |
|---|---|---|
| V1 log | PASS | `1793623842547 [soglia] house loaded apartment-b rooms=4 walls=9 doors=4 windows=4` |
| V2 entità | PASS | `^house:` -> `house:apartment-b`; `^room:` 4 (living, bedroom, bathroom, hall); `^wall:` 9 (w-north, w-east, w-south, w-west, w-living-bath, w-living-hall, w-bedroom-hall, w-living-bedroom, w-bath-hall); `^door:` 4 (d-entrance, d-living, d-bedroom, d-bathroom); `^window:` 4 (win-living, win-bedroom, win-bedroom-east, win-bathroom); `miniature:root` + `table:plinth` |
| V3 | PASS | `apartment-a` -> 0 entità; error 0, warn 0. Screenshot `qa/reports/M3-gate-C2-S1.5-house-b.png` (plastico della casa B, 4 stanze) |

**Esecuzione N** (`house=nope`, carico 1793623936103)

| Verifica | Esito | Dati |
|---|---|---|
| V4 | PASS | `1793623936587 warn [soglia] house not found: nope` (unico warn, atteso) |
| V5 nessuna richiesta | PASS | 0 righe `Failed to load` / `404` / `nope.json` in console; `npx @iwsdk/cli dev logs --tail 100` non riporta richieste a `houses/` (come da nota di M1 non registra le richieste HTTP: la verifica si basa sulla console) |
| V6 entità | PASS | `^(house\|room\|wall\|door\|window\|miniature\|table):` -> **0**; `^ui:error-panel$` -> **1** (`ui:error-panel`) |
| V7 | PASS | `level=error` 0; nessun `unhandledrejection`/`uncaught` |
| V8 screenshot | PASS | `qa/reports/M3-gate-C2-S1.5-error-panel.png`: pannello bianco con barra rossa, davanti alla testa, titolo in grassetto nero `This home could not be found.` e sotto in grigio `Reload the page or choose another home.`; testo grande; sullo sfondo solo cielo e le due forme scure dei controller |

**Esecuzione T** (`house=..%2Fapartment-a`, carico 1793623969024)

| Verifica | Esito | Dati |
|---|---|---|
| V4T | PASS | `[soglia] params source=dev-file house=apartment-a role=visitor reset=true seed=1 debug=true time=- pinch=grip`, poi `warn [soglia] param house="..?apartment-a" ignored: expected letters, digits, "-" or "_"` e `warn [soglia] invalid house id ignored` (stesso timestamp 1793623969026) |
| V5T | PASS | `[soglia] house loaded apartment-a rooms=5 walls=13 doors=5 windows=7`; nessun `house not found` |
| V6T | PASS | ricerca complessiva **33** entità; `^ui:error-panel$` **0**. Screenshot `qa/reports/M3-gate-C2-S1.5-traversal-house-a.png`: plastico della casa A (due colori di pavimento, muri bassi, tre pilastri blu, mano fantasma azzurra, pulsanti `Menu`), nessun pannello d'errore |
| V7T | PASS | nessuna richiesta con `..` (0 righe `Failed to load`/`404` in console; 0 occorrenze di `../` in `dev logs --tail 150`) |
| V8T | PASS | `level=error` 0; gli unici warn sono i due attesi |

**V9 dati corrotti**: coperti da `tests/unit/house.test.ts` (`describe('checkHouse reports readable errors with the field path')`, mutazioni rifiutate; il messaggio `house invalid: <errore>` è in `src/index.ts:163`). `npm test` eseguito ora: **75 file, 4465 test verdi**. PASS.

## S1.6 · Onboarding con la mano fantasma (`M1-onboarding`)

Carico con `pinch=grip` (inizio 1793624054484 per i passi 1-6; poi 3 ricarichi per i passi 7, 10, 11); mani lontane a (∓0,40; 1,40; 0,20); primo pizzico `hand-right` a (0; 1,45; -0,35) orientamento identità, `xr_select` 0,2 s (punto di pizzico (-0,038; 1,447; -0,313), non su stanza né su marcatore). Il timeout di 9 s dopo `step=two-hands` impedisce di fare screenshot e fase A in sequenza: l'ho gestito eseguendo la fase A in blocco subito dopo il primo pizzico (il primo `gesture start` porta a `done`, come da memoria) e l'screenshot a due mani in una prova a parte (passo 11).

| Verifica | Esito | Dati |
|---|---|---|
| V1a ordine | PASS | fuori sessione: `1793624060983 [soglia] miniature placed x=0.000 y=0.950 z=-0.450 ...`, poi `1793624061015 [soglia] onboarding step=pinch` (una sola volta); ricerca `^ui:ghost-hand-` fuori sessione = **0** |
| V1b | PASS | dopo `xr_accept_session`: secondo `miniature placed ... y=1.350` (1793624067485), nessun secondo `step=pinch` nel carico, nessun'altra riga `onboarding` finché non si agisce |
| V1c | PASS (tempo non misurabile) | la ricerca subito dopo `xr_set_input_mode` è partita a 1793624070592, cioè 3,1 s dopo l'avvio sessione (067485): 1 entità (`ui:ghost-hand-right`). Per la scheda non è dimostrabile un intervallo < 1,0 s (latenza CLI): annotato "non misurabile", senza FAIL |
| V2 | PASS | a >= 1,5 s: esattamente 1 entità, `ui:ghost-hand-right`; nessuna `ui:ghost-hand-left`. Screenshot `qa/reports/M3-gate-C2-S1.6-ghost-right.png`: una mano fantasma azzurra translucida sopra il plastico, nessun testo sovrapposto |
| V3 | PASS | `1793624105608 [soglia] onboarding step=two-hands` (primo pizzico a 105601); 2 entità: `ui:ghost-hand-right`, `ui:ghost-hand-left` |
| V4 | PASS | in un carico pulito (inizio 1793624168410): `step=two-hands` 179817; fase A (±0,15 -> ±0,25): `miniature gesture start` 185400 e `onboarding step=done` nello stesso ms; `gesture end scale=0.0833 yawDeg=0.0 tiltDeg=0.0` (191414); `^ui:ghost-hand-` -> **0** |
| V5 | PASS | dopo il ricarico (1793624210723): `state cleared reason=reset keys=1`, `state none key=soglia:v1:state:apartment-a`, `onboarding step=pinch`: la sequenza ricomincia (con `reset=1`; senza `reset=1` la persistenza di M3 salva `prefs.onboardingStep`, non provato qui: vedi AVVISO 6) |
| V6 stringhe | PASS | `grep -n -i "onboard\|ghost\|hand" src/ui/strings.ts` -> una sola riga (53), un commento (`/** The fixed buttons beside the model (T3.3b)...`), nessuna frase visibile di onboarding |
| V7 | PASS | `level=error` 0, `level=warn` 0 in tutti i carichi (info 4, log 196); nessun controller usato (`xr_set_input_mode` = `hand`) |
| V8 screenshot | PASS | `qa/reports/M3-gate-C2-S1.6-ghost-right.png` (una mano) e `qa/reports/M3-gate-C2-S1.6-ghost-two.png` (due mani fantasma azzurre che si avvicinano sopra il plastico); gli unici testi nella vista sono i pulsanti `Menu` (M3, non fanno parte dell'onboarding) e, dopo il passo, il suggerimento `Palm up for the menu` |
| V9 uscita con una stanza | PASS | carico 1793624231787: `onboarding step=two-hands` 244153; 2 entità `ui:ghost-hand-*` al controllo; `1793624246025 [soglia] room selected living area=23.9`, `246027 label shown "Living room & kitchen · 23.9 m²"`, `246028 onboarding step=done`; nessun `gesture`; `^ui:ghost-hand-` -> **0** |
| V10 timeout | PASS | carico 1793624266951: T0 = `step=two-hands` 1793624276801; `step=done` 1793624285665 = **T0 + 8,864 s** (9,0 ± 0,5); 2 mani fantasma nello screenshot a ~3 s da T0 (`qa/reports/M3-gate-C2-S1.6-ghost-two.png`); a T0 + 14,6 s `^ui:ghost-hand-` -> 0; nessuna riga `room selected` |

Giro ridotto `pinch=auto` (carico 1793624316971; pose = bersaglio + (0; 0,025; 0,012), `xr_select` 0,5 s): fuori sessione 0 entità fantasma; `miniature placed y=0.950` e `step=pinch` (stesso ms, nell'ordine corretto), in sessione 1 entità; dopo il pizzico `step=two-hands` (1793624327249) e 2 entità; fase A: `gesture start` e `step=done` a 1793624333660/661, `gesture end scale=0.0832 yawDeg=0.0 tiltDeg=0.0`, 0 entità; `input source=grip hand=* reason=no-joints` (transitorio all'avvio, atteso) poi `input source=joints`; error 0, warn 0. **PASS**.

---

## Riepilogo C2

**Verdetto: PASS.** Gli scenari S1.1-S1.6 di M1 restano PASS dopo le modifiche di M3 (6/6): nessun FAIL, 0 `level=error` e 0 `level=warn` non attesi (gli unici warn sono quelli previsti da S1.5: `house not found: nope`, `param house="..?apartment-a" ignored ...`, `invalid house id ignored`), budget rispettato (max 41 draw call per vista contro 100; max 23,3k triangoli totali contro 150k), nessuna locomozione (testa sempre a (0; 1,6; 0)), nessun controller usato. `npm test`: 75 file, 4465 test verdi (eseguito ora, codice non toccato).

| Scenario | Esito |
|---|---|
| S1.1 open-house | PASS (V7b/V7c parziali, vedi AVVISO 1) |
| S1.2 two-hands | PASS (AVVISI 2 e 3) |
| S1.3 room-label | PASS (AVVISO 4) |
| S1.4 budget | PASS (AVVISO 5) |
| S1.5 house-b-and-errors | PASS |
| S1.6 onboarding | PASS |

Screenshot: `qa/reports/M3-gate-C2-S1.1-open-house.png`, `M3-gate-C2-S1.1-hands-visible.png`, `M3-gate-C2-S1.2-zoomed-rotated.png`, `M3-gate-C2-S1.3-label-living.png`, `M3-gate-C2-S1.3-label-hall.png`, `M3-gate-C2-S1.4-house-b-stats.png`, `M3-gate-C2-S1.5-house-b.png`, `M3-gate-C2-S1.5-error-panel.png`, `M3-gate-C2-S1.5-traversal-house-a.png`, `M3-gate-C2-S1.6-ghost-right.png`, `M3-gate-C2-S1.6-ghost-two.png`.

## Avvisi

1. **S1.1 V7b/V7c (non dimostrati dal browser)**: nessuno strumento valuta JS e il codice dell'app non si poteva toccare (nessuna sonda temporanea come in M1); `browser run` richiede `--allow-browser-automation`, non attivo e non riavviato. Dimostrato solo: log `hand visuals: local models`/`controller visuals: local shape`, `curl` 200 sui due glb (94572 / 94004 byte), 0 righe `Failed to load`/`generic-hand`/`jsdelivr`/`xr-input`. Il censimento delle richieste esterne e della risposta del browser per i glb resta da rifare con la sonda (o a `dev up --allow-browser-automation`). Nota già nota di M1: nella formula della verifica 4 `Oz - 0,630` i valori sono assoluti (z = -0,630 e -0,515 con O = (0; y; -0,45)); misurati esattamente quelli.
2. **S1.2 (differenza intenzionale M3: marcatori `viewpoint:V*`)**: il pizzico a (-0,15; -0,45) cade a 0,025 m da V1 (entro 0,04 m); ho allargato le distanze mantenendo i rapporti e le mani simmetriche attorno a O (fase A 0,36 -> 0,60, fase B raggio 0,27) invece dello spostamento in z, che rompe la verifica 4. Punti usati nel dettaglio nella sezione S1.2. Inoltre O ha y = 1,35 (testa a 1,6, come da incarico) e non 0,95 delle schede.
3. **S1.2 D4 (procedura)**: dopo D2 il plastico è a x = +0,20 e a scala 0,03 i pizzichi a (∓0,15; Oz) sono fuori dal raggio di presa (raggio modello x scala + 0,10 m): il gesto è partito 3,0 s dopo i pizzichi, in corsa, con `scale=0.0604` a fine gesto (ratio 2,0 per partenza tardiva), `translated x=0.300 z=0.000` (verifica 9 soddisfatta). Non è un difetto dell'app; per un D4 pulito centrare le mani sul nuovo centro.
4. **S1.3 (M3, visivo)**: il pilastro `viewpoint:V2` attraversa l'etichetta del corridoio e copre una cifra (`Hallway · 13_ m²`, `qa/reports/M3-gate-C2-S1.3-label-hall.png`). Etichetta (0,020; 1,426; -0,490), marcatore (0,065; 1,4375; -0,470). Il log è corretto, la funzione passa, ma è un difetto di leggibilità da girare a `xr-engineer`. In più il suggerimento `Palm up for the menu` (M3) compare sotto l'etichetta durante tutto S1.3.
5. **S1.4**: `triangles` totali 21 776 (A, 0,05), 23 200 (A, 0,12), 21 456 (B) > obiettivo interno di 20 000 (non decide l'esito; M1 21,3-21,6k). `callsPerView` 40 / 35 / 34 (il caso peggiore previsto per M3 è 71 per vista; qui il massimo letto è 41 per vista, con il suggerimento e i pulsanti `Menu` presenti). Nuova riga `[soglia:stats:groups]` (M3). `textures` 7 (M1: 8-9): il censimento per nome del framework non è stato rifatto (nessuna sonda).
6. **S1.6 V5**: in M3 la persistenza salva `prefs.onboardingStep`; con `reset=1` la sequenza riparte (come richiede lo scenario). Il comportamento senza `reset=1` (la scheda dice di invertire V5 in S4.4) non è stato esercitato.
7. Differenze intenzionali di M3 viste e non trattate come FAIL: riga `params` con `pinch=grip`; pulsanti `Menu` ai polsi (`ui:menu-button-left/-right`) sempre presenti; suggerimento `Palm up for the menu`; pilastri blu `viewpoint:V*`; `input source=grip ... reason=param`; `state cleared reason=reset keys=N` e `state none key=...`; `miniature translated` anche con 0,000 e il campo `offset` nello stato.
8. Alla prima accettazione (senza passare alle mani) negli screenshot di S1.5 N/T compaiono le forme locali dei controller (`controller visuals: local shape`): atteso, la sessione IWER parte con i controller connessi.

## Cosa l'emulatore non dimostra (da aggiungere a `qa/device/DEBT.md`)

- fps e tempo per frame reali: qui SwiftShader 5-6 fps, p50 150 ms (profilo S1.4, non calibrato); draw call (max 41/vista) e triangoli (max 23,3k totali) vanno misurati sul Quest con casa A e B, anche con il menu aperto e le etichette.
- Mani locali: il browser sul Quest non deve fare richieste a `cdn.jsdelivr.net` e le mani devono essere tracciate (S1.1 V7b/V7c non provabili qui senza sonda; i controller IWER sono connessi all'avvio).
- Affidabilità del pizzico a due mani reale (zoom/rotazione/traslazione), soglie di presa e raggio di presa (0,65 m dalla testa, raggio del modello + 0,10 m) con mani vere; comodità dei limiti 0,03/0,12 e del clamp 0,30 m; interferenza dei marcatori `viewpoint:V*` (0,04 m) con il gesto a due mani con le dita reali.
- Leggibilità a 0,5-0,8 m dell'etichetta della stanza, dei glifi `·` e `²`, del pannello d'errore e del suggerimento `Palm up for the menu`, con il campo visivo stretto dei Meta VR Glasses; sovrapposizione con i pilastri dei punti di vista (AVVISO 4).
- Mano fantasma dell'onboarding: si capisce senza spiegazioni, dimensione, velocità, non disturba il campo visivo; tempo di 1,0 s di quiete prima della comparsa (`SHOW_DELAY_S`, non misurabile con la latenza CLI).
- Altezza e distanza del plastico comode da seduti; spazio di riferimento reale del Quest; colori dei pavimenti e dei muri sui display del visore.

## Trappole di procedura

- Fuori dalla modalità `pinch=grip` della scheda, con i marcatori M3 i pizzichi a (Ox ∓ 0,15; Oz) cadono su `viewpoint:V1` (0,025 m): usare span 0,36 -> 0,60 e raggio di rotazione 0,27, oppure spostare di lato; i marcatori (scala 0,05) stanno a (-0,130; -0,465), (0,065; -0,470), (0,215; -0,535) e si muovono con il plastico (centro x scala x rotazione).
- Gesto a due mani: parte solo con ENTRAMBE le mani entro raggio modello x scala + 0,10 m e a <= 0,65 m dalla testa; con il plastico traslato (D4) centrare i pizzichi sul nuovo centro, altrimenti la partenza è tardiva e la scala cambia.
- Il timeout dell'onboarding (9,0 s) corre durante le chiamate MCP: per fase A subito dopo il primo pizzico mandare in un solo blocco `set_transform` x2 + `set_select_value` x2 + `animate_to` x2 + rilascio x2; lo screenshot a due mani solo nella prova del timeout (passo 11) con `browser_screenshot` MCP subito dopo il pizzico (copiare il file da `/tmp/iwsdk-screenshot-*.png`).
- Le righe `[soglia:hands]` ogni 2 s riempiono il buffer da 200: leggere i log sempre con `since` e `pattern` stretto o con il pattern `^(?!\[soglia:(hands|stats|state)\])`; il filtro `level` con `since` funziona anche su 200 righe.
- `browser_interact`: dopo `browser_profile start`, un `wait` di 3000 ms viene rifiutato (`exceeds the remaining batch budget`): usare 1500 ms; la durata reale è circa +1 s.
- `xr_look_at` perpendicolo sulla base dà una quaternione degenere (0,5; 0,5; 0,5; -0,5), innocua per la prova negativa di S1.3 passo 7.
- `dev-params.local.txt` con `pinch=grip` -> la riga `params` termina con `pinch=grip`; con `auto` il campo non compare. Il file è stato cancellato a fine prova e la pagina ricaricata con i parametri predefiniti.
- Durata: circa 30 minuti (dalle 12:33 alle 13:00 UTC circa del 02/11, dai timestamp dei log), nessuna interruzione.
