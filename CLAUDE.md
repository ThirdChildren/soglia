# Soglia — istruzioni di progetto per Claude Code

@AGENTS.md

> La riga sopra importa le istruzioni ufficiali di Immersive Web SDK che il template
> (`npm create @iwsdk@latest`) genera in `AGENTS.md`. Valgono sempre: se qualcosa qui
> sotto le contraddice su come si usa IWSDK, vince `AGENTS.md`; su cosa costruire e con
> quali regole, vince questo file.

## Il progetto in breve

Soglia è un'app **WebXR hands-first** costruita con **Immersive Web SDK (IWSDK)** per la
*Meta VR Start Developer Competition 2026* — track **Productivity**, divisione **New Experience**.
Consegna: **18 novembre 2026, 12:00 PT** (21:00 in Italia). Regolamento: `docs/RULES.md`.

La casa di un annuncio diventa un **plastico da tavolo** (scala 1:20) che si usa solo con le mani:

1. **Scegliere** (visitatore): arredare con le mani, provare i *propri* mobili e verificare se
   passano dalle porte, misurare, entrare nelle stanze a grandezza reale, vedere la luce del sole.
2. **Presentare** (agente): punti informativi, arredo virtuale in un gesto, mappa dell'interesse.
3. **Vivere** (inquilino e proprietario): segnalazioni ancorate al punto esatto della casa,
   con stati rosso → arancione → verde, storico e verbale d'ingresso/uscita.

Riferimenti: `docs/ROADMAP.md` (milestone e gate), `docs/DATA_FORMATS.md` (file JSON),
`docs/DEVICE_CHECKLIST.md` (prove sul visore), `schemas/` (JSON Schema), `public/houses/` (case demo).

## Lingua

- **Con l'utente parla in italiano.**
- **Tutto ciò che finisce nel progetto è in inglese**: codice, identificatori, commenti, messaggi
  di commit, stringhe dell'interfaccia, dati di esempio, README. Il regolamento richiede un
  progetto interamente in inglese: nell'app non deve comparire nessuna stringa italiana.
- Le stringhe visibili stanno tutte in `src/ui/strings.ts` (niente testo sparso nei sistemi).

## Regole non negoziabili

Vengono dal regolamento ufficiale e dal design. Un task che ne viola una non è finito.

1. **Solo mani, dall'inizio alla fine.** Ogni percorso si completa con pizzico e gesti; i
   controller possono funzionare ma non servono mai.
2. **Da seduti.** Interazioni entro ~60 cm. **Nessuna locomozione a levetta né teletrasporto**:
   ci si sposta solo tra *punti di vista* con una dissolvenza.
3. **Prestazioni.** Almeno **60 fps sul Quest** (obiettivo 72). Budget di progetto, da tarare sul
   visore: ≤ 100 draw call, ≤ 150k triangoli visibili, texture ≤ 1024 px, ombre solo dal sole.
4. **Avvio rapido, pausa e ripresa pulite.** Lo stato si salva da solo; togliendo e rimettendo
   il visore (o ricaricando la pagina) si riparte dal punto lasciato.
5. **Feature detection sempre.** Ogni API del browser (SpeechRecognition, MediaRecorder,
   getUserMedia, plane/mesh detection, anchors, hit test) si usa solo dopo averne verificato
   l'esistenza, con un'alternativa. L'emulatore su Chrome desktop ha API che il Quest Browser
   potrebbe non avere.
6. **Contenuti.** Solo asset **CC0 / pubblico dominio**, forniti da Meta per il concorso o creati
   da noi. Ogni asset va in `CREDITS.md`. **Niente marchi, loghi, prodotti di marca, persone
   riconoscibili.**
