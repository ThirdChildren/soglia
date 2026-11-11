# MR · Realtà mista: la mia stanza (ramo `claude/eager-mendel-skcibe`)

**Decisione dell'utente (2026-11-11)**: si fa la **versione completa** della realtà mista, su un ramo separato da `main`, da provare sul visore e poi unire. Contenuto scelto: (1) gli oggetti veri della stanza, riconosciuti dalla scansione del Quest, si vedono, si toccano (nome e misure) e si aggiungono ai "miei mobili" per il FitCheck; (2) **mobili virtuali del catalogo a grandezza reale nella stanza**, appoggiati al pavimento rilevato. Il congelamento delle funzioni (gio 12, 23:59) slitta **solo per questa funzione**; tutto resta dietro `?mr=1` finché non supera la prova sul visore in **due stanze diverse** (regola già scritta in `docs/ROADMAP.md`, M5). Se non la supera entro **domenica 15 novembre in mattinata** (termine indicato dall'utente il 2026-11-11), il ramo non si unisce e la demo resta quella di `main`.

## Cosa la piattaforma dà e cosa no (verificato su `@iwsdk/core` 1.0.1, 2026-11-11)

- `world.xr.mode: 'ar'` → sessione `immersive-ar` con passthrough. `features.sceneUnderstanding: true` → `SceneUnderstandingSystem` crea entità **`XRPlane`** (pavimento, pareti, soffitto, tavoli come piani) e **`XRMesh`** (mobili come volumi con `isBounded3D`, `semanticLabel`, `min`, `max`, `dimensions`), e `XRAnchor` per ancorare contenuti. Richiede le feature WebXR `plane-detection`/`mesh-detection` (e `anchors`).
- Gli oggetti **vengono dalla scansione della stanza fatta nelle impostazioni del Quest (Space Setup)**, non da un riconoscimento libero dalla fotocamera: etichette tipiche `table`, `couch`, `bed`, `storage`, `screen`, `lamp`, `plant`, `wall_art`, `door_frame`, `window_frame`, `other`. Un oggetto che la scansione non ha non esiste per l'app. Il riconoscimento libero di oggetti dalla fotocamera (feature `camera` di IWSDK) richiederebbe un modello di visione o un servizio esterno: **escluso** (regola 10 e "niente dipendenze pesanti senza chiedere").
- Sul PC: l'emulatore IWER ha stanze sintetiche (`dev.emulator.environment`: `living_room`, `meeting_room`, `music_room`, `office_large`, `office_small`) con piani e volumi etichettati: gli scenari si provano lì; la prova vera resta sul visore.

## Decisioni

**DMR1 · Ingresso.** `?mr=1` (URL o `dev-params.local.txt`, come `pinch=`) crea il `World` con `xr.mode = 'ar'` e `sceneUnderstanding` acceso; senza il parametro l'app è **identica a `main`** (sessione `vr`, nessun sistema nuovo attivo). Feature detection (regola 5): se `navigator.xr.isSessionSupported('immersive-ar')` è falso o la sessione non concede `mesh-detection`/`plane-detection`, log `[soglia] feature mr unavailable reason=…` e ripiego sulla sessione `vr` (o sul plastico senza stanza), mai un errore. Senza scansione della stanza (nessun `XRMesh`/`XRPlane` dopo 3 s) un pannello dice in inglese di fare lo Space Setup nelle impostazioni del visore.

**DMR2 · Due viste nella stessa sessione MR.** Il plastico resta come oggi, sospeso sopra il passthrough (sfondo trasparente al posto del cielo). Un pulsante del menu (`My room` / `Model`, nella barra del menu v2 o come scheda) passa alla vista **stanza**: il plastico si nasconde, compaiono i contorni dei mobili veri e i mobili virtuali a 1:1. Una sola vista attiva alla volta; log `[soglia] mr view=room|model`.

**DMR3 · Interazione a distanza da seduti (regole 1, 2).** I mobili veri sono oltre i 60 cm: si puntano con il **raggio della mano** (target ray della mano; IWSDK `RayInteractable` o raggio proprio sui volumi) e si sceglie con il pizzico. Nessuna locomozione: ci si può girare sulla sedia. La scheda che si apre sta **davanti alla testa** (ancora `pinned`, 0,55 m, cono di 30°), non sull'oggetto lontano (regola 8).

