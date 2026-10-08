# S3.9 · Budget di M3: previsione contro misura

**Milestone**: M3 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`); gli fps sono **solo informativi** · **Regola di `CLAUDE.md`**: 3 (prestazioni)
Prerequisiti di implementazione: T3.4 (riga `[soglia:stats:groups]`, R-C), T3.16 (misura finale) e tutti i task che aggiungono elementi permanenti (T3.3b, T3.9, T3.12, T3.14). Vedi `docs/plans/M3.md`, D33 e la sezione "Previsione dei draw call fino a M5"; estende `qa/scenarios/M2-budget.md` (stesse regole di lettura: `callsPerView = calls / views`, `triangles` = totale delle due viste, la fonte con il menu aperto è la riga `[soglia:stats]`, mai `scene_get_render_stats`). Convenzioni comuni: `qa/scenarios/M3-persistence.md`.

## Precondizioni
- Esecuzioni consecutive con `dev-params.local.txt` e `browser_reload_page`:
  - **E1** (riferimento A): `house=apartment-a&role=visitor&reset=1&seed=1&debug=1&pinch=grip`
  - **E2** (A, 14 pezzi): `house=apartment-a&role=visitor&reset=1&seed=1&debug=1&pinch=grip&furnish=scandinavian`
  - **E3** (B): `house=apartment-b&role=visitor&reset=1&seed=1&debug=1&pinch=grip`
  - **E4** (ripiego a blocco): `house=apartment-a&role=visitor&reset=1&seed=1&debug=1&pinch=grip&furnish=scandinavian&failmodels=1`
  - **E5** (giunti, regressione): come E2 ma con `pinch=auto` (i numeri non devono cambiare di più di 1).
- Per ciascuna: `xr_accept_session`, `xr_set_input_mode {mode:"hand"}`, attesa 7 s, testa a (0; 1,6; 0).
- **Casi standard** (sei di M2 + due nuovi), tutti con la riga `[soglia:stats]` più recente dopo 3 s di attesa:
  - `K1` riferimento A senza arredi (E1), scala 0,05. `K2` E2 menu chiuso. `K3` E2 menu aperto. `K4` **caso peggiore**: E2 + 4 pezzi propri/di mobilità posati (`my-sofa`, `my-desk`, `my-bed`, `wheelchair`, in stanze diverse, tutti validi), menu aperto, **`my-sofa` in mano sopra `furniture:bed-double#1` in camera**: pezzo non valido con l'etichetta del motivo **e** l'etichetta del FitCheck con i marcatori (la camera dista due porte: `d-entrance` e `d-bedroom`). `K5` E2 menu chiuso e `K6` E2 menu aperto a scala **0,12** (zoom come M2-budget passo 4). `K7` **punto di vista**: E2, entrare in `viewpoint:V1`, menu chiuso. `K8` **metro**: E2, scheda `measure`, due punti posati e etichetta visibile, menu chiuso.
- **Verifica obbligatoria prima di ogni lettura di K4**: `ecs_find_entities` con `^ui:reason-` ≥ 1 **e** `^ui:fit-label$` = 1 **e** ≥ 2 `^ui:fit-marker-`, e le righe `reason shown` e `fit label shown` nel log; altrimenti la misura non vale (si ripete una volta e il report lo dichiara).

## Previsione (dal piano, D33; R-B e R-C inclusi nei task)
| Caso | M2 misurato | Previsione M3 | Soglia di avviso (previsione + 8) | Previsione M4 → M5 (solo tracciamento) |
|---|---|---|---|---|
| K1 A senza arredi | 35 | **40** | 48 | 40 → 40 |
| K2 14 pezzi, chiuso | 49 | **54** | 62 | 56 → 67 |
| K3 14 pezzi, aperto | 58 | **65** | 73 | 67 → 78 |
| K4 caso peggiore a 0,05 | 66 | **80** (alto 92) | 88 | 84 → 95 |
| K5 chiuso a 0,12 | 40 | **45** | 53 | – |
| K6 aperto a 0,12 | 49 | **56** | 64 | – |
| K7 punto di vista, 14 pezzi | – | **≤ 49** | 57 | ≤ 55 → ≤ 66 |
| K8 metro attivo | – | **59** (K2 + 5) | 67 | – |

