# S6.5 · Regressione ridotta e budget: la fase A non cambia M5

> **Changelog 2026-11-07**: scenario creato dal piano M6 (D65). Dimostra che le manopole, il HUD, la sonda e il cablaggio dei consumatori **non cambiano il comportamento di M5** con i default, e che senza `debug=1` non c'è alcuna traccia degli strumenti. Non sostituisce la regressione completa di `M5-regression.md`: ne esegue un sottoinsieme rappresentativo dei consumatori toccati da T6.A2/T6.A3.

**Milestone**: M6 (fase A) · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime` + shell) · **Regole di `CLAUDE.md`**: 3, 4 · Piano: `docs/plans/M6.md`.
Prerequisiti: tutti i task della fase A consegnati. Convenzioni e calibrazioni: `qa/scenarios/M5-gate-notes.md` (`pinch=grip`, punti corretti). Report di riferimento: `qa/reports/M5-2026-11-06.md`.

## Passi
1. **Controlli del repository**. `npm test` (tutti i test di M5 passano **senza modifiche ai file di test esistenti**: `git diff --stat -- tests/unit` mostra solo file nuovi o aggiunte, nessun test M1–M5 riscritto per il cablaggio; i test nuovi sono ≥ 150), `npm run typecheck`, `npm run build`. Dimensione del pacchetto principale (`dist/assets/*.js`, gzip) a confronto con M5 (misurata sullo stesso computer prima/dopo, es. `git stash`/commit precedente): crescita ≤ 20 kB.
2. **Test dei default**. `npm test -- tuning-defaults` verde: ogni default della tabella coincide con la costante originale importata dal suo modulo (D65).
3. **Sottoinsieme di scenari con `debug=1&hud=0` e senza `t_*`**, `pinch=grip`, `reset=1&seed=1` (per ciascuno: preparazione standard di M5, lettura dei log che lo scenario indica): **S1.3** etichetta della stanza (`M1-room-label.md`), **S2.1** menu del palmo (`M2-palm-menu.md`, apertura e chiusura con entrambe le mani), **S2.2** posa del letto e **S2.3** collisione (`M2-place-bed.md`, `M2-collision.md`), **S2.9** traslazione del plastico a una e a due mani (`M2-translate-miniature.md`), **S3.1** punto di vista V1 e ritorno (`M3-viewpoint.md`), **S3.7** pulsante `Menu` a una mano (`M3-menu-button.md`), **S4.1** pizzico prolungato sulla lavatrice e segnaposto (`M4-issue-create.md`), **S5.4** passo "Rotate" (`M5-one-hand.md`) e **S5.7** coach (`M5-menu-onboarding.md`). Atteso: **stessi esiti e stesse righe di log** del report di M5 (valori numerici uguali: posizioni, distanze, `maxAngleDeg`, durate nominali), nessuna riga nuova diversa da `tuning table` e, con la sessione, `[soglia:env]`/`[soglia:frames]`.
4. **Budget**. Con `debug=1&hud=0`: K2 (14 pezzi, menu chiuso, a regime), K3 (menu `pinned` aperto), K12 (scala reale con `Tabletop`), K18 (caso peggiore) di `M5-budget.md`. Atteso: **uguali** a quelli del report di M5 (K18 = 68 / 70 / 66 / 64; gruppo `house` = 8 in A, 7 in B; ± 1 per il rumore di IWER); triangoli ≤ 150.000.
5. **Senza `debug=1`**. `house=apartment-a&role=tenant&reset=1&seed=1&pinch=grip`, sessione XR 15 s, poi `S3.1` breve. Elenco dei **prefissi distinti** delle righe di console: uguale a quello di M5 (nessuna riga `tuning`, `[soglia:env]`, `[soglia:frames]`, `hud`, `log-tail`, `fov-mask`); la riga `params …` è identica al formato di M5; `console.log` non avvolto (una riga `warn` provocata, ad esempio `house=nope`, compare **una volta**).
6. **Stato salvato invariato**. Con `debug=1` (per le righe `state`): dopo una posa e un annulla, le righe `state saved …` hanno gli stessi campi di M5 e **nessun campo di taratura** (la taratura non si salva, D66); ricaricare senza `reset=1`: `state restored pieces=…` come in M5 e `tuning table` ma nessuna `tuning set` (la taratura non sopravvive alla ricarica, a meno che sia nell'URL o nel file).
7. **Pausa e ripresa**. S3.0 (`M3-persistence.md`, fase di sessione nascosta/ripresa con `F8`/`F9`, se i ganci di debug sono attivi) e S4.4 breve (`M4-persistence-resume.md`): invariati.
8. Log senza filtro (`error`, `uncaught`, `Cannot read`, `reading 'add'`, `Missing glyph`, `budget exceeded`): nessuna riga; l'unico `warn` accettato è quello di framework dopo `xr_end_session`.

## Verifiche (tutte obbligatorie)
1. **Passo 1**: test/typecheck/build verdi; nessun test esistente modificato; crescita del pacchetto ≤ 20 kB gzip.
2. **Passo 2**: test dei default verde.
3. **Passo 3**: ogni scenario del sottoinsieme PASS con gli stessi numeri di M5.
4. **Passo 4**: K2/K3/K12/K18 uguali a M5 (± 1).
5. **Passo 5**: nessuna traccia degli strumenti di M6 senza `debug=1`; `console.log` non avvolto.
6. **Passo 6**: stato salvato senza campi nuovi; la taratura non si salva.
7. **Passo 7**: pausa/ripresa come in M5.
8. Console: 0 `error`, 0 `warn` oltre a quelli attesi; nessun `Missing glyph`, nessun `reading 'add'`.
9. **Solo visore**: nulla (la regressione sul visore è S1–S4 di fase B).

## Esito
PASS se le verifiche 1–8 sono soddisfatte · FAIL altrimenti. Un FAIL qui **blocca** il gate della fase A (la regola d'oro D65 è violata).

## Da rimandare al visore
Nessuna voce nuova.
