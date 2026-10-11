# Gate PC M3 · parte C1 · regressioni di M2 (S2.0-S2.9)

Data: 2026-10-11 · Ambiente: cloud (Linux, SwiftShader, runtime IWER headless già avviato) · HEAD `1a65465`
Esecutore: emulator-qa (Sonnet 5.5). Rendering software: gli fps non sono significativi.

## Tabella scenari (aggiornata dopo ogni scenario)

| Scenario | Scheda | Modalità pinch | Esito | Note |
|---|---|---|---|---|
| S2.0 | M2-glyphs | n/d (`pinch=grip` nella seconda parte) | **PASS** | 0 `Missing glyph info`, `font ready` 512x512, etichette con `·` e `²`, 0 error/warn, `npm test` 4465 verdi |
| S2.1 | M2-palm-menu | grip + auto | da fare | |
| S2.2 | M2-place-bed | grip + auto | da fare | |
| S2.3 | M2-collision | grip | da fare | |
| S2.4 | M2-undo | grip | da fare | |
| S2.5 | M2-rotate | grip + auto | da fare | |
| S2.6 | M2-door-blocked | grip | da fare | |
| S2.7 | M2-return-to-catalog | grip | da fare | |
| S2.8 | M2-budget | grip | da fare | |
| S2.9 | M2-translate-miniature | grip | da fare | |

(Sezioni per scenario, FAIL, avvisi, differenze dovute a M3, limiti e trappole: sotto, riempite man mano.)

## S2.0 · Glifi del font (PASS)

Opzione A (atlante Inter) già adottata in M2: vale la parte B. Caricamento 1: `house=apartment-a&role=visitor&reset=1&seed=1&debug=1&glyphs=1`; caricamento 2 (etichette): senza `glyphs=1`, con `pinch=grip`.

| # | Verifica | Esito | Dato |
|---|---|---|---|
| 1 | 1 entità `ui:glyph-test` | PASS | `ecs_find_entities ^ui:glyph-test$` -> `total: 1` (entityIndex 1; componenti Transform, Visibility, LevelTag, StableId, PanelUI, Follower, PanelDocument) |
| 5 | 0 `Missing glyph info`; `font ready` con W,H <= 1024 | PASS | filtro `Missing glyph` vuoto nel caricamento corrente (ts 1791732635591); `[soglia] font ready family=inter weight=normal atlas=512x512 glyphs=111` e `... weight=bold atlas=512x512 glyphs=111`; `[soglia] glyph test shown id=ui:glyph-test` |
| 6 | testi delle etichette | PASS | `[soglia] label shown "Living room & kitchen · 23.9 m²"` e `[soglia] label shown "Study · 12.0 m²"` (con `room selected living area=23.9` / `room selected study area=12.0`) |
| 7 | screenshot | PASS | `M3-gate-C1-S2.0-glyph-test.png`: pannello con tre righe, `m² ² · × ° − ± → ≈` in regolare e in grassetto e `ABC abc 0123456789 %§°`, nessun quadrato pieno; `M3-gate-C1-S2.0-label-living.png`: etichetta del soggiorno con `·` e `m²` leggibili, sopra il plastico, con il suggerimento "Palm up for the menu" |
| 8 | texture dell'app <= 4, ciascuna <= 1024; niente `budget exceeded`; niente error | PASS | texture dell'app = i due atlanti 512x512; `[soglia:stats] ... textures=7` (con `glyphs=1`, come in M2 rerun3) e `textures=8` con etichetta e suggerimento (UIKit del pannello, framework); 0 righe `budget exceeded`; `level=[error,warn]` vuoto dal caricamento |
| 9 | CDN | PASS | nessuna riga `Failed to load`/`404` (filtro errori/avvisi vuoto) |
| 10 | licenza e crediti | PASS | `public/fonts/` = `OFL.txt`, `inter-bold.{json,png}`, `inter-regular.{json,png}`; `CREDITS.md:11` riga `font-inter-msdf`; `docs/RULES.md` righe 47-53 (seconda eccezione OFL 1.1); `npm test`: 75 file, 4465 test verdi |

Parte A (audit storico): non rieseguita come audit; la tabella degli otto caratteri e' coerente: nessun `Missing glyph info` per `² · × ° − ± → ≈` (tutti disponibili). Nessun cambiamento dovuto a M3.
