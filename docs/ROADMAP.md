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
| M2 Arredare con le mani | 8 – 14 ott | ⬜ |
| M3 Dentro la casa e i miei mobili | 15 – 21 ott | ⬜ |
| M4 Segnalazioni e persistenza | 22 – 28 ott | ⬜ |
| M5 Luce, agente, accessibilità, realtà mista | 29 ott – 4 nov | ⬜ |
| M6 Integrazione con il visore | appena arriva il Quest (idealmente 2 – 10 nov) | ⬜ |
| M7 Rifinitura e consegna | 9 – 15 nov (margine fino al 18) | ⬜ |

Il visore andrebbe preso **entro fine ottobre**: M6 ha bisogno di almeno una settimana di prove reali
prima della consegna.

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
- Annulla dal menu; un mobile lasciato fuori dal plastico torna nel catalogo.

| Scenario PC | Verifica |
|---|---|
| S2.1 Menu del palmo | mano sinistra con palmo in su → `ui:palm-menu` visibile; stesso con la destra |
| S2.2 Posa il letto | pizzico su `bed-double`, trascina in camera, rilascia → entità dentro `bedroom`, appoggiata a una parete |
| S2.3 Collisione | spingi il letto contro l'armadio → stato `invalid`, contorno rosso; spostalo → `valid` |
| S2.4 Annulla | "Undo" → l'ultima azione sparisce dallo store |

**Unit test**: snap alle pareti, collisioni tra rettangoli ruotati, porta bloccata.
**Gate visore**: presa naturale, niente tremolii, rotazione col polso affidabile.

## M3 · Dentro la casa e i miei mobili

**Obiettivo**: punti di vista, metro, i propri mobili e il controllo delle porte.

- `Viewpoint`: pizzico su V1/V2/V3 → dissolvenza → scala reale ad altezza occhi da seduti (1,2 m);
  "Tabletop" dal menu per tornare. Presa a distanza nella stanza.
- `Measure`: pizzico su due punti, aggancio a pareti e spigoli, misura in cm.
- `FitCheck`: percorso dalla porta d'ingresso alla stanza (grafo delle porte), verifica di ogni
  porta; lo stesso per sedia a rotelle e passeggino. Messaggio in inglese che spiega il motivo.

| Scenario PC | Verifica |
|---|---|
| S3.1 Punto di vista | pizzico su `viewpoint:V1` → camera a scala reale nel soggiorno; "Tabletop" → ritorno |
| S3.2 Metro | misura la finestra dello studio → 140 cm (± 1) |
| S3.3 Divano in A | "My sofa 230 × 95 × 85" verso il soggiorno → blocco su `door:d-living`, messaggio "Won't fit: the door is 80 cm wide, the sofa's shortest side is 85 cm" |
| S3.4 Divano in B | stessa prova in `apartment-b` → passa |
| S3.5 Sedia a rotelle | verso il bagno di A → blocco su `door:d-bathroom` (75 cm) |

**Unit test**: grafo delle porte, percorso, regole di passaggio (vedi `docs/DATA_FORMATS.md`).
**Gate visore**: dissolvenza senza nausea, scala reale credibile, metro preciso a mano libera.

## M4 · Segnalazioni e persistenza

**Obiettivo**: il ciclo completo della segnalazione e la ripresa dopo una pausa.

- `Roles`: visitatore, agente, inquilino, proprietario (cambio dal menu del palmo).
- `Issues`: pizzico prolungato su un punto o su un fixture → segnaposto; categoria (proposta dal
  fixture), urgenza, testo con tastiera di sistema, nota vocale con MediaRecorder **solo se esiste**;
  stati open → in_progress → resolved → archived; conferma dell'inquilino; verbale d'ingresso (blu).
- `Persistence`: salvataggio automatico (localStorage/IndexedDB con try/catch), ripresa su reload
  e su `visibilitychange`.

