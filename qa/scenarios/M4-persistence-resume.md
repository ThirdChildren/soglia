# S4.4 · Ripresa: ruolo, segnalazioni, pezzi parcheggiati, ciclo di vita

> **Changelog 2026-11-02**: scenario creato dal piano M4 (D41, D44, T4.R4, T4.11). Estende S3.0 (`qa/scenarios/M3-persistence.md`, che resta valido) con ruolo e segnalazioni.

**Milestone**: M4 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`) · **Regola di `CLAUDE.md`**: 4 (avvio rapido, pausa e ripresa pulite)
Prerequisiti di implementazione: T4.2, T4.R4, T4.11 (T4.4–T4.9 per i pin e il pannello). Convenzioni: `qa/scenarios/M4-issue-create.md` e `qa/scenarios/M3-persistence.md`.

**Limiti degli strumenti** (come S3.0): nessuno strumento MCP legge `localStorage` né cambia `visibilityState`; la prova è la **ricarica** più le righe `state saved` / `state restored` / `issues restored`; la sospensione si simula con `F8`/`F9` (`debug=1`), che **simulano** l'evento (il report lo dichiara).

## Precondizioni
- File di parametri di partenza: `house=apartment-a&role=tenant&reset=1&seed=1&debug=1&pinch=grip&time=2026-11-04T10:00`. Ogni cambio di fase riscrive il file indicato, `browser_reload_page`, `xr_accept_session`, `xr_set_input_mode hand`, attesa 2,5 s.

## Passi
1. **Fase 1 · salva ruolo e segnalazioni**. Con il file di partenza: creare `issue-014` (S4.1 passi 2–4); posare una `chair` in soggiorno a `W(1,5; 3,0)` (S2.2); attesa **1,5 s**. Log `pattern: "state saved|issues|role|furniture placed"`; `ecs_find_entities` `^pin:` (→ 4), `^furniture:` (→ 1).
2. **Fase 2 · ricarica senza `reset` e senza `role`**. File = `house=apartment-a&seed=1&debug=1&pinch=grip&time=2026-11-04T10:00` (senza `reset=1`, senza `role=`). Letture: log `pattern: "role|issues|state|furnish|miniature placed"`; `^pin:` (→ 4); `^furniture:` (→ `furniture:chair#1`); `ecs_find_entities` `^ui:issue-panel$` (→ 0, l'interfaccia non si salva); pizzico su `ui:issue-button-right` e `ui:issue-open-list`: righe `items=` (con `issue-014`); `browser_screenshot` → allegare.
3. **Fase 3 · il ruolo dell'URL vince**. File = `house=apartment-a&role=landlord&seed=1&debug=1&pinch=grip&time=2026-11-04T10:00` (senza `reset`), ricarica: log; `^pin:` (→ 4); attesa 1,5 s: `state saved … role=landlord`. Poi file senza `role=` e ricarica: `role set landlord source=saved`.
4. **Fase 4 · `reset=1` cancella**. File con `reset=1` e `role=tenant`: log `pattern: "state cleared|issues seeded|role"`; `^pin:` (→ 3: il seme), `^furniture:` (→ 0). Ricarica senza `reset=1`: `issues restored count=4`, `^pin:` (→ 3).
5. **Fase 5 · una casa non eredita dall'altra**. Con `house=apartment-b&role=tenant` (senza `reset`): log `issues seed none reason=no-demo-file` (B non ha un file demo e **non parte alcuna richiesta**: nessun 404 in console), `^pin:` (→ 0), `^furniture:` (→ 0); tornare ad `apartment-a`: `issues restored count=4`.
6. **Fase 6 · pezzo proprio non perso (T4.R4)**. File = `house=apartment-a&role=tenant&reset=1&seed=1&debug=1&pinch=grip`. Menu → scheda `mine` → posare `my-sofa` in soggiorno a `W(2,0; 1,5)` (S3.3 passo 2); attesa 1,5 s (`state saved … pieces=1`). Poi `…&debug=1&failmy=1` (senza `reset`), ricarica: log `pattern: "state|my furniture|parked"` (→ `state piece parked id=furniture:my-sofa#1 reason=unknown-catalog`, **nessuna** riga `state piece discarded`); `^furniture:` (→ 0); posare una `chair` (S2.2); attesa 1,5 s: `state saved … pieces=1 … parked=1`. Poi **senza** `failmy` (senza `reset`), ricarica: `^furniture:` (→ `furniture:my-sofa#1` **e** `furniture:chair#1`), `state restored pieces=2`.
7. **Fase 7 · sospensione con la bozza aperta**. File di partenza (con `reset=1`); pizzico prolungato sulla lavatrice (bozza aperta, schermata `new`); `browser_interact` `press` `F8`; attesa 1 s. Log `pattern: "lifecycle|issue|issues panel|state saved"`: `lifecycle suspended source=debug-key state=hidden`, `issue draft cancelled reason=suspend`, `issues panel closed via=suspend`; `^pin:draft$` (→ 0), `^ui:issue-panel$` (→ 0); `^pin:` (→ 3). `xr_set_select_value hand-right` 0 (la mano IWER è ancora "chiusa"), `press` `F9`; `lifecycle resumed source=debug-key state=visible`; il pulsante `ui:issue-button-right` funziona di nuovo (pannello si apre); nessuna segnalazione nuova.
8. **Fase 8 · fine sessione con il pannello aperto**. Pannello aperto sull'elenco; `xr_end_session`; attesa 1 s; log `pattern: "lifecycle|issues panel|state saved"`; `xr_accept_session`, `xr_set_input_mode hand`: `^ui:issue-panel$` (→ 0), `^pin:` come prima, nessun `error`.
9. **Fase 9 · punto di vista e "Tabletop" alla ripresa** (T4.R1 + D35). Entrare in `viewpoint:V1` (pizzico tenuto 0,6 s sul marcatore, S3.1), attesa 2,5 s; ricarica senza `reset`: log `pattern: "viewpoint|tabletop button|walls"`; `ecs_find_entities` `^ui:tabletop-button$` (→ 1) e `^ui:issue-button-` (→ 0 in scala reale); pizzico sul pulsante (S4.6): ritorno al plastico.
10. `browser_get_console_logs` senza filtro (`error`, `QuotaExceeded`, `Cannot read`, `reading 'add'`); `browser_screenshot` al passo 2 → allegare; pulizia come S3.0.

