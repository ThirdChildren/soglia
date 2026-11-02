# S4.7 · Menu `pinned` nel cono di 30° anche con lo sguardo inclinato

> **Changelog 2026-11-02**: scenario creato dal piano M4 (D49 R2, T4.R2; riporto 2 del gate di M3, avviso del `contest-reviewer` sulla regola 8). Prima di M4 la finestra del beccheggio era +5,1° / −7,1° (S3.8 verifica del cono con lo sguardo livellato).

**Milestone**: M4 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`) · **Regola di `CLAUDE.md`**: 8 (campo visivo: pannelli a 0,5–0,8 m, nel cono di 30°)
Prerequisiti di implementazione: T4.R2 (T4.6a per l'ultimo passo). Vedi `docs/plans/M4.md`, D49 R2; `docs/plans/M3.md`, D32 ("Esito di T3.3a"). Convenzioni: `qa/scenarios/M4-issue-create.md`.

## Precondizioni
- `dev-params.local.txt` = `house=apartment-a&role=visitor&reset=1&seed=1&debug=1&pinch=grip`; preparazione standard (testa (0; 1,6; 0), orientamento identità `(0, 0, 0, 1)`, `O` = (0; 1,35; −0,45)).
- **Beccheggio dello sguardo** (rotazione attorno a +X; positivo = guarda in alto), quaternione `(x, y, z, w)` da impostare con `xr_set_transform` sul `headset` (posizione (0; 1,6; 0)): **+10°** `(0,0872; 0; 0; 0,9962)`; **+5°** `(0,0436; 0; 0; 0,9990)`; **0°** `(0; 0; 0; 1)`; **−8°** `(−0,0698; 0; 0; 0,9976)`; **−12°** `(−0,1045; 0; 0; 0,9945)`; **−14°** `(−0,1219; 0; 0; 0,9925)`; **−20°** `(−0,1736; 0; 0; 0,9848)`; **−25°** `(−0,2164; 0; 0; 0,9763)`. (Alternativa: `xr_look_at` `headset` verso un punto a 1 m con la quota giusta; riportare quale.)
- Pulsante "Menu" destro: mano a (0,4727; 1,498; −0,6035), `xr_select {duration: 0.2}` (la posizione dei pulsanti non dipende dallo sguardo).
- Attesi (ancora = centro-basso del pannello; il `Transform` di `ui:palm-menu` è il centro, circa 0,179 m più in alto): quota dell'ancora `1,40 + 0,55·tan(c)` con `c = clamp(g, −8°, +8°)`; centro del pannello: **c = +8°** y ≈ 1,656; **+5°** 1,627; **0°** 1,579; **−8°** 1,502; z ≈ −0,55 in tutti i casi (testa con yaw 0).

## Passi
Per ciascuno dei beccheggi `g` ∈ {0°, +5°, +10°, −8°, −12°, −14°} (**PASS**) e {−20°, −25°} (**informativi**):
1. Impostare il beccheggio del `headset`, attesa 1,5 s.
2. Aprire con il pulsante: pizzico sul pulsante "Menu" destro, attesa 1 s. Log `pattern: "menu"` (righe `menu opened hand=right mode=pinned`, `menu view maxAngleDeg=<a> distance=<d>`, `menu pinned pitchDeg=<g> anchorPitchDeg=<c>`); `ecs_find_entities` `^ui:palm-menu$` (→ 1); `ecs_query_entity` su `ui:palm-menu` con `["Transform"]` (→ `P`); `browser_screenshot` solo per 0°, −8° e −14° → allegare.
3. Chiudere con lo stesso pulsante (`menu closed mode=pinned via=button`); riportare il `headset` a identità prima del giro successivo.

Poi: (4) **ancora del pannello Issues** (T4.6a): per `g` ∈ {0°, −12°}: `ui:issue-button-right` (mano a (0,4727; 1,568; −0,6035)), log `pattern: "issues panel"` (`issues panel view maxAngleDeg=<a> distance=<d>`), chiudere con `ui:issue-close`; (5) **un'unica lettura di regressione** con la testa a identità: la riga di S3.8/S3.7 `menu view maxAngleDeg=26.1 distance=0.59` (± 0,2) e `P` = (0; 1,579; −0,55) ± 0,01 come in M3.

## Verifiche (tutte obbligatorie)
1. **Angolo nel cono**: per `g` ∈ {0, +5, +10, −8, −12, −14} la riga `menu view maxAngleDeg` ha **a ≤ 30,0** e `distance` tra **0,50 e 0,65**. In M3 con `g` = −12° e −14° il valore era > 30 (finestra −7,1°): il confronto va nel report.
2. **Compensazione**: `menu pinned pitchDeg=<g> anchorPitchDeg=<c>` con `c` = +8,0 per +10°; +5,0; 0,0; −8,0 per −8°, −12°, −14° (clamp); la quota del centro del pannello segue la tabella delle precondizioni (± 0,015 m).
3. **Pannello verticale e solo yaw**: il `Transform` ha rotazione attorno a Y soltanto (x e z della rotazione ≈ 0) in ogni caso (nessun testo inclinato).
4. **Distanze** (regola 8): titolo e controlli a 0,50–0,80 m dalla testa (il titolo oltre 0,65 è avviso; le voci ≤ 0,65); nessuna sovrapposizione grossolana con il plastico: l'ancora a −8° sta a ≥ 1,32 m (informazione per il visore, voce `DEBT.md`).
5. **Informativi**: −20° e −25°: riportare `maxAngleDeg` (atteso 31–36° e 36–42°): sono **avvisi dichiarati** (oltre −15° il menu non insegue lo sguardo per non coprire il plastico), non FAIL.
6. **Regressione (passo 5)**: a testa identità i numeri di M3 non cambiano (`26,1` e `distance=0.59`, centro (0; 1,579; −0,55)).
7. **Pannello Issues** (passo 4): `issues panel view maxAngleDeg` ≤ 30,0 a 0° e a −12°.
8. Nessuna voce `error`; nessun `NaN` nelle righe.
9. **Solo visore** (alta): comodità dell'ancora a −8° (non copre il plastico), finestra reale del beccheggio; voce "Menu `pinned` con beccheggio" in `qa/device/DEBT.md`.

## Esito
PASS se le verifiche 1–8 sono soddisfatte · FAIL altrimenti. Se solo il caso −14° fallisce per meno di 0,5°, è un avviso (il margine teorico è 1°).

## Da rimandare al visore
Vedi verifica 9.