| Scenario PC | Verifica |
|---|---|
| S4.1 Segnalazione | ruolo tenant, pizzico prolungato su `fixture:washer` → categoria `appliances`, testo "The washing machine leaks during the spin cycle", urgenza medium → `pin:*` rosso |
| S4.2 Voce | se MediaRecorder esiste: nota registrata e collegata; altrimenti il pulsante voce è nascosto e resta la tastiera |
| S4.3 Proprietario | ruolo landlord → elenco per urgenza; "Take on" → arancione; "Resolved" → verde; conferma tenant → storico |
| S4.4 Ripresa | ricarica la pagina → stesse segnalazioni, stessa casa, stesso ruolo |
| S4.5 Verbale | "Move-in report" → segnaposto blu da `issues-apartment-a.json` |

**Unit test**: macchina a stati (transizioni valide e vietate), serializzazione/deserializzazione,
permessi per ruolo.
**Gate visore**: pizzico prolungato distinto dal pizzico normale, tastiera di sistema in WebXR,
microfono nel Quest Browser (se c'è), ripresa dopo aver tolto il visore.

## M5 · Luce, agente, accessibilità, realtà mista

**Obiettivo**: tutte le funzioni della demo presenti.

- `Sun` con SunCalc, manopola mese/ora, ombre solo nella stanza attiva.
- Agente: punti informativi, "Furnish / Clear" (preset `staging`), mappa dell'interesse con
  etichetta "Sample data", domande ricevute.
- Confronto di due disposizioni e di due case.
- Accessibilità: modalità una mano, alto contrasto, testo grande.
- **T1.15 · Zoom e rotazione del plastico con una mano** (alternativa ai gesti a due mani di M1,
  che oggi sono l'unico modo per ruotare e ingrandire; regola 9). Proposta del piano M1: pizzico
  trascinato con una mano sul plastico = rotazione attorno a Y; due pulsanti piccoli sul bordo
  della base per zoom ± (pannello a 0,5–0,8 m); soglia tra "tocco" (etichetta stanza) e
  "trascinamento" 1,5 cm. Lo scenario S5.4 va esteso a S1.2 (oltre a S2–S4) quando si pianifica M5.
  In M1 l'onboarding si sblocca già con una mano (selezione di una stanza o timeout).
- **Realtà mista (dietro flag `?mr=1`)**: misura dei mobili veri con il pizzico sugli spigoli e
  plastico appoggiato su una superficie rilevata. Sul PC si prova con l'ambiente sintetico
  dell'emulatore; entra nella demo solo se supera il gate visore in **due stanze diverse**.

| Scenario PC | Verifica |
|---|---|
| S5.1 Sole | `time=2026-12-21T10:00` → luce nel soggiorno; `T15:00` → soggiorno in ombra |
| S5.2 Mappa | ruolo agent → mappa visibile con "Sample data" |
| S5.3 Arreda | "Furnish" → mobili del preset; di nuovo → casa vuota |
| S5.4 Una mano | modalità one-hand → tutte le azioni degli scenari S2–S4 eseguibili con la sola mano destra |
| S5.5 Demo completa | percorso dei tre atti in meno di 10 minuti, zero errori in console |

**Gate visore**: realtà mista in due stanze mai provate prima, fps con ombre attive, contrasto
leggibile, sessione completa di 10 minuti senza fastidio.

## M6 · Integrazione con il visore

**Obiettivo**: saldare tutto il debito in `qa/device/DEBT.md` e raggiungere Device-done per M1–M5.

- Setup (vedi agente `quest-integrator`): modalità sviluppatore, adb su Fedora, `adb reverse`,
  debug remoto da Chromium, Meta VR CLI.
- Esecuzione di `docs/DEVICE_CHECKLIST.md` per ogni milestone.
- Taratura: soglie del pizzico, distanze, dimensioni del testo, budget grafico reale.
- Decisione finale sulla realtà mista (dentro o fuori dalla demo).

**Gate**: tutte le voci della checklist superate o motivate; fps ≥ 60 in tutta la demo.

## M7 · Rifinitura e consegna

- `submission-writer`: descrizione Devpost (inglese), tagline ≤ 140 caratteri, istruzioni di test,
  copione e sottotitoli del video.
- Video < 3 minuti con riprese reali (visore o emulatore), niente video generati con AI.
- `contest-reviewer`: revisione finale su `docs/RULES.md`.
- Deploy manuale su GitHub Pages, prova del link dal visore, consegna entro domenica 15 novembre.
- **Congelamento** fino all'annuncio dei vincitori.
