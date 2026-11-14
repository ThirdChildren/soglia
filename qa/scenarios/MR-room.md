# S-MR · Realtà mista: la mia stanza

> **Note 2026-11-14 (UI fixes)**: every step or criterion of this scenario about the FitCheck (door-fit label `Fits` / `Won't fit` / `Fits when disassembled` / `No route`, `ui:fit-label`, `ui:fit-marker-*`, the `fit` menu tab, the wheelchair and stroller pieces) is REMOVED with the feature: skip it. The rest still applies.

> **Changelog 2026-11-12 (dopo le correzioni della revisione)**: il pulsante `My room`/`Model` ha accanto `Menu` (`ui:room-menu-button`) e la coppia sta 0,215 m sopra gli occhi (`mr button shown distance=0.59 maxAngleDeg=25.5`); schede e coppia restano nel cono di 30° anche con la testa inclinata; le misure dei mobili veri sono "About …"; un pezzo virtuale vince sul mobile vero solo se è davanti o dentro. Aggiunto il percorso a una mano in S-MR.3.

> **Changelog 2026-11-12**: scenario creato per il gate PC della funzione MR (`docs/plans/MR.md`, MR.1–MR.5). Coordinate della stanza sintetica `office_large` dell'emulatore (piano `floor` a y = 0; divano vero centro (1,03; 0,42; −0,65), lungo z da −1,5 a −0,2, x da 0,62 a 1,44; scaffale alto (1,10; 0,73; 0,40)): vanno rilette dai log `room mesh …` all'esecuzione.

**Tipo**: PC (emulatore IWER, `dev.emulator.environment: office_large`) · **Regole di `CLAUDE.md`**: 1, 2, 3, 5, 7, 8, 9, 10
Parametri base: `house=apartment-a&role=visitor&reset=1&seed=1&debug=1&pinch=grip&mr=1`. Pizzico = `xr_select` ≥ 0,3 s; il punto di pizzico reale si legge da `[soglia:hands] … point=`. Mira: `xr look-at` della mano verso il bersaglio.

## S-MR.1 · Ingresso e regressione
1. Senza `mr`: sessione `immersive-vr`, nessuna entità `ui:room-*`/`ui:scan-*`, nessuna riga `mr`/`room`, draw call uguali a `main` nello stesso stato.
2. Con `mr=1`: `immersive-ar` con `plane-detection` e `mesh-detection` concessi; righe `mr world created mode=immersive-ar sceneUnderstanding=on`, `mr session scene-understanding=granted`, `room scan meshes=<n> planes=<n>`; nessun cielo; plastico come in `vr`.
3. `debug=1&noscan=1&mr=1`: `room scan empty`; in vista stanza dopo ~10 s il pannello `No room scan found. …`; un pezzo si posa sul pavimento di ripiego.

## S-MR.2 · Oggetti veri
1. Pizzico su `ui:room-button` → `mr view=room`; plastico e pulsanti del plastico nascosti; `mr objects outlined=<n>` (nessun volume grande come la stanza).
2. Raggio della destra sul divano → `mr hover … label=couch`; pizzico → `mr object selected label=couch size=<l>x<p>x<a>`; scheda nel cono di 30° (`coneDeg` ≤ 30), testi ≥ 2,4 cm.
3. `Add to Mine` → `mr object added id=my-scan-couch-1`, `state saved … scanned=1`; la scheda mostra `Added`; ricarica senza `reset`: "My couch" nella scheda `Mine`.
4. In vista `Model`, "My couch" dal menu verso una porta: etichetta del FitCheck con le misure del divano.

## S-MR.3 · Mobili virtuali a grandezza reale
1. In vista stanza, menu del palmo → un pezzo (es. `Armchair`) → raggio sul pavimento libero → rilascio: `mr piece placed id=room:piece-armchair#… status=valid`; linea e cursore del raggio visibili.
2. Trascinato sul divano vero: `status=invalid`, etichetta `Overlaps the couch`.
3. Rotazione con il tocco dell'altra mano: `rot=90`, `rot=180`.
4. Pizzico breve sul pezzo → scheda `Remove`/`Close`; `Remove` → `mr piece removed … reason=card`; rilascio fuori dal pavimento → `reason=off-floor`.
5. 12 pezzi → `mr piece limit reached max=12` e `Room is full`; draw call ≤ 100 per vista; la prima posa mostra `Room layout is not saved`.
6. `Model` nasconde i pezzi, `My room` li rimostra.
7. **Una mano sola** (solo la destra): `My room` → `Menu` (`ui:room-menu-button`) → voce → pezzo posato col raggio → rotazione col polso (rollio della mano) → pizzico sul pezzo → `Remove`.
8. Pezzo dentro il divano vero: si riprende; pezzo dietro il divano: il pizzico sul divano apre la scheda del divano.

## S-MR.4 · Ciclo di vita
1. F8/F9 con un pezzo nuovo in mano: nessun pezzo duplicato o perso; scheda chiusa (`via=suspend`); la vista resta.
2. Fine sessione (`xr exit`, poi `xr enter`): si torna a `Model`, i pezzi della stanza non ci sono più; "My couch" resta in `Mine`.

## Verifiche generali
Console senza `error` nel percorso normale (il `warn` di framework `THREE.WebGLRenderer: Can't change size while VR device is presenting.` da `xr exit` è noto); nessuna stringa italiana; nessuna richiesta di rete nuova nell'app (la stanza sintetica dell'emulatore da `www.unpkg.com` riguarda solo lo sviluppo); ≤ 100 chiamate per vista.

## Da rimandare al visore
Tutto ciò che riguarda passthrough reale, Space Setup vero, etichette reali, mira del raggio della mano da seduti, rotazione col polso, misure reali (±5 cm), fps: vedi `docs/plans/MR.md`, "Prove sul visore".
