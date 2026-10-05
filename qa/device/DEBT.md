# Prove rimandate al visore

Voci che l'emulatore non può dimostrare. Le aggiungono `emulator-qa`, `xr-engineer` e
`quest-integrator`; si chiudono solo con una prova sul Quest (vedi `docs/DEVICE_CHECKLIST.md`).

| Milestone | Voce | Priorità | Aggiunta il | Esito sul visore |
|---|---|---|---|---|
| M0 | `handTracking: true` è richiesto o opzionale? Senza mani l'app deve restare avviabile | alta | 2026-10-05 | — |
| M0 | L'emulatore IWER non si attiva su host non-localhost nella build di produzione | alta | 2026-10-05 | — |
| M0 | Con `cdn.jsdelivr.net` bloccato/offline e sessione a sole mani sul Quest: le mani si vedono (glb locali in `public/models/hands/`), nessun warning `[xr-input] Failed to load visual asset`, nessuna eccezione (F1, vedi `docs/RULES.md`) | alta | 2026-10-05 | — |
| M0 | Controller: con le mani tracciate parte comunque una richiesta ai profili controller (`meta-quest-touch-plus` o altri) su `cdn.jsdelivr.net`? I modelli dei controller non sono locali; nell'emulatore la richiesta parte sempre | media | 2026-10-05 | — |
| M0 | Nessuna richiesta verso `unpkg.com`, `api.dicebear.com` durante una sessione sul Quest (e verso `cdn.jsdelivr.net` solo se compaiono controller) | media | 2026-10-05 | — |
| M0 | Avvio a freddo sul Quest sotto 10 s (bundle 6,57 MB, 1,68 MB gzip) | media | 2026-10-05 | — |
| M0 | Precisione reale delle mani, comfort, fps, passthrough | bassa | 2026-10-05 | — |
