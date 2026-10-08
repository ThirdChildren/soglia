# S3.10 · Presa e misura a distanza in scala reale (SOLO SE T3.15 È FATTO)

**Milestone**: M3 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`) · **Regole di `CLAUDE.md`**: 1, 2 (da seduti, niente locomozione), 8
Prerequisiti di implementazione: T3.12 (punti di vista), T3.14 (metro), T3.15 (raggio dalla mano). Vedi `docs/plans/M3.md`, D38 e lo spike di 20 minuti di T3.15. **Se T3.15 è tagliato** (si taglia per primo) questo scenario non si esegue: il report scrive "S3.10 non applicabile: scala reale, presa solo a portata di braccio" e la voce va in `qa/device/DEBT.md` e nel Devpost. Convenzioni comuni: `qa/scenarios/M3-persistence.md`; punti di vista: `qa/scenarios/M3-viewpoint.md`.

## Precondizioni
- Esito dello spike T3.15 scritto in `docs/plans/M3.md` ("Esiti degli spike"): come si orienta il raggio di `player.raySpaces[hand]` in IWER (`xr_set_transform` con `orientation`, o `xr_look_at` sulla mano; trappola R3 di M2 da verificare) e se la sua direzione è riproducibile. **Lo scenario non si esegue senza questo esito.** Se il raggio non è riproducibile, il task passa a M5/M7 e lo scenario non si applica.
- `dev-params.local.txt` = `house=apartment-a&role=visitor&reset=1&seed=1&debug=1&pinch=grip&furnish=scandinavian`; preparazione standard; testa a (0; 1,6; 0); entrare in `viewpoint:V1` (S3.1 passo 2): `root` = (2,60; 0,40; 0,30). Mondo di un punto di pianta in V1: `(px − 2,9; 0,4 + h; pz − 3,3)`.
- Pezzi fuori portata (> 0,6 m dalla testa) in V1: `furniture:sofa-3seat#1` a (4,62; 3,10) → mondo (1,72; ·; −0,20), distanza orizzontale 1,73 m; `furniture:bookcase#1` a (10,69; ·) è in un'altra stanza.

## Passi
1. **Raggio**: `hand-right` a (0,25; 1,15; −0,25) con l'orientamento che l'esito dello spike indica per puntare al pavimento sotto il divano (`xr_look_at` o quaternione); `xr_select {device: "hand-right", duration: 0.3}` **non** su un pezzo a portata. Log `pattern: "furniture|ray|pinch"`.
2. **Presa a distanza**: mano puntata sul centro del divano, `xr_set_select_value` 1, attesa 0,4 s: `furniture grabbed furniture:sofa-3seat#1 source=…` (la sorgente `distance` o equivalente, citata nel report); mentre il pizzico dura, `xr_animate_to` della mano per puntare un altro punto libero del soggiorno (`(1,5; 3,0)` in pianta → mondo (−1,4; ·; −0,3)), il pezzo segue il punto di intersezione; rotazione col polso come in D19; rilascio: `furniture placed furniture:sofa-3seat#1 …` con posa agganciata e `status` coerente; `Furniture` del pezzo prima e dopo; undo riporta la posa precedente.
3. **Misura a distanza**: scheda `measure`, due pizzichi puntati sulle estremità della finestra `win-study` o, in V1, su due angoli della stanza (il valore atteso lo calcola il report dalla geometria di `apartment-a.json`: distanza tra le facce interne dei muri); log `pattern: "measure"`.
4. **Nessuna locomozione**: `xr_get_transform` `headset` identico prima e dopo (± 0,001).
5. Log senza filtro (`error`); pulizia come S3.0.

## Verifiche (tutte obbligatorie, se applicabile)
1. Il raggio produce la presa del pezzo puntato e **non** di un altro vicino (il più vicino al punto di intersezione, a parità il centro più vicino); nessuna presa quando il raggio non incontra il pavimento del modello.
2. Il pezzo segue il punto di intersezione senza salti oltre 0,1 m tra due letture consecutive; la posa finale, lo stato (`valid`/`invalid`) e il motivo seguono le stesse regole di S2.2/S2.3; una sola entità `furniture:sofa-3seat#1` in ogni lettura.
3. Misura a distanza: `measure result cm=<n>` coerente con la geometria (±2 cm per punti agganciati a facce/angoli).
4. Testa invariata; nessuna riga `viewpoint transition`; nessun `error`.
5. **Solo visore**: raggio dalla mano preciso e senza salti con la mano vera; comodità da seduti.

## Esito
PASS se le verifiche 1-4 sono soddisfatte · FAIL altrimenti · "non applicabile" se T3.15 è stato tagliato.

## Da rimandare al visore
Voce "Presa a distanza" di M3 in `qa/device/DEBT.md` (media).

## Changelog
- 2026-10-09: scenario creato dal piano M3 (D38, T3.15 tagliabile).
