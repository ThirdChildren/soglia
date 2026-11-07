# S6.5 · Regressione ridotta e budget: la fase A non cambia M5

> **Changelog 2026-11-07**: scenario creato dal piano M6 (D65). Dimostra che le manopole, il HUD, la sonda e il cablaggio dei consumatori **non cambiano il comportamento di M5** con i default, e che senza `debug=1` non c'è alcuna traccia degli strumenti. Non sostituisce la regressione completa di `M5-regression.md`: ne esegue un sottoinsieme rappresentativo dei consumatori toccati da T6.A2/T6.A3.

**Milestone**: M6 (fase A) · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime` + shell) · **Regole di `CLAUDE.md`**: 3, 4 · Piano: `docs/plans/M6.md`.
Prerequisiti: tutti i task della fase A consegnati. Convenzioni e calibrazioni: `qa/scenarios/M5-gate-notes.md` (`pinch=grip`, punti corretti). Report di riferimento: `qa/reports/M5-2026-11-06.md`.

> **Changelog 2026-11-07 (sera, T6.A12)**: aggiunta la sezione "Ordine del gate PC (T6.A13)" qui sotto (questo file fa anche da note del gate della fase A, come `M5-gate-notes.md` per M5). Il budget del passo 4 usa come riferimento **K2/K3/K18 rimisurati al gate con `hud=0`** (la base che l'ingegnere ha letto con 14 pezzi è 50 e non i 46 della previsione di T5.RA: si confrontano i numeri di M5 nello stesso stato, non una previsione).

## Ordine del gate PC (T6.A13) — `emulator-qa`
**Report**: un file per parte, `qa/reports/M6-A-<data>.md` (indice e verdetto, con la tabella chiamate `hud=0` contro `hud=1` e K2/K3/K12/K18 rimisurati) più, se serve, `…-S6.1.md` ecc. **Non si modifica il codice**; si lavora con il runtime già acceso (`npx @iwsdk/cli dev up --ai-mode agent --headless` sul cloud: pronto in ~10 s; non cambiare headed/headless senza annunciarlo); alla fine `dev down` e si cancellano `dev-params.local.txt` e `tuning.local.txt`. **Il gate PC non dimostra nulla sul visore**: le verifiche "solo visore" restano in `qa/device/DEBT.md` (righe M6 già inserite).

| # | Cosa | Dove | Perché in questo punto |
|---|---|---|---|
| 0 | `npm test`, `npm run typecheck`, `npm run build`; crescita del pacchetto (misurata dall'ingegnere: **+3,5 kB gzip**, budget +20 kB); `dist/` senza `dev/` | shell | un rosso qui blocca tutto (passi 1–2 di questo file) |
| 1 | **S6.4** script | shell, senza emulatore (anche con `PATH=''`) | non dipende dall'app, è il più economico |
| 2 | **S6.3** sonda | emulatore | pochi passi; `iwer=yes` con i quattro indizi, `ua=OculusBrowser/33…` (non `HeadlessChrome`) |
| 3 | **S6.1** taratura | emulatore | ricarica la pagina più volte (file `dev-params.local.txt` + `tuning.local.txt`) |
| 4 | **S6.2** frame e HUD, **K2 `hud=0` e `hud=1`** nello stesso stato | emulatore | dopo S6.1 per non portare manopole nel budget; K18 con e senza HUD |
| 5 | **S6.5** passi 3–7 (sottoinsieme di regressione, budget K2/K3/K12/K18, senza `debug=1`, stato salvato, pausa/ripresa) | emulatore | per ultimo: tutti i difetti di M6 sono già emersi |
| 6 | Sweep finale della console **in una sola sessione** e report | – | – |

**Ricette dell'emulatore (verificate dall'ingegnere il 2026-11-07, headless)**: ciclo `scrivere dev-params.local.txt` → `browser reload` → attesa 9 s → `xr enter` → `xr set-input-mode {"mode":"hand"}` → attesa 10 s; a IWER cloud 6–8 fps (SwiftShader, `hz=90 hzFrom=session`): gli fps **non** hanno significato, contano formato, chiamate e posizioni. Nomi della CLI: `xr enter`, `xr exit` (non `end-session`). `browser logs` dà al massimo 200 righe, le più vecchie per prime e mescolate tra ricariche: tagliare dopo l'ultimo `Frame navigated` (jq + awk) e filtrare con `pattern`. Modificare un `.uikitml` o un sorgente ricarica la pagina e fa perdere la sessione XR. Il tasto **F7** (con `debug=1`) apre e chiude il menu `pinned`; senza `debug=1` si usa un pizzico su `ui:menu-button-right` (mano = posizione del pulsante − `D_GRIP`, `xr select` 0,3 s). Ricetta dei marcatori: posizione nel mondo = `miniature:root.pos + scala × (locale + posizione della casa)` con la casa spostata di (−5,5; 0; −3,6): V2 a (0,065; 1,4375; −0,47) al posizionamento predefinito.

**Contratto dei log del gate** (oltre a quello di M5): nessun `error` salvo **`kind: requestfailed` `GET …/tuning.local.txt net::ERR_ABORTED`** (artefatto di una ricarica durante un sondaggio); `warn` accettati: quelli provocati di proposito da S6.1 (clamp, nome sconosciuto, ordine, `needs-debug`, `not-a-query`) e S6.2 (`param time`, `param hud ignored`), più `THREE.WebGLRenderer: Can't change size while VR device is presenting.` dopo `xr exit`. Nessun `Missing glyph`, `reading 'add'`, `budget exceeded`, `uncaught`.

**Differenze di criterio già decise** (non sono FAIL): `ua=` in emulatore è un user agent da Quest; la riga di prova di IWER ha il prefisso `[soglia] env iwer clues`, non `[soglia:env]`; la sorgente dei valori di taratura nell'emulatore è `file` (non `url`); il file vivo senza `t_` è ignorato senza log; `mode=immersive-vr` nella riga `session` è derivato da `environmentBlendMode`; il HUD costa +2 chiamate (limite +3); la base K2 con 14 pezzi può essere 50 invece di 46.

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
