# S4.10 · Budget di M4: previsione contro misura (segnaposto, pulsanti "Issues", pannello, "Tabletop")

> **Changelog 2026-11-02**: scenario creato dal piano M4 (D33 aggiornata, D46, D47); estende `qa/scenarios/M3-budget.md` (K1–K8) con K9–K12. Il caso peggiore di M3 misurato è K4 = 71 per vista.

> **Changelog 2026-11-06 (T5.RA, gate di M5)**: il gruppo `house` passa da **24 a 8** (A) e **7** (B) (mesh `merged:walls` e `merged:thresholds`; entità `wall:*` e `door:*` ancore senza mesh) e ogni conteggio sotto scende di **16** per vista; verifica 4 (`house` 24 ± 2) → **8 ± 1**. Le previsioni sono storiche (blocca solo > 100); i valori attuali sono in `qa/scenarios/M5-budget.md`.

**Milestone**: M4 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`); gli fps sono **solo informativi** · **Regola di `CLAUDE.md`**: 3 (prestazioni)
Prerequisiti di implementazione: T4.4, T4.6a, T4.R1, T4.12 e tutti i task che aggiungono elementi permanenti. Stesse regole di lettura di `qa/scenarios/M3-budget.md` (`callsPerView = calls / views`, la fonte con un pannello aperto è la riga `[soglia:stats]`, mai `scene_get_render_stats`). Convenzioni: `qa/scenarios/M4-issue-create.md`.

## Precondizioni
- Esecuzioni consecutive (`dev-params.local.txt`, `browser_reload_page`, `xr_accept_session`, `xr_set_input_mode hand`, attesa 7 s, testa (0; 1,6; 0)):
  - **E1–E5**: come `qa/scenarios/M3-budget.md` (ruolo `visitor`).
  - **E6** (inquilino, 14 pezzi, segnaposto del seme + 1): `house=apartment-a&role=tenant&reset=1&seed=1&debug=1&pinch=grip&furnish=scandinavian&time=2026-11-04T10:00`; creare `issue-014` sulla lavatrice (S4.1 passi 2–4) e accendere il verbale (S4.5 passo 2): 5 segnaposto, 4 rossi/arancioni/verdi e 1 viola (il verbale era blu fino a T5.R4; correzione 2026-11-06).
- **Casi**:
  - `K1`–`K8`: come M3 (E1–E5), ora con i pulsanti "Issues" (+2 stimati).
  - `K9` E6, menu e pannello chiusi, scala 0,05. `K10` E6 con il pannello Issues aperto sull'elenco (`ui:issue-button-right`, `ui:issue-open-list`), attesa 3 s.
  - `K11` **caso peggiore di M4**: E6 + posare i 4 pezzi propri/mobilità (S3.3/S3.5), aprire il pannello Issues (elenco), **riprendere dal plastico** `my-sofa` e portarlo sopra `furniture:bed-double#1` (pezzo non valido con l'etichetta del motivo **e** l'etichetta del FitCheck con i marcatori); attesa 3 s. Verifica obbligatoria prima della lettura: `^ui:reason-` ≥ 1, `^ui:fit-label$` = 1, ≥ 2 `^ui:fit-marker-`, `^ui:issue-panel$` = 1, `^pin:` ≥ 5.
  - `K12` **scala reale**: E2, entrare in `viewpoint:V1` (S4.6 passo 1), menu chiuso, con `ui:tabletop-button` presente, attesa 3 s.
  - `K13` (informativo) **10 + 1 segnaposto**: da E6 aggiungere segnalazioni dal punto libero fino a 12 `pin:*` (MAX 40 non si prova): il numero di chiamate non deve crescere di più di 1 rispetto a K9 (una sola mesh istanziata).

