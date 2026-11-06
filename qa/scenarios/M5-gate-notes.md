# Note per il gate PC di M5 (T5.17): ordine di esecuzione, calibrazioni, id e log

> **Changelog 2026-11-06**: file creato dal piano M5 dopo la consegna di T5.1–T5.16, per `emulator-qa`. Non è uno scenario: dice **in che ordine** eseguirli, **con quali mani** e **che cosa leggere**. Rispecchia le parti A, B, C1, C2 del gate di M4 (`qa/reports/M4-2026-11-03*.md`). Tutto ciò che c'è qui è verificato sul codice del 2026-11-06 (id, righe di log); dove un valore non è noto è scritto "da leggere".

**Milestone**: M5 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`) · Piano: `docs/plans/M5.md`. Report: un file per parte, `qa/reports/M5-<data>-A.md`, `-B.md`, `-C1.md`, `-C2.md`, `-D.md`, più l'indice `qa/reports/M5-<data>.md` (verdetto e tabella previsione contro misura).

## 0. Prima di cominciare
1. `npm test` (atteso verde; 6413 test al 2026-11-06), `npm run typecheck`, `npm run build`. Un rosso qui blocca il gate.
2. Runtime già avviato (non cambiare headed/headless senza annunciarlo). Ogni scenario: scrivere `dev-params.local.txt` (una riga), `browser_reload_page`, `xr_accept_session`, `xr_set_input_mode {mode: "hand"}`, attesa 2,5–3 s, testa (0; 1,6; 0), mani a riposo `(∓0,30; 1,10; 0,10)`.
3. **Ogni scenario parte con `reset=1`** (cancella tutte le chiavi `soglia:v1:*`, incluse le preferenze di accessibilità, il sole, il coach e le segnalazioni): altrimenti il contrasto, il testo grande o il ruolo di uno scenario passano al successivo. Gli scenari che provano la ripresa lo dicono.
4. Modificare un `.uikitml` o un sorgente durante la sessione ricarica la pagina e **fa perdere la sessione XR**: rifare `xr_accept_session`. Il gate non modifica il codice.
5. Leggere i log con `since` e filtri stretti: `[soglia:hands]` e `[soglia:stats]` riempiono il buffer.
6. **Contratto dei log**: nessun `error`; l'unico `warn` accettato è `THREE.WebGLRenderer: Can't change size while VR device is presenting.` **dopo** `xr_end_session`; non ci devono essere `Missing glyph`, `reading 'add'`, `budget exceeded`, `toNonIndexed`, `uncaught`.

## 1. Calibrazione delle mani in IWER (chi sbaglia il bersaglio non ha trovato un bug)
| Sorgente (`pinch=`) | Posa della mano per pizzicare il punto `T` | Dove vale |
|---|---|---|
| `grip` (ricetta storica M2–M4) | `T − D_GRIP` = `(Tx + 0,038; Ty + 0,003; Tz − 0,037)`, orientamento identità, `D_GRIP` = (−0,038; −0,003; +0,037) | tutti gli scenari vecchi, pulsanti 8 × 6 cm, chip, menu, pezzi |
| `grip` (misura di T5.8–T5.10) | `T + (0,029; −0,0015; −0,045)` (il punto di pizzico è `mano + (−0,029; +0,0015; +0,045)`) | bersagli piccoli: rombi `pin:info-*` (raggio 2 cm) |
| `auto` (sorgente `joints`) | `T + (0; 0,0245; 0,012)` | righe `−`/`+` del pannello View (3,3 cm), S5.1, S5.6; il log `[soglia:hands] … event=pinch-start point=` dà il punto reale |
Se un bersaglio non risponde: leggere `pinch-start point=` e correggere la posa di quella differenza (una volta), annotando il valore nel report. Le due ricette `grip` differiscono di circa 1 cm: sui bersagli da 8 × 6 cm non conta.
Altre regole di M4 valide: **pizzico prolungato** = `xr_set_select_value` a 1, mano ferma, attesa 1,5 s, poi 0 (mai `xr_select` < 1 s); pizzico breve = `xr_select {duration: 0.3}`; con `pinch=auto` serve `xr_select` ≥ 0,4 s o `set-select-value` 1 + 1,5 s.

