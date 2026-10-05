# S1.3 · Pizzico su una stanza: etichetta con nome e area

**Milestone**: M1 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`)
Prerequisiti di implementazione: T1.4, T1.8, T1.9, T1.10 (vedi `docs/plans/M1.md`).

## Precondizioni
- Come S1.1: runtime headless, `dev-params.local.txt` = `house=apartment-a&role=visitor&reset=1&seed=1&debug=1`, `browser_reload_page`, headset a (0; 1,2; 0), `xr_accept_session`, `xr_set_input_mode` con `mode: "hand"`, attesa 2 s.
- **O = (Ox; Oy; Oz)** dall'ultima riga `miniature placed` (atteso (0; 0,95; −0,45)). Scala 0,05 e yaw 0 (nessun gesto prima di questo scenario).
- Centri dei pavimenti nel mondo, `C = (Ox + dx; Oy; Oz + dz)`:

  | Stanza | `dx` | `dz` | Etichetta attesa (esatta) | Riga di log attesa |
  |---|---|---|---|---|
  | `living` | −0,145 | −0,065 | `Living room & kitchen: 23.9 m2` | `room selected living area=23.9` |
  | `bedroom` | +0,065 | −0,065 | `Bedroom: 14.7 m2` | `room selected bedroom area=14.7` |
  | `study` | +0,210 | −0,065 | `Study: 12.0 m2` | `room selected study area=12.0` |
  | `bathroom` | −0,210 | +0,115 | `Bathroom: 6.8 m2` | `room selected bathroom area=6.8` |
  | `hall` | +0,065 | +0,090 | `Hallway: 13.4 m2` | `room selected hall area=13.4` |

  (Forma ASCII `<name>: <area> m2`: il font Inter MSDF del pannello non ha i glifi `·` e `²`. Per la casa B, con lo stesso formato, il soggiorno è `Living room & kitchen: 20.2 m2`.)

  (calcolo: `d = (centro_stanza − (5,5; 3,6)) × 0,05`; le aree sono 23,92 / 14,72 / 11,96 / 6,76 / 13,44 m².)
- Mano usata: destra. Per ogni stanza: `hand-right` a **(Cx; Oy + 0,25; Cz + 0,02)** (quasi sopra il centro, il raggio scende quasi verticale e non attraversa muri), poi `xr_look_at` con `device: "hand-right"` e `target: C`.

## Passi
1. Per la stanza `living`: `xr_set_transform` `hand-right` come sopra → `xr_look_at` → `xr_select` con `device: "hand-right"`, `duration: 0.3`.
2. Attendere 1 s (`browser_interact`, passo `wait` 1000 ms). `browser_get_console_logs` con `pattern: "room|label"`.
3. `ecs_find_entities` con `namePattern: "^ui:room-label$"`.
4. `browser_screenshot` → allegare (etichetta del soggiorno visibile).
5. Ripetere i passi 1–2 per `bedroom`, `study`, `bathroom`, `hall` (nell'ordine della tabella), un `xr_select` per stanza. Dopo ciascuna, controllare il log.
6. Ripetere la selezione di `hall` (stesso punto, secondo `xr_select`). `browser_get_console_logs` con `pattern: "room"`.
7. Prova negativa: `hand-right` a (Ox + 0,38; Oy + 0,25; Oz) sopra la base vuota, `xr_look_at` verso (Ox + 0,38; Oy; Oz), `xr_select`. `browser_get_console_logs` con `pattern: "room"`.
8. `browser_get_console_logs` senza filtro (cercare `error`).

## Verifiche (tutte obbligatorie)
1. Passo 2: la riga `[soglia] room selected living area=23.9` e **dopo** di essa `[soglia] label shown "Living room & kitchen: 23.9 m2"` (testo esattamente uguale, in ASCII: `: ` e `m2`).
2. Passo 3: esattamente **1** entità `ui:room-label`.
3. Passo 5: per ogni stanza la riga `room selected <id> area=<x>` e la riga `label shown "<testo>"` della tabella; al cambio di stanza l'entità `ui:room-label` resta **una sola** (il pannello è riutilizzato).
4. Passo 6: compare `[soglia] room deselected hall` e nessuna nuova `label shown`.
5. Passo 7: nessuna nuova riga `room selected` né `room deselected` (la base non è una stanza).
6. L'area del soggiorno è 23,9 ± 0,1 (verifica sulla riga del passo 2); per le altre stanze il valore esatto della tabella.
7. Con `debug=1`: dopo il passo 1 l'ultima riga `[soglia:state]` ha `selectedRoomId":"living"`; dopo il passo 6 ha `selectedRoomId":null`.
8. Nessuna voce `error` in console. Nessuna delle selezioni ha mosso, scalato o ruotato il plastico (ultima riga `[soglia:state]`: `miniature.scale` 0,05, `yawDeg` 0).
9. Screenshot allegato; il report descrive posizione dell'etichetta (sopra la stanza, rivolta verso la testa) e leggibilità a parole.

## Esito
PASS se le verifiche 1–8 sono soddisfatte · FAIL altrimenti. Se `xr_select` non produce nessuna selezione, ripetere **una sola volta** con la mano a ≤ 0,05 m di scarto orizzontale dal centro e riportare lo scarto; poi FAIL.

## Da rimandare al visore
Dimensione e leggibilità del testo a 0,5–0,8 m, presenza dei glifi `·` e `²` nel font su schermo reale, pizzico che seleziona la stanza giusta con la mano reale e non con una vicina (voci M1 in `qa/device/DEBT.md`).

## Changelog
- 2026-10-05: testo atteso dell'etichetta portato alla forma ASCII attuale `<name>: <area> m2` (tabella, verifica 1; aggiunta la nota per la casa B `Living room & kitchen: 20.2 m2`) — motivo: il font Inter MSDF del pannello non ha i glifi `·` (U+00B7) né `²` (U+00B2) (F1 del report `qa/reports/M1-2026-10-05.md`). Obiettivo futuro invariato: il testo Unicode `<name> · <area> m²` resta quello desiderato; un task del piano M2 verificherà quali glifi sono disponibili e come ottenerli, e a quel punto lo scenario tornerà alla forma Unicode.
