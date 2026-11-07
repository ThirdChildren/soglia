# S6.2 · Statistiche dei frame, riepilogo di sessione e pannello nel visore (`ui:debug-hud`)

> **Changelog 2026-11-07**: scenario creato dal piano M6 (D65, D68, D71; T6.A6, T6.A7, T6.A8). Gli fps di IWER (software o GPU del PC) sono **solo informativi**: qui si verifica il **formato**, il **costo in chiamate** e la **posizione** del pannello, non le prestazioni. I passi che dipendono da T6.A7 (coda dei log) sono ➖ se il task è tagliato.

**Milestone**: M6 (fase A) · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`) · **Regole di `CLAUDE.md`**: 3 (prestazioni), 8 (il pannello è uno strumento di sviluppo, **esente** dal cono; dichiarato), 5 · Piano: `docs/plans/M6.md`.
Prerequisiti di implementazione: T6.A6; per i passi 4–5 T6.A7; per i passi 2–3 e 6–7 T6.A8. Convenzioni: `qa/scenarios/M5-gate-notes.md` e `qa/scenarios/M5-budget.md` (K2, K3, K18, formula `callsPerView = calls / views`, sorgente `[soglia:stats]` con un pannello aperto, mai `scene_get_render_stats`).

## Precondizioni
- `BASE` = `house=apartment-a&role=tenant&reset=1&seed=1&debug=1&pinch=grip&furnish=scandinavian&time=2026-12-21T10:00` (K2: 14 pezzi, menu chiuso).
- Preparazione standard di M5 per ogni passo (file, `browser_reload_page`, `xr_accept_session`, `xr_set_input_mode {mode: "hand"}`, attesa 7 s, testa (0; 1,6; 0), mani a riposo).

## Passi
1. **Prima della sessione**. Scrivere `BASE`, ricaricare **senza** accettare la sessione. Log `pattern: "frames|stats|hud|log-tail"` → nessuna riga `[soglia:frames]` (non c'è sessione); `ecs_find_entities` `^ui:debug-hud$` → 0 entità **oppure** 1 non visibile (`Visibility` falsa); `xr_get_session_status` → `sessionActive: false`.
2. **Righe dei frame**. `xr_accept_session`, mani, attesa 7 s. Log `pattern: "soglia:frames"`, almeno 3 righe a distanza di ~2 s, ciascuna con **tutti** i campi `n`, `hz`, `avgMs`, `p95Ms`, `maxMs`, `over`, `fps`, `class`; `class` ∈ {`OK`, `LOW`, `FAIL`}; coerenza: `p95Ms ≥ avgMs`, `maxMs ≥ p95Ms`, `fps ≈ 1000 / avgMs` (± 5 %), `n ≤ 120`. Le righe `[soglia:stats]` e `[soglia:stats:groups]` hanno ancora **tutti i campi di M5** nello stesso ordine; il gruppo `hud=<n>` è **in coda** alla riga dei gruppi.
3. **Pannello nel visore**. Log `hud shown distance=<d>` con `d` in [0,55; 0,85]. `ecs_find_entities` `^ui:debug-hud$` → 1 entità, `Visibility` vera. `ecs_query_entity` `ui:debug-hud` con `["Transform"]` → distanza dalla testa (0; 1,6; 0) in [0,55; 0,85] e distanza dal centro del plastico (`miniature:root`) ≥ 0,50 m (non sta sopra il plastico). `ui_inspect` `ui:debug-hud`: il testo contiene `fps`, `ms`, `calls` e una delle parole `OK`/`LOW`/`FAIL`; nessun testo in italiano; nessun figlio fuori dal bordo. `browser_screenshot` → allegare.
4. **Coda dei log** (T6.A7; ➖ se tagliato). Scrivere `BASE&time=2026-02-30T10:00` (data inesistente), ricaricare e accettare la sessione. Log `pattern: "param time"` → **una sola** riga `param time="…" ignored: …` (warn); `ui_inspect` del HUD: contiene `param time` (riga troncata a ≤ 48 caratteri). Verifica del non-raddoppio: la riga del `warn` compare **una volta** nel buffer dei log (il gancio inoltra all'originale, non lo duplica). Riga `log-tail capture on lines=40` presente una volta.
5. **Riepilogo di sessione**. Attesa 12 s dopo l'avvio della sessione: log `pattern: "stats:summary"` → riga con `seconds ≥ 10`, `minFps`, `worstMs`, `maxCallsPerView`, `maxTriangles`, `windowsBelow60`, `windows`; `minFps ≤ fps` dell'ultima riga `frames`; `maxCallsPerView ≥ callsPerView` letto in `[soglia:stats]`. `xr_end_session`: una riga `[soglia:stats:summary]` alla sospensione e `hud hidden reason=no-session`; nuova `xr_accept_session`: il riepilogo riparte (`seconds` < 10 alla prima riga). L'unico `warn` accettato dopo `xr_end_session` è `THREE.WebGLRenderer: Can't change size while VR device is presenting.` (contratto di M5).
6. **Costo in chiamate (K2)**. Con `BASE` (HUD acceso), menu chiuso, a regime (attesa 8 s e dopo la prima apertura/chiusura del menu per spegnere il suggerimento): `callsPerView_hud1` dalla riga `[soglia:stats]` e `hud_calls` dal gruppo `hud`. Poi `BASE&hud=0`, stesso stato: `callsPerView_hud0`. **Verifiche**: `callsPerView_hud1 − callsPerView_hud0 ≤ 3`; `callsPerView_hud0` = K2 di `qa/scenarios/M5-budget.md` (atteso dopo T5.RA **46**, ± 1; se M5 ha misurato altro nel suo report, vale quel numero); con `hud=0`: `hud=0` nel gruppo, 0 entità visibili `ui:debug-hud`, log `hud hidden reason=hud0`, la riga `params` finisce con `hud=0`; con `hud=1` la riga `params` **non** ha `hud=` in coda.
7. **Caso peggiore (K18)**. Ricetta di K18 di `M5-budget.md` (`my-sofa` non valido sopra `furniture:bed-double#1`, menu `pinned` aperto, etichette del motivo e del FitCheck, marcatori, ruolo `tenant`) con HUD acceso: `callsPerView` ≤ 100 (atteso ≤ 75) e, con `hud=0`, uguale a K18 di M5 (68 a regime, 70 dopo il rilascio, 66, 64 a riposo; tolleranza ±1). Triangoli ≤ 150.000 in entrambi.
8. **Senza `debug=1`**. `house=apartment-a&role=tenant&reset=1&seed=1&pinch=grip` (nessun `debug`): `xr_accept_session`, attesa 7 s. Nessuna riga `[soglia:frames]`, `[soglia:stats…]`, `[soglia:env]`, `hud …`, `log-tail …`; `ecs_find_entities` `^ui:debug-hud$` → 0; con `hud=1` esplicito e senza `debug`: un solo `warn` `param hud ignored: needs debug=1`.
9. **Alto contrasto**. `BASE&contrast=1`: `ui_inspect` del HUD: sfondo `#000000`, testo `#ffffff` (il test `theme-contrast` lo garantisce per il `.uikitml`).
10. Log senza filtro (`error`, `uncaught`, `Cannot read`, `reading 'add'`, `Missing glyph`, `budget exceeded`): nessuna riga oltre ai `warn` voluti del passo 4 e di `xr_end_session`/passo 8; pulizia.

