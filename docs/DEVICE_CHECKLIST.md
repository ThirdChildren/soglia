# Checklist del visore

Da eseguire con un Meta Quest (3 o 3S) quando è disponibile. Ogni voce: ✅ ok, ❌ problema (con
nota), ➖ non applicabile. I risultati vanno in `qa/device/<milestone>-<data>.md`.
Le prove rimandate mentre il visore non c'è si elencano in `qa/device/DEBT.md`.

## Setup (una volta)

- [ ] Modalità sviluppatore attiva (app Meta Horizon sul telefono → visore → Developer mode).
- [ ] `adb devices` vede il visore (su Fedora: `sudo dnf install android-tools`; se serve, regola udev per il vendor USB `2833`).
- [ ] App raggiungibile: `adb reverse tcp:<porta> tcp:<porta>` e `https://localhost:<porta>` nel Quest Browser,
      oppure `https://<ip-del-pc>:<porta>` in Wi-Fi accettando il certificato locale.
- [ ] IWER **non** si attiva sul visore (regola `userAgentException` per OculusBrowser).
- [ ] Debug remoto: Chromium sul PC → `chrome://inspect/#devices` → console della pagina sul visore.
- [ ] Meta VR CLI installato (`metavr`), per screenshot, log e tracce di prestazioni.

## Sempre, a ogni milestone

- [ ] Nessun controller acceso: tutto si completa con le mani.
- [ ] Da seduti, senza alzarsi né allungarsi oltre ~60 cm.
- [ ] fps ≥ 60 in tutto il percorso della milestone (obiettivo 72); annotare draw call e triangoli.
- [ ] Testo leggibile senza sforzo; UI essenziale al centro della vista.
- [ ] Nessun errore in console (debug remoto).
- [ ] Togli il visore e rimettilo: l'app riprende dal punto lasciato.
- [ ] Nessuna stringa italiana visibile.

## M1 · Casa e plastico
- [ ] Il plastico compare a un'altezza comoda da seduti; distanza e scala naturali.
- [ ] Pizzico a due mani per ruotare/ingrandire affidabile, senza scatti.
- [ ] Onboarding con la mano fantasma comprensibile senza spiegazioni.

## M2 · Arredare
- [ ] Il menu del palmo si apre solo quando serve (niente aperture accidentali), con entrambe le mani.
- [ ] Presa e rilascio precisi; l'aggancio non "salta".
- [ ] Rotazione col polso affidabile; collisioni evidenti.

## M3 · Dentro la casa
- [ ] Dissolvenza tra plastico e stanza senza fastidio; altezza occhi corretta.
- [ ] Presa a distanza utilizzabile nella stanza a grandezza reale.
- [ ] Metro: errore ≤ 2 cm su misure note del plastico.
- [ ] Messaggio del FitCheck leggibile e chiaro.

## M4 · Segnalazioni
- [ ] Pizzico prolungato distinto dal pizzico normale (niente segnaposto per errore).
- [ ] Tastiera di sistema in WebXR funzionante.
- [ ] Microfono: MediaRecorder / getUserMedia disponibili nel Quest Browser? Se no, il pulsante voce è nascosto.
- [ ] Ciclo rosso → arancione → verde chiaro anche a colpo d'occhio.

## M5 · Luce, agente, accessibilità, realtà mista
- [ ] fps con ombre del sole attive.
- [ ] Alto contrasto e testo grande leggibili; modalità una mano completa.
- [ ] Realtà mista: plastico su superficie rilevata e misura dei mobili veri in **due stanze diverse**,
      mai provate prima; se fallisce, la realtà mista resta fuori dalla demo.

## Prima della consegna
- [ ] Link pubblico (GitHub Pages) aperto dal Quest Browser, senza login, dall'inizio alla fine.
- [ ] Demo completa dei tre atti in meno di 10 minuti da una persona che non la conosce.
- [ ] Riprese per il video fatte dal visore (o dall'emulatore) senza persone riconoscibili né marchi.
