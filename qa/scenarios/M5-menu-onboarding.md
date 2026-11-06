# S5.7 · Onboarding del pulsante "Menu" (coach a due passi)

> **Changelog 2026-11-06**: scenario creato dal piano M5 (D60; T5.15). Completa l'onboarding del menu rimandato da M2/T2.16 (il suggerimento `Palm up for the menu` resta).

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
7. **Timeout**: con `reset=1`, chiudere l'onboarding di M1 e **non** toccare nulla per 22 s: `coach step=done reason=timeout`; nessun `ui:coach-*`.
8. **Con un pezzo in mano non c'è**: durante il passo 2 del coach, tenere un pezzo in mano: il testo del coach sparisce alla presa o non si sovrappone alla mano (nessuna etichetta più vicina di 0,50 m).
9. Log senza filtro; pulizia.

## Verifiche (tutte obbligatorie)
1. **Passo 1**: 0 `ui:coach-*` durante l'onboarding di M1 (non si sovrappongono).
2. **Passo 2**: `coach step=menu-button reason=start`; 1 `ui:coach-menu-button` a ≤ 0,15 m da `ui:menu-button-right` e a 0,50–0,80 m dalla testa; testo `Pinch Menu` (nessun testo italiano); `ui:menu-hint` può coesistere ma non deve sovrapporsi (distanza ≥ 0,05 m).
3. **Passo 3**: `menu opened hand=right mode=pinned` e `coach step=grab reason=menu-opened`; 1 `ui:coach-grab`, 0 `ui:coach-menu-button`.
4. **Passo 4**: `coach step=done reason=placed`; 0 `ui:coach-*`.
5. **Passo 5**: dopo la ricarica `coach step=done reason=saved` (o nessuna riga `coach` e 0 entità); con `reset=1` il coach riparte da `menu-button`.
6. **Passo 6**: `coach step=grab reason=menu-opened` (partenza da `grab` per chi ha già aperto il menu).
7. **Passo 7**: `coach step=done reason=timeout` entro 25 s dall'inizio del coach.
8. **Passo 8**: nessuna sovrapposizione con la mano o con il pezzo; nessun pizzico del coach reclama la mano (il coach non è interattivo).
9. **Budget**: il picco di chiamate a freddo (suggerimento + coach) ≤ 75 e rientra a regime entro 3 s dopo la fine del coach (tabella di S5.9, caso K16).
10. Nessuna voce `error`; nessun `Missing glyph`; nessun `reading 'add'`.
11. **Solo visore** (media): la mano fantasma si capisce senza spiegazioni, i 20 s di timeout non sono né troppi né pochi.

## Esito
PASS se le verifiche 1–10 sono soddisfatte · FAIL altrimenti.

## Da rimandare al visore
Voce "Coach del pulsante Menu" di M5.