**DMR4 · Oggetti veri: contorni, scheda, "Add to Mine".** Ogni `XRMesh` delimitato con etichetta di arredo (`table`, `couch`, `bed`, `storage`, `screen`, `lamp`, `plant`, `other`) ha un contorno (spigoli del volume) in **una** mesh istanziata (+1 chiamata) e un nome inglese (`Couch`, `Table`, …). Pizzico con il raggio → contorno evidenziato e scheda: nome, misure **larghezza × profondità × altezza in cm interi** (dal volume, asse Y in alto), pulsanti `Add to Mine` e `Close`. `Add to Mine` crea un pezzo proprio (`kind: furniture`, misure ordinate come i pezzi di `my-furniture.json`, nome "My couch", id stabile `my-scan-couch-1`), salvato nello stato (lista bianca, versione 1 additiva) e visibile nella scheda `Mine` del menu e nel FitCheck sulle porte dell'appartamento ("Does my couch fit through the door?"). Pareti, pavimento, soffitto, cornici di porte e finestre non si aggiungono.

**DMR5 · Mobili virtuali a grandezza reale.** In vista stanza, scegliere un pezzo dal menu (catalogo, `Mine`, mobilità) lo crea **a 1:1** sul pavimento rilevato (piano `floor` più basso; ripiego: quota del pavimento dal riferimento `local-floor`) nel punto colpito dal raggio, davanti all'utente. Si sposta trascinandolo con il raggio sul pavimento, si ruota di 90° con il polso o con il tocco dell'altra mano (come sul plastico, D19), si toglie con `Remove` dalla sua scheda o rilasciandolo fuori dal pavimento. Collisioni in pianta (2D) con i volumi veri e con gli altri pezzi virtuali: contorno rosso e etichetta del motivo `Overlaps the couch` (riuso delle regole di posa e dell'etichetta del motivo). Massimo 12 pezzi nella stanza. **Non salvati tra una sessione e l'altra nella versione 1** (le coordinate della stanza cambiano a ogni sessione senza ancore persistenti): dichiarato in UI ("Room layout is not saved") e in `qa/device/DEBT.md`; i pezzi aggiunti con `Add to Mine` invece si salvano.

**DMR6 · Prestazioni (regola 3).** Contorni dei volumi in una mesh istanziata, mesh globale della stanza mai disegnata, pezzi a 1:1 con gli stessi glb del plastico (un pezzo = 1 chiamata), nessuna ombra. Tetto: ≤ 100 chiamate per vista anche con 12 pezzi; obiettivo ≤ 70.

**DMR7 · Testi e dati.** Tutte le stringhe in `src/ui/strings.ts`, in inglese; nessun dato simulato (i mobili veri sono veri: niente "Sample data"); nessun asset nuovo; nessun servizio esterno.

## Task (in ordine; `xr-engineer`, poi `logic-tester` dove c'è logica pura)

| Id | Task | Accettazione PC |
|---|---|---|
| MR.1 | **Spike e ingresso**: `?mr=1` → `World` in `ar` con `sceneUnderstanding`; emulatore con `dev.emulator.environment` (stanza sintetica); log dei volumi e piani rilevati (etichetta, misure); feature detection e ripiego; senza `mr` l'app è identica (regressione rapida) | S-MR.1 |
| MR.2 | **Logica pura** `src/logic/room-scan.ts`: etichette → nomi, misure in cm dal volume, scelta del volume colpito dal raggio, pezzo proprio da un volume, posa a 1:1 sul pavimento e collisioni 2D con i volumi | test Vitest |
| MR.3 | **Vista stanza e oggetti veri**: pulsante `My room`/`Model`, contorni istanziati, raggio + pizzico, scheda con misure, `Add to Mine` salvato e visibile in `Mine` e nel FitCheck | S-MR.2 |
| MR.4 | **Mobili virtuali 1:1**: dal menu al pavimento, trascinamento con il raggio, rotazione, collisioni con etichetta del motivo, `Remove`, tetto 12 | S-MR.3 |
| MR.5 | **Ciclo di vita e messaggi**: sospensione/ripresa in MR (presa chiusa, vista conservata), pannello "Space Setup" se la stanza è vuota, "Room layout is not saved" | S-MR.4 |
| MR.6 | **Gate PC** (`emulator-qa`: S-MR.1–S-MR.4 + regressione rapida della sessione `vr` senza `mr`), `contest-reviewer`, debito del visore, PR verso `main` | report `qa/reports/MR-<data>.md` |

## Prove sul visore (dell'utente, prima dell'unione)

In **due stanze diverse** con Space Setup fatto: la sessione MR parte; i mobili veri compaiono con il nome giusto; il raggio li sceglie da seduti; le misure sono plausibili (±5 cm su un mobile misurato col metro); `Add to Mine` poi FitCheck sull'appartamento; un divano virtuale a 1:1 sul pavimento resta fermo quando ci si gira; collisione con un mobile vero; ≥ 60 fps; senza `?mr=1` l'app è quella di `main`. Se una prova fallisce, la funzione resta sul ramo.

## Changelog
- 2026-11-11: piano creato dopo la decisione dell'utente (versione completa, ramo separato, mobili virtuali nella stanza).
- 2026-11-11: termine per le prove sul visore e l'unione spostato a domenica 15 novembre mattina (indicazione dell'utente).