7. **Onestà.** Dati simulati (es. mappa dell'interesse) etichettati **"Sample data"** nell'app.
8. **Campo visivo.** UI essenziale vicino al centro della vista, pannelli a 0,5–0,8 m, niente
   elementi critici ai bordi: deve funzionare anche con il campo visivo più stretto dei Meta VR Glasses.
9. **Accessibilità.** Tutto usabile anche con una mano sola (menu del palmo su entrambe le mani),
   tema ad alto contrasto, testo grande.
10. **Nucleo originale.** Nessun servizio esterno al centro dell'esperienza; la demo funziona
    senza backend.
11. **Three.js si importa da `@iwsdk/core`, mai da `'three'`** (una seconda copia della libreria
    crea bug difficili da trovare).
12. **Congelamento.** Dopo la consegna (18 nov 2026, 12:00 PT) e fino all'annuncio dei vincitori
    (~11 dic 2026) il sito pubblicato non si modifica: nessun deploy.

## Stack e comandi

- IWSDK + TypeScript + Vite, Node ≥ 20.19. Controlla i nomi reali degli script in `package.json`.
- `npm run dev` — server locale; l'emulatore **IWER** si attiva su `localhost`.
- `npx @iwsdk/cli dev up --ai-mode agent` — runtime gestito **headless** per gli agenti
  (server MCP `iwsdk-runtime`: sessione XR, mani, screenshot, profilo, ECS).
- `npx @iwsdk/cli dev up --ai-mode collaborate` — stessa cosa con finestra **visibile** condivisa
  con l'utente. Regola IWSDK: **annuncia sempre** un cambio headed/headless prima di riavviare.
- `npx @iwsdk/cli adapter sync` — registra/aggiorna i server MCP per Claude Code (`.mcp.json`).
  Se gli strumenti `xr_*`, `browser_*`, `ecs_*` non sono disponibili, eseguilo e chiedi
  all'utente di riavviare Claude Code.
- `npm test` — Vitest sulla logica pura. `npm run build` — build di produzione in `dist/`.

## Architettura

```
src/
  index.ts          World.create(...) e registrazione dei sistemi
  systems/          sistemi ECS (usano IWSDK / Three.js)
  components/       componenti ECS
  logic/            logica PURA: nessun import da @iwsdk/core o three → testabile con Vitest
  ui/               pannelli e menu del palmo; strings.ts con tutti i testi (inglese)
  data/             caricamento + validazione dei JSON (house, catalog, issues)
  debug/            strumenti solo per sviluppo (dietro flag)
public/houses/      apartment-a.json, apartment-b.json
public/catalog/     catalog.json (+ modelli glb)
public/demo/        my-furniture.json, issues-apartment-a.json
schemas/            house.schema.json, issue.schema.json
tests/unit/         test Vitest
qa/scenarios/       scenari di accettazione per l'emulatore (Markdown)
qa/reports/         report QA per milestone
qa/device/          prove sul visore + DEBT.md (prove rimandate)
```

| Sistema | Responsabilità | Logica pura in `src/logic/` |
|---|---|---|
| `HouseBuilder` | pavimenti, muri con aperture, porte, finestre da `house.json` | geometria delle aperture |
| `Miniature` | plastico 1:20, rotazione/zoom a due mani, appoggio sul tavolo in MR | trasformazioni di scala |
| `Furniture` | catalogo, presa, aggancio, collisioni, rotazione 90° | snap e collisioni 2D |
| `FitCheck` | mobili / sedia a rotelle / passeggino attraverso le porte | percorso porte + verifica misure |
| `Viewpoint` | punti di vista, passaggio plastico ↔ scala reale | — |
| `Measure` | metro con aggancio a pareti e spigoli | distanze e snap |
| `Sun` | posizione del sole (SunCalc), luce e ombre | calcolo azimut/elevazione |
| `Issues` | segnaposto, categorie, urgenza, stati, verbale | macchina a stati delle segnalazioni |
| `Roles` | visitatore, agente, inquilino, proprietario | permessi per ruolo |
| `Persistence` | salvataggio automatico e ripresa | serializzazione dello stato |
| `Analytics` | mappa dell'interesse dalla direzione della testa | aggregazione |
| `Accessibility` | una mano, alto contrasto, testo grande | — |

### Convenzioni per la testabilità (obbligatorie)

- Ogni entità interattiva ha un **id stabile e leggibile** in un componente `StableId`
  (es. `house:apartment-a`, `room:living`, `wall:w-north`, `door:d-living`, `fixture:washer`,
  `furniture:bed-double#1`, `pin:issue-014`, `viewpoint:V1`, `ui:palm-menu`). La QA la trova con `ecs_find_entities`.
- Lo stato applicativo (casa aperta, ruolo, disposizione, segnalazioni, preferenze) vive in **un
  unico store serializzabile** (`src/logic/state.ts`): è ciò che si salva, si ripristina e si verifica.
- **Determinismo**: nessun `Math.random` non seminato nella logica; orologio iniettabile per `Sun`
  e cronologie.
- **Parametri URL per i test**: `?house=apartment-a&role=tenant&reset=1&seed=1&time=2026-12-21T10:00`
  caricano stati noti. `?debug=1` mostra le statistiche (draw call, triangoli, fps) e le scrive in
  console con prefisso `[soglia:stats]`.
- Log utili alla QA con prefisso `[soglia]` e nessun errore in console nel percorso normale.

## Due livelli di verifica

1. **Gate PC (sempre, senza visore).** `npm test` verde, `npm run build` ok, scenari della
   milestone superati nell'emulatore tramite MCP, nessun errore in console, `contest-reviewer`
   senza bloccanti. Una milestone è **PC-done** quando passa questo gate.
2. **Gate visore (quando il Quest è disponibile).** Checklist in `docs/DEVICE_CHECKLIST.md`.
   Una milestone è **Device-done** quando passa anche questo. Finché il visore non c'è, ogni
   prova rimandata va in `qa/device/DEBT.md`.

Mai scrivere o dire "funziona sul visore" per qualcosa provato solo nell'emulatore.

## Subagent e flusso di lavoro

Tutti i subagent usano **Sonnet 5.5 con effort high** (vedi `.claude/agents/`).

| Agente | Quando usarlo |
|---|---|
| `milestone-planner` | all'inizio di ogni milestone: task, criteri di accettazione, scenari QA |
| `xr-engineer` | ogni modifica al codice dell'app (sistemi, componenti, UI, interazioni) |
| `logic-tester` | test Vitest della logica pura, schemi JSON, regressioni |
| `emulator-qa` | eseguire gli scenari nell'emulatore IWER via MCP e scrivere il report |
| `asset-curator` | trovare, ottimizzare e registrare modelli e texture CC0 |
| `quest-integrator` | tutto ciò che riguarda il visore: setup, prove, prestazioni reali |
| `contest-reviewer` | revisione di conformità al regolamento e qualità (sola lettura) |
| `submission-writer` | testi in inglese: UI, Devpost, istruzioni di test, copione del video |

**Ciclo di una milestone**

1. `milestone-planner` → piano in `docs/plans/Mx.md` + scenari in `qa/scenarios/Mx-*.md`.
2. Per ogni task: `xr-engineer` implementa (piccolo, un sistema alla volta) → `logic-tester`
   aggiunge/aggiorna i test → commit.
3. `emulator-qa` esegue tutti gli scenari della milestone → `qa/reports/Mx-<data>.md`.
4. `contest-reviewer` → verdetto; i bloccanti tornano a `xr-engineer`.
5. Gate PC superato → aggiorna lo stato in `docs/ROADMAP.md` e aggiungi le prove rimandate a
   `qa/device/DEBT.md`.
6. Quando c'è il visore: `quest-integrator` esegue il gate visore delle milestone in debito.

Il contesto principale coordina: delega ai subagent, non ripete il loro lavoro, e riassume
all'utente in italiano cosa è stato fatto e cosa resta.

## Git

- Commit piccoli, in inglese, formato conventional: `feat:`, `fix:`, `test:`, `docs:`, `chore:`.
- La cronologia dimostra che il progetto è nato dopo il 24 settembre 2026 (divisione New
  Experience): niente import di codice preesistente, niente riscrittura della storia.
- Il deploy su GitHub Pages è **manuale** (workflow `pages.yml`): mai durante il congelamento.
- Mai committare segreti; `.env` è ignorato.

## Cosa non fare

- Aggiungere dipendenze pesanti senza chiedere all'utente.
- Introdurre locomozione a levetta, teletrasporto, interazioni che richiedono il controller.
- Scrivere testo italiano nell'interfaccia o nei dati.
- Usare asset senza licenza CC0 verificata o con marchi riconoscibili.
- Segnare un gate come superato senza il report che lo dimostra.
