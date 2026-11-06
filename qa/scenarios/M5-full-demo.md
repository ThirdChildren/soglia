# S5.5 · Demo completa: i tre atti in un solo percorso

> **Changelog 2026-11-06**: scenario creato dal piano M5 (ROADMAP S5.5). Il "meno di 10 minuti" del primo ROADMAP vale per una persona sul visore: **il tempo di orologio non è un criterio PC** (ogni chiamata MCP costa 0,5–3 s). Il criterio PC è: percorso completo, zero errori, e un conteggio di pizzichi.

> **Changelog 2026-11-06 (esiti di T5.1–T5.7)**: passo 6 allineato ai golden del sole (alle 15:00 del 21 dic in A non ci sono chiazze); vedi `qa/scenarios/M5-sun.md`.
> **Changelog 2026-11-06 (esiti di T5.11–T5.15)**: passo 1: il coach è a due passi con timeout di 20 s per passo e aspetta se Issues o View sono aperti; passo 2: "Rotate" (11 × 5 cm, 12 s, ogni pressione riparte da 12 s); passo 11: alto contrasto e testo grande dal pannello View (6 righe, `+`/`−` o cella) con `contrast=`/`text=` espliciti che vincono sul salvato; testo grande del pannello **Issues** e del **menu v2** **in corso** (T5.13 parte rimasta, T5.16): se non consegnati, la verifica 4 di S5.6 resta sull'esito `menu=normal issues=normal` dichiarato. Alla ripresa (passo 12) anche `coach step=done reason=saved`. Problema noto: un'etichetta del motivo persistente può coprire le righe basse del pannello View (avviso).
> **Changelog 2026-11-06 (esiti di T5.8–T5.10)**: passo 7 allineato a Furnish/Clear come realizzati (pannello che si chiude dopo l'azione, Undo `action=stage`, id a contatori crescenti, chip `Agent` acceso, 5 rombi informativi per visitor e agent); calibrazione IWER con `pinch=grip`: mano a `T + (0,029; −0,0015; −0,045)` per i bersagli piccoli (rombi, righe del pannello); vedi `qa/scenarios/M5-agent.md`.

**Milestone**: M5 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`) · **Regole di `CLAUDE.md`**: tutte le non negoziabili (1, 2, 4, 5, 7, 8, 9, 10) · Vedi `docs/plans/M5.md`. Si esegue **per ultimo** (dopo S5.1–S5.9). Convenzioni: `qa/scenarios/M4-issue-create.md`.

## Precondizioni
- `dev-params.local.txt` = `house=apartment-a&role=visitor&reset=1&seed=1&debug=1&pinch=grip&time=2026-12-21T10:00`. Una sola esecuzione, **senza ricaricare** tra gli atti, tranne il passo 12 (ripresa).
- Uso solo delle mani e dei pulsanti; la sinistra serve solo per i passi indicati (palmo in su, secondo pizzico).

## Percorso
**Atto 1 · Scegliere (visitatore)**
1. Preparazione standard; onboarding di M1 (selezione di una stanza); coach del pulsante "Menu" (S5.7 passi 2–4 in forma breve: pulsante, pezzo, posa).
2. Arredare: `bed-double` in camera `W(7,0; 3,0)` e `sofa-3seat` in soggiorno (S2.2); ruotare il letto con il tocco della sinistra (S2.5) e il divano con "Rotate" (S5.4 passo 5); un pezzo non valido (S2.3) con etichetta, poi corretto.
3. I propri mobili: scheda `Mine`, `my-sofa` verso il soggiorno: `Won't fit: the door is 80 cm wide, the sofa's shortest side is 85 cm` (S3.3); in B la stessa prova passa (S3.4: ricarica con `house=apartment-b`, **un solo** cambio di casa nell'intero percorso, passo 3b).
4. Misura: finestra dello studio 140 cm (S3.2).
5. Punto di vista V1: entrare, vedere le chiazze sul pavimento (S5.1 passo 7), tornare con "Tabletop".
6. Sole: pannello "View", 10:00 → 15:00 (5 pressioni), soggiorno al sole alle 10:00 (2,3 m²) e **nessuna chiazza** alle 15:00 (correzione 2026-11-06: lo studio non è al sole alle 15:00); mese a giugno e ore 18:00 (studio al sole, 1,16 m²). Il pannello View ha 4 righe prima di T5.11 (poi 6) e si chiude da solo se si apre un altro pannello.
**Atto 2 · Presentare (agente)**
7. Pannello Issues → `Agent`: `Clear`, `Furnish` (`agent staging action=furnish style=scandinavian pieces=14`; il pannello si chiude da solo, `closed via=stage`), Undo in un passo (`undo action=stage id=furnish:scandinavian`; un nuovo Furnish dà id a contatori più alti, `chair#5..8`); un punto informativo (`pin:info-001`, schermata `info`, `Sample data`). Il visitatore vede già i 5 rombi all'inizio dell'atto 1; il tenant no.
**Atto 3 · Vivere (inquilino → proprietario → inquilino)**
8. `Tenant`: pizzico prolungato sulla lavatrice, `Leaks`, `Report` (S4.1); verbale d'ingresso acceso (S4.5).
9. `Landlord`: elenco (`014, 013, 012, 010`), `Take on`, `Resolved` (S4.3).
10. `Tenant`: `Confirm` sulla 014 (archiviata) e `Reopen` su un'altra.
11. Accessibilità: alto contrasto e testo grande (S5.6 passi 2–3) e, con la sola destra, una segnalazione a testo grande.
12. **Ripresa**: attesa 1,5 s, ricaricare **senza** `reset=1` e senza `role=`: stesso ruolo, stesse segnalazioni, stessi pezzi, stessa ora del sole, stesso contrasto, `coach step=done reason=saved`; poi `F8`/`F9` (sospensione/ripresa simulate) con un pezzo in mano: nessun duplicato.
13. Log senza filtro e per i filtri `[soglia:stats]`; pulizia.

## Verifiche (tutte obbligatorie)
1. **Zero errori**: nessuna voce `error`, `uncaught`, `Cannot read`, `reading 'add'`, `Missing glyph`; nessun `budget exceeded`; l'unico `warn` ammesso è quello di framework dopo `xr_end_session` (contratto dei log di M5).
2. **Atti**: ogni atto produce le sue righe di log (atto 1: `furniture placed`, `fit`, `measure`, `viewpoint entered/exited`, `sun set … source=ui`; atto 2: `agent staging action=furnish … pieces=14`, `info opened id=info-001`; atto 3: `issue created id=issue-014`, `issue transition … to=in_progress/resolved/archived`).
3. **Conteggio**: il numero di righe `pinch (left|right) start` dell'intero percorso (senza i passi di ripresa) è ≤ **120** e quello della sola sinistra ≤ **15** (palmo in su e tocco di rotazione; il resto è a una mano).
4. **Etichette oneste**: "Sample data" visibile sulle segnalazioni del seme, sul verbale e sui punti informativi; il ruolo è dichiarato "Demo roles, no accounts"; nessun testo in italiano in nessun `ui_inspect` (si controlla l'insieme dei testi letti).
5. **Ripresa (regola 4)**: dopo la ricarica `role set <ruolo> source=saved`, `sun set … source=saved`, `access … source=saved`, `state restored pieces=<n>` con gli stessi pezzi dell'ultimo salvataggio; dopo `F8`/`F9` con un pezzo in mano 0 duplicati e il pezzo del menu con lo stesso id (S3.0 fase 8).
6. **Budget**: letture `[soglia:stats]` a metà di ogni atto, tutte ≤ 100 chiamate per vista.
7. **Solo visore** (alta): la prova vera dei 10 minuti con una persona, la ripresa vera, i 60 fps e il comfort (voci di `DEBT.md`).

## Esito
PASS se le verifiche 1–6 sono soddisfatte · FAIL altrimenti. Se un passo di un atto fallisce per un punto di partenza non libero, si corregge il punto e si annota (come nel gate di M4).

## Da rimandare al visore
Voce "Sessione completa" di `docs/DEVICE_CHECKLIST.md`.
