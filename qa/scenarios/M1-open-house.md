# S1.1 · Apri la casa A: il plastico compare con le entità attese

**Milestone**: M1 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`)
Prerequisiti di implementazione: T1.1, T1.2, T1.5, T1.6, T1.8, T1.9 (vedi `docs/plans/M1.md`).

## Precondizioni
- Runtime headless: `npx @iwsdk/cli dev up --ai-mode agent`, attendere `browserCommandReady: true`.
- Parametri (gli strumenti MCP non navigano a URL con query, vedi decisione D1 del piano): scrivere nella radice del progetto il file `dev-params.local.txt` con **una sola riga**
  `house=apartment-a&role=visitor&reset=1&seed=1&debug=1`
  poi `browser_reload_page`. (Equivalente a `/?house=apartment-a&role=visitor&reset=1&seed=1&debug=1`.)
- Input: mani. Testa da seduti a (0; 1,2; 0), yaw 0.

## Passi
1. `browser_get_console_logs` con `pattern: "\\[soglia\\]"`, `count: 100`.
2. `xr_set_transform` con `device: "headset"`, `position: {x: 0, y: 1.2, z: 0}`.
3. `xr_accept_session`, poi `xr_set_input_mode` con `mode: "hand"`.
4. `browser_interact` con un passo `wait` di 2000 ms, poi `browser_get_console_logs` con `pattern: "miniature placed"`. **Prendere l'ultima riga**: i suoi `x y z` sono l'origine **O** del plastico (atteso (0,000; 0,950; −0,450)).
5. `ecs_find_entities`, una chiamata per ciascuno (`limit: 50`):
   - `namePattern: "^house:"`
   - `namePattern: "^room:"`
   - `namePattern: "^wall:"`
   - `namePattern: "^door:"`
   - `namePattern: "^window:"`
   - `namePattern: "^(miniature:root|table:plinth)$"`
6. `scene_get_runtime_hierarchy` con `maxDepth: 8`: ricavare gli UUID di `house:apartment-a` e `room:living`; poi `scene_get_object_transform` per ciascuno (posizione e scala globali).
7. `browser_screenshot` (sessione attiva) → allegare.
8. `browser_get_console_logs` senza filtro, `count: 200` (cercare `error`).

## Verifiche (tutte obbligatorie)
1. Passo 1 contiene, in quest'ordine:
   - `[soglia] params source=dev-file house=apartment-a role=visitor reset=true seed=1 debug=true`
   - `[soglia] house loaded apartment-a rooms=5 walls=13 doors=5 windows=7`
2. Passo 4: `[soglia] miniature placed x=… y=… z=… yawDeg=0.0 scale=0.0500` con `x` = 0 ± 0,02, `y` = 0,95 ± 0,02, `z` = −0,45 ± 0,02. Se `y` ≠ 0,95 (es. la posa di partenza della testa non è stata applicata), annotarlo nel report e usare i valori loggati come O; la verifica passa solo se `y − (altezza testa − 0,25)` = 0 ± 0,02 con l'altezza testa letta con `xr_get_transform`.
3. Passo 5, conteggi **esatti** e id esatti:
   - `^house:` → 1 entità, `house:apartment-a` (nessun `house:apartment-b`).
   - `^room:` → 5: `room:living`, `room:bedroom`, `room:study`, `room:bathroom`, `room:hall`.
   - `^wall:` → 13: `wall:w-north`, `wall:w-east`, `wall:w-south-hall`, `wall:w-notch`, `wall:w-south-bath`, `wall:w-west`, `wall:w-living-bath`, `wall:w-living-hall`, `wall:w-bedroom-hall`, `wall:w-study-hall`, `wall:w-living-bedroom`, `wall:w-bedroom-study`, `wall:w-bath-hall`.
   - `^door:` → 5: `door:d-entrance`, `door:d-living`, `door:d-bedroom`, `door:d-study`, `door:d-bathroom`.
   - `^window:` → 7: `window:win-living-1`, `window:win-living-2`, `window:win-bedroom`, `window:win-study`, `window:win-study-east`, `window:win-living-west`, `window:win-bathroom`.
   - ultimo filtro → 2: `miniature:root` e `table:plinth`.
   Ogni entità trovata ha il componente `StableId` (campo `value` uguale al nome).
4. Passo 6 (tolleranza ± 0,005 m, ± 0,001 sulla scala), con O = (Ox; Oy; Oz) e yaw 0:
   - `house:apartment-a`: scala globale 0,05; posizione globale (Ox − 0,275; Oy; Oz − 0,630).
   - `room:living`: posizione globale (Ox − 0,145; Oy; Oz − 0,515).
5. Passo 8: nessuna voce di livello `error`; nessun `[soglia] house invalid`; nessun `[soglia] house not found`.
6. Screenshot allegato; il report descrive a parole: plastico visibile davanti alla testa, pavimenti di due colori distinti (legno e piastrelle), muri bassi con varchi per le porte.

## Esito
PASS se le verifiche 1–5 sono tutte soddisfatte e lo screenshot è allegato · FAIL altrimenti, con atteso vs ottenuto e le righe di log rilevanti.

## Da rimandare al visore
Altezza e distanza del plastico comode da seduti; spazio di riferimento reale del Quest; leggibilità dei colori; fps reali (voci M1 in `qa/device/DEBT.md`).
