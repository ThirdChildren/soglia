# S1.4 · Budget grafico di M1 (draw call e triangoli)

**Milestone**: M1 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`); i valori in fps sono **solo informativi**
Prerequisiti di implementazione: T1.8, T1.9, T1.14 (vedi `docs/plans/M1.md`).

## Precondizioni
- Runtime headless. Headset a (0; 1,2; 0), mani.
- Due esecuzioni consecutive, cambiando `dev-params.local.txt` e facendo `browser_reload_page` tra l'una e l'altra:
  - **Esecuzione 0 (senza debug)**: `house=apartment-a&role=visitor&reset=1&seed=1`
  - **Esecuzione 1**: `house=apartment-a&role=visitor&reset=1&seed=1&debug=1`
  - **Esecuzione 2**: `house=apartment-b&role=visitor&reset=1&seed=1&debug=1`

## Passi
1. Esecuzione 0: `xr_accept_session`, `xr_set_input_mode` `mode: "hand"`, attesa 6 s, `browser_get_console_logs` con `pattern: "soglia:(stats|state)"`.
2. Esecuzione 1: stessa preparazione, attesa **7 s**, poi `browser_get_console_logs` con `pattern: "soglia:stats"`, `count: 50`.
3. `scene_get_render_stats` (registrare tutto: `calls`, `triangles`, `textures`, `geometries`, `programs`, `shadow casters`, campioni di tempo per fotogramma).
4. `browser_profile` con `action: "start"`, `mode: "rendering"`, `maxDurationMs: 5000`; attesa 5 s; `action: "stop"`. Registrare il tempo medio per fotogramma (informativo).
5. Caso peggiore: zoom massimo con la sequenza della fase C di `qa/scenarios/M1-two-hands.md` (passo 10, scala 0,12), attesa 3 s, di nuovo `browser_get_console_logs` con `pattern: "soglia:stats"`.
6. Esecuzione 2 (casa B): stessa preparazione dell'esecuzione 1, attesa 7 s, passi 2–3.
7. `browser_get_console_logs` senza filtro per ogni esecuzione (cercare `error`).
8. Per ogni esecuzione 1 e 2: `browser_get_console_logs` con `pattern: "budget exceeded|framework:"`; annotare il timestamp di `xr_accept_session` e quello del passaggio alle mani (`xr_set_input_mode` `mode: "hand"`) per la verifica 6.
9. Censimento delle texture (verifica 6): per l'esecuzione 1, dopo l'attesa del passo 2, una sonda **temporanea** nel browser (non va committata) che elenca per nome/dimensione le texture esistenti e le assegna all'app o al framework; in mancanza di una sonda, riportare almeno `textures` (totale) di ogni riga e confrontarlo con i valori di riferimento della verifica 6 (informativi).

## Verifiche (tutte obbligatorie)
1. Esecuzione 0: **nessuna** riga `[soglia:stats]` né `[soglia:state]` (le statistiche compaiono solo con `debug=1`).
2. Esecuzioni 1 e 2: almeno 3 righe `[soglia:stats]` a circa 2 s di distanza, nel formato
   `[soglia:stats] fps=<n> calls=<n> views=<1|2> callsPerView=<n> triangles=<n> geometries=<n> textures=<n>`.
3. **Budget (decide l'esito)**, sull'ultima riga di ciascuna esecuzione e sulla riga dopo lo zoom massimo: `callsPerView` ≤ 100 e `triangles` ≤ 150 000. Nota: `callsPerView = calls / views`.
4. **Obiettivo interno di M1** (non decide l'esito, ma va riportato come AVVISO se superato): `callsPerView` ≤ 50 e `triangles` ≤ 20 000. Nota: `triangles` della riga `[soglia:stats]` è il **totale delle due viste** (in sessione stereo `renderer.info.render` conta entrambi gli occhi); misurato sul PC il 2026-10-05: ~21,5k totali, cioè ~10,8k per vista. Il budget di `CLAUDE.md` (≤ 150k triangoli visibili) e la soglia interna di 20 000 restano invariati e vanno confrontati con il totale della riga.
5. Coerenza con `scene_get_render_stats`: `calls` di quello strumento è uguale a `calls` della riga `[soglia:stats]` oppure a `callsPerView` (± 20 %); se non lo è, riportare entrambi i valori e la spiegazione ipotizzata (non decide l'esito).
6. Texture, con la distinzione app / framework:
   a. **Texture DELL'APP** (create dal nostro contenuto o dalla nostra UI; oggi solo gli atlanti font UIKit dei pannelli: 256x512, 2 pagine = 2 texture; M1 non ha texture di contenuto): al massimo **4**, ciascuna ≤ **1024 px** sul lato maggiore.
   b. **Texture del FRAMEWORK** (non nostre): elencarle per nome e dimensione nel report, **senza limite** e senza che contino per il budget. Censimento misurato sul PC (`src/debug/stats.ts`, sonda del 2026-10-05): render target PMREM cubeUv 768x1024 RGBA16F e il suo ping-pong 768x1024 (da `IBLGradient` della scena, creati da `EnvironmentSystem`); lookup 32x32 RG16F di three (primo draw con MeshStandard); ossa delle mani 12x12 (2); modelli dei controller Meta Quest Touch Plus: `crystalControllers_left_BaseColor` e `crystalControllers_right_BaseColor` 2048x2048 più 2 `_matricesTexture` 8x8, caricati dal CDN perché IWER connette i controller a inizio sessione e restano in cache dopo il passaggio alle mani.
   c. Valori di riferimento **informativi** di `renderer.info.memory.textures` (totale, la riga `textures=` di `[soglia:stats]`): casa A 3 fuori XR, 7 in XR con i controller, 9 dopo il passaggio alle mani; con `house=nope` 4 / 9 / 11. Il totale non è un criterio di PASS: un valore diverso va riportato con la lista per nome.
   d. Il warn `[soglia] budget exceeded: texture 2048 px > 1024 px` **NON deve comparire** in nessuna esecuzione (0 righe con `budget exceeded` e `texture`).
   e. La riga `[soglia] framework: texture 2048 px > 1024 px (input model under world.player, not ours)` (livello `log`, una volta per cambiamento) **può** comparire solo con i controller connessi, cioè dopo `xr_accept_session` e fino al passaggio alle mani (più al massimo un campionamento di 2 s); non deve comparire fuori sessione né a lungo dopo il passaggio alle mani. Se compare, va registrata nel report con il timestamp e non è un fallimento.
7. Nessuna voce `error` in console in nessuna esecuzione; nessuna ombra attiva (`shadow casters` = 0).
8. Il report include una tabella con `callsPerView`, `triangles`, `fps` e tempo per fotogramma per ogni esecuzione e dichiara in chiaro: "gli fps sul PC non rappresentano il Quest".

## Esito
PASS se le verifiche 1, 2, 3, 6 e 7 sono soddisfatte per entrambe le case · FAIL altrimenti. Gli avvisi della verifica 4 non fanno fallire ma vanno in `qa/device/DEBT.md` come "misurare sul Quest".

## Da rimandare al visore
fps reali ≥ 60 sul Quest con A e B, draw call e triangoli reali letti via debug remoto, tempo per fotogramma; temperatura/sostenibilità non richieste in M1.

## Changelog
- 2026-10-05: verifica 6 emendata: si contano le texture DELL'APP (oggi 2 atlanti font UIKit 256x512), limite 4 e ciascuna ≤ 1024 px; le texture del framework (PMREM + ping-pong 768x1024, lookup 32x32, ossa mani 12x12, modelli controller Quest Touch Plus 2048x2048 + 2 matrici 8x8) vanno elencate per nome senza limite e senza contare per il budget; il warn `budget exceeded: texture 2048 px` è sostituito dalla riga `framework: texture 2048 px > 1024 px (input model under world.player, not ours)`, e lo scenario verifica che `budget exceeded` NON compaia e che `framework:` compaia solo con i controller connessi; aggiunti i passi 8–9 per raccogliere log e censimento — motivo: la baseline "≤ 4 texture totali" non teneva conto del framework (totale misurato 9 nel report `qa/reports/M1-2026-10-05.md`, F2); l'app non ha texture di contenuto. La soglia di 1024 px di CLAUDE.md resta valida per le texture dell'app.
- 2026-10-05: verifica 4: aggiunta la nota che `triangles` è il totale delle due viste (~21,5k totali, ~10,8k per vista) — motivo: chiarire il numero del report (21,3k–21,6k, AVVISO) senza cambiare la soglia interna di 20 000 né il budget di CLAUDE.md (≤ 150k).
