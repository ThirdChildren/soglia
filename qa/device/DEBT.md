# Prove rimandate al visore

Voci che l'emulatore non può dimostrare. Le aggiungono `emulator-qa`, `xr-engineer` e
`quest-integrator`; si chiudono solo con una prova sul Quest (vedi `docs/DEVICE_CHECKLIST.md`).

| Milestone | Voce | Priorità | Aggiunta il | Esito sul visore |
|---|---|---|---|---|
| M0 | `handTracking: true` è richiesto o opzionale? Senza mani l'app deve restare avviabile | alta | 2026-10-05 | — |
| M0 | L'emulatore IWER non si attiva su host non-localhost nella build di produzione | alta | 2026-10-05 | — |
| M0 | Con `cdn.jsdelivr.net` bloccato/offline e sessione a sole mani sul Quest: le mani si vedono (glb locali in `public/models/hands/`), nessun warning `[xr-input] Failed to load visual asset`, nessuna eccezione (F1, vedi `docs/RULES.md`) | alta | 2026-10-05 | — |
| M0 | Controller (accesi sul Quest): si vede la capsula locale al posto del modello, nessuna richiesta a `cdn.jsdelivr.net`, nessun warning `[xr-input] Failed to load visual asset` (`src/systems/local-controllers.ts`; nell'emulatore IWER verificato: nessuna richiesta esterna) | bassa | 2026-10-05 | — |
| M0 | Nessuna richiesta verso `unpkg.com`, `api.dicebear.com` durante una sessione sul Quest (`cdn.jsdelivr.net` non deve comparire nemmeno con i controller accesi) | media | 2026-10-05 | — |
| M0 | Avvio a freddo sul Quest sotto 10 s (bundle 6,57 MB, 1,68 MB gzip) | media | 2026-10-05 | — |
| M0 | Precisione reale delle mani, comfort, fps, passthrough | bassa | 2026-10-05 | — |
| M1 | Altezza e distanza del plastico (0,45 m davanti, 0,25 m sotto gli occhi) comode da seduti; spazio di riferimento effettivo (`local` vs `local-floor`); l'emulatore parte con la testa a 1,6 m | alta | 2026-10-05 | — |
| M1 | Pizzico a due mani affidabile senza scatti: soglie di presa (0,35 m / 0,25 m), zona morta di 5 mm, limiti di zoom 0,03–0,12 (a 0,12 la casa A misura 1,32 m, oltre i 60 cm di portata); posa `gripSpace` delle mani vere (se imprecisa, passare alla punta dell'indice) | alta | 2026-10-05 | — |
| M1 | Pizzico reale su una stanza: sceglie quella giusta e non una vicina; il primo pizzico a due mani non seleziona una stanza prima che parta il gesto | alta | 2026-10-05 | — |
| M1 | Leggibilità e dimensione dell'etichetta della stanza e del pannello d'errore a 0,5–0,8 m e nel campo visivo stretto dei Meta VR Glasses; forma ASCII `m2` sul font reale; glifi `·` e `²` (voce aperta in M2) | alta | 2026-10-05 | — |
| M1 | Onboarding: la mano fantasma si capisce senza spiegazioni; dimensione, distanza e velocità; 1,0 s di quiete prima della comparsa; il timeout di 9 s e la selezione di una stanza come uscita per chi usa una sola mano | media | 2026-10-05 | — |
| M1 | fps ≥ 60 sul Quest con A e con B; draw call e triangoli reali (`[soglia:stats]` via debug remoto; sul PC 21,3–21,7k triangoli su due viste contro l'obiettivo interno di 20k); costo GPU dei pannelli UIKit | alta | 2026-10-05 | — |
| M1 | Tutta l'esperienza di M1 completabile senza controller; `renderer.xr.getCamera().cameras.length` è 2 sul Quest? | alta | 2026-10-05 | — |
| M1 | Pausa/ripresa: togliere e rimettere il visore non rompe il plastico (nessuna persistenza prima di M4; il plastico viene riposizionato a ogni avvio di sessione) | media | 2026-10-05 | — |
| M1 | Parametri URL (`?house=…&debug=1`) letti nel Quest Browser (il file `dev-params.local.txt` esiste solo in sviluppo) | media | 2026-10-05 | — |
| M2 | Font locale dei pannelli (`public/fonts/inter-regular` e `inter-bold`, atlanti MSDF 512x512 con `² · × − ± → ≈`): sul Quest i glifi `²` e `·` sono nitidi e leggibili a 0,5–0,8 m e nel campo visivo stretto (l'etichetta ora è un pannello largo 0,46 m); nessun `[soglia] font fallback` in console; nessuna richiesta di rete per il font (sostituisce la parte "glifi" della voce M1 sull'etichetta) | alta | 2026-10-05 | — |
| M2 | Menu del palmo (T2.12): dimensione e distanza dei bersagli (voci 12,2 x 9,4 cm, barra 8,8 x 7 cm, raggio di presa 5 cm) a 0,5 m; leggibilità con campo visivo stretto; etichette dei pulsanti della barra a 1,7 cm (sotto i 2,4 cm del resto, per larghezza: da ingrandire se illeggibili); icone Lucide con testo; il menu a 0,38 m di altezza resta nel campo visivo | alta | 2026-10-05 | — |
| M2 | Punto di pizzico: `pinchPoint` usa il `gripSpace`; in IWER il grip dista circa 5 cm dalla posa impostata (-0,028; +0,002; +0,045 a orientamento identità, mano destra). Sul Quest va confermato che il pizzico sulle voci del menu cada nel raggio di 5 cm, altrimenti passare alla punta dell'indice (`XRHand`) | alta | 2026-10-05 | — |
| M2 | Presa e posa (T2.13-T2.15): presa naturale con le dita vere (pizzico entro 1,5 cm dall'impronta, 0,06 m in altezza), nessun tremolio del pezzo in mano, aggancio ai muri a 0,30 m e griglia 0,05 m a scala 1:20; il pezzo preso dal plastico segue la mano solo dopo 150 ms (offset preso a pizzico assestato: sul Quest va confermato che il grip non si sposta e che 150 ms bastano); rilascio fuori dal modello (altezza > 0,25 m o fuori dalle stanze) comprensibile senza spiegazioni | alta | 2026-10-05 | — |
| M2 | Rotazione (T2.14): torsione del polso (isteresi 50/40 gradi, asse Y del `gripSpace`, riferimento preso a 150 ms dal pizzico) affidabile con la mano vera; il tocco dell'altra mano come metodo principale se il polso non regge; il menu non si apre con un pezzo in mano e non si chiude per sbaglio | alta | 2026-10-05 | — |
| M2 | Etichetta del motivo (T2.9b): leggibile a 0,5-0,8 m su un pezzo a scala 1:20, non copre la cornice né le altre etichette (al piu 3), compare dopo 200 ms dallo stato e non lampeggia mentre si passa sopra i muri; log `furniture status` e etichetta in ritardo di 200 ms sono giusti anche con una mano che trema | media | 2026-10-05 | — |
| M2 | Pezzi 1:20 (T2.9): leggibilità dei 14 modelli CC0 e della cornice rossa a 0,5-0,8 m; i blocchi di ripiego (se un glb non carica) | media | 2026-10-05 | — |
