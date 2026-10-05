# S1.5 · Casa B e gestione degli errori di caricamento

**Milestone**: M1 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`)
Scenario aggiunto dal pianificatore (non è nella ROADMAP originale). Prerequisiti: T1.5, T1.6, T1.8.

## Precondizioni
- Runtime headless; headset a (0; 1,2; 0); mani. Tre esecuzioni, cambiando `dev-params.local.txt` + `browser_reload_page`:
  - **B**: `house=apartment-b&role=visitor&reset=1&seed=1&debug=1`
  - **N**: `house=nope&role=visitor&reset=1&seed=1&debug=1`
  - **T**: `house=..%2Fapartment-a&role=visitor&reset=1&seed=1&debug=1` (tentativo di uscire dalla cartella)

## Passi
### Esecuzione B
1. `xr_accept_session`, `xr_set_input_mode` `mode: "hand"`, attesa 2 s.
2. `browser_get_console_logs` con `pattern: "\\[soglia\\]"`.
3. `ecs_find_entities` (una per ciascuno, `limit: 50`): `^house:`, `^room:`, `^wall:`, `^door:`, `^window:`, `^(miniature:root|table:plinth)$`.
4. `browser_screenshot` → allegare.

### Esecuzione N
5. `browser_reload_page` con il file N; `xr_accept_session`; attesa 2 s.
6. `browser_get_console_logs` senza filtro `level` (`count: 200`).
7. `ecs_find_entities` con `namePattern: "^(house|room|wall|door|window|miniature|table):"` e con `namePattern: "^ui:error-panel$"`.
8. `browser_screenshot` → allegare.

### Esecuzione T
9. Come i passi 5–8 con il file T.

## Verifiche (tutte obbligatorie)
**Esecuzione B**
1. Log: `[soglia] house loaded apartment-b rooms=4 walls=9 doors=4 windows=4`.
2. Entità: `^house:` → solo `house:apartment-b`; `^room:` → 4 (`room:living`, `room:bedroom`, `room:bathroom`, `room:hall`); `^wall:` → 9 (`wall:w-north`, `wall:w-east`, `wall:w-south`, `wall:w-west`, `wall:w-living-bath`, `wall:w-living-hall`, `wall:w-bedroom-hall`, `wall:w-living-bedroom`, `wall:w-bath-hall`); `^door:` → 4 (`door:d-entrance`, `door:d-living`, `door:d-bedroom`, `door:d-bathroom`); `^window:` → 4 (`window:win-living`, `window:win-bedroom`, `window:win-bedroom-east`, `window:win-bathroom`); `miniature:root` e `table:plinth` presenti.
3. Nessuna entità `*apartment-a*`. Nessun `error` in console.

**Esecuzioni N e T**
4. Log (livello `warn`): `[soglia] house not found: nope` (N) e `[soglia] house not found: ../apartment-a` (T).
5. **Nessuna richiesta di rete** per quel file (la lista bianca blocca prima del `fetch`): nessuna voce di console `Failed to load resource` / `404`. Se `npx @iwsdk/cli dev logs --tail 100` mostra le richieste HTTP, nessuna deve riguardare `houses/nope.json` né percorsi con `..` (altrimenti la verifica si basa solo sulla console).
6. Entità: la prima ricerca del passo 7 restituisce **0** risultati; `ui:error-panel` → **1** risultato.
7. Zero voci di livello `error` in console e nessuna eccezione non gestita (`[unhandledrejection]`).
8. Screenshot: il report descrive il pannello d'errore (testo grande, davanti alla testa, a circa 0,6 m) e cita il testo esatto visibile: "This home could not be found." e "Reload the page or choose another home."

**Dati corrotti (non eseguibile qui, coperto da test unitari)**
9. Il report rimanda a `tests/unit/house.test.ts` per i casi "casa non valida" (`[soglia] house invalid: <path>: <message>`); verifica: i test esistono e passano.

## Esito
PASS se le verifiche 1–8 sono soddisfatte e la 9 è confermata · FAIL altrimenti.

## Da rimandare al visore
Leggibilità del pannello d'errore a 0,6 m (voce secondaria, accorpata alla leggibilità del testo di M1).
