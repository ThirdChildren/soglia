# S1.2 · Pizzico a due mani: zoom, rotazione, limiti

**Milestone**: M1 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`)
Prerequisiti di implementazione: T1.9, T1.11, T1.12 (vedi `docs/plans/M1.md`).

## Precondizioni
- Come S1.1: runtime headless, `dev-params.local.txt` = `house=apartment-a&role=visitor&reset=1&seed=1&debug=1`, `browser_reload_page`.
- `xr_set_transform` headset a (0; 1,2; 0); `xr_accept_session`; `xr_set_input_mode` con `mode: "hand"`; attesa 2 s.
- Ricavare **O = (Ox; Oy; Oz)** dall'ultima riga `[soglia] miniature placed …` (atteso (0; 0,95; −0,45)). Le mani stanno alla quota **y = Oy + 0,05**. Convenzione di rotazione: `yawDeg` positivo = rotazione antioraria vista dall'alto attorno a +Y (come `rotation.y` di Three.js); la mano destra che si allontana dall'utente (−z) mentre la sinistra si avvicina equivale a +90°.
- Nota sulle chiamate: `xr_animate_to` accoda le animazioni una dopo l'altra; l'esito dipende solo dalle pose finali di ogni tappa. Durata 0,5 s per tappa, una chiamata per mano, nell'ordine sinistra → destra.

## Passi

### Fase A · zoom
1. `xr_set_transform`: `hand-left` a (Ox − 0,15; y; Oz), `hand-right` a (Ox + 0,15; y; Oz). Distanza tra le mani 0,30 m.
2. `xr_set_select_value` `hand-left` = 1, poi `hand-right` = 1 (pizzico tenuto).
3. `browser_get_console_logs` con `pattern: "gesture"` → deve esserci `miniature gesture start`.
4. `xr_animate_to`: `hand-left` a (Ox − 0,25; y; Oz), poi `hand-right` a (Ox + 0,25; y; Oz). Distanza finale 0,50 m (rapporto 1,667).
5. `xr_set_select_value` `hand-left` = 0, `hand-right` = 0 (rilascio).
6. `browser_get_console_logs` con `pattern: "gesture end|room selected"`.

### Fase B · rotazione (a partire dalla fine della fase A; sia s1 la scala letta nella riga `gesture end` della fase A)
7. `xr_set_transform`: `hand-left` a (Ox − 0,20; y; Oz), `hand-right` a (Ox + 0,20; y; Oz); poi `xr_set_select_value` a 1 su entrambe.
8. Tappe, una chiamata `xr_animate_to` per mano (prima la sinistra, poi la destra), durata 0,5 s:
   - 30°: sinistra (Ox − 0,173; y; Oz + 0,100), destra (Ox + 0,173; y; Oz − 0,100)
   - 60°: sinistra (Ox − 0,100; y; Oz + 0,173), destra (Ox + 0,100; y; Oz − 0,173)
   - 90°: sinistra (Ox; y; Oz + 0,200), destra (Ox; y; Oz − 0,200)
9. Rilascio (select a 0 su entrambe). `browser_get_console_logs` con `pattern: "gesture end"`, poi `browser_screenshot` → allegare (plastico ingrandito e ruotato di 90°).

### Fase C · limiti
10. Mani a (Ox ∓ 0,15; y; Oz), pizzico, `xr_animate_to` a (Ox ∓ 0,60; y; Oz) (rapporto 4), rilascio. Leggere `gesture end`.
11. Mani a (Ox ∓ 0,15; y; Oz), pizzico, `xr_animate_to` a (Ox ∓ 0,02; y; Oz) (rapporto 0,13), rilascio. Leggere `gesture end`.

### Chiusura
12. `scene_get_runtime_hierarchy` + `scene_get_object_transform` su `miniature:root` (posizione globale).
13. `browser_get_console_logs` senza filtro (cercare `error`).
14. Rilascio finale di entrambe le mani (select a 0) e `xr_end_session`.

## Verifiche (tutte obbligatorie)
1. Fase A: esistono `miniature gesture start` e `miniature gesture end …`; la scala finale s1 è **0,0833 ± 10 %**, cioè tra 0,075 e 0,092; `tiltDeg` ≤ 3.
2. Fase B: `yawDeg` = **+90 ± 10** (tra 80 e 100); la scala finale è s1 ± 3 %; `tiltDeg` ≤ 3.
3. Fase C: dopo il passo 10 `scale` ≤ 0,1201 (limite superiore 0,12); dopo il passo 11 `scale` ≥ 0,0299 (limite inferiore 0,03). Nessun valore NaN in nessuna riga.
4. Posizione globale di `miniature:root` dopo tutte le fasi: entro 0,02 m da O (il plastico non si sposta).
5. Durante le tre fasi **non** compare nessuna riga `room selected` (pizzicare con due mani sul plastico non seleziona stanze).
6. Con `debug=1`, l'ultima riga `[soglia:state]` ha `miniature.scale` e `miniature.yawDeg` uguali (± 0,001 e ± 0,1) a quelli dell'ultimo `gesture end`.
7. Nessuna voce `error` in console; nessuna locomozione (la posizione della testa letta con `xr_get_transform` è invariata).
8. Screenshot del passo 9 allegato; il report dice a parole che il plastico è più grande e ruotato, senza ribaltamenti.

## Esito
PASS se le verifiche 1–7 sono soddisfatte · FAIL altrimenti. Se la presa non parte (nessun `gesture start`), ripetere **una sola volta** con le mani spostate fino a 0,05 m verso il centro del plastico e riportare lo scarto nel report. Se dopo la correzione la presa non parte: FAIL.

## Da rimandare al visore
Affidabilità del pizzico a due mani reale, assenza di scatti, soglie di presa e zona morta, comodità dei limiti di zoom (voci M1 in `qa/device/DEBT.md`).
