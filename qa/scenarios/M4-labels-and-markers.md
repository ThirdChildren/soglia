# S4.8 · Etichetta sopra i pilastri, quota minima, conferma del punto di vista

> **Changelog 2026-11-02**: scenario creato dal piano M4 (D49 R3 e R4, T4.R5, T4.R6; riporti 3, 4 e 6 del gate di M3: `qa/reports/M3-gate-C2-S1.3-label-hall.png`, voci `DEBT.md` "Pizzico vicino a un marcatore" e "Etichetta della stanza").

**Milestone**: M4 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`) · **Regole di `CLAUDE.md`**: 8, 9
Prerequisiti di implementazione: parti A e B: T4.R5; parte C: T4.R6 (o il suo ripiego, vedi parte C). Convenzioni: `qa/scenarios/M4-issue-create.md`.

## Precondizioni
- `dev-params.local.txt` = `house=apartment-a&role=visitor&reset=1&seed=1&debug=1&pinch=grip`; preparazione standard (testa (0; 1,6; 0), `O` = (0; 1,35; −0,45)).
- Marcatori `viewpoint:V1/V2/V3` a (−0,130; 1,4375; −0,465), (0,065; 1,4375; −0,470), (0,215; 1,4375; −0,535) (leggerli con `ecs_query_entity` `["Transform"]`).
- Corridoio (`hall`, 8,4 × 1,6 m = 13,4 m²): centro pianta (6,8; 5,4) → mondo (0,065; 1,39; −0,36) → mano a (0,103; 1,393; −0,397). Soggiorno: punto (1,5; 1,5) → (−0,200; 1,39; −0,255) con il plastico spostato di +0,30 in z (vedi parte B).

## Parte A · l'etichetta del corridoio non è coperta dal pilastro (T4.R5)
1. Pizzico breve (0,3 s) sul corridoio; attesa 1 s. Log `pattern: "room|label"`; `ecs_find_entities` `^ui:room-label` (→ 1); `ecs_query_entity` sulla sua `Transform`; `browser_screenshot` con la testa che guarda il corridoio (`xr_look_at` `headset` verso (0,02; 1,40; −0,49)) → allegare; `ui_inspect` sull'etichetta (testo).
2. Pizzico breve sul soggiorno (stesso modo): etichetta del soggiorno invariata rispetto a S1.3.

**Verifiche A**: `room selected hall area=13.4` e `label shown "Hallway · 13.4 m²"` (testo esatto, con `·` e `²`); riga `room label layer markers=below` (l'etichetta si disegna sopra i marcatori) **oppure** `room label layer markers=hidden` (ripiego: il marcatore vicino è nascosto mentre l'etichetta c'è); nello screenshot le **cifre `1`, `3`, `.`, `4` si leggono tutte** (prima: `Hallway · 13_ m²`, una cifra coperta da `viewpoint:V2`): il report descrive il testo letto a parole. L'etichetta del soggiorno resta `Living room & kitchen · 23.9 m²` (S1.3 PASS).

## Parte B · etichetta mai sotto il piano (T4.R5, riporto 6)
1. Spostare il plastico verso la testa di 0,30 m con la sola destra (pan sulla base libera, come S2.9 passo 1): `hand-right` a (0,388; 1,383; −0,487), select 1, attesa 0,3 s, `xr_animate_to` a (0,388; 1,383; −0,187) in 0,8 s, select 0. Letture: `miniature translated x=0.000 z=0.300 source=pan`; `miniature:root` a (0; 1,35; −0,15).
2. Pizzico breve sul soggiorno al punto (1,5; 1,5): mano a (−0,162; 1,393; −0,292). Log `pattern: "room|label"`; `ecs_find_entities` `^ui:room-label`; `ecs_query_entity` sulla `Transform` (→ `L`); `browser_screenshot` → allegare. Distanza di `L` dalla testa.
3. Facoltativo: lo stesso con lo studio e il bagno.

**Verifiche B**: `room selected living area=23.9`; `L.y` **≥ 1,44** (= quota del piano 1,35 + muro 0,05 + 0,047, tolleranza 0,005; in M3 poteva essere 17 cm sotto il piano); distanza di `L` dalla testa **≥ 0,52 m**; il testo si legge nello screenshot; nessuna etichetta sotto il piano in nessuna delle stanze provate. Senza spostamento (parte A) le quote non cambiano rispetto a M3 (nessuna regressione).

## Parte C · il pizzico vicino a un marcatore non entra per sbaglio (T4.R6)
Riportare il plastico al centro (menu → `ui:menu-recenter`, oppure ricaricare con `reset=1`). Tutte le prove con la **destra**, tranne C4.
- **C1 · pizzico fermo e tenuto → entra**: mano a (−0,092; 1,4405; −0,502) (pizzico su V1), `xr_set_select_value` 1, attesa 1 s, 0. Log `pattern: "viewpoint|miniature"`. Tornare con il pulsante "Tabletop" (S4.6).
- **C2 · tocco breve → non entra**: stessa posa, `xr_select {duration: 0.1}` (se lo strumento arrotonda, usare la durata minima e riportarla); attesa 1,5 s.
- **C3 · mano che si sposta → non entra**: stessa posa, select 1, attesa 0,1 s, `xr_animate_to` a (−0,052; 1,4405; −0,502) (+0,04 m in x) in 0,2 s, attesa 1 s, select 0.
- **C4 · zoom a due mani vicino a un marcatore → parte lo zoom**: la **destra** pizzica per prima a (0,188; 1,453; −0,487) (fuori dai marcatori, select 1), poi la **sinistra** a (−0,112; 1,453; −0,487) (a 0,02 m da V1: la ricetta di M2/S1.2 di prima), `xr_set_select_value` 1, attesa 0,5 s, allargare di 0,2 m (`xr_animate_to` a (−0,312; …) e (0,388; …)), select 0/0.
- **C5 · ricetta di zoom corretta di S1.2** (mani ∓0,20): zoom come S1.2 fase A: nessuna conferma di punto di vista.

**Verifiche C (variante con T4.R6)**: C1: `viewpoint confirm start id=V1` seguito (≥ 0,3 s dopo) da `viewpoint transition start id=V1 from=tabletop` e `viewpoint entered id=V1 …`; C2: `viewpoint confirm start id=V1` e `viewpoint confirm cancelled reason=released`, **nessuna** riga `viewpoint transition`, `miniature:root` invariato, nessuna `room selected`; C3: `confirm cancelled reason=moved`, nessuna transizione, nessun `pan start` (la mano è sulle stanze); C4: **nessuna** riga `viewpoint confirm start` per la sinistra, `miniature gesture start` e `miniature gesture end scale=… yawDeg=…` con la scala cresciuta (il caso in cui la sinistra pizzica per prima è nei test unitari di `viewpoint-confirm`, perché con la latenza di MCP le due mani non si pizzicano a meno di 0,3 s l'una dall'altra: il report lo dichiara); C5: `miniature gesture start`, nessun `viewpoint confirm`.
**Verifiche C (variante di ripiego: solo raggio 0,025 m, T4.R6 non fatto)**: pizzico a 0,025 m da V1 (C4 e C5 senza la prima mano) **non** entra; pizzico a 0,01 m entra subito; C2 entra (un tocco breve a 0,01 m è un ingresso): il report dice quale variante è in uso e la voce `DEBT.md` "Pizzico vicino a un marcatore" resta aperta.

## Parte D · regressione
S1.3 (soggiorno e studio), S3.1 (ingresso/uscita con pulsante), S1.2 con la ricetta corretta: nessuna differenza di criterio.

## Verifiche generali
Nessuna voce `error`; nessun `Missing glyph`; nessun `NaN`. Differenze attese rispetto a M3 (non sono FAIL): righe nuove `room label layer …` e `viewpoint confirm …`.

## Esito
PASS se le verifiche A, B, C (nella variante in uso) e generali sono soddisfatte · FAIL altrimenti. Un'etichetta con una cifra coperta è FAIL (la leggibilità è la ragione del riporto).

## Da rimandare al visore
Etichette davanti ai pilastri con la testa vera; ingressi per sbaglio e frustrazione della conferma di 0,30 s (voci di M4 in `qa/device/DEBT.md`).
