# S2.9 · Trascinare il plastico con le due mani (CONDIZIONALE)

**Milestone**: M2 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`)
**Si esegue solo se l'utente ha approvato T2.17** (`docs/plans/M2.md`, sezione "Domanda dell'utente: trascinare il plastico"). Se T2.17 non è stato fatto, lo scenario non conta per il gate. Prerequisiti di implementazione: T2.12 (per `ui:menu-recenter`), T2.17.

## Precondizioni
- `dev-params.local.txt` = `house=apartment-a&role=visitor&reset=1&seed=1&debug=1`; `browser_reload_page`; `xr_accept_session`; `xr_set_input_mode` con `mode: "hand"`; attesa 2 s; testa a (0; 1,6; 0). O = (Ox; Oy; Oz) dall'ultima riga `miniature placed` (atteso (0; 1,35; −0,45)). Le mani stanno a **y = Oy + 0,05**.
- Regola di progetto (T2.17): il punto medio delle mani è il perno; il centro del plastico resta entro **0,30 m** dall'ancora in orizzontale; la quota (y) del plastico non cambia mai; nessuna inclinazione.
- Nota di sequenza: `xr_animate_to` accoda le animazioni (sinistra poi destra); conta solo la posa finale di ogni tappa (come in S1.2). Ogni `xr_set_transform` passa `orientation` `(0, 0, 0, 1)`.

## Passi
1. **Ingrandire a 0,12** (S1.2, fase C, passo 10): mani a (Ox ∓ 0,15; y; Oz), select 1/1, `xr_animate_to` a (Ox ∓ 0,60; y; Oz), select 0/0. Log `gesture end`.
2. **Trascinare in orizzontale**: mani a (Ox ∓ 0,15; y; Oz), select 1/1; log `gesture start`; `xr_animate_to` `hand-left` a (Ox + 0,05; y; Oz) e poi `hand-right` a (Ox + 0,35; y; Oz) (span invariato 0,30, punto medio + 0,20); select 0/0. Log `pattern: "gesture end|translated|room"`; `ecs_query_entity` su `miniature:root` con `["Transform"]`; stato.
3. **Nessuna deriva verticale**: mani a (Ox + 0,20 ∓ 0,15; y; Oz), select 1/1, `xr_animate_to` entrambe a quota y + 0,10 (stesso span e stesso x), select 0/0. `ecs_query_entity` su `miniature:root`.
4. **Limite**: mani a (Ox + 0,20 ∓ 0,15; y; Oz), select 1/1; `xr_animate_to` entrambe a (Ox + 0,70 ∓ 0,15; y; Oz) (punto medio + 0,70 dall'ancora), select 0/0. Log `translated`; `ecs_query_entity` su `miniature:root`.
5. **Limite in diagonale**: mani a (Ox + 0,30 ∓ 0,15; y; Oz), select 1/1, `xr_animate_to` entrambe a (Ox + 0,30 ∓ 0,15; y; Oz + 0,60), select 0/0. Log `translated`; `ecs_query_entity` su `miniature:root`.
6. **Recenter**: `hand-left` a `L_MENU` con `Q_UP` (menu aperto, come S2.1); `ecs_query_entity` su `ui:menu-recenter` (Transform) → `R`; `hand-right` a `R` (orientamento `(0, 0, 0, 1)`), `xr_select {device: "hand-right", duration: 0.2}`; attesa 0,5 s. Log `pattern: "recentered|miniature"`; `ecs_query_entity` su `miniature:root`; stato.
7. **Rotazione e traslazione insieme (nessun ribaltamento)**: mani a (Ox ∓ 0,20; y; Oz), select 1/1, tre tappe di 30°/60°/90° come S1.2 fase B con in più uno spostamento del punto medio di + 0,10 in x nell'ultima tappa; select 0/0; `gesture end`; `ecs_query_entity` su `miniature:root`.
8. `browser_get_console_logs` senza filtro (cercare `error`). `browser_screenshot` dopo il passo 2 (casa ingrandita e spostata a destra, ancora nel campo visivo).

## Verifiche (tutte obbligatorie)
1. Passo 1: `gesture end scale=0.1200 yawDeg=0.0 tiltDeg=0.0`; posizione di `miniature:root` = O ± 0,01 (nessuna traslazione: le mani simmetriche attorno al centro non lo spostano; stessa verifica 4 di S1.2).
2. Passo 2: `[soglia] miniature translated x=0.200 z=0.000` (± 0,01); `miniature:root` a (Ox + 0,20; Oy; Oz) ± 0,01; scala 0,12 e yaw 0 invariati; `tiltDeg=0.0`; **nessun** `room selected`.
3. Passo 3: `Oy` invariato (± 0,001) anche con le mani 0,10 m più in alto; `translated` con `z=0.000` e `x=0.200` (± 0,01).
4. Passo 4: `translated x=0.300 z=0.000` (± 0,01): il raggio del centro dall'ancora è ≤ 0,301 m.
5. Passo 5: la distanza orizzontale tra `miniature:root` e l'ancora (Ox, Oz) è ≤ 0,301 m e la sua quota è Oy (± 0,001); la riga `translated` ha `sqrt(x² + z²)` ≤ 0,301.
6. Passo 6: `[soglia] miniature recentered scale=0.0500`; `miniature:root` torna a O ± 0,01 con scala 0,05 e yaw 0; stato aggiornato (`miniature.offset` `[0, 0]`).
7. Passo 7: `yawDeg` = +90 ± 10, `tiltDeg` ≤ 3, scala invariata ± 3 %, offset entro 0,30 m.
8. Nessuna riga `room selected`, nessuna voce `error`, nessuna locomozione (`xr_get_transform` della testa invariata: (0; 1,6; 0)).
9. Screenshot del passo 2 allegato; il report dice a parole che il plastico è più grande, spostato a destra e ancora in parte nel campo visivo.

## Esito
PASS se le verifiche 1–8 sono soddisfatte · FAIL altrimenti. Se la presa non parte, ripetere **una sola volta** con le mani a ≤ 0,05 m verso il centro del plastico e riportare lo scarto (come in S1.2).

## Da rimandare al visore
Afferrare e trascinare il plastico con mani vere senza scatti né deriva, comodità del limite di 0,30 m, "Recenter" raggiungibile, campo visivo stretto con il plastico decentrato (voci M2 condizionali in `qa/device/DEBT.md`).
