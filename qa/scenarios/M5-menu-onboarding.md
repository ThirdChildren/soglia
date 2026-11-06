# S5.7 · Onboarding del pulsante "Menu" (coach a due passi)

> **Changelog 2026-11-06**: scenario creato dal piano M5 (D60; T5.15). Completa l'onboarding del menu rimandato da M2/T2.16 (il suggerimento `Palm up for the menu` resta).

> **Changelog 2026-11-06 (esiti di T5.11 e T5.15)**: (1) `prefs.coach` si salva; un salvato **vecchio senza `coach`** parte da `done` se ci sono pezzi, da `grab` se il menu è già stato aperto, altrimenti da `menu-button`; (2) due passi (D60) con **timeout di 20 s per passo**; log `coach step=menu-button reason=start` → `coach step=grab reason=menu-opened` → `coach step=done reason=placed`, **0** entità `ui:coach-*` alla fine; alla ricarica `coach step=done reason=saved`; (3) passo 1: testo **sotto** il pulsante, a 10 cm da esso (≤ 0,15 m) e a **38°** dal centro della vista; passo 2: sopra il menu; (4) il coach **aspetta** se il pannello Issues o il pannello View è aperto; (5) misure: a freddo con il coach **57** chiamate per vista, menu aperto con il coach `grab` **62**; (6) i pulsanti fissi sono ×1,25 in larghezza con il testo grande: la distanza dal pulsante si legge dal `Transform`.

> **Changelog 2026-11-06 (gate A/B e correzione W1)**: la verifica 9 era l'unica non soddisfatta al gate A/B (il timeout di 20 s scorreva anche con View o Issues aperti e il coach non tornava). **Corretto**: il timeout ora **va in pausa** con il pannello View o Issues aperto e il coach **ricompare alla chiusura nello stesso passo**; **un pezzo in mano nasconde il coach ma non ferma il timer** (se si tiene un pezzo oltre i 20 s dal primo momento in cui il passo era visibile, scatta `coach step=done reason=timeout`). Nel gate le sequenze vanno eseguite **in un unico blocco di comandi** (la CLI costa ≈ 1 s a chiamata e il coach dura 20 s per passo): per il passo 9 aprire il pannello entro pochi secondi dall'inizio del coach (nel gate: +2,8 s). Budget (verifica 11): al gate A/B, **prima di T5.RA**, K16 = 73 (14 pezzi, suggerimento, etichetta della stanza e coach) e 78 (menu aperto e coach `grab`); dopo T5.RA (−16 chiamate) atteso ≈ 57 e ≈ 62; la soglia ≤ 75 vale per il **rerun**. Gli altri risultati (verifiche 1–8 e 10) erano PASS: passo 1 a 0,096 m dal pulsante e 36,8° dal centro; timeout 20,06 s con la sequenza `start` → `done reason=timeout` (nessun passo `grab` in mezzo).

