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
- **Host esterni noti nel bundle di produzione** (default di `@iwsdk/core` / `@iwsdk/xr-input`,
  verificato su `@iwsdk/core` 1.0.1, nessuna opzione per cambiarli):
  `unpkg.com` (decoder Draco/KTX2, scatta solo caricando un glTF compresso, vietato sopra) e
  `cdn.jsdelivr.net` (profili e modelli dei controller, scatta solo se il visore ha controller
  collegati; l'app è hands-first e funziona senza) e `api.dicebear.com` (immagine casuale di
  default del componente Avatar di `@pmndrs/uikit-horizon`: **non usare mai Avatar senza `src`**).
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
