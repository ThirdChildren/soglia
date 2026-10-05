# S2.8 · Budget grafico con 14 arredi (preset di prova)

**Milestone**: M2 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`); gli fps sono **solo informativi**
Prerequisiti di implementazione: T2.5 (preset valido), T2.9, T2.14/T2.15 per il caso peggiore, T2.18 (vedi `docs/plans/M2.md`, D16, D20, D23). Estende `qa/scenarios/M1-budget.md`: valgono le stesse regole di lettura (`callsPerView = calls / views`, `triangles` = totale delle due viste).

## Precondizioni
- Esecuzioni consecutive, cambiando `dev-params.local.txt` e facendo `browser_reload_page` tra l'una e l'altra:
  - **Esecuzione 1**: `house=apartment-a&role=visitor&reset=1&seed=1&debug=1&furnish=scandinavian`
  - **Esecuzione 2**: `house=apartment-b&role=visitor&reset=1&seed=1&debug=1&furnish=scandinavian`
  - **Esecuzione 3** (riferimento senza arredi): `house=apartment-a&role=visitor&reset=1&seed=1&debug=1`
- Per ciascuna: `xr_accept_session`, `xr_set_input_mode` con `mode: "hand"`, attesa 7 s; testa a (0; 1,6; 0).
- Il preset `staging.scandinavian` di `apartment-a.json` ha 14 pezzi: `sofa-3seat` ×1, `coffee-table` ×1, `table-dining` ×1, `chair` ×4, `bed-double` ×1, `nightstand` ×2, `wardrobe` ×1, `desk` ×1, `bookcase` ×1, `plant` ×1. `apartment-b.json` non ha `staging`.

## Passi
1. Esecuzione 1: `browser_get_console_logs` con `pattern: "furnish|catalog|soglia:stats"`, `count: 30`; `ecs_find_entities` con `namePattern: "^furniture:"`.
2. `scene_get_render_stats` (annotare `calls`, `triangles`, `geometries`, `textures`, `programs`, `meshCount`, `shadowCasters`).
3. `browser_profile` con `action: "start"`, `mode: "rendering"`, `maxDurationMs: 5000`; attesa 5 s; `action: "stop"` (informativo).
4. **Caso peggiore**: zoom massimo (fase C di `qa/scenarios/M1-two-hands.md`, passo 10, scala 0,12), poi menu aperto (`hand-left` a `L_MENU` con `Q_UP`) e un pezzo in mano in posa non valida (presa di `ui:menu-item-armchair`, `xr_animate_to` sopra `furniture:bed-double#1`, **senza rilasciare**), attesa 3 s; `browser_get_console_logs` con `pattern: "soglia:stats"`, `count: 10`; `scene_get_render_stats`. Poi rilascio fuori dal plastico (il pezzo rientra).
5. Esecuzione 2: attesa 7 s, `browser_get_console_logs` con `pattern: "furnish|soglia:stats"`; `ecs_find_entities` con `^furniture:`.
6. Esecuzione 3: attesa 7 s, `browser_get_console_logs` con `pattern: "soglia:stats"`, `count: 10` (riferimento).
7. Per ogni esecuzione: `browser_get_console_logs` con `pattern: "budget exceeded|framework:|Missing glyph|uncaught|unhandled"` e senza filtro (cercare `error`). Annotare la riga `[soglia] font ready …` se esiste.
8. Dopo l'esecuzione 1: `browser_screenshot` (casa arredata, testa puntata sul plastico con `xr_look_at` verso O).

## Verifiche (tutte obbligatorie)
1. Esecuzione 1: riga `[soglia] furnish applied style=scandinavian pieces=14 invalid=0`; esattamente **14** entità `furniture:*` con id `furniture:sofa-3seat#1`, `coffee-table#1`, `table-dining#1`, `chair#1`–`#4`, `bed-double#1`, `nightstand#1`–`#2`, `wardrobe#1`, `desk#1`, `bookcase#1`, `plant#1`.
2. Esecuzione 2 (casa B): `[soglia] furnish: no staging in apartment-b` (livello `warn`), **0** entità `furniture:*`, nessun `error`, nessun pannello d'errore.
3. **Budget (decide l'esito)**, sull'ultima riga `[soglia:stats]` di ogni esecuzione e del caso peggiore: `callsPerView` ≤ 100 e `triangles` ≤ 150.000.
4. **Obiettivo interno di M2** (AVVISO se superato, non decide): `callsPerView` ≤ 70 e `triangles` ≤ 60.000 con i 14 pezzi; nel report anche la differenza rispetto all'esecuzione 3 (baseline M1: `callsPerView` ≈ 35, `triangles` ≈ 21,6k).
5. Texture: **texture dell'app ≤ 4** in totale e ciascuna ≤ 1024 px (atlanti font dal log `font ready` se presente; i glTF dei modelli devono condividere una sola texture); le texture del framework si elencano come in S1.4 verifica 6b senza limite; **0** righe `budget exceeded`; la riga `framework: …` solo come in S1.4 verifica 6e.
6. `shadowCasters` = 0 in ogni `scene_get_render_stats`; nessuna voce `error` in console; nessun `Missing glyph info`.
7. Coerenza con `scene_get_render_stats`: `calls` uguale a quello della riga `[soglia:stats]` (come S1.4 verifica 5).
8. Il report contiene una tabella con `callsPerView`, `triangles`, `textures`, `fps` e tempo per fotogramma per ogni esecuzione e il caso peggiore, e dichiara in chiaro: "gli fps sul PC non rappresentano il Quest".
9. Screenshot allegato; il report descrive a parole se i pezzi si distinguono (blocchi o modelli) e se il preset sembra "arredato".

## Esito
PASS se le verifiche 1, 2, 3, 5, 6 sono soddisfatte per le esecuzioni 1 e 2 · FAIL altrimenti. Gli avvisi della verifica 4 non fanno fallire ma vanno in `qa/device/DEBT.md` come "misurare sul Quest".

## Da rimandare al visore
fps reali ≥ 60 sul Quest con 14 pezzi, il menu aperto e un pezzo in mano; draw call e triangoli reali (debug remoto); costo dei pannelli del menu (voci M2 in `qa/device/DEBT.md`).
