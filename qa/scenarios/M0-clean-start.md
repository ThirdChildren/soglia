# S0.3 · Avvio pulito: nessun contenuto del template

**Milestone**: M0 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`)

## Precondizioni
- Runtime headless attivo come in S0.2 (`npx @iwsdk/cli dev up --ai-mode agent`, `browserCommandReady: true`).
- Task T0.6 completato (contenuto del template rimosso).

## Passi
1. `browser_reload_page`, attendere `browserCommandReady: true`.
2. `browser_get_console_logs` con `count: 200`, senza filtro `level`.
3. `npx @iwsdk/cli dev logs --tail 200` → log del server di sviluppo.
4. `ecs_find_entities` con `namePattern: "robot|welcome|webxr banner|sansevieria|^environment$"`, `limit: 50`.
5. `ecs_list_systems` → elenco dei nomi.
6. `scene_get_render_stats` → registra `calls` e `triangles` come base di partenza.
7. `xr_accept_session`, `xr_get_session_status`, poi `browser_get_console_logs` ancora una volta (errori che compaiono solo in sessione), infine `xr_end_session`.
8. `browser_screenshot` (fuori sessione) → allegare.

## Verifiche (tutte obbligatorie)
1. Passo 2 e 7: nessuna voce di livello `error`; nessun messaggio che nomini 404, `Failed to load`, `jsdelivr`, `gltf`, `uikitml`, `chime`.
2. Passo 3: nessuna riga 404 né `ERR`/`error` dal server di sviluppo.
3. Passo 4: **0** entità trovate.
4. Passo 5: l'elenco **non** contiene `RobotSystem` né `PanelSystem`.
5. Passo 6: se `available: true`, `calls` ≤ 10 e `triangles` ≤ 5 000 (scena vuota). Se `available: false`, annotarlo e passare oltre (non bloccante).
6. Passo 7: la sessione si avvia con la scena vuota senza errori.
7. Passo 8: lo screenshot esiste; il report dice a parole cosa mostra (atteso: solo lo sfondo a gradiente, nessun oggetto).

## Esito
PASS se le verifiche 1–4, 6 e 7 sono soddisfatte (la 5 è informativa quando `available: false`) · FAIL altrimenti.

## Da rimandare al visore
Niente.