## 2. Ordine di esecuzione consigliato
Dal più economico al più costoso dentro ogni parte; ogni parte ha il suo report. Il budget (S5.9) si legge **dentro** le parti, non a parte.

### Parte A · Riporti e sole (≈ 1 h reale)
| # | Scenario | File | `dev-params.local.txt` (oltre a `reset=1&seed=1&debug=1`) |
|---|---|---|---|
| A1 | S5.8 riporti R1–R6 | `M5-carryovers.md` | `house=apartment-a&role=tenant&pinch=grip&time=2026-11-04T10:00` (R2 con `failcatalog=1`, R6 con `glyphs=1` senza `debug=1`) |
| A2 | S5.1 sole | `M5-sun.md` | `house=apartment-a&role=visitor&pinch=auto&time=2026-12-21T10:00` |
| A3 | S5.9 K1–K4, K7, K9–K12 | `M5-budget.md` | come E1–E6 di `M4-budget.md` + `time=2026-12-21T10:00` |

### Parte B · Agente, una mano, onboarding, accessibilità (≈ 2 h reali)
| # | Scenario | File | `dev-params.local.txt` |
|---|---|---|---|
| B1 | S5.3 agente | `M5-agent.md` | `house=apartment-a&role=visitor&pinch=grip&time=2026-12-21T10:00` |
| B2 | S5.7 coach | `M5-menu-onboarding.md` | `house=apartment-a&role=visitor&pinch=grip&time=2026-12-21T10:00` |
| B3 | S5.4 una mano | `M5-one-hand.md` | fase A `…&role=tenant&pinch=auto&time=2026-12-21T10:00`, fase B `pinch=grip` (si ricarica a metà) |
| B4 | S5.6 accessibilità | `M5-accessibility.md` | `house=apartment-a&role=tenant&pinch=auto&time=2026-12-21T10:00` |
| B5 | S5.9 K14–K18 | `M5-budget.md` | come descritto nello scenario |

### Parte C1 · Regressione M2 e M3 (≈ 2,5 h reali; con `pinch=grip` e i punti corretti)
S2.1 → S2.2 → S2.5 → S2.3 → S2.4 → S2.7 → S2.6 → S2.9 → S2.8 (si legge dal budget) → S3.0 → S3.1 → S3.2 → S3.3 → S3.4 → S3.5. File: `M2-*.md`, `M3-*.md`. Si usano **le correzioni del 2026-11-02 e del 2026-11-06** (S3.0 verifica 4 e fase 2, S3.5 passo 3). Aspettative cambiate da M5 che **non** sono regressioni: dopo ogni posa compare per 12 s il pulsante `ui:rotate-button` (11 × 5 cm accanto al pezzo): se è sulla traiettoria di un pizzico, spostare il pizzico di 0,05 m e annotarlo; all'avvio, dopo l'onboarding di M1, compare il coach (`ui:coach-*`, non interattivo) e il suggerimento `Palm up for the menu`: sono attesi.

### Parte C2 · Regressione M1, S3.6–S3.8 e M4 (≈ 2,5 h reali)
S1.2 → S1.3 → S1.6 → S3.6 (`pinch=auto`) → S3.7 → S3.8 → S4.1 → S4.3 → S4.4 → S4.5 → S4.6 → S4.7 → S4.8. S1.1, S1.4, S1.5 si leggono dai log di S2.8/S5.9 e di un caricamento di B; S2.0 (glifi, `debug=1&glyphs=1`) è nel giro delle etichette. Cambiamenti da conoscere: **sei** pulsanti fissi a plastico (3 piani: `ui:menu-button-*`, `ui:issue-button-*`, `ui:view-button-*`), quattro chip dei ruoli, elenco a due righe e 4 per pagina, verbale viola e spento di default, `ui:tabletop-button` unico in scala reale (S4.6 e S3.7 contano `^ui:(menu|issue)-button-` → 4, non 6, e `^ui:view-button-` → 2 a parte).

