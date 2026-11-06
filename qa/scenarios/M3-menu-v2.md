# S3.8 · Menu v2: testi ≥ 2,4 cm, schede, cono di 30° e etichetta della stanza nel cono

**Milestone**: M3 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`) · **Regole di `CLAUDE.md`**: 8 (campo visivo, distanze, niente elementi critici ai bordi), 9 (testo grande)
Prerequisiti di implementazione: T3.5 (menu v2), T3.6 (etichetta della stanza nel cono), T3.8 (schede `mine` e `fit` con i dati). Vedi `docs/plans/M3.md`, D37; chiude gli avvisi W2 (testi sotto 2,4 cm) e A4 (etichetta senza controllo del cono) di `qa/reports/M2-2026-10-06-rerun3.md`. Convenzioni comuni (pose, `D_GRIP`, `Q_UP`, regola di gate): `qa/scenarios/M3-persistence.md`.

## Precondizioni
- `dev-params.local.txt` = `house=apartment-a&role=visitor&reset=1&seed=1&debug=1&pinch=grip`; preparazione standard; testa a (0; 1,6; 0) **e mai ruotata**; `O` = (0; 1,35; −0,45); scala 0,05.
- Centri delle stanze in coordinate del mondo (x, z): soggiorno (−0,145; −0,515), camera (0,065; −0,515), studio (0,210; −0,515), bagno (−0,210; −0,335), corridoio (0,065; −0,360). Pizzico di una stanza: `hand-right` a (Cx; 1,6; Cz + 0,02) con `xr_look_at` verso (Cx; 1,35; Cz), `xr_select {device: "hand-right", duration: 0.3}`.
- Etichette attese (`<name> · <area> m²`, area dal poligono, un decimale): `Living room & kitchen · 23.9 m²`, `Bedroom · 14.7 m²`, `Study · 12.0 m²`, `Bathroom · 6.8 m²`, `Hallway · 13.4 m²`.
- Gli id dei testi del pannello si leggono con `grep -n 'id=' public/ui/palm-menu.uikitml`; `ui_inspect {entityIndex, selector: "#<id>", properties: ["fontSize","text"]}` accetta un solo id per volta (1 unità = 1 cm); l'entità `ui:palm-menu` si ritrova con `ecs_find_entities` a ogni apertura.

## Passi
1. **Aperture e schede**: `hand-left` a `L_MENU` con `Q_UP`, attesa 0,9 s. `ecs_find_entities` con `^ui:palm-menu$`, `^ui:menu-tab-`, `^ui:menu-item-`, `^ui:menu-(undo|page-prev|page-next|recenter|tabletop)$`; log `pattern: "menu|catalog"`, `count: 12`; riga `menu view`; `browser_screenshot` → allegare.
2. **Pagine della scheda `items`**: come S2.1 passo 5 (Next, Next, Next, Prev): `ecs_find_entities` con `^ui:menu-item-` e `^ui:palm-menu$` (stesso indice di entità) e log `pattern: "menu page"` a ogni passo.
3. **Altre schede**: pizzico su `ui:menu-tab-mine`, poi `ui:menu-tab-fit`, poi `ui:menu-tab-measure`, infine di nuovo `ui:menu-tab-items` (destra, mano a `voce − D_GRIP`, `xr_select 0.2`, attesa 0,5 s a ogni passo): `ecs_find_entities` con `^ui:menu-item-` dopo ognuno; log `pattern: "menu tab|menu page|measure"`.
4. **Testi**: per `items` (pagina 1 e pagina 2, che ha `Bookcase`, `Wardrobe`, `Nightstand`) e per le schede `mine` e `fit`: `ui_inspect` con `properties: ["fontSize","text"]` su **ogni** testo (titolo, nome e riga della misura di tutte le voci, 4 schede, Undo, Back, Next, Recenter/Tabletop). Larghezza del pannello: `ui_inspect` sulla radice (`width` in cm; se non si può, il `menu view` del log).
5. **Etichette delle stanze** (menu chiuso, palmo in giù): per le 5 stanze, pizzico come in precondizioni; dopo ogni pizzico `ecs_find_entities` con `^ui:room-label$`, `ecs_query_entity` su `ui:room-label` con `["Transform"]` (→ `L`), `ui_inspect` del testo; log `pattern: "room"`. Si calcola da `L`: distanza `|L − (0; 1,6; 0)|`, angolo `acos(−dz / |d|)`, rotazione (yaw-only: x e z ≈ 0). Per la stanza più laterale (**bagno**, in basso a sinistra) e per lo **studio** (a destra) si allega `browser_screenshot`.
6. **Regressione**: S1.3 (testi esatti), S2.1 verifiche 2, 3, 3b, 4; il pezzo in mano continua ad attenuare il menu v2 (S2.1 passo 13).
7. Log senza filtro (`error`, `Missing glyph`, `Cannot read`); pulizia come S3.0.

## Verifiche (tutte obbligatorie)
1. **Struttura (passo 1)**: 1 `ui:palm-menu`; schede `ui:menu-tab-items`, `-mine`, `-fit`, `-measure` (4); 6 voci `ui:menu-item-*` nella scheda `items` (stesso ordine di M2: `bed-double`, `bed-single`, `sofa-3seat`, `armchair`, `table-dining`, `chair`), più `ui:menu-undo`, `ui:menu-page-prev`, `ui:menu-page-next`, `ui:menu-recenter` (e **non** `ui:menu-tabletop`, che esiste solo in scala reale). Gli id e le righe di log della scheda `items` sono quelli di M2 (S2.1 resta valido): `menu page 2/3 items=coffee-table,desk,bookcase,wardrobe,nightstand,tv-stand`, `menu page 3/3 items=rug,plant`.
2. **Schede**: `menu tab mine` → `menu page 1/1 tab=mine items=my-sofa,my-desk,my-bed` e 3 voci; `menu tab fit` → `menu page 1/1 tab=fit items=wheelchair,stroller` e 2 voci; `menu tab measure` → riga `measure start` (lo strumento si attiva, nessuna voce di mobile); `menu tab items` → `measure end` e di nuovo 6 voci in pagina 1/3. Nessuna scheda senza dato mostrata con testo provvisorio.
3. **Testi (W2 chiuso)**: **ogni** testo letto nel passo 4 ha `fontSize` ≥ **2,4 cm** (nomi, misure, schede, pulsanti, titolo), inclusi `Bookcase`, `Wardrobe`, `Nightstand` (in M2 2,24/2,21/2,02); se un nome non entra, si accorcia la riga della misura (`1.6×2.0`) prima di scendere sotto 2,4. Un testo sotto 2,4 cm: FAIL (regola 9).
4. **Geometria del menu**: larghezza del pannello **≤ 0,38 m**; riga `menu view maxAngleDeg=<a> distance=<d>` con **a ≤ 30,0** e d tra 0,50 e 0,60 per ogni apertura (anche con `Q_UP` e con il menu `pinned` di S3.7); ogni voce e ogni scheda a distanza 0,50-0,65 m dalla testa (≥ 0,499) e entro 30° (`acos(−dz/|d|)` dal `Transform`); distanza tra le voci ≥ 0,06 m; il titolo non esce da 0,70 m (avviso se tra 0,65 e 0,70; era A5 di M2).
5. **Etichette delle stanze (A4 chiuso)**: i testi sono quelli dell'elenco di precondizioni (±0,1 m² sull'area); per **tutte e 5** le stanze `ui:room-label` è a distanza **≥ 0,52 m e ≤ 0,80 m** dalla testa, **entro 30,0°** dall'asse della vista (avviso fino a 30,5°), yaw-only (x e z della rotazione ≈ 0, tolleranza 0,01) e con `fontSize` ≥ 2,4 cm; per il bagno e lo studio lo screenshot mostra il testo **intero** (non tagliato dal bordo) e il report descrive la posizione rispetto alla stanza (ancorata sul bordo del cono se la stanza ne esce). Una sola etichetta alla volta (`room-label` unico).
6. **Regressione**: S1.3 e S2.1 PASS con le stesse verifiche; in particolare l'etichetta del soggiorno è esattamente `Living room & kitchen · 23.9 m²`.
7. Nessuna voce `error`; nessun `Missing glyph info`; nessuna riga `budget exceeded`.
8. **Solo visore** (alta): leggibilità a 0,5 m dei testi di 2,4 cm; il pannello più grande resta nel campo visivo stretto; schede e pagine selezionabili con il pizzico vero.

## Esito
PASS se le verifiche 1-7 sono soddisfatte · FAIL altrimenti. Deviazioni numeriche (0,495 m, 30,2°) sono avvisi; un testo sotto 2,4 cm o un angolo sopra 30,5° senza ancoraggio è FAIL (regole 8 e 9).

## Da rimandare al visore
Voci "Menu v2" e "Etichetta della stanza nel cono" di M3 in `qa/device/DEBT.md`; sostituiscono le voci M2 su testi < 2,4 cm (W2) e A4.

## Changelog
- 2026-10-10 (T3.5, nessun criterio cambiato): nota di lettura. Con **due schede o più** l'intestazione è la riga delle schede e **il titolo "Furniture" non è disegnato** (con una scheda sola, come prima di T3.8, è disegnato il titolo e non ci sono schede): al passo 4 il testo "titolo" si legge solo nel secondo caso. La cornice del menu del palmo sta a 0,50–0,52 m (`MENU_FRAME_MAX_DISTANCE`), dentro 0,50–0,60 della verifica 4. Per provare le schede prima di T3.8 e T3.14 con `debug=1`: tasto `F6` (`browser_interact` `press`), che accende `mine`, `fit` e `measure`; la scheda `measure` non scrive ancora `measure start`.
- 2026-10-09: scenario creato dal piano M3 (D37, T3.6).
- 2026-10-10 (T3.8 e T3.14, nessun criterio cambiato): il tasto di sviluppo F6 non esiste più. Le schede `Mine` e `Fit` compaiono da sole (T3.8) e la scheda `Measure` da sola con il metro (T3.14); i passi che citavano F6 si eseguono senza premere nulla.
