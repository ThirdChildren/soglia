# Regolamento: cosa conta per Soglia

Sintesi del regolamento ufficiale letto il 28 settembre 2026:
https://start-developer-competition-26.devpost.com/rules — in caso di dubbio fa fede il testo ufficiale.
Il `contest-reviewer` lo ricontrolla a ogni gate.

## Date

- Periodo: dal 24 settembre 2026, 10:00 PT, al **18 novembre 2026, 12:00 PT** (21:00 in Italia).
- Valutazione: 18 novembre – 9 dicembre 2026. Vincitori: ~11 dicembre 2026.
- **Dopo la scadenza nessuna modifica** all'entry.

## Idoneità

- Maggiorenne; Italia non esclusa. Account Meta con accesso sviluppatore; membro Meta VR Start entro la consegna.
- Una sola partecipazione per persona. Nessun finanziamento Meta precedente per il progetto.

## Requisiti del progetto

| Requisito | Testo del regolamento (sintesi) | Come si applica |
|---|---|---|
| Piattaforma | App VR/MR per dispositivi Meta; WebXR/IWSDK ammesso con link ospitato | GitHub Pages |
| Divisione New Experience | Ideato e costruito dal 24/9/2026, niente codice preesistente | cronologia git |
| Hands-first | "Fully usable with hands end-to-end. Controller support optional." | regola 1 di `CLAUDE.md` |
| Seated | "Designed for seated/stationary use. Limit roomscale or large physical movement." | punti di vista, niente locomozione |
| Quick engagement | "Fast cold start. Clean pause/resume. Satisfying in ≤10 minutes." | `Persistence`, demo in 3 atti |
| Originale | Nucleo costruito da noi; involucri di servizi esistenti sconsigliati | nessun servizio esterno centrale |
| Contenuti | Originali, pubblico dominio o forniti da Meta; terze parti solo se la licenza lo consente | CC0 + `CREDITS.md` |
| Strumenti | Solo strumenti pubblici o per membri Start; niente strumenti Meta non rilasciati | IWSDK pubblico |
| Contenuti vietati | Niente marchi, loghi, slogan, prodotti di marca, arte commerciale, persone riconoscibili, contenuti ingannevoli, associazioni con Meta | catalogo generico, "Sample data" |
| Lingua | "Projects must be entirely in the English language or include English subtitles." Materiali (video, descrizione, istruzioni di test) in inglese | tutto in inglese |
| Policy | Termini Start, Community Standards, Conduct in VR, Developer App Policies e Content Guidelines; fascia 10+, 13+ o 18+ | rileggere prima di registrare voce/dati |
| Accesso | Gratuito e accessibile ai giudici fino all'annuncio dei vincitori | link pubblico, senza login |

## Regole interne derivate (non dal regolamento)

- **glTF senza compressione Draco e senza texture KTX2.** I decoder di `@iwsdk/core` vengono da
  `unpkg.com/three@0.<rev>.0` e non esiste un'opzione supportata per percorsi locali. Il nucleo
  non deve dipendere da servizi esterni (regola 10 di `CLAUDE.md`). Vale per `asset-curator`.
- **Eccezione alla regola 6 (CC0): asset di runtime del framework con licenza MIT, citati.** I
  modelli delle mani che IWSDK mostra in una sessione a mani (`generic-hand/left.glb` e
  `right.glb` del pacchetto `@webxr-input-profiles/assets` 1.0.20, MIT, Copyright 2019 Amazon)
  non sono CC0 né creati da noi, ma sono parte del framework ufficiale e senza di essi le mani
  non si vedono. Sono copiati in `public/models/hands/` con la licenza accanto, citati in
  `CREDITS.md` con autore e licenza. Nessun altro asset non CC0 è ammesso senza una voce analoga
  qui; sono generici e non raffigurano marchi.
