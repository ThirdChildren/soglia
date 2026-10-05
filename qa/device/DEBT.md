# Prove rimandate al visore

Voci che l'emulatore non può dimostrare. Le aggiungono `emulator-qa`, `xr-engineer` e
`quest-integrator`; si chiudono solo con una prova sul Quest (vedi `docs/DEVICE_CHECKLIST.md`).

| Milestone | Voce | Priorità | Aggiunta il | Esito sul visore |
|---|---|---|---|---|
| M0 | `handTracking: true` è richiesto o opzionale? Senza mani l'app deve restare avviabile | alta | 2026-10-05 | — |
| M0 | L'emulatore IWER non si attiva su host non-localhost nella build di produzione | alta | 2026-10-05 | — |
| M0 | Con controller collegati e `cdn.jsdelivr.net` bloccato/offline: nessuna eccezione, sessione e input a mani funzionanti (F1, vedi `docs/RULES.md`) | alta | 2026-10-05 | — |
| M0 | Nessuna richiesta verso `unpkg.com`, `cdn.jsdelivr.net`, `api.dicebear.com` durante una sessione sul Quest | media | 2026-10-05 | — |
| M0 | Avvio a freddo sul Quest sotto 10 s (bundle 6,57 MB, 1,68 MB gzip) | media | 2026-10-05 | — |
| M0 | Precisione reale delle mani, comfort, fps, passthrough | bassa | 2026-10-05 | — |