## Verifiche (tutte obbligatorie)
1. **Fase 1**: una sola riga `state saved key=soglia:v1:state:apartment-a pieces=1 bytes=<n> reason=debounce issues=5 role=tenant parked=0` dopo l'ultima modifica (tra 0,45 s e 1,5 s dalla riga `issue created` o `furniture placed`; ±0,05 s è avviso; `issues=5` = i tre del seme, il verbale e `issue-014`); 4 `pin:*`; 1 `furniture:*`.
2. **Fase 2**: `role set tenant source=saved`; `issues restored count=5 key=soglia:v1:state:apartment-a`; `state restored pieces=1`; 4 `pin:*` incluso `pin:issue-014` rosso nella stessa posizione; `furniture:chair#1` nella stessa posa; nessuna riga `issues seeded` (il seme non si ricarica); 0 `ui:issue-panel`; `selectedRoomId` `null`; l'elenco del proprietario/inquilino contiene `issue-014`.
3. **Fase 3**: `role set landlord source=url` (il parametro vince sul salvato); poi `state saved … role=landlord`; al caricamento senza `role=`: `role set landlord source=saved`. Il ruolo non viene mai preso dal salvato quando l'URL lo dice.
4. **Fase 4**: con `reset=1`: `state cleared reason=reset keys=<n≥1>`, `issues seeded issues=3 baseline=1 source=demo`, 3 `pin:*` e 0 pezzi; alla ricarica senza `reset`: `issues restored count=4` (i quattro del seme: 5 meno la `issue-014` cancellata dal reset) e 3 `pin:*`.
5. **Fase 5**: A e B non condividono lo stato: in B nessun pezzo e nessun pin di A; al ritorno ad A i dati di A tornano (`issues restored count=4`).
6. **Fase 6**: `state piece parked id=furniture:my-sofa#1 reason=unknown-catalog` (warn, una per pezzo), **nessuna** `state piece discarded` per quel pezzo, `^furniture:` = 0 con `failmy`; il successivo `state saved` ha `parked=1` e, alla ricarica normale, **entrambi** i pezzi tornano (`furniture:my-sofa#1`, `furniture:chair#1`, `state restored pieces=2`): prima di M4 il pezzo proprio sarebbe stato perso.
7. **Fase 7**: `issue draft cancelled reason=suspend`, 0 `pin:draft`, 0 pannelli, `issues` invariate (3 `pin:*` dopo il `reset`), nessun `state saved … issues=` con una segnalazione in più; alla ripresa il pulsante "Issues" risponde; nessun `error`.
8. **Fase 8**: dopo `xr_end_session` il pannello è chiuso, nessuna bozza, nessun pin perso o duplicato (`^pin:` invariato), nessun `error`.
9. **Fase 9**: dopo la ricarica con il punto di vista salvato esiste **1** `ui:tabletop-button` e **0** `ui:issue-button-*` e `ui:menu-button-*`; il pulsante riporta al plastico (S4.6).
10. Nessuna voce `error`; nessuna riga `QuotaExceeded` né `feature localStorage unavailable`.
11. Il report dichiara in chiaro: (a) `localStorage` assente/bloccato/pieno e il debounce sono **solo nei test unitari**; (b) `F8`/`F9` **simulano** l'evento; (c) la ripresa vera (visore tolto/rimesso) è **solo visore** (`qa/device/DEBT.md`).

## Esito
PASS se le verifiche 1–10 sono soddisfatte e la 11 è nel report · FAIL altrimenti (una segnalazione, un pezzo o il ruolo persi o duplicati è FAIL).

## Da rimandare al visore
Ripresa vera con segnalazioni e ruolo (togliere e rimettere il visore, ricaricare la pagina); `localStorage` nel Quest Browser.
