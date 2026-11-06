# S5.9 · Budget di M5: previsione contro misura (sei pulsanti, quadrante, chiazze, punti informativi, "Rotate", coach)

> **Changelog 2026-11-06**: scenario creato dal piano M5 (D55, D61, T5.7); estende `qa/scenarios/M4-budget.md` (K1–K13) con K14–K18. Il caso peggiore misurato in M4 è K4 = 75 per vista (regressione) e K11 = 71.

**Milestone**: M5 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`); gli fps sono **solo informativi** · **Regola di `CLAUDE.md`**: 3 (prestazioni)
> **Changelog 2026-11-06 (esiti di T5.7)**: il punto di controllo è stato eseguito (IWER, casa A, `time=2026-12-21T10:00`): **K1 47, K2 61, K3 69, K10 64, K17 64, caso peggiore 76, K12 29** chiamate per vista; gruppi `house` 24, `ui` 12, `sun` 2 (1 a scala reale: il quadrante è nascosto, le chiazze restano), `markers` 1; triangoli massimi 31.354. **Il caso peggiore (76) è sotto 85: T5.RA NON serve.** K14, K15, K16 e K18 restano da misurare (dopo T5.9, T5.14, T5.15 e a gate); K18 va rimisurato col ruolo `tenant` e le due etichette. Il pannello View ha per ora 4 righe, quindi K17 vale per quelle.

Prerequisiti di implementazione: T5.4, T5.5, T5.9, T5.14, T5.15 (il **punto di controllo T5.7** misura K1–K4 e K9–K12 appena esistono pulsanti, quadrante e chiazze, **prima** di T5.8). Stesse regole di lettura di `qa/scenarios/M3-budget.md` e `M4-budget.md` (`callsPerView = calls / views`, con un pannello aperto la fonte è la riga `[soglia:stats]`, mai `scene_get_render_stats`). Convenzioni: `qa/scenarios/M4-issue-create.md`.

## Precondizioni
- Esecuzioni consecutive (`dev-params.local.txt`, `browser_reload_page`, `xr_accept_session`, `xr_set_input_mode hand`, attesa 7 s, testa (0; 1,6; 0)). **E1–E6** come `M4-budget.md` (con `time=2026-12-21T10:00` aggiunto: il sole è sopra l'orizzonte e le chiazze esistono). Il suggerimento d'avvio (`ui:menu-hint`) pesa +3…+4: le letture "a regime" si fanno dopo la prima apertura del menu, quelle "a freddo" prima.
- **Casi nuovi**:
  - `K14` **agente**: `house=apartment-a&role=agent&reset=1&seed=1&debug=1&pinch=grip&furnish=scandinavian&time=2026-12-21T10:00`, pannello Issues aperto sulla `home` (`ui:agent-furnish` visibile), attesa 3 s.
  - `K15` **dopo una posa**: da E2 (14 pezzi) posare `chair` in soggiorno e leggere entro 5 s con `ui:rotate-button` presente.
  - `K16` **a freddo con il coach**: E2, `reset=1`, chiusa l'onboarding di M1, coach al passo `menu-button` (S5.7 passo 2), attesa 3 s.
  - `K17` **pannello View aperto** su E2, attesa 3 s (e ancora dopo 10 s: il picco dei primi 8–9 s di M4 è transitorio).
  - `K18` **caso peggiore di M5**: E6 + i 4 pezzi propri/mobilità, pannello Issues aperto sull'elenco (o il menu `pinned`), **riprendere dal plastico** `my-sofa` e portarlo sopra `furniture:bed-double#1` (pezzo non valido con etichetta del motivo e del FitCheck, con i marcatori), sole sopra l'orizzonte (chiazze presenti), ruolo `tenant`; attesa 3 s. Verifica obbligatoria prima della lettura: `^ui:reason-` ≥ 1, `^ui:fit-label$` = 1, ≥ 2 `^ui:fit-marker-`, un pannello aperto, `^light:patches$` = 1, `^sun:dial$` = 1.