## Passi
1. **E1**: attesa 7 s; `browser_get_console_logs` con `pattern: "soglia:stats"`, `count: 6` → K1; `scene_get_render_stats` (menu chiuso) per il confronto; `ecs_find_entities` con `^ui:menu-button-` (→ 2).
2. **E2**: K2, poi K3 (menu aperto, `L_MENU` con `Q_UP`, attesa 0,9 s + 3 s). Poi K4, che si prepara posando prima i 4 pezzi (schede `mine` e `fit`, S3.3/S3.5, tutti validi; `my-sofa#1` resta posato in soggiorno), poi aprendo il menu, prendendo `my-sofa` (sarà `furniture:my-sofa#2`) e portandolo (correzione del grip) sopra `furniture:bed-double#1` (posizione letta con `ecs_query_entity` `["Transform"]` + (0; 0,05; 0)); attesa 3 s; verifiche obbligatorie; lettura. Rilascio fuori dalla casa. Zoom a 0,12 (M1-two-hands fase C) e K5, K6.
3. **K7**: da E2 a scala 0,05, menu chiuso, `viewpoint:V1` (S3.1 passo 2), attesa 3 s → lettura; ritorno al tabletop.
4. **K8**: scheda `measure`, due punti sulla finestra dello studio (S3.2 passo 3), menu chiuso, attesa 3 s → lettura; uscita dalla scheda.
5. **E3, E4, E5**: attesa 7 s e lettura (E4 anche `furniture models loaded=0 fallback=14` e `furniture model unavailable` ×14, come M2-budget passo 9; E5 stessa lettura di K2/K3).
6. Per ogni lettura `[soglia:stats]` annotare anche l'ultima riga `[soglia:stats:groups]` (ogni 2 s con `debug=1`): `house`, `furniture`, `hands`, `ui`, `markers`, `other` (stima per attraversamento della scena, non il numero del renderer).
7. Per ogni esecuzione `browser_get_console_logs` con `pattern: "budget exceeded|framework:|Missing glyph|uncaught|unhandled"` e senza filtro (`error`); `browser_profile` (informativo) in K4.
8. Pulizia come S3.0.

## Verifiche (tutte obbligatorie)
1. **Blocca**: in **ogni** lettura (K1-K8, E1-E5) `callsPerView` ≤ **100** e `triangles` ≤ **150.000**. Più di 100 in una qualsiasi: FAIL del gate.
2. **Tracciamento** (D33, non blocca): il report contiene la tabella "previsione contro misura" con una riga per caso (K1-K8), le colonne M2, previsione, misurato, scarto, e per ogni scarto > +8 la scritta **AVVISO** con l'ipotesi da correggere (D33 aggiornata nel piano). **Se K4 ≥ 85 il report apre il task R-A (unire muri e soglie, −16 per vista, 2,5 h) come primo task di M4**; se K4 ≥ 85 e < 100 è avviso, non FAIL.
3. Il costo del menu `K3 − K2` ≤ 12 (avviso se superiore; atteso +9...+11) e il costo del pulsante Menu (K1 − 35 ≈ +4...+5; avviso se > 8).
4. `[soglia:stats:groups]`: `house` = 24 ± 2, `furniture` uguale al numero di pezzi (14 in K2, 18 in K4) ± 1, `hands` tra 5 e 8, `markers` ≤ 4 in K4; riga presente a ogni 2 s con `debug=1` e **assente** senza `debug=1`.
5. Texture dell'app ≤ 4 e ciascuna ≤ 1024 px; 0 righe `budget exceeded`; `shadowCasters` = 0 (nessuna ombra prima di M5); 0 voci `error`; nessun `Missing glyph info`.
6. E4 (blocchi): `furniture models loaded=0 fallback=14`; 14 righe `warn` `furniture model unavailable … using a block`; `callsPerView` ≈ 49 + (nuovi) con R-C (un blocco a una chiamata: la riga di M2 passa da 63 a ~49-54); il report dichiara il numero.
7. E5 (`pinch=auto`) differisce da E2 di non più di 1 chiamata per vista.
8. Il report dichiara in chiaro: "il conteggio di IWER (due passate) è un proxy; gli fps del PC non rappresentano il Quest" e le voci per il visore: draw call e fps reali del caso K4; costo reale dei pannelli UIKit (2 per radice?) e del multiview.

## Esito
PASS se la verifica 1 e le 5-7 sono soddisfatte per tutte le esecuzioni, la 2 è nel report e la 3-4 sono riportate (anche come avvisi) · FAIL altrimenti. **Regola di gate (utente, 2026-10-06)**: bloccano solo errori in console nel percorso normale, test/build rossi, violazioni di `CLAUDE.md` e > 100 draw call; tutto il resto è avviso.

## Da rimandare al visore
Draw call, triangoli e fps reali con K4; costo reale del pannello UIKit e del multiview (voce "Draw call e fps reali con il caso peggiore di M3" in `qa/device/DEBT.md`).

## Changelog
- 2026-10-09: scenario creato dal piano M3 (D33): previsione contro misura a ogni gate; K4 ≥ 85 apre R-A in M4.
