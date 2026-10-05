# S0.2 · Runtime headless e sessione XR emulata

**Milestone**: M0 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`)

## Precondizioni
- Nessun runtime attivo: `npx @iwsdk/cli dev down` (esito qualsiasi).
- Avvio **headless** (annunciarlo all'utente prima, regola di `AGENTS.md`):
  `npx @iwsdk/cli dev up --ai-mode agent`.
- Attendere `npx @iwsdk/cli dev status` con `browserCommandReady: true` (timeout 60 s, ripetere ogni 5 s).
- Strumenti MCP disponibili (`xr_*`, `browser_*`, `ecs_*`). Se mancano: `npx @iwsdk/cli adapter sync` e chiedere all'utente di riavviare Claude Code.
- Nessun parametro URL (non servono in M0).

## Passi
1. `xr_get_session_status` → salva la risposta nel report.
2. `browser_get_console_logs` con `count: 100` (nessun filtro `level`, che nasconderebbe gli errori).
3. `xr_accept_session`.
4. `xr_get_session_status` di nuovo.
5. `xr_set_input_mode` con `mode: "hand"` → salva `activeDevices`.
6. `xr_set_transform` con `device: "headset"`, `position: {x: 0, y: 1.2, z: 0}`.
7. `xr_get_transform` per `headset`, `hand-left`, `hand-right`.
8. `ecs_list_systems`.
9. `browser_screenshot` → allegare il percorso (`screenshotPath`) al report.
10. `browser_reload_page`, attendere `browserCommandReady: true`, poi `xr_get_session_status` (avvio a freddo dopo il ricaricamento).
11. `xr_end_session`.
12. `npx @iwsdk/cli dev down`.

## Verifiche (tutte obbligatorie)
1. Passo 1: la risposta arriva senza errore (nessun `browser_not_launched`, nessun timeout).
2. Passo 2: nessuna voce di livello `error`. Avvisi (`warn`) ammessi ma elencati nel report.
3. Passi 3–4: dopo `xr_accept_session` lo stato indica la sessione **attiva** (diverso dalla risposta del passo 1).
4. Passo 5: `activeDevices` contiene sia `hand-left` sia `hand-right` e **non** contiene `controller-left` né `controller-right`.
5. Passo 7: tutte le coordinate restituite sono numeri finiti; per `headset` `y` = 1,2 ± 0,01 dopo il passo 6.
6. Passo 8: `ecs_list_systems` restituisce almeno un sistema (il mondo ECS è vivo).
7. Passo 9: il file dello screenshot esiste e non è vuoto.
8. Passo 10: dopo il ricaricamento `xr_get_session_status` risponde entro 15 s e l'app si riavvia senza errori in console (`browser_get_console_logs`).
9. Passi 11–12: la sessione termina e il runtime si ferma (`dev status` non riporta più il runtime attivo).

## Esito
PASS se tutte le verifiche sono soddisfatte · FAIL altrimenti, con atteso vs ottenuto. Se il runtime non parte per ragioni ambientali (browser mancante, porta 8081), esito **BLOCKED** con la causa e il comando che l'ha rivelata.

## Da rimandare al visore
Sessione WebXR reale su Quest con `handTracking: true` e assenza dell'emulatore sul visore (voci M0 in `qa/device/DEBT.md`, vedi `docs/plans/M0.md`).