**Milestone**: M5 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`) · **Regole di `CLAUDE.md`**: 1, 8, 9 · Vedi `docs/plans/M5.md`, D60. Convenzioni: `qa/scenarios/M4-issue-create.md`, onboarding di M1: `qa/scenarios/M1-onboarding.md`.

## Precondizioni
- `dev-params.local.txt` = `house=apartment-a&role=visitor&reset=1&seed=1&debug=1&pinch=grip&time=2026-12-21T10:00`. Stato pulito (`reset=1`): `onboardingStep=pinch`, `menuOpened=false`, `coach` al valore iniziale.

## Passi
1. **Prima del coach**: preparazione standard; `ecs_find_entities` `^ui:coach-` (→ 0); log `pattern: "coach|onboarding"`.
2. **Chiudere l'onboarding di M1**: pizzico breve su una stanza (come S1.6): log `pattern: "onboarding|coach"`; attesa 1,5 s; `ecs_find_entities` `^ui:coach-` (→ `ui:coach-menu-button`, 1) e `^ui:menu-hint$`; `ecs_query_entity` su `ui:coach-menu-button` e `ui:menu-button-right` con `["Transform"]`; `ui_inspect` (testo `Pinch Menu`, `fontSize` ≥ 2,4 cm); `browser_screenshot` → allegare (la mano fantasma sul pulsante).
3. **Passo 2 del coach**: pizzico su `ui:menu-button-right`; log `pattern: "coach|menu opened"`; `ecs_find_entities` `^ui:coach-` (→ `ui:coach-grab`); `ui_inspect` (testo `Drop it in the house`); `browser_screenshot` → allegare.
4. **Fine del coach**: prendere `ui:menu-item-chair` e posarlo in soggiorno a `W(1,5; 3,0)`: log `pattern: "coach|furniture placed"`; `ecs_find_entities` `^ui:coach-` (→ 0).
5. **Persistenza**: attesa 1,5 s, ricaricare senza `reset=1`: log `pattern: "coach"` (→ nessun coach); poi con `reset=1` ripetere i passi 1–2 (il coach torna).
6. **Strada del palmo**: con `reset=1`, chiudere l'onboarding di M1, poi aprire il menu con il **palmo in su** (`hand-left` a `L_MENU`, `Q_UP`, attesa 0,9 s): `coach step=grab reason=menu-opened` (il passo 1 si salta); chiudere (palmo giù).
7. **Timeout**: con `reset=1`, chiudere l'onboarding di M1 e **non** toccare nulla per 45 s: `coach step=done reason=timeout` (timeout di 20 s per passo); nessun `ui:coach-*`.
8. **Con un pezzo in mano non c'è**: durante il passo 2 del coach, tenere un pezzo in mano: il testo del coach sparisce alla presa o non si sovrappone alla mano (nessuna etichetta più vicina di 0,50 m).
9. **Coach in attesa**: con `reset=1` e l'onboarding di M1 chiuso, aprire subito (entro ≈ 3 s dall'inizio del coach, in un unico blocco di comandi) il pannello View (`ui:view-button-right`) e dopo 25 s richiuderlo (il coach deve essere ancora lì, nello stesso passo); poi lo stesso con il pannello Issues (`ui:issue-button-right`).
10. Log senza filtro; pulizia.

## Verifiche (tutte obbligatorie)
1. **Passo 1**: 0 `ui:coach-*` durante l'onboarding di M1 (non si sovrappongono).
2. **Passo 2**: `coach step=menu-button reason=start`; 1 `ui:coach-menu-button` **sotto** il pulsante, a ≤ 0,15 m da `ui:menu-button-right` (atteso 0,10 m) e a 0,50–0,80 m dalla testa, a circa 38° dal centro della vista (≤ 45°, ingresso di riserva); testo `Pinch Menu` (nessun testo italiano); `ui:menu-hint` può coesistere ma non deve sovrapporsi (distanza ≥ 0,05 m).
3. **Passo 3**: `menu opened hand=right mode=pinned` e `coach step=grab reason=menu-opened`; 1 `ui:coach-grab`, 0 `ui:coach-menu-button`.
4. **Passo 4**: `coach step=done reason=placed`; 0 `ui:coach-*`.
5. **Passo 5**: dopo la ricarica `coach step=done reason=saved` (o nessuna riga `coach` e 0 entità); con `reset=1` il coach riparte da `menu-button`.
6. **Passo 6**: `coach step=grab reason=menu-opened` (partenza da `grab` per chi ha già aperto il menu).
7. **Passo 7**: il timeout è di 20 s **per passo**: entro 45 s dall'inizio del coach, `coach step=done reason=timeout` (se dopo il primo timeout si passa al passo `grab` invece di chiudere, riportare la sequenza esatta delle righe `coach step=…`); alla fine 0 `ui:coach-*`.
8. **Passo 8**: nessuna sovrapposizione con la mano o con il pezzo; nessun pizzico del coach reclama la mano (il coach non è interattivo).
9. **Passo 9 (coach in attesa)**: con il pannello View (o Issues) aperto per 25 s, il coach **aspetta**: nessuna riga `coach step=done reason=timeout` e il timeout di 20 s non scorre; chiuso il pannello, il passo `menu-button` riprende **nello stesso passo** (la entità `ui:coach-menu-button` torna visibile) e il tempo trascorso con il pannello aperto non conta; lo stesso con il pannello Issues. Con un **pezzo in mano** il coach è nascosto ma il timer **continua**: tenerlo oltre i 20 s dal primo momento visibile porta a `coach step=done reason=timeout`.
10. **Salvato vecchio**: i tre casi di ripresa da un salvato senza `coach` (con pezzi → `done`; menu già aperto e senza pezzi → `grab`; né l'uno né l'altro → `menu-button`) sono coperti dai test unitari: il report li cita; sul runtime si prova solo il caso "nessun pezzo, menu mai aperto" con `reset=1`.
11. **Budget**: il picco di chiamate a freddo (suggerimento + coach) ≤ 75 e con il menu aperto e il coach `grab` ≤ 75 (**dopo T5.RA**; al gate A/B, prima di T5.RA, erano 73 e 78: 78 oltre la soglia), e rientra a regime entro 3 s dopo la fine del coach (tabella di S5.9, caso K16).
12. Nessuna voce `error`; nessun `Missing glyph`; nessun `reading 'add'`.
13. **Solo visore** (media): la mano fantasma si capisce senza spiegazioni, i 20 s di timeout non sono né troppi né pochi.

## Esito
PASS se le verifiche 1–12 sono soddisfatte (la 13 è solo visore) · FAIL altrimenti.

## Da rimandare al visore
Voce "Coach del pulsante Menu" di M5.
