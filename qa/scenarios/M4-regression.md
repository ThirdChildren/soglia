# S4.9 · Regressione rapida di M1, M2 e M3 dopo M4

> **Changelog 2026-11-02**: scenario creato dal piano M4. Usa gli scenari esistenti **con i punti di partenza corretti il 2026-11-02** (S1.2, S2.6, S2.9, S3.0, S3.2, S3.3; vedi la riga di changelog in testa a ciascuno) e `pinch=grip`.

**Milestone**: M4 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`) · **Regola di `CLAUDE.md`**: 1, 3, 4, 8, 9
Non introduce criteri nuovi: ripete gli scenari elencati e conferma che **i loro criteri non sono cambiati** (salvo le differenze attese qui sotto). Prerequisito: tutti i task di M4. Convenzioni: `qa/scenarios/M3-persistence.md` e `qa/scenarios/M4-issue-create.md` (pose, `D_GRIP`, pizzico prolungato, orologio).

## Esecuzione
- Ruolo `visitor` (default) e `pinch=grip`, salvo dove indicato. Ogni scenario con il suo file di parametri (sempre con `reset=1`, già verificato nelle schede). Regola per il report: una riga per scenario (PASS / PASS con avvisi / FAIL), la causa degli avvisi e gli screenshot citati dagli scenari originali.
- Ordine (dal più economico): S2.1 → S2.2 → S2.5 → S2.3 → S2.4 → S2.7 → S2.6 → S2.9 → S1.2 → S1.3 → S1.6 → S3.7 → S3.8 → S3.0 → S3.1 → S3.2 → S3.3 → S3.4 → S3.5 → S3.9 (con `qa/scenarios/M4-budget.md`). S1.1, S1.4 e S1.5 (casa B e pannello d'errore) si leggono dai log di S2.8/S4.10 e di un unico caricamento di B; S2.0 (glifi) è nel giro delle etichette.
- **Giro `pinch=auto`** (ridotto, punto di pizzico dai giunti, `xr_select` ≥ 0,4 s): S2.1, S2.2, S2.5, S3.6 (`qa/scenarios/M3-joints.md`): stessi esiti.
- **Ruolo `tenant` e `landlord`** (ridotto): S2.2 (posa del letto), S3.3 e S3.7 con `role=tenant`: i flussi di M2/M3 non cambiano con il ruolo; il menu del palmo ha le stesse schede.

## Differenze attese rispetto a M3 (avvisi o fatti nuovi, **non** FAIL)
- 4 pulsanti invece di 2 (`ui:menu-button-left/-right` e `ui:issue-button-left/-right`); `^ui:menu-button-` resta 2; `^ui:(menu|issue)-button-` è 4; le chiamate per vista sono +2 (S4.10).
- 4 entità `fixture:*` nuove (`^fixture:`): le conte per prefisso di S1.1 non le includono (`^house:`, `^room:`, `^wall:`, `^door:`, `^window:`).
- `state saved key=… pieces=N bytes=N reason=debounce` ora termina con ` issues=<n> role=<ruolo> parked=<n>`: un confronto a fine riga con `$` non vale più; usare il prefisso.
- Le righe `[soglia:state]` portano le segnalazioni in forma compatta (`issues:[…]`) e il campo `role`.
- `menu pinned pitchDeg=… anchorPitchDeg=…` dopo ogni apertura del menu `pinned` (S3.7, S3.8).
- Etichetta del corridoio (S1.3): ora leggibile, riga `room label layer markers=…`.
- `viewpoint confirm start/cancelled` (solo se T4.R6 è fatto): in S3.1 e S3.2 il pizzico sul marcatore va **tenuto ≥ 0,6 s** (`xr_set_select_value` 1, attesa 0,8 s, 0) invece di `xr_select 0.3`; vedi la nota in testa a `qa/scenarios/M3-viewpoint.md`. Con il solo ripiego (raggio 0,025 m) i pizzichi a 0,02 m dal marcatore (vecchia ricetta di zoom) **non** entrano più nel punto di vista.
- In scala reale (S3.1, S3.5 parte reale) compare `ui:tabletop-button` e i pulsanti "Menu"/"Issues" non ci sono.
- Pezzi propri non persi se `my-furniture.json` manca (S3.0 non lo prova da solo: lo fa S4.4 fase 6).
- Con un ruolo diverso da `tenant` il pizzico prolungato non fa nulla (`issue denied …`): negli scenari di M2/M3 con `visitor` non produce segnalazioni.

## Verifiche
1. Per ciascuno scenario elencato, tutte le sue verifiche obbligatorie sono soddisfatte (con i punti corretti); nessun nuovo `error`, `Missing glyph`, `reading 'add'`, `budget exceeded`.
2. Le differenze attese sono riportate come tali nel report, una volta, in testa.
3. Il giro `pinch=auto` e i giri con `tenant`/`landlord` danno gli stessi esiti (o differenze spiegate dalle costanti dei giunti, `qa/…/reference_m3_hand_constants`).
4. S3.9 e S4.10 sono eseguiti una sola volta (con la tabella unica "previsione contro misura").
5. Le voci rimaste aperte (W4, prove solo visore) non sono riaperte: il report le elenca come in `qa/device/DEBT.md`.

## Esito
PASS se le verifiche 1–4 sono soddisfatte · FAIL altrimenti. Se uno scenario fallisce per un **punto di partenza** non libero, si aggiusta il punto nello scenario (un solo aggiornamento, riga di changelog) senza cambiare il criterio, come per i riporti di M3.

## Da rimandare al visore
Nessuna voce nuova oltre a quelle degli scenari elencati.
