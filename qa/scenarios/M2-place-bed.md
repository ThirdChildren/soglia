# S2.2 · Posa il letto

**Milestone**: M2 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`)
Prerequisiti di implementazione: T2.3, T2.5, T2.6, T2.7, T2.9, T2.10 – T2.13 (vedi `docs/plans/M2.md`, D13 – D17, sezione "Strategia QA").

## Precondizioni
- `dev-params.local.txt` = `house=apartment-a&role=visitor&reset=1&seed=1&debug=1`; `browser_reload_page`; `xr_accept_session`; `xr_set_input_mode` con `mode: "hand"`; attesa 2 s; testa a (0; 1,6; 0).
- **O** = (Ox; Oy; Oz) dall'ultima riga `miniature placed` (atteso (0; 1,35; −0,45), scala 0,05, yaw 0). Conversione: `W(px, pz) = (Ox + (px − 5,5)·0,05; Oy + 0,04; Oz + (pz − 3,6)·0,05)`.
- Menu: `L_MENU`, `Q_UP` come in `qa/scenarios/M2-palm-menu.md` (sequenza "Aprire il menu"). La mano sinistra resta in alto per tutto lo scenario.
- Punti (con O = (0; 1,35; −0,45), mani a y = 1,39):
  - **P1** = `W(6,8; 1,30)` = (0,065; 1,39; −0,565) → camera da letto, a 0,175 m reali dal muro nord.
  - Centro atteso del letto dopo l'aggancio: (6,80; 1,125) in pianta = `W` (0,065; 1,39; −0,574).

## Passi
1. Aprire il menu (`xr_set_transform` `hand-left` a `L_MENU` con `Q_UP`, attesa 0,6 s). `ecs_find_entities` con `namePattern: "^furniture:"` (deve essere 0). `browser_get_console_logs` con `pattern: "furniture|undo"`.
2. `ecs_query_entity` su `ui:menu-item-bed-double` con `components: ["Transform"]` → posizione `I`.
3. **Prendere**: `xr_set_transform` `hand-right` a `I` con orientamento `(0, 0, 0, 1)`; `xr_set_select_value` `hand-right` = 1; attesa 0,3 s. `browser_get_console_logs` con `pattern: "furniture grabbed"`; `ecs_find_entities` con `^furniture:`; `ecs_query_entity` sull'entità trovata con `components: ["Furniture"]`.
4. **Trasportare**: `xr_animate_to` `hand-right` a **P1** (0,8 s); attesa 1 s. `ecs_query_entity` con `["Furniture"]` (stato in volo) e `browser_get_console_logs` con `pattern: "furniture status"`. `browser_screenshot` → allegare (letto in mano sopra la camera, cornice verde sul pavimento).
5. **Rilasciare**: `xr_set_select_value` `hand-right` = 0; attesa 0,5 s. `browser_get_console_logs` con `pattern: "furniture placed|room selected|gesture"`; `ecs_query_entity` con `["Furniture", "Transform"]`; riga `[soglia:state]` più recente.
6. `browser_screenshot` → allegare (letto appoggiato al muro nord, nessuna cornice).
7. Mano a riposo (`hand-right` lontano, select 0), chiusura del menu (palmo in giù). `browser_get_console_logs` senza filtro (cercare `error`).

## Verifiche (tutte obbligatorie)
1. Passo 1: **0** entità `furniture:*`.
2. Passo 3: riga `[soglia] furniture grabbed furniture:bed-double#1 source=menu hand=right`; esattamente **1** entità `furniture:bed-double#1`; `Furniture.catalogId` = `bed-double`, `instance` = 1, `phase` = `held`, `hand` = `right`.
3. Passo 4 (in volo, mano sopra il plastico): `Furniture.status` = `valid`, `outline` = `green`, `phase` = `held`; **non** esiste nessuna riga `miniature gesture start` (un solo pizzico, e il suo proprietario è il mobile) né `room selected`.
4. Passo 5: riga `[soglia] furniture placed furniture:bed-double#1 room=bedroom x=6.80 z=1.13 rot=0 status=valid` (x = 6,80 ± 0,01; **z = 1,125 ± 0,01**: il lato nord del letto è a filo con la faccia interna del muro nord, 0,125 m); `Furniture.phase` = `placed`, `status` = `valid`, `outline` = `none`, `roomId` = `bedroom`; `Transform` locale (se riportato come locale) ≈ (6,8; 0; 1,125).
5. Passo 5, store (`[soglia:state]`): `furniture` ha **1** elemento con `id` `furniture:bed-double#1`, `catalogId` `bed-double`, `x` 6,8 ± 0,01, `z` 1,125 ± 0,01, `rotationDeg` 0, `roomId` `bedroom`; `nextInstance` `{"bed-double":2}`; `historyLength` 1; `miniature.scale` 0,05 e `yawDeg` 0 (non toccati).
6. Nessuna riga `room selected` / `room deselected` in tutto lo scenario (il pizzico che ha preso il pezzo non ha selezionato la stanza) e **nessuna** riga `pan start` né `miniature translated` (il pizzico che ha preso il pezzo non ha mosso il plastico: priorità mobile > `pan`, D15/D28); `miniature.offset` resta `[0,0]` nello stato.
7. Nessuna voce `error`; nessun `Missing glyph info`.
8. Screenshot dei passi 4 e 6 allegati; il report descrive a parole: letto in mano con cornice verde (passo 4) e letto appoggiato al muro nord senza cornice (passo 6).

## Esito
PASS se le verifiche 1–7 sono soddisfatte · FAIL altrimenti. Se la presa non parte (nessun `furniture grabbed`), ripetere **una sola volta** con la mano a ≤ 0,02 m dal centro della voce e riportare lo scarto; poi FAIL. Se `x`/`z` differiscono di più di 0,01 m ma il pezzo è `valid` e nella stanza giusta, riportare i valori reali: FAIL solo se il letto non è in `bedroom` o non è valido.

## Da rimandare al visore
Presa naturale con la mano vera, tremolii nel trasporto, comodità dell'aggancio al muro (0,30 m) a scala 1:20, visibilità della cornice verde a 0,5–0,8 m (voci M2 in `qa/device/DEBT.md`).

## Changelog
- 2026-10-05: verifica 6 estesa: nessuna riga `pan start` né `miniature translated` e `miniature.offset` invariato — motivo: decisione dell'utente 2 (la traslazione del plastico, anche a una mano, non deve entrare in conflitto con la presa dei mobili; arbitraggio D15/D28).
