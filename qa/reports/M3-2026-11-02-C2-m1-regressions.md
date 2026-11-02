# Gate PC M3 · parte C2 · regressioni di M1 (S1.1-S1.6)

Data: 2026-11-02 · Ambiente: cloud (Linux, SwiftShader, runtime IWER headless già avviato) · ramo `m3`
Esecutore: emulator-qa (Sonnet 5.5). Rendering software: gli fps non sono significativi.
Testa a (0; 1,6; 0) (default della sessione, quindi O = (0; 1,35; -0,45), non (0; 0,95; -0,45) degli scenari scritti per testa a 1,2 m).

## Tabella scenari (aggiornata dopo ogni scenario)

| Scenario | Scheda | Modalità pinch | Esito | Note |
|---|---|---|---|---|
| S1.1 | M1-open-house | grip (completo) + auto (giro ridotto) | **PASS** (V7b/V7c solo in parte: vedi Avvisi) | O = (0; 1,350; -0,450), 33 entità con StableId, `house:apartment-a` a (-0,275; 1,350; -0,630), `room:living` a (-0,145; 1,350; -0,515), 0 error/warn |
| S1.2 | M1-two-hands | - | - | - |
| S1.3 | M1-room-label | - | - | - |
| S1.4 | M1-budget | - | - | - |
| S1.5 | M1-house-b-and-errors | - | - | - |
| S1.6 | M1-onboarding | - | - | - |

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