### Parte D · Demo completa e chiusura (≈ 1 h reale)
S5.5 `M5-full-demo.md` per ultimo, in una sola esecuzione. Poi: tabella previsione contro misura (S5.9), elenco delle voci per `qa/device/DEBT.md` (le aggiunge l'utente, non `emulator-qa`), indice `qa/reports/M5-<data>.md`.

## 3. Id e righe di log da conoscere (verificati sul codice)
- **Entità**: `sun:dial`, `sun:marker`, `light:patches`, `light:<windowId>` (solo se illuminate), `ui:view-button-left|right`, `ui:view-panel`, `ui:view-close`, `ui:view-zoom|turn|month|hour-less|more`, `ui:view-contrast`, `ui:view-contrast-less|more`, `ui:view-text`, `ui:view-text-less|more`, `pin:info-001`…`-005`, `ui:agent-furnish`, `ui:agent-clear`, `ui:rotate-button` (esiste sempre, visibile solo nella finestra di 12 s), `ui:coach-menu-button`, `ui:coach-grab`.
- **Log** (prefisso `[soglia]`): `sun set time=… source=… utc=…Z az=… el=…` · `sun below horizon time=… source=… utc=…` · `sun light windows=… rooms=<id>:<m² con 1 decimale>` · `sun dial ringRadius=… marker=x,y,z` · `view button pressed id=… hand=…` · `view panel opened mode=pinned hand=…` · `view panel view maxAngleDeg=… distance=…` · `view panel closed via=button|close|menu|panel|suspend|view` · `view control pressed id=ui:view-… hand=…` · `view step row=… value=…` · `view panel rebuilt text=…` · `access contrast=on|off source=…` · `access text=large|normal source=… menu=large issues=large` · `access applied recolored=N` · `coach step=menu-button|grab|done reason=…` · `rotate button shown|hidden|pressed …` · `furniture rotated <id> rot=<deg> source=button` · `pins layer count=… baseline=… info=… role=…` · `info opened id=…` · `issues screen=info` · `agent staging action=furnish|clear …` · `agent staging denied action=… reason=…` · `undo action=stage id=furnish:scandinavian`.
- **Aree di sole**: nel log hanno **un decimale**; i golden esatti (2,3029; 1,1616; 2,4284 m²) stanno nei test unitari.
- **Risoluzione**: `menu view maxAngleDeg` e `issues panel view maxAngleDeg` per il cono; a testo grande ≈ 28,5° (≤ 30° con beccheggio ±8°), a testo normale ≈ 26,1°.

## 4. Decisioni e criteri del gate (dal piano M5)
- **Bloccano**: errori in console nel percorso normale, `npm test`/`typecheck`/`build` rossi, violazioni di `CLAUDE.md` (stringhe italiane, asset non CC0, servizi esterni), > 100 chiamate per vista. Il resto è avviso (regola dell'utente, 2026-10-06).
- **R-A (T5.RA)** non serve: caso peggiore misurato 76 (T5.7) e 65 con contrasto e testo grande; se il gate misura **≥ 85**, lo scrive come avviso alto e lo segnala al coordinatore prima di chiudere.
- **Differenze di criterio già decise** (non sono FAIL): il log delle aree ha un decimale; alle 15:00 del 21 dic in A non ci sono chiazze; lo studio non è al sole alle 15:00; il pannello View si chiude da solo quando si apre un altro pannello; un'etichetta del motivo persistente può coprire le righe basse del pannello View (avviso).
- **Solo visore** (non si prova qui): fps reali, comodità dei sei pulsanti, leggibilità a 3,0 cm, contrasto nel campo visivo stretto, ripresa vera, pizzico prolungato con le dita vere. Il report le elenca come proposte per `qa/device/DEBT.md`.
- Dopo il gate: `contest-reviewer` (T5.18).