- **Seconda eccezione alla regola 6 (CC0): il font dei pannelli, Inter con licenza SIL OFL 1.1,
  citato (decisione dell'utente, 2026-10-05).** I pannelli usano un atlante MSDF generato da noi
  dal TTF ufficiale di Inter (release v4.1 di `rsms/inter`, Copyright (c) 2016 The Inter Project
  Authors, nessun Reserved Font Name) con glifi in più (`² · × − ± → ≈`) che il font incluso in
  `@pmndrs/msdfonts` non ha (verificato a schermo, vedi `docs/plans/M2.md`, "Esiti degli
  spike"). Non è CC0, ma la OFL permette uso, modifica e ridistribuzione con la licenza accanto:
  il testo è in `public/fonts/OFL.txt` (e in `assets-src/fonts/OFL.txt` insieme ai TTF
  sorgente, fuori da `public/` e quindi fuori dalla build), i file `public/fonts/inter-*.json` e
  `.png` sono citati in `CREDITS.md` (id `font-inter-msdf`). Il font non è un marchio e non si
  vende da solo. Se i file mancano, l'app ripiega sul font incluso nel framework (solo ASCII).
- **Terza eccezione alla regola 6 (CC0): le icone dei pulsanti del menu, da `@pmndrs/uikit-lucide`,
  licenza ISC, citate.** I pulsanti del menu del palmo e il suggerimento hanno un'icona
  (`Undo2`, `ChevronLeft`, `ChevronRight`, `LocateFixed`, `Hand`) presa dal pacchetto
  `@pmndrs/uikit-lucide` 1.0.76 (involucro MIT, Copyright 2024 Bela Bohlender e 2023 Coconut
  Capital). I disegni sono icone Lucide (ISC, Copyright (c) 2026 Lucide Icons and Contributors);
  i chevron derivano da Feather e sono MIT (Copyright (c) 2013-present Cole Bemis). Non sono CC0,
  ma le licenze permettono uso e ridistribuzione con il testo accanto; le icone sono citate in
  `CREDITS.md`. Sono incluse nel
  bundle una per una (nessuna richiesta a un host in esecuzione), stanno sempre accanto a
  un'etichetta di testo e sono forme generiche: nessun marchio, nessun logo.
- **Host esterni noti nel bundle di produzione** (default di `@iwsdk/core` / `@iwsdk/xr-input`,
  verificato su `@iwsdk/core` 1.0.1, nessuna opzione per cambiarli):
  `unpkg.com` (decoder Draco/KTX2, scatta solo caricando un glTF compresso, vietato sopra),
  `cdn.jsdelivr.net` (profili e modelli di **mani e controller**: di default IWSDK scarica da qui
  il modello `generic-hand` a ogni sessione con mani tracciate, quindi senza rete le mani sono
  invisibili; dal 2026-10-05 i due glb delle mani sono locali in `public/models/hands/`
  (`src/systems/local-hands.ts`) e non partono più richieste per le mani; dal 2026-10-05 anche i
  **controller** non scaricano più nulla: `src/systems/local-controllers.ts` sostituisce il loro
  visual con una capsula procedurale (nessun glb, nessuna texture) e rimpiazza il loader degli
  adapter, quindi nell'emulatore IWER, con i controller connessi, non parte alcuna richiesta
  verso `cdn.jsdelivr.net`; il ripiego, se l'hook non esistesse in una versione futura di IWSDK, è
  un warning `[soglia] feature controller-loader-hook unavailable`) e `api.dicebear.com` (immagine casuale di default del componente Avatar di `@pmndrs/uikit-horizon`:
  **non usare mai Avatar senza `src`**).
  Da ricontrollare a ogni aggiornamento di IWSDK;
  sul visore va verificato che non partano richieste (`qa/device/DEBT.md`).

## Consegna

- Link alla pagina ospitata (GitHub Pages o simili).
- Video **sotto i 3 minuti**, "as viewed on a Meta Quest device or via XR Simulator or another
  equivalent emulator", pubblico su YouTube o Vimeo. Riprese reali: "Don't lean on AI-generated video".
- Descrizione: ispirazione, come è fatto, sviluppi futuri, data di lancio; screenshot consigliati.
- Track Productivity, divisione New Experience.

## Valutazione

- **Fase 1**: superato/non superato (rientra nel tema, usa le funzioni richieste).
- **Fase 2**: quattro criteri al 25%.
  - *Innovation & Creativity*: originalità, rilevanza per la track, uso delle capacità del dispositivo per l'uso ripetuto.
  - *Experience Design*: seduti, mani, onboarding chiaro, scopo che crea abitudine; **passthrough con uno scopo**
    ("the player's real room meaningfully changes the experience"); **FoV-aware design**.
  - *Technical Implementation*: mani, passthrough, ancoraggio, **min 60 fps sul Quest**, niente bug; per il passthrough
    riconoscimento della scena e tenuta "in rooms the developer never tested". Lo sguardo è citato per Unity/Unreal ISDK v207+.
  - *Polish & Presentation*: UI/UX, grafica, suono, materiali di consegna; video onesto che racconta la storia.
- **Un solo premio per progetto.**

## Premi speciali rilevanti

- **Best First Five Minutes**: si spiega da solo, insegna i gesti senza muri di testo, dà una soddisfazione subito.
- **Best Accessibility Forward Experience**: alternative ai gesti, navigazione per mobilità ridotta, alto contrasto, inclusività.
- **Best Reason to Come Back**: progressione e ricompense tra una sessione e l'altra.
