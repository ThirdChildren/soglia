# Checklist del visore

Da eseguire con un Meta Quest (3 o 3S) quando è disponibile. Ogni voce: ✅ ok, ❌ problema (con
nota), ➖ non applicabile. I risultati vanno in `qa/device/<milestone>-<data>.md`.
Le prove rimandate mentre il visore non c'è si elencano in `qa/device/DEBT.md` (una riga per voce,
con priorità: questa checklist è l'indice, DEBT.md il dettaglio con i numeri da confrontare).
Guida passo passo per l'utente (Fedora, adb, certificato, debug remoto, Meta VR CLI):
`docs/QUEST_SETUP.md`. Piano e ordine delle sessioni: `docs/plans/M6.md`.

> **Changelog 2026-11-07** (piano M6, segnalazioni di `quest-integrator`): (1) M5: le "ombre del sole" non
> esistono più, sono **chiazze di luce** (D55 di M5); (2) M5: la **realtà mista è tagliata e fuori dal gate**
> (`mr=1` non ha effetto), decisione esplicita D74 del piano M6; (3) M4: tastiera di sistema e microfono **non
> implementati** (D40), voci ➖; presa a distanza di M3 ➖ (T3.15 tagliato); (4) aggiunte le voci presenti in DEBT.md e
> mancanti: pulsanti fissi `Menu`/`Issues`/`View`/`Tabletop`, pannello View, punti informativi, Furnish/Clear,
> `Rotate`, coach, avvio a freddo sotto 10 s, `handTracking` richiesto o opzionale; (5) `[soglia:stats]` richiede
> `?debug=1`; (6) il server è **HTTPS autofirmato anche su `localhost`**; (7) `dev-params.local.txt` vale anche sul visore
> se la pagina arriva dal server di sviluppo. Aggiunta la sezione "Strumenti di M6" (HUD, `[soglia:env]`, taratura).

## Setup (una volta)

