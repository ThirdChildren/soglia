# Roadmap di Soglia

Ogni milestone ha **due gate**:

- **Gate PC** — tutto verificabile sul PC (Fedora) con test automatici e con l'emulatore IWER
  pilotato via MCP (`iwsdk-runtime`). È il gate che decide se si passa alla milestone successiva.
- **Gate visore** — le stesse funzioni provate su un Meta Quest vero. Finché il visore non c'è,
  le prove si accumulano in `qa/device/DEBT.md` e si recuperano nella milestone **M6**.
  Se il visore arriva prima, il gate visore si fa alla fine di ogni milestone.

Legenda stato: ⬜ da fare · 🟨 in corso · ✅ PC-done · 🟩 Device-done

| Milestone | Periodo | Stato |
|---|---|---|
| M0 Setup e strumenti | 30 set – 1 ott | ✅ PC-done (piano: `docs/plans/M0.md`) |
| M1 Casa e plastico | 2 – 7 ott | ✅ PC-done 2026-10-05 (piano: `docs/plans/M1.md`; report: `qa/reports/M1-2026-10-05-rerun.md`; gate visore in debito) |
| M2 Arredare con le mani | 8 – 14 ott (PC-done anticipato al 7 ott) | ✅ PC-done 2026-10-07 (piano: `docs/plans/M2.md`; report: `qa/reports/M2-2026-10-06-rerun3.md`; `contest-reviewer`: SUPERATO CON RISERVE, nessun bloccante; gate visore in debito, vedi `qa/device/DEBT.md`) |
| M3 Dentro la casa e i miei mobili | 15 – 21 ott (PC-done atteso 12–13 ott) | ✅ PC-done 2026-11-02 (piano: `docs/plans/M3.md`; report: `qa/reports/M3-2026-10-10.md`; `contest-reviewer`: APPROVATO CON AVVISI, nessun bloccante; T3.15 tagliato; gate visore in debito, vedi `qa/device/DEBT.md`) |
| M4 Segnalazioni e persistenza | 2 – 8 nov (PC-done atteso dom 8, limite lun 9) | ✅ PC-done 2026-11-04 (piano: `docs/plans/M4.md`; report: `qa/reports/M4-2026-11-03.md`; `contest-reviewer`: APPROVATO CON AVVISI, nessun bloccante; nota vocale, tastiera di sistema, conferma completa del punto di vista e corsivo W4 non fatti; gate visore in debito, vedi `qa/device/DEBT.md`; ramo `m4`) |
| M5 Luce, agente, accessibilità, realtà mista (**ridotta**) | 9 – 12 nov (PC-done entro gio 12, 23:59; iniziata ven 6 nov) | ✅ PC-done 2026-11-06 (piano: `docs/plans/M5.md`; report: `qa/reports/M5-2026-11-06.md`; `contest-reviewer`: APPROVATO CON AVVISI, nessun bloccante, avvisi correggibili chiusi; T5.RA fatta; realtà mista, ombre vere, mappa e confronto tagliati; gate visore in debito, vedi `qa/device/DEBT.md`) |
| M6 Integrazione con il visore | **fase A** (strumenti, senza visore) sab 7 – lun 9 nov; **fase B** con il Quest (arriva mar 10): sessioni 10 – 13 nov, sessione principale ven 13; ripiego: prova di fumo del link 15 – 16 nov | 🟨 piano consegnato 2026-11-07, **fase A implementata, gate PC T6.A13 da eseguire** (piano: `docs/plans/M6.md`; guida utente: `docs/QUEST_SETUP.md`; scenari fase A: `qa/scenarios/M6-*.md`; realtà mista tagliata e fuori dal gate) |
| M7 Rifinitura e consegna | 14 – 17 nov (consegna interna mar 17, 18:00; scadenza mer 18 nov, 12:00 PT = 21:00 in Italia) | ⬜ |

### Calendario ripianificato (2026-11-02)

