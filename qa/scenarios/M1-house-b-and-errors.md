# S1.5 · Casa B e gestione degli errori di caricamento

**Milestone**: M1 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`)
Scenario aggiunto dal pianificatore (non è nella ROADMAP originale). Prerequisiti: T1.5, T1.6, T1.8.

## Precondizioni
- Runtime headless; headset a (0; 1,2; 0); mani. Tre esecuzioni, cambiando `dev-params.local.txt` + `browser_reload_page`:
  - **B**: `house=apartment-b&role=visitor&reset=1&seed=1&debug=1`
  - **N**: `house=nope&role=visitor&reset=1&seed=1&debug=1`
  - **T**: `house=..%2Fapartment-a&role=visitor&reset=1&seed=1&debug=1` (tentativo di uscire dalla cartella; il valore decodificato è `../apartment-a`, id **non valido**: il parser dei parametri lo IGNORA e l'app usa la casa predefinita `apartment-a`)

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
9. Come i passi 5–8 con il file T. In più, al passo 7 la ricerca `^(house|room|wall|door|window|miniature|table):` deve dare 33 risultati (casa A completa) e `^ui:error-panel$` 0; al passo 6 cercare nei log le righe `param house=`, `invalid house id ignored`, `house loaded` e `house not found`.

## Verifiche (tutte obbligatorie)
**Esecuzione B**
1. Log: `[soglia] house loaded apartment-b rooms=4 walls=9 doors=4 windows=4`.
2. Entità: `^house:` → solo `house:apartment-b`; `^room:` → 4 (`room:living`, `room:bedroom`, `room:bathroom`, `room:hall`); `^wall:` → 9 (`wall:w-north`, `wall:w-east`, `wall:w-south`, `wall:w-west`, `wall:w-living-bath`, `wall:w-living-hall`, `wall:w-bedroom-hall`, `wall:w-living-bedroom`, `wall:w-bath-hall`); `^door:` → 4 (`door:d-entrance`, `door:d-living`, `door:d-bedroom`, `door:d-bathroom`); `^window:` → 4 (`window:win-living`, `window:win-bedroom`, `window:win-bedroom-east`, `window:win-bathroom`); `miniature:root` e `table:plinth` presenti.
3. Nessuna entità `*apartment-a*`. Nessun `error` in console.

**Esecuzione N (`house=nope`: id valido ma sconosciuto)**
4. Log (livello `warn`): `[soglia] house not found: nope`.
5. **Nessuna richiesta di rete** per quel file (la lista bianca blocca prima del `fetch`): nessuna voce di console `Failed to load resource` / `404`. Se `npx @iwsdk/cli dev logs --tail 100` mostra le richieste HTTP, nessuna deve riguardare `houses/nope.json` (altrimenti la verifica si basa solo sulla console).
6. Entità: la prima ricerca del passo 7 restituisce **0** risultati; `ui:error-panel` → **1** risultato.
7. Zero voci di livello `error` in console e nessuna eccezione non gestita (`[unhandledrejection]`).
8. Screenshot: il report descrive il pannello d'errore (testo grande, davanti alla testa, a circa 0,6 m) e cita il testo esatto visibile: "This home could not be found." e "Reload the page or choose another home."

**Esecuzione T (`house=../apartment-a`: id NON valido, ignorato dal parser)**
4T. Log del caricamento corrente, entrambe di livello `warn`, in quest'ordine: `[soglia] param house="..?apartment-a" ignored: expected letters, digits, "-" or "_"` (nel valore stampato il `/` è sostituito da `?`, come fa `printable` in `src/logic/params.ts`; testo osservato nel report del 2026-10-05) e poi `[soglia] invalid house id ignored`. La riga `[soglia] params source=dev-file house=apartment-a ...` mostra la casa predefinita.
5T. Viene caricata la casa A: `[soglia] house loaded apartment-a rooms=5 walls=13 doors=5 windows=7`. **Non** compare `[soglia] house not found: ../apartment-a` (né alcun `house not found`).
6T. Entità: la prima ricerca del passo 7 restituisce **33** risultati (casa A completa: 1 house + 5 room + 13 wall + 5 door + 7 window + `miniature:root` + `table:plinth`); `ui:error-panel` → **0** risultati. Nessun pannello d'errore nello screenshot (il report descrive il plastico della casa A).
7T. **Nessuna richiesta di rete** per `../apartment-a` (né per percorsi con `..`): il loader non viene nemmeno interrogato; nessuna voce `Failed to load resource` / `404` in console e, se `npx @iwsdk/cli dev logs --tail 100` mostra le richieste HTTP, nessuna riguarda percorsi con `..` (altrimenti la verifica si basa solo sulla console).
8T. Zero voci di livello `error` in console e nessuna eccezione non gestita (`[unhandledrejection]`).

**Dati corrotti (non eseguibile qui, coperto da test unitari)**
9. Il report rimanda a `tests/unit/house.test.ts` per i casi "casa non valida" (`[soglia] house invalid: <path>: <message>`); verifica: i test esistono e passano.

## Esito
PASS se le verifiche 1–8 (esecuzione B: 1–3; esecuzione N: 4–8; esecuzione T: 4T–8T) sono soddisfatte e la 9 è confermata · FAIL altrimenti.

## Da rimandare al visore
Leggibilità del pannello d'errore a 0,6 m (voce secondaria, accorpata alla leggibilità del testo di M1).

## Changelog
- 2026-10-05: esecuzione T (`house=../apartment-a`) riscritta: id non valido IGNORATO dal parser → casa A caricata con 33 entità, nessun `ui:error-panel`, nessun `house not found: ../apartment-a`, warn `param house="..?apartment-a" ignored: expected letters, digits, "-" or "_"` e nuova riga `[soglia] invalid house id ignored`, nessuna richiesta di rete per `..`; verifiche T separate come 4T–8T, mentre N (`house=nope`, id valido ma sconosciuto) resta invariata con pannello d'errore e `house not found: nope` — motivo: F3 del report `qa/reports/M1-2026-10-05.md`; la validazione dell'id in `src/logic/params.ts` scatta prima della lista bianca del loader, il comportamento è sicuro e voluto (decisione di gate dell'utente), lo scenario descriveva un percorso diverso.