## Previsione (dal piano M5, "Previsione dei draw call")
| Caso | M4 misurato | Previsione M5 | Soglia di avviso (prev. + 8) | **Misurato (T5.7, 2026-11-06)** |
|---|---|---|---|---|
| K1 A senza arredi, a regime | 37 (45 a freddo) | **44** | 52 | **47** |
| K2 14 pezzi, chiuso, a regime | 55 | **62** | 70 | **61** |
| K3 14 pezzi, menu aperto | 63 (menu `pinned`) | **70** | 78 | **69** |
| **K4 caso peggiore della regressione** | **75** | **82** (alto 88) | 90 | **76** (caso peggiore misurato) |
| K7 punto di vista + "Tabletop" | 24 | **26** | 34 | (vedi K12) |
| K9 inquilino, 14 pezzi, chiuso | 55 | **62** | 70 | – |
| K10 pannello Issues aperto | 58 | **65** | 73 | **64** |
| K11 caso peggiore di M4 | 71 | **78** | 86 | – |
| K12 scala reale con "Tabletop" | 24 | **26** | 34 | **29** (+3 sulla previsione, sotto l'avviso) |
| **K14** agente, 14 pezzi, pannello `home` | – | **66** | 74 | da misurare |
| **K15** dopo una posa, con "Rotate" | – | **64** | 72 | da misurare |
| **K16** a freddo con il coach | 59 | **70** | 78 | da misurare |
| **K17** pannello View aperto | – | **65** | 73 | **64** |
| **K18** caso peggiore di M5 | – | **82** (alto 88) | 90 | da misurare al gate (finora 76 senza agente, Rotate e coach) |

## Passi
1. **K1–K4, K7, K9–K12** (punto di controllo T5.7): come `M3-budget.md`/`M4-budget.md`; in più `ecs_find_entities` `^ui:(menu|issue|view)-button-` (→ 6 nei casi con plastico, 0 nel punto di vista) e `^(sun|light):` (→ `sun:dial`, `sun:marker`, `light:patches`, ancore `light:win-*`).
2. **K14–K18** come descritto; per ognuno la lettura `[soglia:stats]` e `[soglia:stats:groups]` (il gruppo nuovo `sun` e `markers`), e la verifica degli stati prima della lettura.
3. Per ogni esecuzione: `browser_get_console_logs` con `pattern: "budget exceeded|framework:|Missing glyph|uncaught|unhandled"` e senza filtro (`error`); pulizia come S3.0.

## Verifiche (tutte obbligatorie)
1. **Blocca**: in **ogni** lettura `callsPerView` ≤ **100** e `triangles` ≤ **150.000**. Più di 100: FAIL del gate.
2. **Regola di T5.7 (D61)**: il caso peggiore di K4/K11/K18 **≥ 85** apre T5.RA (R-A, −16) **prima** di T5.8; tra 85 e 100 non è FAIL ma blocca l'avvio dell'agente finché R-A non è fatto. Il report dice in chiaro quale ramo si è applicato.
3. **Tracciamento** (non blocca): tabella "previsione contro misura" per tutti i casi (colonne M4, previsione, misurato, scarto); AVVISO per scarto > +8 con l'ipotesi da correggere.
4. **Costi unitari** da dichiarare: pulsanti "View" (K1 − K1 di M4 con il resto uguale = +4 atteso, avviso se > +6), quadrante (+1, avviso > +2), chiazze (+1, avviso > +2; 0 con il sole sotto l'orizzonte), punti informativi (+1, avviso > +2), "Rotate" (+2, avviso > +4), coach (+3…+4, avviso > +6), pannello View (≈ 0…+3 sul K9, avviso > +9).
5. `[soglia:stats:groups]`: `house` 24 ± 2, `furniture` uguale al numero di pezzi ± 1, `sun` ≤ 2 (**1 a scala reale**: il quadrante è nascosto, le chiazze restano), `markers` ≤ 6 (pin, rombi, marcatori dei punti di vista; 1 nel punto di controllo con `visitor`), `ui` coerente (**12** con i 6 pulsanti a plastico, più pannello ed etichette).
6. Texture dell'app ≤ 4 e ciascuna ≤ 1024 px; 0 righe `budget exceeded`; `shadowCasters` = 0 (nessuna ombra con shadow map: D55); 0 voci `error`; nessun `Missing glyph`.
7. Il report dichiara in chiaro: "il conteggio di IWER (due passate) è un proxy; gli fps del PC non rappresentano il Quest" e le voci per il visore (caso K18, costo reale dei pannelli UIKit e dei sei pulsanti, multiview).

## Esito
PASS se le verifiche 1 e 6 sono soddisfatte in tutte le esecuzioni, la 2 è applicata e dichiarata, e le 3–5 e 7 sono riportate (anche come avvisi) · FAIL altrimenti. **Regola di gate (utente, 2026-10-06)**: bloccano solo errori in console nel percorso normale, test/build rossi, violazioni di `CLAUDE.md` e > 100 draw call.

## Da rimandare al visore
Voce "Draw call e fps reali con il caso peggiore di M5" di `qa/device/DEBT.md`.