Le date originali (M4 22–28 ott, M5 29 ott–4 nov, M6 2–10 nov, M7 9–15 nov) erano **superate**: M3 si è chiusa il
2 novembre con ~12–13 h di lavoro attivo contro 7 stimate (fattore ≈ 1,8, tre interruzioni per limite d'uso).
Restano 16 giorni alla consegna. L'utente ha deciso di proseguire ("slitta tutto il resto, penso che possiamo
farcela"). Le stime di `docs/plans/M4.md` applicano il fattore 1,8: M4 ≈ **23 h reali** (intervallo 16–32 h).

| Quando (Italia) | Cosa |
|---|---|
| lun 2 – dom 8 nov | **M4**: Blocco R (riporti dal gate di M3), segnalazioni, persistenza, gate PC |
| lun 9 – gio 12 nov | **M5 ridotta**: sole, agente minimo, accessibilità base; R-A se ci sono le ombre |
| **gio 12 nov, 23:59** | **CONGELAMENTO DELLE FUNZIONI**: nessun task nuovo dopo **mer 11 nov, 12:00**; dopo solo correzioni, tarature, documenti |
| 10 – 13 nov (mezze giornate) | **M6** appena c'è il Quest; sessione principale ven 13 |
| sab 14 – mar 17 nov | **M7**: README e `DATA_FORMATS.md` in inglese, video < 3 min, Devpost, istruzioni di test, `contest-reviewer`, deploy manuale, prova del link |
| mar 17 nov, 18:00 | **consegna interna**; mer 18 mattina di riserva |

**Tagli, in ordine** (dettagli e criteri persi in `docs/plans/M4.md`, "Tagli"): nota vocale e tastiera di sistema (già
tagliate di partenza) → conferma del punto di vista (T4.R6) e W4 → presa a distanza (già tagliata, T3.15) → confronto di
due disposizioni/case → mappa dell'interesse e domande → realtà mista → ombre del sole → modalità una mano completa di M5.
**Scenario A** (ritardo moderato): tagli fino alla mappa. **Scenario B** (M4 non PC-done lun 9 notte): M4 minima e M5
ridotta a sole (quadrante) + Furnish/Clear + alto contrasto/testo grande.

Il visore va preso **il prima possibile**: ogni giorno senza Quest sposta le prove del pizzico prolungato, dei 60 fps e
della ripresa vera in `qa/device/DEBT.md`.

---

## M0 · Setup e strumenti

**Obiettivo**: progetto pronto, agenti e test funzionanti, primo commit.

- Iscrizione a Meta VR Start (fatto dall'utente), account Meta con accesso sviluppatore.
- `npm create @iwsdk@latest` (TypeScript, hand tracking attivo), poi copiare questo kit nella radice.
- `npx @iwsdk/cli adapter sync` per registrare il server MCP `iwsdk-runtime`.
- Aggiungere Vitest (`npm i -D vitest ajv ajv-formats`) e lo script `"test": "vitest run"`.
- Workflow CI (`.github/workflows/ci.yml`) e Pages manuale (`pages.yml`).
- Primo commit git.

**Gate PC**: `npm test` gira (anche con un solo test dello schema), `npm run build` ok,
`npx @iwsdk/cli dev up --ai-mode agent` avviato e `xr_get_session_status` risponde.
Scenari in `qa/scenarios/M0-*.md` (S0.1 toolchain, S0.2 runtime e sessione XR, S0.3 avvio pulito).
**Gate visore**: nessuno.

## M1 · Casa e plastico

**Obiettivo**: dal file `apartment-a.json` nasce il plastico sul tavolo, si ruota e si ingrandisce
con due mani.

- Validazione dei JSON con `schemas/house.schema.json` (errori leggibili).
- `HouseBuilder`: pavimenti per materiale, muri con aperture di porte e finestre, geometrie unite.
- `Miniature`: scala 1:20, muri tagliati a 1 m, posizionato davanti all'utente seduto
  (~0,45 m davanti, ~0,25 m sotto gli occhi), rotazione e zoom con pizzico a due mani.
- Tocco su una stanza → etichetta "Living room & kitchen · 24 m²" (area calcolata dal poligono).
- Onboarding: mano fantasma che mostra il pizzico, senza testo.

| Scenario PC | Verifica |
|---|---|
| S1.1 Apri la casa | `?house=apartment-a&reset=1` → entità `house:apartment-a` presente, 5 stanze, 13 muri |
| S1.2 Due mani | pizzico a due mani e allontanamento → la scala del plastico aumenta; rotazione di ~90° |
| S1.3 Etichetta stanza | pizzico sul soggiorno → etichetta con area 23,9 m² (± 0,1) |
| S1.4 Budget | `?debug=1` → draw call e triangoli entro il budget di `CLAUDE.md` |
| S1.5 Casa B ed errori | `?house=apartment-b` → 4 stanze, 9 muri; `?house=nope` → pannello d'errore, nessuna richiesta di rete (aggiunto dal piano M1) |
| S1.6 Onboarding | mano fantasma: pizzico → due mani → fine, senza testo (aggiunto dal piano M1) |

Scenari in `qa/scenarios/M1-*.md`. Gli strumenti MCP non navigano a URL con parametri: la QA scrive
`dev-params.local.txt` e fa `browser_reload_page` (vedi `docs/plans/M1.md`, decisione D1).

**Unit test**: area dei poligoni, aperture dentro la lunghezza del muro, schema valido per A e B.
**Gate visore (rimandabile)**: altezza e distanza del plastico comode da seduti, leggibilità delle
etichette, pizzico a due mani affidabile, fps ≥ 60.

## M2 · Arredare con le mani

**Obiettivo**: catalogo sul palmo, mobili presi, agganciati, ruotati e controllati.

- Menu del palmo (palmo verso l'alto, entrambe le mani) con le voci della modalità attiva.
- Catalogo da `public/catalog/catalog.json`; modelli CC0 dall'`asset-curator`.
- Presa (IWSDK), aggancio al pavimento e alle pareti, rotazione a scatti di 90° col polso,
  contorno rosso se collide o blocca una porta, verde se valido.
- Annulla dal menu; un mobile lasciato fuori dal plastico torna nel catalogo. Un pezzo non valido **resta nel plastico** con la cornice rossa e un'etichetta breve (in inglese) che ne spiega il motivo (T2.9b).
- **T2.0b (spike, 30 min)**: modelli dei controller sostituiti da una forma locale col metodo `AnimatedHand`, senza toccare `node_modules`; se non fattibile, voce in `qa/device/DEBT.md`.
- **T2.1 (primo task di interfaccia)**: verifica dei glifi del font dei pannelli (`² · × ° − ± → ≈`; controllo statico: solo `°` c'è) e spike di 45 min sull'**opzione A** (atlante MSDF esteso da Inter OFL: l'ok dell'utente e la seconda eccezione di licenza in `docs/RULES.md` sono già dati); se lo spike non riesce, **opzione D** (ASCII definitivo) senza altre domande. Dopo T2.2 (opzione A) l'etichetta della stanza (S1.3) torna a `<name> · <area> m²`.
- **T2.17a/b (obbligatorio, decisione dell'utente)**: spostare il plastico con le **due mani** (punto medio come perno) e con **una mano** (pizzico sulla base libera, mai su una stanza o un pezzo), limite 0,30 m dall'ancora, quota bloccata, "Recenter" (`ui:menu-recenter`) nel menu; priorità dei pizzichi menu > mobile > due mani > traslazione > stanza. Oggi il plastico non si sposta mai.
- **T2.16 (suggerimento, non onboarding)**: un piccolo indizio ("Palm up for the menu") resta visibile finché il menu del palmo non è stato aperto la prima volta; l'**onboarding completo del menu passa a M5**; l'onboarding di M1 (S1.6) non cambia.
- Icone `@pmndrs/uikit-lucide` ammesse come libreria nel bundle, sempre con etichetta di testo, citate in `CREDITS.md` (Libraries).
- Il catalogo di M2 mostra solo i 14 `furniture` (tetto `MAX_PIECES = 40`); i `mobility` (sedia a rotelle, passeggino) entrano in M3.
- Correzione dello staging di `apartment-a.json` approvata (libreria x 10,8 → 10,69; divano z 3,42 → 3,10): il test del preset deve fallire se un pezzo esce dalla stanza, entra in un muro o occupa il vano di una porta.

| Scenario PC | Verifica |
|---|---|
| S2.0 Glifi del font | `glyphs=1` → audit a schermo dei caratteri (parte A); dopo T2.2 nessun `Missing glyph info` e l'etichetta `Living room & kitchen · 23.9 m²` (parte B) (aggiunto dal piano M2) |
| S2.1 Menu del palmo | mano sinistra con palmo in su → `ui:palm-menu` visibile; stesso con la destra; 6 voci per pagina, 3 pagine |
| S2.2 Posa il letto | pizzico su `bed-double`, trascina in camera, rilascia → entità dentro `bedroom`, appoggiata a una parete |
| S2.3 Collisione | spingi il letto contro l'armadio → stato `invalid`, contorno rosso **e etichetta "Overlaps the wardrobe"**; spostalo → `valid`, etichetta sparita |
| S2.4 Annulla | "Undo" → l'ultima azione sparisce dallo store |
| S2.5 Rotazione a scatti | polso o tocco con l'altra mano → 0 → 90 → 180 → 270, impronta e aggancio ricalcolati (aggiunto dal piano M2) |
| S2.6 Porta bloccata | poltrona davanti a `door:d-bedroom` → `invalid` con motivo `blocks-door`, valida accanto alla porta (aggiunto dal piano M2) |
| S2.7 Rientro nel catalogo | rilascio fuori dalla casa → `furniture returned`, nessuna entità; annulla ripristina lo stesso id (aggiunto dal piano M2) |
| S2.8 Budget con arredi | `furnish=scandinavian&debug=1` → 14 pezzi, `callsPerView` ≤ 100, triangoli ≤ 150.000, texture dell'app ≤ 4 (aggiunto dal piano M2) |
| S2.9 Sposta il plastico | **obbligatorio (T2.17a/b)**: traslazione a due mani **e a una mano** (pizzico sulla base), limite 0,30 m, quota invariata, "Recenter", nessun conflitto con presa dei pezzi e selezione delle stanze (aggiunto dal piano M2) |

**Unit test**: snap alle pareti, collisioni tra rettangoli ruotati, porta bloccata, rotazione a scatti, store con annulla, catalogo, arbitraggio dei pizzichi, rilevamento del palmo, guardia dei glifi, traslazione del plastico (clamp, zone di pizzico disgiunte), preset di arredo valido, etichette dei motivi.
**Calendario**: PC-done previsto entro l'**11 ottobre 2026** (cuscinetto 12–14 ott); **raggiunto il 7 ottobre 2026** (report `qa/reports/M2-2026-10-06-rerun3.md`, verdetto SUPERATO CON RISERVE, nessun bloccante; riserve e avvisi nel report). Ordine di esecuzione e stime in `docs/plans/M2.md`.
**Gate visore (in debito, non ancora fatto)**: presa naturale, niente tremolii, rotazione col polso affidabile, palmo in su affidabile; voci M2 in `qa/device/DEBT.md`. Il budget di IWER (66 chiamate per vista a scala 0,05 e 53 a 0,12 nel caso peggiore, 30,7k triangoli) è un numero del PC, non del visore. Persistenza assente in M2 (regola 4): i mobili si perdono ricaricando; la prima fetta (salvataggio in `localStorage`) arriva con i primi task di M3.

## M3 · Dentro la casa e i miei mobili

**Obiettivo**: punti di vista, metro, i propri mobili e il controllo delle porte; in più la ripresa
dopo una pausa (prima fetta della persistenza), il menu a una mano e la previsione dei draw call.
Piano e decisioni D29–D38 in `docs/plans/M3.md`.

**I primi quattro task, in quest'ordine e prima di ogni altro lavoro** (richiesta dell'utente):

1. **Salvataggio minimo + ciclo di vita** (T3.1a/b): la disposizione dei mobili si salva in
   `localStorage` (chiave `soglia:v1:state:<casa>`, `serialize/deserialize` di `src/logic/state.ts`,
   cancellata da `reset=1`); è la **prima fetta di `Persistence` di M4**, non un sistema a parte (M4
   riusa `storage.ts`, `persistence.ts` e il ciclo di vita e aggiunge solo i campi: ruolo,
   segnalazioni). Sessione nascosta/ripresa con un pezzo in mano: la presa si chiude pulita, nessun
   pezzo perso né duplicato.
2. **Palmo in su e punto di pizzico dalle articolazioni** (T3.2a/b, spike di 45 min con ripiego
   dichiarato): giunti `XRHand` via `fillPoses`, `gripSpace` solo come riserva.
3. **Pulsante "Menu" fisso** sul bordo del plastico, apribile con un pizzico di UNA mano, con
   menu `pinned` (Undo e Recenter inclusi) (T3.3a/b); chiude anche l'avviso F-A di M2.
4. **Previsione dei draw call fino a M5** con tracciamento a ogni gate (T3.4).

Poi: menu v2 (testi ≥ 2,4 cm, schede), etichetta della stanza nel cono, FitCheck, i propri mobili,
punti di vista, metro (T3.5–T3.17).

- `Viewpoint`: pizzico su V1/V2/V3 → dissolvenza → scala reale ad altezza occhi da seduti (1,2 m);
  "Tabletop" dal menu per tornare. Presa a distanza nella stanza (T3.15, **tagliabile**: se salta,
  in scala reale si prende solo a portata di braccio e lo si dichiara).
- `Measure`: pizzico su due punti, aggancio a pareti e spigoli, misura in cm.
- `FitCheck`: percorso dalla porta d'ingresso alla stanza (grafo delle porte), verifica di ogni
  porta; lo stesso per sedia a rotelle e passeggino. Messaggio in inglese che spiega il motivo.

| Scenario PC | Verifica |
|---|---|
| S3.1 Punto di vista | pizzico su `viewpoint:V1` → camera a scala reale nel soggiorno; "Tabletop" → ritorno |
| S3.2 Metro | misura la finestra dello studio → 140 cm (± 1) |
| S3.3 Divano in A | "My sofa 230 × 95 × 85" verso il soggiorno → blocco su `door:d-living`, messaggio "Won't fit: the door is 80 cm wide, the sofa's shortest side is 85 cm" |
| S3.4 Divano in B | stessa prova in `apartment-b` → passa |
| S3.5 Sedia a rotelle | verso il bagno di A → blocco su `door:d-bathroom` (75 cm); il passeggino (60 cm) passa |
| S3.0 Persistenza e pausa/ripresa (aggiunto dal piano M3) | `qa/scenarios/M3-persistence.md`: salva, ricarica (stessi pezzi, stessi id), `reset=1` cancella, una chiave per casa, sessione nascosta con un pezzo in mano (nessun duplicato, presa chiusa, stesso id alla ripresa) |
| S3.6 Palmo e pizzico dalle articolazioni (aggiunto) | `qa/scenarios/M3-joints.md`: sorgente `joints`/`grip`, palmo in su dai giunti, punto di pizzico, `pinch=grip` come riserva |
| S3.7 Pulsante Menu a una mano e F-A (aggiunto) | `qa/scenarios/M3-menu-button.md`: apertura, pagina, presa, Undo e Recenter con la sola destra; il pizzico in aria della mano del menu non seleziona la stanza |
| S3.8 Menu v2 e etichette nel cono (aggiunto) | `qa/scenarios/M3-menu-v2.md`: testi ≥ 2,4 cm, schede, pannello ≤ 0,38 m e ≤ 30°, etichetta della stanza nel cono |
| S3.9 Budget: previsione contro misura (aggiunto) | `qa/scenarios/M3-budget.md`: otto casi K1–K8; > 100 per vista blocca, caso peggiore ≥ 85 apre R-A in M4 |
| S3.10 Presa a distanza (aggiunto, solo se T3.15) | `qa/scenarios/M3-distance-grab.md`: raggio dalla mano in scala reale; non applicabile se il task è tagliato |

Il FitCheck non riusa `blocks-door` (zona libera davanti alla porta, M2): i codici sono
`door-too-narrow`, `door-too-low`, `fits-disassembled`, `no-route`. Corridoi non verificati
("Simplified check"). `sofa-3seat` del catalogo non passa da `d-living` di A (coerente: il preset non
mostra mai l'etichetta finché il pezzo non è in mano); il caso demo resta `my-sofa` 230 × 95 × 85.

**Unit test**: grafo delle porte, percorso, regole di passaggio (vedi `docs/DATA_FORMATS.md`),
persistenza (chiavi, lista bianca, `localStorage` mancante/bloccato/pieno), ciclo di vita, giunti
della mano, menu e pulsante, previsione dei gruppi di draw call, posa in scala reale, dissolvenza,
aggancio del metro.
**Calendario**: PC-done atteso **12–13 ottobre 2026** (cuscinetto fino al 15; finestra ufficiale
15–21 ott come margine). Stima onesta in `docs/plans/M3.md` (≈ 7 h di orologio; ottimista 4,5 h,
pessimista 11 h).
**Gate visore**: dissolvenza senza nausea, scala reale credibile, metro preciso a mano libera;
in più (voci in `qa/device/DEBT.md` a gate superato): ripresa dopo aver tolto il visore, `localStorage`
nel Quest Browser, giunti reali, raggiungibilità dei pulsanti Menu, draw call e fps reali con il caso
peggiore.

**Esito del gate PC (2026-11-02)**: **superato**, report in `qa/reports/M3-2026-10-10.md` (indice) con
A, B, rerun di S3.5, C1 (regressioni M2) e C2 (regressioni M1). `npm test` 4465 test in 75 file,
typecheck e build ok, CI verde. Un bloccante trovato e corretto durante il gate (F-S3.5-1, errore
`PanelUISystem ... (reading 'add')` con le etichette del FitCheck e del motivo, commit `9d52d0e`).
Draw call: caso peggiore K4 = 71 per vista (< 85: **R-A non diventa il primo task di M4**), proiezione
M5 ≈ 86. **T3.15 (presa e misura a distanza) tagliato**: in scala reale si prende solo a portata di
braccio, il metro lavora solo sul plastico, S3.10 non applicabile, il task passa a M5/M7. Voci di
debito del visore in `qa/device/DEBT.md` (righe M3). Tempo reale di esecuzione ≈ 12–13 h di lavoro
attivo contro 7 h stimate, con tre interruzioni per limite d'uso dell'account.

## M4 · Segnalazioni e persistenza

**Obiettivo**: il ciclo completo della segnalazione e la ripresa dopo una pausa.
**Piano e decisioni D39–D52 in `docs/plans/M4.md` (consegnato il 2026-11-02, 🟨)**: prima il Blocco R (riporti dal
gate di M3, T4.R1–T4.R7), poi segnalazioni e persistenza (T4.1–T4.12), gate PC (T4.13) e revisione (T4.14). Stima:
≈ 23 h reali (centrale × 1,8); PC-done atteso dom 8 nov, limite lun 9.

- `Roles`: visitatore, agente (M5), inquilino, proprietario; **il cambio avviene dal nuovo pannello "Issues"**
  (due pulsanti specchiati sopra i pulsanti "Menu", raggiungibili con una mano; il menu del palmo è al limite del
  cono di 30°), non dal menu del palmo; il ruolo si salva, un `role=` nell'URL vince (D41).
- `Issues`: pizzico prolungato (0,8 s) su un punto o su un fixture → segnaposto; categoria (proposta dal
  fixture), urgenza, **testo scelto tra frasi predefinite per categoria** (nessuna tastiera: D40; la tastiera di
  sistema e la nota vocale con MediaRecorder sono extra opzionali, feature-detected, tagliati di partenza);
  stati open → in_progress → resolved → archived; conferma dell'inquilino; verbale d'ingresso (blu, "Sample data").
- `Persistence`: salvataggio automatico (localStorage/IndexedDB con try/catch), ripresa su reload
  e su `visibilitychange`. **La prima fetta è consegnata in M3** (T3.1a/b: chiave
  `soglia:v1:state:<casa>`, lista bianca dei campi ripristinati, `reset=1`, ciclo di vita con presa
  chiusa pulita); M4 riusa `src/data/storage.ts`, `src/logic/persistence.ts` e il ciclo di vita e
  aggiunge solo `role` e le segnalazioni alla lista bianca, l'eventuale bump di versione e
  IndexedDB se la quota lo richiede. Il caso peggiore dei draw call di M3 ha misurato **71** (< 85):
  R-A (unire muri e soglie in due mesh, −16 chiamate per vista, ~2,5 h; vedi `docs/plans/M3.md`, D33)
  **non** è il primo task di M4, ma resta pronto se il Quest misura di più.
- **Riporti dal gate di M3 → Blocco R di `docs/plans/M4.md` (da eseguire PRIMA del lavoro nuovo; prerequisiti: (1), (2), (5), (9) = T4.R1–T4.R4; rimandabili: (3)+(6) T4.R5, (4) T4.R6, W4 T4.R7; (7) scenari già corretti il 2026-11-02, con riga di changelog; (8) in M7)** (avvisi del `contest-reviewer` e di `emulator-qa`), in
  ordine di importanza: (1) **scala reale senza menu per chi usa una mano sola**: mostrare almeno un
  pulsante di ritorno al plastico anche in scala reale (regola 9); (2) **menu `pinned` nel cono di 30°
  solo con lo sguardo livellato**: ancora che tiene conto del beccheggio (`fitPanelToCone`); (3)
  pilastro `viewpoint:V2` che copre una cifra dell'etichetta del corridoio (`Hallway · 13_ m²`,
  `qa/reports/M3-gate-C2-S1.3-label-hall.png`): spostare l'etichetta o fare passare i marcatori sotto
  le etichette; (4) pizzico vicino a un marcatore di punto di vista che sostituisce lo zoom: zona morta
  o conferma; (5) perdita dei pezzi propri se `my-furniture.json` non si carica (non riscrivere il
  salvato con pezzi scartati); (6) `placeRoomLabel` sotto il piano con stanze a meno di 0,52 m dalla
  testa; (7) correggere gli scenari con punti non liberi (S3.0, S3.2 passo 10, S3.3 passi 5-6, S2.9
  passo 10, S2.6 passo 6) e il corsivo W4; (8) `README.md` ancora a "M0" e `docs/DATA_FORMATS.md` in
  italiano (prima della consegna, M7); (9) spostare `flushPanelDisposals()` fuori da `PalmMenuSystem`.

| Scenario PC | Verifica |
|---|---|
| S4.1 Segnalazione | `qa/scenarios/M4-issue-create.md`: ruolo tenant, pizzico prolungato su `fixture:washer` → categoria `appliances`, frase "Leaks" → testo `The washing machine leaks.` (frasi predefinite al posto della tastiera, D40), urgenza medium → `pin:issue-014` rosso; punto libero con scelta della categoria; ruoli non autorizzati |
| S4.2 Voce (opzionale) | `qa/scenarios/M4-voice-note.md`: sempre: nessun pulsante vocale senza API (nessun pulsante morto); se T4.15: nota registrata e collegata |
| S4.3 Proprietario | `qa/scenarios/M4-landlord-flow.md`: ruolo landlord → elenco per urgenza (`014, 013, 012, 010`); "Take on" → arancione; "Resolved" → verde; conferma tenant → storico (archiviata); "Reopen" |
| S4.4 Ripresa | `qa/scenarios/M4-persistence-resume.md`: ricarica → stesse segnalazioni, stesso ruolo (un `role=` esplicito vince), pezzi propri non persi (`failmy=1`), sospensione con la bozza aperta |
| S4.5 Verbale | `qa/scenarios/M4-move-in-report.md`: "Move-in report" → segnaposto blu da `issues-apartment-a.json`, "Sample data" |
| S4.6 Scala reale a una mano (aggiunto) | `qa/scenarios/M4-one-hand-real-scale.md`: pulsante `ui:tabletop-button` in scala reale, ritorno con una sola mano (riporto 1 di M3) |
| S4.7 Menu `pinned` inclinato (aggiunto) | `qa/scenarios/M4-pinned-menu-pitch.md`: cono ≤ 30° con beccheggio da +10° a −14° (riporto 2) |
| S4.8 Etichetta, pilastro, zona morta (aggiunto) | `qa/scenarios/M4-labels-and-markers.md`: etichetta del corridoio leggibile, quota minima, conferma del punto di vista (riporti 3, 4, 6) |
| S4.9 Regressione rapida (aggiunto) | `qa/scenarios/M4-regression.md`: S1.2, S1.3, S1.6, S2.1–S2.9, S3.0–S3.9 con `pinch=grip` e i punti corretti |
| S4.10 Budget (aggiunto) | `qa/scenarios/M4-budget.md`: K1–K13, caso peggiore di M4 K11 (previsione 74); ≥ 85 apre R-A in M5 |

**Unit test**: macchina a stati (transizioni valide e vietate), serializzazione/deserializzazione,
permessi per ruolo.
**Gate visore**: pizzico prolungato distinto dal pizzico normale, pulsanti "Issues" e pannello leggibili e
raggiungibili con una mano, scala reale a una mano ("Tabletop"), ripresa dopo aver tolto il visore; tastiera di
sistema in WebXR e microfono nel Quest Browser solo se gli extra opzionali (T4.15, T4.16) sono stati fatti.
Voci previste in `docs/plans/M4.md`, "Debito per `qa/device/DEBT.md`" (le aggiunge l'utente al gate).

## M5 · Luce, agente, accessibilità, realtà mista

**Piano e decisioni D53–D64 in `docs/plans/M5.md` (consegnato il 2026-11-06, 🟨)**: prima il Blocco R (riporti 1–5 del gate di M4 più log e pulizia, T5.R1–T5.R6), poi sole (algoritmo proprio, **chiazze di luce al posto delle ombre**, pannello "View" con mese/ora, zoom e rotazione a pulsanti = T1.15 ridotto), agente (punti informativi, Furnish / Clear annullabile), accessibilità (alto contrasto, testo grande, "Rotate", coach del pulsante "Menu"), gate PC (T5.17) e revisione (T5.18). Stima: ≈ 30 h reali (centrale × 1,8); capacità fino a gio 12 ≈ 44 h. **Tagliati in partenza**: confronto di due disposizioni/case, mappa dell'interesse e domande (S5.2), realtà mista `?mr=1`, ombre con shadow map, trascinamento a una mano; **sotto la linea**: menu v2 a testo grande (T5.16). R-A (T5.RA) è condizionale al punto di controllo T5.7 (caso peggiore ≥ 85).

**Riporti dal gate di M4 (avvisi del `contest-reviewer` e di `emulator-qa`, 2026-11-04), in ordine di importanza**: (1) **`transitionIssue` deve usare `state.role`** (il reducer oggi si fida del ruolo passato dal chiamante: oggi l'unico chiamante passa `state.role`, quindi nessun aggiramento reale, ma M5 aggiunge chiamanti); (2) **persistenza anche se `catalog.json` non si carica** (`src/index.ts` ripristina e salva solo con il catalogo: ruolo e segnalazioni andrebbero persi); (3) **chip "Agent"**: oggi è un ruolo senza funzioni con il suggerimento "Info points for agents are coming soon.": M5 consegna i punti informativi oppure si nasconde il chip prima di M7; (4) **accessibilità dell'elenco**: stato in parole o forma oltre al pallino colorato (D46), testo delle righe troncato a circa 16 caratteri, `Medium` a bordo pannello nel dettaglio, blu del verbale vicino al blu dei pilastri; (5) **apertura del dettaglio con due pressioni** (scopribilità): un'indicazione o un solo pizzico; (6) **scenari da allineare** (decisione dell'utente, non toccati): S3.0 verifica 4 (`state restored pieces=0` al posto di `state none` con il seme), S4.3 passo 4 (due pressioni), S4.5 passi 2 e 5 (interruttore spento di default), punti non liberi di S3.0 fase 2 e S3.5 passo 3; (7) il `warn` di framework `THREE.WebGLRenderer: Can't change size while VR device is presenting.` (solo `xr_end_session`) nel contratto dei log; (8) `console.error` di `src/index.ts` fuori dal prefisso, `strings.issues.comingSoon` quasi morto, `?glyphs=1` senza `debug=1`; (9) tetto di 40 pezzi che non conta i parcheggiati (rarissimo); (10) conferma completa di 0,30 s sul punto di vista (T4.R6) e corsivo W4 (T4.R7) se il visore le chiede.

**Obiettivo**: tutte le funzioni della demo presenti. **Ripianificata il 2026-11-02 (9 – 12 nov, PC-done entro gio 12
23:59 = congelamento delle funzioni)** e **ridotta al minimo che regge i tre atti**: restano sole, Furnish/Clear e
punti informativi, alto contrasto e testo grande, "Rotate", onboarding del menu; sono tagliabili, in quest'ordine,
confronto di due disposizioni/case, mappa dell'interesse e domande, realtà mista (`?mr=1`, fuori dalla demo salvo prova
sul visore in due stanze), ombre (si evita R-A), modalità una mano completa. Il caso peggiore del ruolo agent arriva a
~95 chiamate con le ombre: R-A (−16) è il primo task di M5 se ci sono le ombre (vedi `docs/plans/M4.md`).

- `Sun` con SunCalc, manopola mese/ora, ombre solo nella stanza attiva.
- Agente: punti informativi, "Furnish / Clear" (preset `staging`), mappa dell'interesse con
  etichetta "Sample data", domande ricevute.
- Confronto di due disposizioni e di due case.
- Accessibilità: modalità una mano, alto contrasto, testo grande.
- **Onboarding completo del menu del palmo** (rimandato da M2/T2.16, dove resta solo un suggerimento): insegnare il palmo in su, il pulsante "Menu" e la presa dal catalogo, con testo minimo in inglese.
- **Menu e Recenter usabili con una mano sola** (voce esplicita, decisione del gate M2 del 2026-10-06; regola 9 di `CLAUDE.md`) — **CONSEGNATA IN M3 (2026-10-09, T3.3a/b, S3.7)**: il pulsante "Menu" fisso sul bordo del plastico (`ui:menu-button-left`/`-right`) apre con un pizzico di UNA mano il menu `pinned` (0,55 m davanti, 0,20 m sotto gli occhi, nel cono di 30°), che resta aperto senza tenere il palmo in su e contiene **Undo e Recenter**; non dipende dal gesto del palmo. **Cosa resta a M5**: (a) l'onboarding del pulsante; (b) il pulsante **"Rotate"** per ruotare un pezzo con una mano sola (oggi il tocco dell'altra mano, il polso funziona con una mano); (c) alto contrasto e testo grande anche per il menu `pinned`; (d) la scelta di aprire il menu `pinned` di default in modalità una mano; (e) S5.4 esteso a tutte le azioni di S2–S4 con la sola mano destra, partendo dal pulsante (la parte "Recenter e Undo a una mano" è già in S3.7); (f) la prova di raggiungibilità sul visore (i pulsanti stanno a ~0,65 m e ~46°, fuori dal cono di 30°: avviso dichiarato, voce in `qa/device/DEBT.md`).
- **T1.15 · Zoom e rotazione del plastico con una mano** (alternativa ai gesti a due mani di M1,
  che oggi sono l'unico modo per ruotare e ingrandire; regola 9). Proposta del piano M1: pizzico
  trascinato con una mano sul plastico = rotazione attorno a Y; due pulsanti piccoli sul bordo
  della base per zoom ± (pannello a 0,5–0,8 m); soglia tra "tocco" (etichetta stanza) e
  "trascinamento" 1,5 cm. Lo scenario S5.4 va esteso a S1.2 (oltre a S2–S4) quando si pianifica M5.
  In M1 l'onboarding si sblocca già con una mano (selezione di una stanza o timeout).
  **Nota (decisione M2 del 2026-10-05)**: la *traslazione* a una mano esiste già dall'M2 e usa il
  pizzico sulla **base libera** del plastico; la rotazione e lo zoom a una mano non devono usare
  quella zona (usare i pulsanti sul bordo e/o il pizzico trascinato su una stanza, con
  l'arbitraggio dei pizzichi dell'M2).
- **Realtà mista (dietro flag `?mr=1`)**: misura dei mobili veri con il pizzico sugli spigoli e
  plastico appoggiato su una superficie rilevata. Sul PC si prova con l'ambiente sintetico
  dell'emulatore; entra nella demo solo se supera il gate visore in **due stanze diverse**.

| Scenario PC | Verifica |
|---|---|
| S5.1 Sole | `qa/scenarios/M5-sun.md`: `time=2026-12-21T10:00` → chiazze di sole nel soggiorno; `T15:00` → soggiorno in ombra e studio al sole; ora legale a giugno; notte; precedenza `time=` > salvato (aggiornato dal piano M5) |
| S5.2 Mappa | **TAGLIATA** dal piano M5 (nessun file): la mappa dell'interesse e le domande non entrano |
| S5.3 Agente: punti informativi e Furnish / Clear | `qa/scenarios/M5-agent.md`: ruolo visitor/agent → 5 punti informativi con "Sample data"; "Furnish" → 14 pezzi; Undo o "Clear" → casa vuota; nessun pulsante in `apartment-b` (aggiornato dal piano M5) |
| S5.4 Una mano | `qa/scenarios/M5-one-hand.md`: zoom, rotazione, pezzo, "Rotate", segnalazione, ritorno con la sola mano destra; nessun evento della sinistra (aggiornato dal piano M5) |
| S5.5 Demo completa | `qa/scenarios/M5-full-demo.md`: percorso dei tre atti, zero errori in console; il tempo di 10 minuti vale sul visore, sul PC si conta (aggiornato dal piano M5) |
| S5.6 Accessibilità (aggiunto) | `qa/scenarios/M5-accessibility.md`: alto contrasto (≥ 7:1 da test) e testo grande ≥ 3,0 cm, persistenza e parametri |
| S5.7 Onboarding del pulsante Menu (aggiunto) | `qa/scenarios/M5-menu-onboarding.md`: coach a due passi, ripresa, timeout |
| S5.8 Riporti dal gate di M4 (aggiunto) | `qa/scenarios/M5-carryovers.md`: R1–R6 |
| S5.9 Budget (aggiunto) | `qa/scenarios/M5-budget.md`: K1–K18, caso peggiore previsto ~82; ≥ 85 apre T5.RA |
| S5.10 Regressione rapida (aggiunto) | `qa/scenarios/M5-regression.md`: S1.2, S1.3, S1.6, S2.1–S2.9, S3.0–S3.9, S4.1, S4.3–S4.8 con `pinch=grip` |

**Gate visore**: ~~realtà mista in due stanze mai provate prima~~ (**tagliata e fuori dal gate**, D74 del piano M6),
fps con le chiazze di luce del sole (non ci sono ombre vere), contrasto leggibile, sessione completa di 10 minuti
senza fastidio. (Riallineato il 2026-11-07 con `docs/DEVICE_CHECKLIST.md`.)

## M6 · Integrazione con il visore

**Obiettivo**: saldare tutto il debito in `qa/device/DEBT.md` e raggiungere Device-done per M1–M5.
**Piano e decisioni D65–D79 in `docs/plans/M6.md` (consegnato il 2026-11-07, 🟨)**; guida per l'utente (Fedora, adb,
certificato, debug remoto, Meta VR CLI e "Strumenti di M6"): `docs/QUEST_SETUP.md`. Due fasi.

- **Fase A · prima del visore (sab 7 – lun 9 nov)**, solo strumenti dietro `debug=1` o fuori dall'app, **default
  invariati** e nessuna funzione nuova (T6.A1–T6.A13): manopole di taratura `t_<nome>` (URL, `dev-params.local.txt`,
  file vivo `tuning.local.txt` riletto ogni 2 s, `foveation`), pannello di statistiche nel visore `ui:debug-hud`
  (`hud=0` lo spegne), righe `[soglia:frames]`, `[soglia:stats:summary]` e `[soglia:env]` (sonda delle funzioni del
  browser), script `npm run quest:*` per `adb` e `metavr`, maschera del campo visivo stretto (opzionale), pagina di
  avvio (opzionale). Stima: nucleo ≈ 18 h reali, tutto ≈ 22 h (centrale × 1,8). Scenari PC: S6.1 taratura, S6.2
  frame e pannello, S6.3 sonda, S6.4 script, S6.5 regressione ridotta e budget (`qa/scenarios/M6-*.md`).
- **Fase B · con il visore (da mar 10 nov)**: sessioni S0 fumo e ambiente (mar sera), S1 mani (mer mattina),
  S2 viaggi e dati (mer pomeriggio), S3 luce, agente, accessibilità e prestazioni (gio mattina), decisione dei
  default (gio sera, entro il congelamento), S4 riverifica e gate (ven 13); ripiego L1–L3 se il visore tarda.
  Esecuzione di `docs/DEVICE_CHECKLIST.md` (riallineata il 2026-11-07) e di `qa/device/DEBT.md` per priorità; taratura
  con protocolli a soglie numeriche; budget grafico reale con criterio D71 (nessuna finestra di 2 s sotto 60 fps).
- **Realtà mista: TAGLIATA e fuori dal gate** (decisione esplicita D74, conferma di M5: `mr=1` non ha effetto). Non
  si prova e non si cita nella demo; resta solo il dato di `[soglia:env]` sul browser.

**Gate**: tutte le voci della checklist superate o motivate (le righe `alta` di DEBT.md per milestone, D77); fps ≥ 60
in tutta la demo (D71); nessuna dichiarazione "funziona sul visore" senza il report in `qa/device/`.

## M7 · Rifinitura e consegna

- `submission-writer`: descrizione Devpost (inglese), tagline ≤ 140 caratteri, istruzioni di test,
  copione e sottotitoli del video.
- Video < 3 minuti con riprese reali (visore o emulatore), niente video generati con AI.
- `contest-reviewer`: revisione finale su `docs/RULES.md`.
- **`README.md`** (ancora a "M0", con "solo CC0" che contraddice le tre eccezioni di `docs/RULES.md`) e
  **`docs/DATA_FORMATS.md` in inglese** (oggi in italiano): riporto (8) del gate di M3, da fare prima della consegna.
- Deploy manuale su GitHub Pages, prova del link (dal visore se c'è), **consegna interna martedì 17 novembre, 18:00**
  (scadenza ufficiale mercoledì 18 novembre, 12:00 PT = 21:00 in Italia; mercoledì mattina di riserva).
- **Congelamento delle funzioni giovedì 12 novembre 2026, 23:59** (nessun task nuovo dopo mer 11 nov, 12:00); poi
  **congelamento del sito** dalla consegna fino all'annuncio dei vincitori (nessun deploy).

## Changelog

- 2026-11-07 (sera): **M6 fase A implementata (T6.A1–T6.A11) e T6.A12 fatta** (documenti riallineati al codice, nessun codice toccato dal pianificatore): `docs/plans/M6.md` ("Esiti" compilata con ciò che c'è davvero: 26 manopole `t_*` tutte cablate con default di M5, strati live > url > file, 11 script `quest:*` con 12 preset, HUD `ui:debug-hud` +2 chiamate, maschera `debug:fov-mask`, `quest.html`, build +3,5 kB gzip), `docs/QUEST_SETUP.md` (sezione 4.2 con il quoting giusto di `adb shell`, sezione 11 con lo stato reale e il procedimento di martedì), `docs/DEVICE_CHECKLIST.md`, `qa/device/DEBT.md` (13 righe M6), scenari S6.1–S6.5 allineati e ordine del gate in `qa/scenarios/M6-regression.md`. **Resta il gate PC T6.A13** (`emulator-qa`); nulla è provato sul visore.
- 2026-11-07: **piano M6 consegnato (M6 ⬜ → 🟨)**: `docs/plans/M6.md` (decisioni D65–D79, fase A T6.A1–T6.A13, fase B sessioni S0–S4 con protocolli di taratura a soglie numeriche, ripiego L1–L3 se il visore tarda, rischi R57–R73, debito per `DEBT.md`, stima onesta: fase A nucleo ≈ 18 h reali / tutto ≈ 22 h, fase B ≈ 12,5 h di sessioni sul visore + ≈ 16 h di lavoro dell'agente) e scenari `qa/scenarios/M6-*.md` (S6.1–S6.5). Fase A = solo strumenti dietro `debug=1` o fuori dall'app, default invariati, nessuna dipendenza nuova. **Realtà mista tagliata e fuori dal gate** (D74, conferma di M5). `docs/DEVICE_CHECKLIST.md` riallineata (sette segnalazioni di `quest-integrator`: chiazze di luce al posto delle ombre, realtà mista tagliata, tastiera/microfono/presa a distanza non applicabili, voci mancanti di DEBT.md aggiunte, `debug=1` per `[soglia:stats]`, HTTPS autofirmato anche su `localhost`, `dev-params.local.txt` sul visore) e sezione 11 di `docs/QUEST_SETUP.md` completata con lo stato "da implementare". Stato di M5 invariato (✅ PC-done); nulla è provato sul visore.
- 2026-11-06: **M5 🟨 → ✅ PC-done** (report unificato `qa/reports/M5-2026-11-06.md`, con i parziali AB, rerun e C2D; scenari S5.1, S5.3–S5.10 e regressioni S1.x, S2.x, S3.x, S4.x superati). Consegnati: Blocco R (riporti 1–8 di M4), sole in logica pura con chiazze di luce e dicitura "Simplified light", pannello "View" (sole, zoom, rotazione, contrasto, testo), punti informativi e Furnish/Clear del ruolo agent, alto contrasto (≥ 7:1), testo grande (pannelli scalati ×1,25, finestra di beccheggio ±8° dichiarata), "Rotate" a una mano, coach del pulsante Menu, T5.RA (muri e soglie uniti, −16 chiamate). Caso peggiore 70 chiamate per vista, 32.766 triangoli. Corretti dopo il gate: F1, W1, W2, F-D-1, F-D-2 e gli avvisi 3–9 del `contest-reviewer`. Aperti: rilettura del regolamento ufficiale (sito Devpost non raggiungibile dalla sessione), N2/N3 da rimisurare sul visore. Nulla è provato sul visore: voci M5 in `qa/device/DEBT.md`. M3 e M4 uniti in `main` con squash (PR #1 e #2).
- 2026-11-06: **piano M5 consegnato (M5 ⬜ → 🟨)**: `docs/plans/M5.md` (decisioni D53–D64, Blocco R T5.R1–T5.R6, task T5.1–T5.18 con T5.16 sotto la linea e T5.RA condizionale, previsione dei draw call con caso peggiore ~82, rischi, debito, stima ≈ 30 h reali, ordine dei tagli) e scenari `qa/scenarios/M5-*.md` (S5.1, S5.3–S5.10). **Tagliati in partenza**: confronto di due disposizioni/case, mappa dell'interesse e domande (S5.2), realtà mista, ombre con shadow map (sostituite da chiazze di luce), trascinamento a una mano (T1.15 ridotto a pulsanti nel pannello "View"). Correzioni agli scenari esistenti (riporto 6) **applicate il 2026-11-06 su decisione dell'utente** (S3.0, S3.5, S4.3, S4.5, ciascuno con riga di changelog); confermate anche le chiazze di sole al posto delle shadow map, il pannello "View" unico e lo staging solo per apartment-a. Stato di M4 invariato (✅ PC-done).
- 2026-11-02: **piano M4 consegnato (M4 ⬜ → 🟨)**: `docs/plans/M4.md` (decisioni D39–D52, Blocco R dei riporti di M3, task T4.R1–T4.R7 e T4.1–T4.14, previsione dei draw call, rischi, debito, stima onesta con fattore 1,8) e scenari `qa/scenarios/M4-*.md` (S4.1–S4.10). **Calendario M4–M7 ripianificato** (le date precedenti erano superate): M4 PC-done atteso dom 8 nov (limite lun 9), M5 ridotta 9–12 nov, **congelamento delle funzioni gio 12 nov 23:59**, M6 appena c'è il Quest (sessione principale ven 13), M7 14–17 nov con consegna interna mar 17, 18:00; tagli in ordine e scenari A/B in `docs/plans/M4.md`. Testo con le sole mani: frasi predefinite (D40), tastiera di sistema e nota vocale opzionali e tagliate di partenza. Cambio ruolo dal nuovo pannello "Issues" (D41). Scenari corretti nei punti di partenza (non nei criteri), con riga di changelog in testa: S1.2, S2.6, S2.9, S3.0, S3.2, S3.3 e nota condizionale su S3.1. `README.md` e `docs/DATA_FORMATS.md` in inglese passano a M7. Stato di M3 invariato (✅ PC-done).
- 2026-11-04: **M4 🟨 → ✅ PC-done** (report `qa/reports/M4-2026-11-03.md`; scenari S4.1–S4.8, S4.10 e regressioni S1.x, S2.x, S3.x superati; `contest-reviewer`: APPROVATO CON AVVISI, nessun bloccante). Caso peggiore di draw call 75 per vista (< 85: R-A non è il primo task di M5). Chiuso con 5 giorni di anticipo sul piano rivisto (previsto dom 8–lun 9 nov). Voci M4 aggiunte a `qa/device/DEBT.md`. Una differenza di criterio da decidere: S3.0 verifica 4. Riporti a M5 nella sezione M5.
- 2026-11-02: **M3 🟨 → ✅ PC-done** (report `qa/reports/M3-2026-10-10.md`; scenari S3.0–S3.9 e regressioni S1.1–S1.6, S2.0–S2.9 superati; `contest-reviewer`: APPROVATO CON AVVISI, nessun bloccante). T3.15 tagliato (presa e misura a distanza passano a M5/M7). Chiarimento della regola 8 in `docs/RULES.md` (ingressi di riserva fino a 45°: due pulsanti Menu laterali a ±0,45 m). Voci M3 aggiunte a `qa/device/DEBT.md`. **Calendario non aggiornato**: M3 si chiude il 2 novembre invece del 12–13 ottobre e restano 16 giorni alla consegna del 18 novembre per M4–M7: da ripianificare con l'utente (tagli possibili: presa a distanza, voce, agente).
- 2026-10-09: piano M3 consegnato (`docs/plans/M3.md`, scenari `qa/scenarios/M3-*.md`): **M3 ⬜ → 🟨**. Richiesta dell'utente: i primi quattro task sono salvataggio minimo in `localStorage` + ciclo di vita, palmo e pizzico dai giunti, pulsante "Menu" a una mano, previsione dei draw call fino a M5. Righe scenari aggiunte (S3.0, S3.6–S3.10). **M4**: `Persistence` ha già la prima fetta (nota). **M5**: la voce "menu e Recenter usabili con una mano sola" è riscritta come consegnata in M3, con l'elenco di ciò che resta a M5 (onboarding del pulsante, "Rotate", alto contrasto, default una mano, S5.4, prova sul visore). Nessun altro stato di milestone è cambiato.
- 2026-10-07: M2 PC-done (report `qa/reports/M2-2026-10-06-rerun3.md`; `contest-reviewer`: SUPERATO CON RISERVE, nessun bloccante). Gate visore di M2 in debito: voci aggiunte o allineate in `qa/device/DEBT.md`. Stato di M3+ invariato (lo aggiorna il piano M3).
- 2026-10-06: M5 ha ora la voce esplicita "menu e Recenter usabili con una mano sola" (menu `pinned`, Undo e Recenter inclusi) — decisione dell'utente sul gate di M2 (finding del report `qa/reports/M2-2026-10-06.md`). Nessuno stato di milestone è cambiato.
