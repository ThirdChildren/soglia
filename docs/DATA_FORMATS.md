# Formati dei dati

Tutti i file sono JSON, **in inglese** (chiavi e valori: i valori compaiono nell'interfaccia).
Gli schemi in `schemas/` sono la fonte di verità; `logic-tester` li usa nei test.

## Sistema di coordinate

- Unità: **metri**. Pianta sul piano **x–z**: `x` verso destra, `z` verso il basso del disegno
  ("verso chi guarda"). `y` è l'altezza.
- Un punto 2D in pianta è `[x, z]`; un punto 3D è `[x, y, z]`.
- `northAngleDeg`: angolo **in senso orario** dalla direzione "su" della pianta (−z) al nord vero.
  Esempio: facciata principale (lato z = 0) esposta a sud-est → il "su" della pianta punta a 135°
  → il nord è a 225° in senso orario → `northAngleDeg: 225`.

## house (`public/houses/*.json`, schema `schemas/house.schema.json`)

| Campo | Significato |
|---|---|
| `id`, `title`, `areaM2`, `floor` | identità e dati dell'annuncio (area commerciale) |
| `location` | `{ lat, lon }` per il calcolo del sole (posizione indicativa) |
| `northAngleDeg`, `ceilingHeight` | orientamento e altezza soffitto |
| `rooms[]` | `id`, `name`, `polygon` (punti `[x, z]` in senso orario), `floorMaterial` |
| `walls[]` | `id`, `from`, `to`, `thickness`, `exterior`, `openings[]` |
| `openings[]` | `id`, `type` (`door`/`window`), `offset` (m dall'estremo `from`), `width` (luce netta), `height`, `sill` (finestre), `connects` (porte: due id di stanza o `"outside"`), `entrance` |
| `viewpoints[]` | `id`, `room`, `position` `[x, z]`, `yawDeg` (0 = verso −z, orario), `eyeHeight` |
| `fixtures[]` | oggetti fissi indicabili dall'inquilino: `id`, `name`, `room`, `category`, `position` `[x, y, z]` |
| `staging` | preset "Furnish": `{ "<style>": [{ catalogId, position [x, z], rotationDeg }] }` |

Categorie (`category`): `plumbing`, `electrical`, `appliances`, `furniture`, `floors_walls`,
`windows_doors`, `other`.

## Regola di passaggio (FitCheck)

Semplificata e dichiarata come tale nell'app (seconda riga fissa dell'etichetta: "Simplified check").
Logica pura in `src/logic/door-graph.ts` e `src/logic/fit-check.ts` (D34 in `docs/plans/M3.md`).

1. Percorso: dalla porta con `entrance: true` alla stanza di destinazione, sul grafo delle porte
   (`connects`; nodi = stanze + `outside`), cammino con meno porte (a parità, la prima in ordine
   di file). Solo la porta d'ingresso può collegare `outside`. Stanza sconosciuta, casa senza
   ingresso o stanza isolata: `no-route` ("No route from the entrance to this room").
2. **Mobile** (`kind: "furniture"`) con dimensioni `w x d x h`: ordinate crescenti `a <= b <= c`.
   Passa da una porta se `a <= width + 0.01` e `b <= height` (lo si può inclinare); la tolleranza
   di 1 cm vale solo per i mobili.
3. **Sedia a rotelle / passeggino** (`kind: "mobility"` nel catalogo): passa se
   `size[0] + 2 x 0.05 <= width`, **senza** tolleranza (solo 1e-9 per il rumore numerico dei
   decimali: 0,70 + 0,10 passa da una porta di 0,80, non da una di 0,79). L'altezza della porta
   non conta e un pezzo di mobilità non si smonta mai.
4. **Corridoi non verificati**: il file della casa non ha alcun dato di corridoio (larghezza,
   curve), quindi il FitCheck guarda solo le porte. Nelle case demo il corridoio di A è largo
   1,6 m e non cambierebbe nessun esito. È la ragione del "Simplified check".
5. Il risultato indica **la prima porta del percorso** che non passa e il motivo. Codici
   **distinti** dai motivi di posa di M2: `door-too-narrow`, `door-too-low`, `fits-disassembled`,
   `no-route` (più `fits`). **Non** si riusa mai `blocks-door`: è la zona libera di 0,30 m
   davanti a una porta e resta un motivo di posa non valida. Un mobile con `disassemblable: true`
   bloccato da una porta è `fits-disassembled` (mai "blocked").
6. Testi (cm interi, nome corto in minuscolo senza "My " iniziale), in `strings.fit`:
   `Won't fit: the door is 80 cm wide, the sofa's shortest side is 85 cm` /
   `Won't fit: the door is 75 cm wide, the wheelchair needs 80 cm` /
   `Won't fit: the door is 210 cm high, the sofa needs 230 cm` /
   `Fits when disassembled: the door is 90 cm wide, the bed's shortest side is 95 cm` /
   `Fits: the narrowest door on the way is 90 cm wide` /
   `No route from the entrance to this room`.

Esiti attesi sui dati demo (porte di A: `d-entrance` 0,90, `d-living`/`d-bedroom`/`d-study` 0,80,
`d-bathroom` 0,75; di B: tutte 0,90 tranne `d-bathroom` 0,80):
- divano 85 x 95 x 230 (`my-sofa`): bloccato su `d-living` (80 cm) in A, passa nel soggiorno di B;
- letto `my-bed` (smontabile): `fits-disassembled` su `d-entrance` (90 cm) verso qualunque stanza;
- sedia a rotelle 70 cm (servono 80): bloccata su `d-bathroom` (75 cm) in A, passa nel bagno di B;
- passeggino 60 cm (servono 70): passa anche dal bagno di A.

## catalog (`public/catalog/catalog.json`)

`items[]`: `id`, `name`, `kind` (`furniture` | `mobility`), `size` `[w, d, h]` in metri,
`disassemblable` (letti, armadi, tavoli: il FitCheck risponde "Fits when disassembled" invece di
bloccarli), `model` (percorso glb, `null` finché l'`asset-curator` non lo assegna), `credit` (id in `CREDITS.md`).
Schema: `schemas/catalog.schema.json` (vale anche per `my-furniture.json`: senza `model` serve `owner`; con `model` serve `credit`).
Validazione a mano in `src/logic/catalog.ts` (`checkCatalog`), con in più id univoci. I pezzi piatti
(`size[2] ≤ 0.02`, il tappeto) non collidono con altri mobili e non bloccano le porte.

### Posa dei mobili (`rotationDeg`, `position`)

Vale per `house.staging[].rotationDeg`, per lo stato dell'app e per il catalogo (`size = [w, d, h]`):

- `position` = **centro dell'impronta** `[x, z]` in metri della pianta; il pezzo sta a terra (y = 0).
- `rotationDeg` ∈ {0, 90, 180, 270}, **in senso orario visto dall'alto** con la pianta disegnata con −z in
  alto (come `viewpoints[].yawDeg`). Un altro valore si porta al quarto di giro più vicino.
- **Fronte**: a 0° il fronte del mobile guarda **−z** (verso l'alto della pianta).
- **Impronta** sulla pianta: `[w, d]` a 0° e 180°, `[d, w]` a 90° e 270°.
- In Three.js: `object.rotation.y = −rotationDeg · π / 180` (stessa convenzione dei muri).
- Le `rotationDeg` di `staging.scandinavian` non seguono ancora il fronte (sedie e armadio guardano il lato
  sbagliato): non cambiano l'impronta e si rivedono in M5.

## my furniture (`public/demo/my-furniture.json`)

Come `catalog.items`, con `owner: "me"`. In MR le misure possono arrivare dal pizzico sugli spigoli.

## issue (`public/demo/issues-*.json`, schema `schemas/issue.schema.json`)

| Campo | Significato |
|---|---|
| `id`, `houseId` | identità |
| `kind` | `issue` (segnalazione), `question` (domanda all'agente), `baseline` (difetto del verbale), `info` (punto informativo) |
| `position` | `[x, y, z]` in coordinate della casa |
| `fixtureId` | opzionale, se ancorata a un fixture |
| `category`, `urgency` | categoria come sopra; `low` / `medium` / `urgent` |
| `text`, `audio` | testo; percorso della nota vocale (opzionale) |
| `status` | `open` → `in_progress` → `resolved` → `archived` (solo per `issue`) |
| `history[]` | `{ at, by, event, note? }` con `by` ∈ `tenant`, `landlord`, `agent`, `visitor` |

Transizioni valide di `status`: `open→in_progress` (landlord), `in_progress→resolved` (landlord),
`resolved→archived` (tenant conferma), `resolved→in_progress` (tenant rifiuta). Le altre sono vietate.
Colori: open rosso, in_progress arancione, resolved verde, archived grigio, baseline blu.
