# S1.2 · Pizzico a due mani: zoom, rotazione, limiti

> **Changelog 2026-11-02** (solo punti di partenza, criteri invariati; gate M3, `qa/reports/M3-2026-11-02-C2-m1-regressions.md`): da M3 i marcatori `viewpoint:V1/V2/V3` stanno a (−0,130; −0,465), (0,065; −0,470), (0,215; −0,535) in scala 0,05 e si spostano con il plastico; un pizzico entro 0,04 m da un marcatore entra nel punto di vista invece di avviare lo zoom (le mani a ∓0,15 cadevano a 0,025 m da `V1`). Le distanze delle mani dal centro diventano: fase A **∓0,20 → ∓0,333**, fase B **raggio 0,27**, passo 10 **∓0,27 → ∓0,75**, passo 11 **∓0,40 → ∓0,02**, fase D **∓0,17** (tutte a ≥ 0,05 m dai marcatori, ricalcolate sulla scala di partenza di ogni fase). Testa a (0; 1,6; 0), `O` = (0; 1,35; −0,45), `pinch=grip` (come M2/M3). Le mani restano simmetriche attorno al centro: la verifica 4 vale alla lettera.

**Milestone**: M1 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`)
Prerequisiti di implementazione: T1.9, T1.11, T1.12 (vedi `docs/plans/M1.md`).

## Precondizioni
- Come S1.1: runtime headless, `dev-params.local.txt` = `house=apartment-a&role=visitor&reset=1&seed=1&debug=1&pinch=grip`, `browser_reload_page`.
- `xr_set_transform` headset a (0; 1,6; 0) (come l'emulatore la mette di default); `xr_accept_session`; `xr_set_input_mode` con `mode: "hand"`; attesa 2 s.
- Ricavare **O = (Ox; Oy; Oz)** dall'ultima riga `[soglia] miniature placed …` (atteso (0; 1,35; −0,45) con la testa a 1,6 m). Le mani stanno alla quota **y = Oy + 0,05**. Convenzione di rotazione: `yawDeg` positivo = rotazione antioraria vista dall'alto attorno a +Y (come `rotation.y` di Three.js); la mano destra che si allontana dall'utente (−z) mentre la sinistra si avvicina equivale a +90°.
- **Nota (T2.17a, mani rispetto al centro)**: dalla T2.17a il punto medio delle mani è il **perno** del gesto (`docs/plans/M2.md`, D28): mani simmetriche rispetto al centro del plastico non lo spostano, mani spostate da un lato lo spostano quando si ingrandisce. In IWER il punto di pizzico è il `gripSpace`, che sta a circa 5 cm dalla posa impostata con `xr_set_transform`: con orientamento `(0, 0, 0, 1)` il grip sta a **posa + (−0,038; −0,003; +0,037)** (assestato, dopo ~150 ms dal pizzico). Per avere mani davvero simmetriche attorno a O, ogni posa delle fasi A–D va impostata a **bersaglio − (−0,038; −0,003; +0,037)**, cioè (x + 0,038; y + 0,003; z − 0,037) (vale anche per le tappe di `xr_animate_to`). Senza questa correzione lo zoom ×2,4 sposta il centro di circa 7 cm e la verifica 4 non regge.
- Nota sulle chiamate: `xr_animate_to` accoda le animazioni una dopo l'altra; l'esito dipende solo dalle pose finali di ogni tappa. Durata 0,5 s per tappa, una chiamata per mano, nell'ordine sinistra → destra.

## Passi

### Fase A · zoom
1. `xr_set_transform`: `hand-left` a (Ox − 0,20; y; Oz), `hand-right` a (Ox + 0,20; y; Oz). Distanza tra le mani 0,40 m.
2. `xr_set_select_value` `hand-left` = 1, poi `hand-right` = 1 (pizzico tenuto).
3. `browser_get_console_logs` con `pattern: "gesture"` → deve esserci `miniature gesture start`.
4. `xr_animate_to`: `hand-left` a (Ox − 0,333; y; Oz), poi `hand-right` a (Ox + 0,333; y; Oz). Distanza finale 0,667 m (rapporto 1,667).
5. `xr_set_select_value` `hand-left` = 0, `hand-right` = 0 (rilascio).
6. `browser_get_console_logs` con `pattern: "gesture end|room selected"`.

### Fase B · rotazione (a partire dalla fine della fase A; sia s1 la scala letta nella riga `gesture end` della fase A)
7. `xr_set_transform`: `hand-left` a (Ox − 0,27; y; Oz), `hand-right` a (Ox + 0,27; y; Oz) (dopo la fase A il plastico è più grande e `V1` è a 0,03 m da ∓0,20: per questo il raggio è 0,27); poi `xr_set_select_value` a 1 su entrambe.
8. Tappe, una chiamata `xr_animate_to` per mano (prima la sinistra, poi la destra), durata 0,5 s:
   - 30°: sinistra (Ox − 0,234; y; Oz + 0,135), destra (Ox + 0,234; y; Oz − 0,135)
   - 60°: sinistra (Ox − 0,135; y; Oz + 0,234), destra (Ox + 0,135; y; Oz − 0,234)
   - 90°: sinistra (Ox; y; Oz + 0,270), destra (Ox; y; Oz − 0,270)
9. Rilascio (select a 0 su entrambe). `browser_get_console_logs` con `pattern: "gesture end"`, poi `browser_screenshot` → allegare (plastico ingrandito e ruotato di 90°).

### Fase C · limiti
10. Mani a (Ox ∓ 0,27; y; Oz), pizzico, `xr_animate_to` a (Ox ∓ 0,75; y; Oz) (rapporto ≈ 2,8: dalla scala della fase B, 0,0833, si supera 0,12 e la scala si ferma al limite), rilascio. Leggere `gesture end`.
11. Mani a (Ox ∓ 0,40; y; Oz) (a 0,12 il marcatore `V2` sta a (0,156; −0,498): le mani a ∓0,40 ne distano 0,24 m), pizzico, `xr_animate_to` a (Ox ∓ 0,02; y; Oz) (rapporto 0,05), rilascio. Leggere `gesture end`.

### Fase D · traslazione a due mani (T2.17a, decisione D28; a scala qualsiasi, qui dalla scala della fase C)
D1. Mani a (Ox ∓ 0,17; y; Oz) (a scala 0,03 i marcatori sono vicini al centro: `V3` a 0,065 m dalla destra), con la correzione del grip della nota in alto (centro tra le mani = centro del plastico), pizzico su entrambe, attesa 0,3 s.
D2. `xr_animate_to`: `hand-left` a (Ox + 0,03; y; Oz), poi `hand-right` a (Ox + 0,37; y; Oz) (distanza invariata 0,34, punto medio **+0,20**); rilascio. `browser_get_console_logs` con `pattern: "\\] miniature (gesture end|translated)"`.
D3. `ecs_query_entity` su `miniature:root` con `["Transform"]`.
D4. Limite: ripetere D1–D2 con spostamento del punto medio di **+0,60** (da una posizione già a +0,20); **le mani partono centrate sul nuovo centro** (Ox + 0,20 ∓ 0,17: a scala 0,03 i pizzichi a ∓0,15 da Ox sono fuori dal raggio di presa e il gesto parte in ritardo con la scala sbagliata); leggere `translated`.

### Chiusura
12. `scene_get_runtime_hierarchy` + `scene_get_object_transform` su `miniature:root` (posizione globale).
13. `browser_get_console_logs` senza filtro (cercare `error`).
14. Rilascio finale di entrambe le mani (select a 0) e `xr_end_session`.

## Verifiche (tutte obbligatorie)
1. Fase A: esistono `miniature gesture start` e `miniature gesture end …`; la scala finale s1 è **0,0833 ± 10 %**, cioè tra 0,075 e 0,092; `tiltDeg` ≤ 3.
2. Fase B: `yawDeg` = **+90 ± 10** (tra 80 e 100); la scala finale è s1 ± 3 %; `tiltDeg` ≤ 3.
3. Fase C: dopo il passo 10 `scale` ≤ 0,1201 (limite superiore 0,12); dopo il passo 11 `scale` ≥ 0,0299 (limite inferiore 0,03). Nessun valore NaN in nessuna riga.
4. Posizione globale di `miniature:root` dopo le fasi A–C: entro 0,02 m da O (il plastico non si sposta; con le mani simmetriche attorno al centro, vedi la nota T2.17a). Dopo la fase D la posizione è quella di D3 (verifica 9).
5. Durante le tre fasi **non** compare nessuna riga `room selected` (pizzicare con due mani sul plastico non seleziona stanze).
6. Con `debug=1`, l'ultima riga `[soglia:state]` ha `miniature.scale` e `miniature.yawDeg` uguali (± 0,001 e ± 0,1) a quelli dell'ultimo `gesture end`.
7. Nessuna voce `error` in console; nessuna locomozione (la posizione della testa letta con `xr_get_transform` è invariata).
8. Screenshot del passo 9 allegato; il report dice a parole che il plastico è più grande e ruotato, senza ribaltamenti.

9. Fase D (T2.17a): dopo D2 esiste `[soglia] miniature translated x=0.200 z=0.000 source=two-hands` (± 0,01); `miniature:root` sta a (Ox + 0,20; Oy; Oz) ± 0,01 con la **quota Oy invariata** (± 0,001), scala e `yawDeg` invariati; nessuna riga `room selected`. Dopo D4 il centro sta a **0,30 m** dall'ancora (la riga `translated` ha `sqrt(x² + z²)` ≤ 0,301), non a 0,80.

## Esito
PASS se le verifiche 1–7 e 9 sono soddisfatte · FAIL altrimenti. Se la presa non parte (nessun `gesture start`), ripetere **una sola volta** con le mani spostate fino a 0,05 m verso il centro del plastico e riportare lo scarto nel report. Se dopo la correzione la presa non parte: FAIL.

## Da rimandare al visore
Affidabilità del pizzico a due mani reale, assenza di scatti, soglie di presa e zona morta, comodità dei limiti di zoom (voci M1 in `qa/device/DEBT.md`).

## Changelog
- 2026-10-06 (T2.17a): aggiunta la **fase D** (traslazione a due mani, verifica 9) e la **nota sul perno e sul grip di IWER**; la verifica 4 vale per le fasi A–C con mani simmetriche attorno al centro (motivo: il gesto a due mani ora sposta il centro del plastico attorno al punto medio delle mani, D28; misurato in IWER: senza correggere il grip lo zoom da 0,05 a 0,12 sposta il centro di (+0,053; −0,052) m, con la correzione di 0,000 m).
