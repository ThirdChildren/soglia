# Caricare una casa da file JSON (ramo `claude/house-file-upload`)

**Decisione dell'utente (2026-11-12)**: aggiungere una funzione per caricare un file JSON di una casa (formato `schemas/house.schema.json`, `docs/DATA_FORMATS.md`) e ottenerne la casa con le sue misure; ramo nuovo da `main`, PR propria; stesso termine della realtà mista (pronta e provata sul visore entro **domenica 15 novembre mattina**, altrimenti resta sul ramo). La casa d'esempio ricavata dal PDF dell'utente **non** si aggiunge al repository.

## Decisioni
- **HF1 · Dove**: nella pagina 2D, prima di entrare in VR (in sessione immersiva il selettore dei file non è disponibile). Un piccolo pannello DOM (testi da `src/ui/strings.ts`, in inglese, grandi e ad alto contrasto) con: casa attuale (titolo e superficie), scelta tra le case demo e quelle caricate, `Load house file` (selettore del sistema, `accept=".json,application/json"`), trascinamento del file sulla pagina, `Remove` per le case caricate. Nascosto durante la sessione XR. Funziona con il puntatore della mano nel Quest Browser (regola 1).
- **HF2 · Controllo**: il file è dato non fidato: dimensione massima 1 MB, `JSON.parse`, `checkHouse` (stesso controllo delle case demo), limiti di quantità per le prestazioni (regola 3); errori in inglese, leggibili (le prime righe di `checkHouse`), nessun carico parziale; testo mostrato solo come testo (mai HTML).
- **HF3 · Dove si salva**: nel browser (`localStorage` tramite `createSafeStorage`), chiave `soglia:v1:house-file:<id>` e indice `soglia:v1:house-files`; id con prefisso `file-` (mai in conflitto con `apartment-a`/`apartment-b`); al massimo 5 case; quota piena o storage assente → la casa vale solo per la sessione, con un avviso. Disposizione e segnalazioni di una casa caricata si salvano come per le altre (chiave per casa). Nessun server (regola 10).
- **HF4 · Apertura**: `?house=file-<id>` apre la casa caricata (il pannello ricarica la pagina con quel parametro); un id `file-*` assente dallo storage mostra il pannello d'errore come una casa sconosciuta, senza richieste di rete. `reset=1` non cancella le case caricate (solo lo stato).
- **HF5 · Feature detection** (regola 5): `File`, `FileReader`/`Blob.text`, drag and drop e `localStorage` usati solo se esistono, con ripiego.

## Prove sul visore
Nel Quest Browser: il pulsante `Load house file` apre il selettore dei file (file da Download o da un servizio di file del visore), la casa caricata si apre in VR con le misure giuste, resta dopo la chiusura del browser, `Remove` la toglie.

## Changelog
- 2026-11-12: piano creato dopo la richiesta dell'utente.
