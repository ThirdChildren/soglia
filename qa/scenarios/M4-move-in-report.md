# S4.5 · Verbale d'ingresso: segnaposto viola da `issues-apartment-a.json`

> **Changelog 2026-11-06 (scostamenti del Blocco R, T5.R4/T5.R5)**: il verbale ha righe a due righe (pallino + parola di stato + urgenza; sotto il testo fino a 22 caratteri) e **si apre con un solo pizzico sulla riga**: alla verifica 3 si aggiunge la prova dalla schermata `movein` (`ui:issue-row-0` → `issues screen=detail id=baseline-001`); il troncamento usa tre punti ASCII `...`.
> **Changelog 2026-11-06** (decisione dell'utente sul riporto 6 del gate di M4; piano M5, T5.R4): (1) **passi 2 e 5, verifica 2**: l'interruttore `Show on model` è **spento di default**; al passo 2 si apre il verbale, si verifica lo stato spento (0 `pin:baseline*`) e **poi** si preme `ui:issue-movein-toggle` per accenderlo; la lettura del segnaposto, dell'interruttore acceso e dello screenshot avviene dopo questa pressione; al passo 5 "lasciare il livello acceso" resta com'è; (2) il colore del segnaposto del verbale diventa **viola** (`color=violet`, `0x9b59d0`) invece di blu, per distinguerlo dai pilastri dei punti di vista (T5.R4): dove sotto si legge "viola" prima si leggeva "blu". Nessun altro criterio cambia.
> **Changelog 2026-11-02**: scenario creato dal piano M4 (D46, D48, T4.10).

**Milestone**: M4 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`) · **Regole di `CLAUDE.md`**: 7 ("Sample data"), 8, 9
Prerequisiti di implementazione: T4.4, T4.6b, T4.8, T4.9, T4.10. Convenzioni: `qa/scenarios/M4-issue-create.md`.

## Precondizioni
- `dev-params.local.txt` = `house=apartment-a&role=tenant&reset=1&seed=1&debug=1&pinch=grip&time=2026-11-04T10:00`; preparazione standard. Il verbale è la voce `baseline-001` ("Scratch on the parquet, present at move-in.") in pianta (3,8; 0,0; 1,0) → mondo (−0,085; 1,35; −0,58); testa del segnaposto a circa y = 1,385. Pizzico sulla testa: mano a (−0,047; 1,388; −0,617).

## Passi
1. **Prima**: `ecs_find_entities` `^pin:baseline` (→ 0: il livello del verbale è spento di default); `^pin:` (→ 3).
2. **Aprire il verbale**: pizzico su `ui:issue-button-right` (mano a (0,4727; 1,568; −0,6035)), pizzico su `ui:issue-open-movein`: log `pattern: "issues screen|movein|pins|pin color"`; `ui_inspect` (righe, intestazione, interruttore `Show on model` **spento**); `ecs_find_entities` `^pin:baseline` (→ 0). Poi pizzico su `ui:issue-movein-toggle`: log `movein shown count=1 sample=true`; `ecs_find_entities` `^pin:baseline` (→ 1); `ecs_query_entity` su `pin:baseline-001` con `["Transform"]`; `ui_inspect` (interruttore acceso); `browser_screenshot` → allegare (segnaposto viola nel soggiorno-corridoio, accanto ai tre colori del seme).
3. **Aprire il segnaposto viola**: (a) dalla schermata `movein` un solo pizzico su `ui:issue-row-0`: log `issues screen=detail id=baseline-001`, poi `ui:issue-back`; (b) chiudere il pannello; pizzico breve (0,3 s) sulla testa del segnaposto (mano a (−0,047; 1,388; −0,617)): log `issues screen=detail id=baseline-001`; `ui_inspect` (testo intero, nessun controllo d'azione, `Sample data`); `ecs_find_entities` `^ui:issue-action-` (→ 0).
4. **Spegnere**: tornare al verbale (`ui:issue-back`), pizzico su `ui:issue-movein-toggle`: `movein hidden`; `^pin:baseline` (→ 0). Riaccendere: `movein shown count=1 sample=true`.
5. **Persistenza**: lasciare il livello acceso, attesa 1,5 s (`state saved`), ricaricare **senza** `reset=1` e senza `role=`: log `pattern: "role|issues|pins|movein"`; `^pin:baseline` (→ 1); aprire il verbale: l'interruttore risulta acceso. Spegnere, attendere, ricaricare: `^pin:baseline` (→ 0).
6. **Proprietario**: `ui:issue-role-landlord`: il verbale e il segnaposto viola sono visibili in sola lettura (nessun `ui:issue-action-*`).
7. **Visitatore**: `ui:issue-role-visitor` con il livello acceso: `ecs_find_entities` `^ui:issue-open-movein$` (→ 0), `^pin:(issue|baseline)` (→ 0, anche `pin:baseline-001`; dal T5.9 il visitatore vede però i 5 `pin:info-*`, quindi `^pin:` da solo dà 5, non 0: correzione 2026-11-06, F-C2-2); la home dice `Pick Tenant to report an issue or Landlord to manage them.`; tornare a `tenant`: il segnaposto riappare.
8. Log senza filtro (`error`, `Missing glyph`, `reading 'add'`).

## Verifiche (tutte obbligatorie)
1. **Passo 1**: 0 `pin:baseline-*` e 3 `pin:issue-*` con il verbale spento.
2. **Passo 2**: `issues screen=movein`; all'apertura l'interruttore `Show on model` è **spento** e 0 `pin:baseline*` (default); l'elenco ha **una** riga con il testo `Scratch on the par...` (troncato a **21–22 caratteri** con tre punti ASCII, **anche a metà parola**; sotto la riga di stato; F-C2-4) e l'intestazione `Sample data`; dopo la pressione su `ui:issue-movein-toggle`: `movein shown count=1 sample=true`; `pin color id=baseline-001 color=violet`; `pin:baseline-001` a (3,8; 0,0; 1,0) ± 0,02 (la punta a quota 0); l'interruttore è acceso; tutti i testi ≥ 2,4 cm.
3. **Passo 3**: `issues screen=detail id=baseline-001` (raggiunto sia dal segnaposto sia, dalla schermata `movein`, con **un solo** pizzico su `ui:issue-row-0`; nessuna riga di sola selezione); il testo intero `Scratch on the parquet, present at move-in.`; `Sample data`; **nessuno** stato rosso/arancione/verde (il segnaposto è viola) e **0** controlli d'azione (il verbale non è una segnalazione).
4. **Passo 4**: `movein hidden` → 0 `pin:baseline*`; riaccendere → 1.
5. **Passo 5**: la preferenza `prefs.moveInVisible` si ripristina (riga `pins layer count=4 baseline=1 role=tenant` alla ricarica; `state saved` porta il valore); da spento resta spento.
6. **Passo 6**: il proprietario vede lo stesso segnaposto viola in sola lettura; nessun controllo d'azione.
7. **Passo 7**: il visitatore non vede né il pulsante del verbale né alcun segnaposto **di segnalazione o di verbale** (nemmeno con la preferenza accesa): 0 `pin:issue-*`, 0 `pin:baseline*`; vede solo i 5 `pin:info-*` (`pins layer count=0 baseline=0 info=5 role=visitor`; F-C2-2).
8. Costo: `[soglia:stats:groups]` conta il segnaposto viola nel gruppo `markers`; le chiamate per vista non crescono rispetto a quelle del gruppo (una sola mesh istanziata).
9. Nessuna voce `error`; nessun `Missing glyph`.

## Esito
PASS se le verifiche 1–9 sono soddisfatte · FAIL altrimenti.

## Da rimandare al visore
Leggibilità del viola accanto agli altri colori; comprensione del verbale per chi non lo conosce (il testo "Sample data" basta?) — voce "Segnaposto istanziati" di M4 in `qa/device/DEBT.md`.
