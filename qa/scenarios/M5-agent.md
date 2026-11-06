# S5.3 · Agente: punti informativi e Furnish / Clear

> **Changelog 2026-11-06**: scenario creato dal piano M5 (D57; T5.8–T5.10, T5.R3). La "mappa dell'interesse" (S5.2 del primo ROADMAP) è **tagliata**: nessun file.

**Milestone**: M5 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`) · **Regole di `CLAUDE.md`**: 1, 7 ("Sample data"), 9, 10
Prerequisiti di implementazione: T5.8–T5.10 (T5.R3 per la verifica 1). Vedi `docs/plans/M5.md`. Convenzioni: `qa/scenarios/M4-issue-create.md` (pose, ricette, pannello Issues).

## Precondizioni
- `dev-params.local.txt` = `house=apartment-a&role=visitor&reset=1&seed=1&debug=1&pinch=grip&time=2026-12-21T10:00`. Pulsante `ui:issue-button-right` a (0,4347; 1,565; −0,5665); chip e controlli del pannello si leggono con `ecs_query_entity` `["Transform"]` a ogni schermata.
- Posizione dei punti informativi in coordinate di casa: caldaia `info-001` (2,3; 1,6→1,2; 4,8), lavatrice (0,42; 0,85; 5,05), piano cottura (0,4; 0,9; 2,2), tapparella (6,8; 2,2→1,2; 0,1), vetro di `win-living-1` (valori esatti letti dai `Transform` di `pin:info-00N`).

## Passi
1. **Visitatore**: preparazione standard; log `pattern: "role|pins|issues"`; `ecs_find_entities` `^pin:` (→ solo `pin:info-001`…`-005`), `^pin:issue-` (→ 0), `^ui:agent-` (→ 0); `ecs_query_entity` su `pin:info-001` con `["Transform"]`; `browser_screenshot` → allegare (cinque rombi ciano sul plastico).
2. **Inquilino non li vede**: aprire il pannello Issues (`ui:issue-button-right`), `ui:issue-role-tenant`, chiudere; `ecs_find_entities` `^pin:`; log `pattern: "pins layer"`. Poi `ui:issue-role-visitor` per tornare.
3. **Il chip Agent**: aprire il pannello Issues come visitatore; `ui_inspect` (testi dei chip); `ui:issue-role-agent`; `ui_inspect` della `home` dell'agente; `ecs_find_entities` `^ui:agent-` (→ `ui:agent-furnish`, `ui:agent-clear`); log `pattern: "role|issues"`.
4. **Un punto informativo**: chiudere il pannello (`ui:issue-close`); pizzico breve su `pin:info-001` (mano a `posizione − D_GRIP`): log `pattern: "info|issues screen"`; `ui_inspect` (titolo `Info`, testo `Condensing boiler.`, `Sample data`, tutti i `fontSize` ≥ 2,4 cm); `ecs_find_entities` `^ui:issue-action-` (→ 0); `ui:issue-close`.
5. **Furnish**: riaprire il pannello (agente), pizzico su `ui:agent-furnish`: log `pattern: "agent staging|furniture|state saved"`; `ecs_find_entities` `^furniture:` (→ 14); `[soglia:state]`; `browser_screenshot` → allegare (la casa arredata).
6. **Undo di un passo**: pannello chiuso (si chiude da solo dopo l'azione), aprire il menu `pinned` con `ui:menu-button-right`, pizzico su `ui:menu-undo`: `ecs_find_entities` `^furniture:` (→ 0). Aprire il pannello, `ui:agent-furnish` di nuovo (→ 14).
7. **Clear**: pizzico su `ui:agent-clear`: log `pattern: "agent staging|furniture"`; `^furniture:` (→ 0); Undo dal menu: `^furniture:` (→ 14); pizzico su `ui:agent-clear` di nuovo.
8. **Persistenza**: `ui:agent-furnish` (→ 14), attesa 1,5 s, riscrivere il file **senza** `reset=1` e **senza** `role=` (restano `time=` e `debug=1`), ricaricare: log `pattern: "role|state restored|agent"`; `^furniture:` (→ 14).
9. **Chi non può**: ruolo `visitor` e `tenant` (chip): `ecs_find_entities` `^ui:agent-` (→ 0 in entrambi).
10. **Casa B**: riscrivere il file con `house=apartment-b&role=agent&reset=1&…`, ricaricare: log `pattern: "issues seed|pins layer|agent"`; aprire il pannello Issues: `ecs_find_entities` `^ui:agent-` (→ solo `ui:agent-clear`), `^pin:` (→ 0).
11. Log senza filtro (`error`, `uncaught`, `Cannot read`, `reading 'add'`, `Missing glyph`); pulizia (select 0 su entrambe, mani a riposo, `xr_end_session`, cancellare `dev-params.local.txt`).

## Verifiche (tutte obbligatorie)
1. **Passo 1**: `pins layer count=0 baseline=0 info=5 role=visitor`; 5 `pin:info-*` e **nessun** `pin:issue-*`; i rombi ciano non sono rossi/arancioni/verdi (forma e colore distinti, visibile dallo screenshot); `pin:info-001` a (2,3; 1,2; 4,8) ± 0,02 (quota limitata a 1,2 m).
2. **Passo 2**: con il ruolo `tenant` `pins layer count=3 baseline=0 info=0 role=tenant` e **0** `pin:info-*`; tornando a `visitor` di nuovo 5.
3. **Passo 3**: i chip sono quattro (`Visitor`, `Agent`, `Tenant`, `Landlord`) e **nessun** testo `coming soon`; dopo `ui:issue-role-agent`: `role changed from=visitor to=agent source=ui`; i controlli `ui:agent-furnish` e `ui:agent-clear` esistono; per l'agente **nessun** `pin:issue-*` e 5 `pin:info-*`.
4. **Passo 4**: `info opened id=info-001`, `issues screen=info`; il testo contiene `Condensing boiler.` e `Sample data`; **0** controlli d'azione; tutti i testi ≥ 2,4 cm.
5. **Passo 5**: `agent staging action=furnish style=scandinavian pieces=14`; 14 `furniture:*`; `state saved … pieces=14`; il pannello si chiude (`issues panel closed via=…`); nessuna riga `error`.
6. **Passo 6**: l'Undo toglie **tutti** e 14 i pezzi in un passo (`furniture undo` con `action=stage`), `^furniture:` → 0; il nuovo Furnish riporta 14 con gli id `furniture:<catalogId>#1…` (i contatori di istanza non scendono: dopo Undo e Furnish gli id sono `#2` per i pezzi che ne avevano uno).
7. **Passo 7**: `agent staging action=clear pieces=0`; `^furniture:` → 0; Undo → 14.
8. **Passo 8**: alla ricarica 14 pezzi (`state restored pieces=14`) e ruolo `agent` (`role set agent source=saved`).
9. **Passo 9**: per `visitor` e `tenant` 0 controlli `ui:agent-*`.
10. **Passo 10**: `apartment-b` non ha staging: **nessun** `ui:agent-furnish` (nessun pulsante morto), `ui:agent-clear` presente; `issues seed none reason=no-demo-file`, `pins layer count=0 baseline=0 info=0 role=agent`.
11. Nessuna voce `error`; nessun `Missing glyph`; nessun `reading 'add'`; "Sample data" è l'unico modo in cui i dati di esempio compaiono; nessun testo in italiano.
12. **Solo visore** (alta): i rombi si leggono e si prendono a 1:20 con le dita; Furnish senza scatti (14 pezzi).

## Esito
PASS se le verifiche 1–11 sono soddisfatte · FAIL altrimenti.

## Da rimandare al visore
Voci "Punti informativi" e "Furnish / Clear" di M5 in `qa/device/DEBT.md`.