## Previsione (dal piano M4, D33 aggiornata; R-B e R-C inclusi)
| Caso | M3 misurato | Previsione M4 | Soglia di avviso (prev. + 8) | Previsione M5 (solo tracciamento) |
|---|---|---|---|---|
| K1 A senza arredi | 35 | **37** | 45 | 48 |
| K2 14 pezzi, chiuso | 49 | **51** | 59 | 62 |
| K3 14 pezzi, aperto | 58 | **60** | 68 | 71 |
| K4 caso peggiore di M3 (visitatore) | 71 | **73** | 81 | 84 |
| K5 chiuso a 0,12 | 44 | **46** | 54 | – |
| K6 aperto a 0,12 | 53 | **55** | 63 | – |
| K7 punto di vista | ≤ 49 | **≤ 51** (pulsante Tabletop; pulsanti Menu/Issues nascosti) | 59 | ≤ 62 |
| K8 metro attivo | (nel report B di M3; previsione di M3: 59) | **K2 misurato + 5 + 2** | K2 + 15 | – |
| **K9** inquilino, 14 pezzi, chiuso, 5 segnaposto | – | **52** (K2 + 2 pulsanti + 1 mesh) | 60 | 63 |
| **K10** K9 con il pannello Issues aperto | – | **61** (K9 + 9) | 69 | 72 |
| **K11** caso peggiore di M4 | – | **74** (alto 80) | 82 | 85 (tenant) / 95 (agent) |
| **K12** scala reale con "Tabletop" | – | **≤ 51** | 59 | ≤ 62 |
| **K13** 12 segnaposto | – | **K9 + 1** | – | – |

## Passi
1. **E1–E5, K1–K8**: come M3-budget (passi 1–5), ora ruolo `visitor`: nei sei casi standard dei pulsanti `ecs_find_entities` `^ui:(menu|issue)-button-` (→ 4).
2. **E6, K9, K10**: lettura `[soglia:stats]` e `[soglia:stats:groups]` (`markers` deve crescere di 1 per la mesh dei segnaposto); `ecs_find_entities` `^pin:`.
3. **K11**: preparare come indicato; verifiche obbligatorie; lettura; `browser_profile` (informativo); rilascio fuori dalla casa.
4. **K12**: entrare in V1 (menu chiuso), lettura; `ecs_find_entities` `^ui:tabletop-button$` (→ 1).
5. **K13**: aggiungere segnalazioni fino a 12 pin; lettura.
6. Per ogni esecuzione: `browser_get_console_logs` con `pattern: "budget exceeded|framework:|Missing glyph|uncaught|unhandled"` e senza filtro (`error`); pulizia come S3.0.

## Verifiche (tutte obbligatorie)
1. **Blocca**: in **ogni** lettura `callsPerView` ≤ **100** e `triangles` ≤ **150.000**. Più di 100: FAIL del gate.
2. **Tracciamento** (non blocca): tabella "previsione contro misura" nel report per K1–K13 (colonne M3, previsione, misurato, scarto); AVVISO per scarto > +8 con l'ipotesi da correggere. **K11 ≥ 85 apre R-A come primo task di M5**; K11 tra 85 e 100 è avviso, non FAIL. Con K11 < 85 la proiezione di M5 (agent ~95) resta da rimisurare con le ombre.
3. Costi unitari da dichiarare: pulsanti "Issues" (K1 − K1 di M3 = +2 atteso, avviso se > +5), mesh dei segnaposto (K9 − K2 − pulsanti = +1, avviso se > +2), pannello Issues (K10 − K9 ≈ +9, avviso se > +12), pulsante Tabletop (K12 − K7 = +2, avviso se > +4).
4. `[soglia:stats:groups]`: `house` 24 ± 2, `furniture` uguale al numero di pezzi ± 1, `markers` ≤ 5 in K11 (pin e marcatori dei punti di vista, un'istanza ciascuno), `ui` coerente (pannello + pulsanti + etichette); riga assente senza `debug=1`.
5. K13: 12 segnaposto non costano più di 1 chiamata rispetto a K9 (mesh istanziata).
6. Texture dell'app ≤ 4 e ciascuna ≤ 1024 px; 0 righe `budget exceeded`; `shadowCasters` = 0; 0 voci `error`; nessun `Missing glyph`.
7. Il report dichiara in chiaro: "il conteggio di IWER (due passate) è un proxy; gli fps del PC non rappresentano il Quest" e le voci per il visore (caso K11, costo reale dei pannelli UIKit e del multiview).

## Esito
PASS se la verifica 1 e le 5–6 sono soddisfatte in tutte le esecuzioni, la 2 è nel report, e le 3–4 e 7 sono riportate (anche come avvisi) · FAIL altrimenti. **Regola di gate (utente, 2026-10-06)**: bloccano solo errori in console nel percorso normale, test/build rossi, violazioni di `CLAUDE.md` e > 100 draw call.

## Da rimandare al visore
Draw call e fps reali con K11 (voce "Draw call e fps reali con il caso peggiore di M4" di `qa/device/DEBT.md`).