## Verifiche (tutte obbligatorie)
1. **Passo 1**: nessuna riga di frame né pannello visibile prima della sessione; la sonda e il HUD non avviano alcuna sessione (`sessionActive: false`).
2. **Passo 2**: tre righe `[soglia:frames]` con tutti i campi e coerenti; le righe di M5 (`stats`, `stats:groups`) conservano i loro campi, `hud` in coda.
3. **Passo 3**: `ui:debug-hud` a 0,55–0,85 m dalla testa e ≥ 0,50 m dal plastico, testo con `fps`, `ms`, `calls` e la parola di stato, screenshot allegato.
4. **Passo 4** (T6.A7): la riga di `warn` compare nel HUD e **una sola volta** nei log.
5. **Passo 5**: riepilogo ogni ~10 s e alla sospensione, azzerato a una nuova sessione.
6. **Passo 6**: HUD ≤ **+3** chiamate; `hud=0` = K2 di M5.
7. **Passo 7**: K18 ≤ 100 con HUD; uguale a M5 con `hud=0`.
8. **Passo 8**: senza `debug=1` nessuna traccia degli strumenti di M6 (M5 invariato).
9. **Passo 9**: HUD in alto contrasto.
10. Console: 0 `error`; nessun `Missing glyph`, nessun `reading 'add'`, nessun `budget exceeded`.
11. **Solo visore** (alta): gli fps veri (`[soglia:frames]` con `hz` 72/90/120), il HUD si legge a 0,55–0,85 m senza togliere il visore e senza dare fastidio, il costo reale del pannello UIKit, la soglia `OK ≥ 70` ha senso rispetto alla frequenza di aggiornamento del browser.

## Esito
PASS se le verifiche 1–3 e 5–10 sono soddisfatte (4 se T6.A7 c'è) · FAIL altrimenti.

## Da rimandare al visore
Voce "HUD `ui:debug-hud` nel visore" e "Frequenza di aggiornamento effettiva" di `docs/plans/M6.md`; le misure vere sono S3/S4 di fase B.