- [ ] Modalità sviluppatore attiva (app Meta Horizon sul telefono → visore → Developer mode; serve prima
      un'organizzazione sviluppatore sul sito Meta: vedi `docs/QUEST_SETUP.md`, sezione 3).
- [ ] `adb devices` vede il visore (su Fedora: `sudo dnf install android-tools`; se serve, regola udev per il
      vendor USB `2833`).
- [ ] App raggiungibile: server di sviluppo `npx @iwsdk/cli dev up --no-open` (**HTTPS autofirmato sulla porta
      8081, anche su `localhost`**: il Quest Browser mostra un avviso del certificato la prima volta, per ogni
      indirizzo, e va accettato). Via USB: `adb reverse tcp:8081 tcp:8081` e `https://localhost:8081/?debug=1`;
      via Wi-Fi: `https://<ip-del-pc>:8081/?debug=1`. Leggere sempre la porta da `dev status`.
- [ ] IWER **non** si attiva sul visore (regola per lo user agent OculusBrowser): nessun controllo
      dell'emulatore a schermo.
- [ ] Debug remoto: Chromium sul PC → `chrome://inspect/#devices` → console della pagina sul visore.
- [ ] Meta VR CLI: è già una dipendenza di sviluppo (`@meta-quest/metavr`, installata da `npm ci`); si usa con
      `npx metavr ...` e scarica il suo programma dalla CDN di Meta al primo avvio (vedi
      `docs/QUEST_SETUP.md`, sezione 5.3). Non serve un'installazione globale.
- [ ] **`[soglia:stats]` esiste solo con `?debug=1`** (ogni 2 s: fps, chiamate, triangoli; con `debug=1` anche
      `[soglia:stats:groups]`). Senza `debug=1` la console non ha numeri di prestazioni.
- [ ] **Parametri da file**: `dev-params.local.txt` (radice del progetto, una riga, senza `?`) funziona **anche sul
      visore** se la pagina arriva dal server di sviluppo (non dalla build pubblica); un parametro nell'URL vince
      su quello del file. Cancellarlo a fine prova.
- [ ] Mani attive nelle impostazioni del visore (Hand tracking), controller messi via e spenti.

## Sempre, a ogni milestone

- [ ] Nessun controller acceso: tutto si completa con le mani.
- [ ] Da seduti, senza alzarsi né allungarsi oltre ~60 cm.
- [ ] fps ≥ 60 in tutto il percorso della milestone (obiettivo 72); annotare draw call e triangoli (da
      `[soglia:stats]`, con `debug=1`).
- [ ] Testo leggibile senza sforzo; UI essenziale al centro della vista.
- [ ] Nessun errore in console (debug remoto).
- [ ] Togli il visore e rimettilo: l'app riprende dal punto lasciato.
- [ ] Nessuna stringa italiana visibile.
- [ ] **Mani locali**: con la rete bloccata (o `cdn.jsdelivr.net` irraggiungibile) le mani si vedono
      (glb in `public/models/hands/`), nessun warning `[xr-input] Failed to load visual asset`.
- [ ] **Prova con i controller**: accendi i controller e riavvia la sessione. Si vede una capsula
      grigia locale (non il modello Meta), non parte alcuna richiesta a `cdn.jsdelivr.net` e l'app
      non li richiede mai (resta tutta completabile a mani).

## M0 · Avvio e ambiente

- [ ] **`handTracking: true` è richiesto o opzionale?** La sessione parte con le mani attive; senza mani (o con
      il tracciamento spento) l'app deve restare avviabile.
- [ ] **Avvio a freddo sotto 10 s** (dalla pressione del link a plastico visibile; bundle 6,57 MB, 1,68 MB gzip).
- [ ] Nessuna richiesta verso `unpkg.com`, `api.dicebear.com` né `cdn.jsdelivr.net` (nemmeno con i controller
      accesi): scheda Rete di DevTools.
- [ ] `renderer.xr.getCamera().cameras.length` è 2 (campo `views=2` di `[soglia:stats]`).
- [ ] `localStorage` presente e non bloccato nel Quest Browser (serve alla ripresa).

## M1 · Casa e plastico
- [ ] Il plastico compare a un'altezza comoda da seduti; distanza e scala naturali.
- [ ] Pizzico a due mani per ruotare/ingrandire affidabile, senza scatti.
- [ ] Pizzico su una stanza: sceglie quella giusta; etichetta leggibile (`·` e `²` nitidi).
- [ ] Onboarding con la mano fantasma comprensibile senza spiegazioni.

## M2 · Arredare
- [ ] Il menu del palmo si apre solo quando serve (niente aperture accidentali), con entrambe le mani.
- [ ] Presa e rilascio precisi; l'aggancio non "salta".
- [ ] Rotazione col polso affidabile; collisioni evidenti.
- [ ] Traslazione del plastico a una e a due mani senza scatti; `Recenter` raggiungibile.

## M3 · Dentro la casa
- [ ] **Pulsanti fissi `Menu`** (due, a ±0,45 m): raggiungibili con una mano da seduti, leggibili, senza prendere il
      pezzo vicino; il menu `pinned` si legge nel campo visivo.
- [ ] Dissolvenza tra plastico e stanza senza fastidio; altezza occhi corretta.
- [ ] ➖ Presa a distanza nella stanza a grandezza reale: **tagliata** (T3.15). In scala reale si prende solo a
      portata di braccio: annotare quanto è scomodo.
- [ ] Metro: errore ≤ 2 cm su misure note del plastico.
- [ ] Messaggio del FitCheck leggibile e chiaro.
- [ ] Giunti delle mani (`XRHand`, `fillPoses`) disponibili e punto di pizzico preciso (`[soglia:hands]`).

## M4 · Segnalazioni
- [ ] Pizzico prolungato distinto dal pizzico normale (niente segnaposto per errore).
- [ ] **Pulsanti `Issues`** sopra `Menu` e **pulsante `Tabletop`** in scala reale: raggiungibili e leggibili con una
      mano; pannello Issues leggibile a 0,59 m, nessuna riga scambiata con la vicina.
- [ ] ➖ Tastiera di sistema in WebXR: **non implementata** (D40, frasi predefinite al posto della tastiera).
- [ ] ➖ Microfono (`MediaRecorder` / `getUserMedia`): **non implementato**, nessun pulsante vocale (S4.2). Verificare
      solo che non compaia alcun pulsante morto.
- [ ] Ciclo rosso → arancione → verde chiaro anche a colpo d'occhio; il viola del verbale si distingue.
- [ ] Ripresa vera con segnalazioni, ruolo, pezzi e punto di vista attivo.

## M5 · Luce, agente, accessibilità
- [ ] **fps con le chiazze di luce del sole** (non ci sono ombre vere: il sole è un calcolo proprio con chiazze sul
      pavimento, "Simplified light") nel caso peggiore (menu `pinned` + pezzo non valido + etichette).
- [ ] **Pulsanti `View`** (terzo piano) e **pannello View** (Zoom, Turn, Month, Hour, Contrast, Text): raggiungibili con
      una mano, righe da 3,3 cm senza scambi, quadrante del sole leggibile.
- [ ] **Punti informativi** (rombi ciano, "Sample data") leggibili e pizzicabili; **Furnish / Clear** a una mano,
      14 pezzi senza scatti, `Undo` in un passo.
- [ ] Alto contrasto e testo grande leggibili nel campo visivo; modalità una mano completa.
- [ ] **`Rotate`** (12 s dopo la posa) raggiungibile e non premuto per sbaglio; **coach** del pulsante `Menu`
      comprensibile senza spiegazioni.
- [ ] ➖ **Realtà mista: tagliata e fuori dal gate** (`mr=1` non ha effetto; decisione D74 del piano M6, conferma di
      M5). Non si prova e non si cita nella demo. Resta solo il rilevamento di funzioni del browser, a titolo di
      informazione (`[soglia:env]`, sezione "Strumenti di M6").

## Strumenti di M6 (disponibili dopo la fase A del piano M6)
- [ ] `?debug=1` mostra nel visore il pannello `ui:debug-hud` (fps, tempo per frame, chiamate, triangoli, ultime
      righe di log); `&hud=0` lo spegne per le misure pulite.
- [ ] La console contiene `[soglia:env]` (browser, funzioni disponibili, frequenza di aggiornamento) e
      `[soglia:frames]` (media, p95 e massimo del tempo per frame).
- [ ] Taratura: parametri `t_<nome>=<valore>` (solo con `debug=1`) e file `tuning.local.txt` letto ogni 2 s dal
      server di sviluppo; ogni cambio scrive `[soglia] tuning set ...`.

## Prima della consegna
- [ ] Link pubblico (GitHub Pages) aperto dal Quest Browser, senza login, dall'inizio alla fine (la build pubblica
      non legge `dev-params.local.txt`).
- [ ] Demo completa dei tre atti in meno di 10 minuti da una persona che non la conosce.
- [ ] Riprese per il video fatte dal visore (o dall'emulatore) senza persone riconoscibili né marchi.
