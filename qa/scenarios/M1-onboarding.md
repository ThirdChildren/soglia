# S1.6 · Onboarding con la mano fantasma (senza testo)

**Milestone**: M1 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`)
Scenario aggiunto dal pianificatore. Prerequisito: T1.13. Se T1.13 slitta a M2 (decisione dell'utente) questo scenario è BLOCKED e fuori dal gate di M1.

## Precondizioni
- Runtime headless; `dev-params.local.txt` = `house=apartment-a&role=visitor&reset=1&seed=1&debug=1`; `browser_reload_page`.
- Headset a (0; 1,2; 0); `xr_accept_session`; `xr_set_input_mode` `mode: "hand"`.
- Le mani restano **lontane dal plastico** e senza pizzico: `hand-left` a (−0,40; 1,40; 0,20), `hand-right` a (0,40; 1,40; 0,20), select a 0.
- **O** = origine letta dall'ultima riga `miniature placed`.

## Passi
1. Subito dopo `browser_reload_page` e **prima** di `xr_accept_session` (fuori sessione): `browser_get_console_logs` con `pattern: "onboarding|miniature placed"` (solo le righe del caricamento corrente: partire dalla riga `params source=`) e `ecs_find_entities` con `namePattern: "^ui:ghost-hand-"` (deve dare 0: fuori sessione XR le mani fantasma non esistono). Poi `xr_accept_session`, `xr_set_input_mode` `mode: "hand"`, `ecs_find_entities` `^ui:ghost-hand-` **subito** (nella stessa sequenza di chiamate, senza attese: tentativo al meglio, vedi verifica 1b), attendere 4 s e ripetere `browser_get_console_logs` con lo stesso `pattern`. Le mani restano lontane e senza pizzico (precondizioni).
2. `ecs_find_entities` con `namePattern: "^ui:ghost-hand-"` (a ≥ 1,5 s dall'avvio della sessione, cioè dopo l'attesa del passo 1).
3. `browser_screenshot` → allegare (mano fantasma sopra il plastico).
4. Primo pizzico: `hand-right` a (Ox; Oy + 0,10; Oz + 0,10), `xr_select` con `device: "hand-right"`, `duration: 0.2`. Attesa 1 s. `browser_get_console_logs` con `pattern: "onboarding"`; `ecs_find_entities` con `namePattern: "^ui:ghost-hand-"`.
5. `browser_screenshot` → allegare (due mani fantasma).
6. Gesto a due mani: fase A di `qa/scenarios/M1-two-hands.md` (passi 1–5, mani a ±0,15 m → ±0,25 m, poi rilascio). Attesa 1 s. `browser_get_console_logs` con `pattern: "onboarding"`; `ecs_find_entities` con `namePattern: "^ui:ghost-hand-"`.
7. `browser_reload_page` (stessi parametri), `xr_accept_session`, attesa 4 s. `browser_get_console_logs` con `pattern: "onboarding"`.
8. Controllo sulle stringhe, da riga di comando: `grep -n -i "onboard\|ghost\|hand" src/ui/strings.ts`.
9. `browser_get_console_logs` senza filtro (`error`).
10. **Uscita con una mano: selezione di stanza.** `browser_reload_page` (stessi parametri), `xr_accept_session`, `xr_set_input_mode` `mode: "hand"`, mani lontane come nelle precondizioni, attesa 2 s. Primo pizzico non su una stanza come al passo 4 (`hand-right` a (Ox; Oy + 0,10; Oz + 0,10), `xr_select` `duration: 0.2`): attendere 1 s e controllare `onboarding step=two-hands`. Poi selezionare la stanza `living` come in `qa/scenarios/M1-room-label.md` passo 1 (`hand-right` a (Ox − 0,145; Oy + 0,25; Oz − 0,065 + 0,02), `xr_look_at` verso (Ox − 0,145; Oy; Oz − 0,065), `xr_select` `duration: 0.3`). Attesa 1 s. `browser_get_console_logs` con `pattern: "onboarding|room selected"`; `ecs_find_entities` con `namePattern: "^ui:ghost-hand-"`. Nessun gesto a due mani in questo passo.
11. **Uscita con una mano: timeout.** `browser_reload_page` (stessi parametri), `xr_accept_session`, `xr_set_input_mode` `mode: "hand"`, mani lontane, attesa 2 s. Primo pizzico non su una stanza come al passo 4; attesa 1 s; `browser_get_console_logs` con `pattern: "onboarding"` (annotare il timestamp T0 della riga `step=two-hands`); `ecs_find_entities` `^ui:ghost-hand-`. Poi **nessuna azione** (nessun pizzico, nessun `xr_select`, nessun gesto, nessuna stanza): attendere in totale 4 s da T0, `ecs_find_entities` `^ui:ghost-hand-`, `browser_get_console_logs` `pattern: "onboarding"`; attendere fino a 11 s da T0 e ripetere log ed `ecs_find_entities`.

## Verifiche (tutte obbligatorie)
1. Ordine nei log dopo il ricaricamento (passo 1), per il caricamento corrente:
   a. Prima della sessione compare **una sola volta** `[soglia] onboarding step=pinch`, subito dopo il **primo** `[soglia] miniature placed ...` (quello fuori sessione, `y=0.950`, creato alla creazione del mondo; osservato 3–6 ms dopo; il criterio è l'ordine, non il ritardo). Può esserci in mezzo `[soglia] house loaded ...`.
   b. Dopo `xr_accept_session` compare un secondo `[soglia] miniature placed ...` (inizio sessione, `y=1.350` con la testa a 1,6 m) e `onboarding step=pinch` **non si ripete**: dopo la sessione il conteggio delle righe `onboarding step=pinch` del caricamento è ancora **1**, e non compare nessun'altra riga `onboarding` finché non si agisce.
   c. `ui:ghost-hand-right` **non esiste** prima della sessione (ricerca del passo 1 fuori sessione: 0 risultati). Esiste invece alla ricerca del passo 2, a ≥ 1,5 s dall'avvio della sessione (1 entità). La mano fantasma compare solo in sessione XR, dopo **1,0 s di quiete** (`SHOW_DELAY_S`) dal primo fotogramma con la posa della testa: quindi **non** prima di 1,0 s dall'avvio sessione. La ricerca subito dopo `xr_accept_session` è solo informativa: se restituisce già 1 entità e il report può dimostrare (timestamp delle righe di log dell'avvio sessione) che sono passati meno di 1,0 s, è FAIL; se non si può dimostrare il tempo trascorso, annotare "non misurabile" senza FAIL. Il timing esatto di 1,0 s è coperto dai test unitari di `src/logic/onboarding.ts` (`shouldShowHint`) e dalla prova sul visore.
2. Passo 2: esattamente 1 entità, `ui:ghost-hand-right`; **nessuna** `ui:ghost-hand-left`.
3. Passo 4: compare `[soglia] onboarding step=two-hands`; ora esistono `ui:ghost-hand-left` **e** `ui:ghost-hand-right` (2 entità).
4. Passo 6: compare `[soglia] onboarding step=done`; la ricerca restituisce **0** entità `ui:ghost-hand-*`.
5. Passo 7: dopo il ricaricamento la sequenza ricomincia (`step=pinch`): in M1 non c'è persistenza (arriva in M4; questa verifica va invertita in S4.4 quando `prefs.onboardingStep` verrà salvato).
6. Passo 8: nessuna riga trovata che contenga testo di onboarding (l'onboarding è senza testo); eventuali corrispondenze sono solo nomi di funzioni/chiavi e non frasi visibili.
7. Nessuna voce `error` in console. Nessun uso di controller (`xr_set_input_mode` resta `hand`).
8. Gli screenshot mostrano (descrizione a parole nel report): la mano fantasma sopra il plastico, poi due mani; **nessun testo** sovrapposto.
9. Passo 10 (via d'uscita con una mano, selezione di stanza): dopo `onboarding step=two-hands` (primo pizzico) esistono 2 entità `ui:ghost-hand-*`; dopo la selezione di `living` compare `[soglia] room selected living area=23.9` e `[soglia] onboarding step=done` (l'ordine tra le due righe non è vincolato, nessun gesto a due mani è stato fatto); la ricerca `^ui:ghost-hand-` restituisce **0** entità.
10. Passo 11 (via d'uscita con una mano, timeout): dopo `step=two-hands` (T0) esistono 2 entità `ui:ghost-hand-*` e a 4 s da T0 **non** c'è ancora `step=done`; senza alcuna azione compare `[soglia] onboarding step=done` a T0 + 9,0 s ± 0,5 s (9,0 s = 3 ripetizioni × 3,0 s di `REPEAT_PERIOD_S`; osservato 781.45 → 790.45) e a 11 s da T0 la ricerca `^ui:ghost-hand-` restituisce **0** entità. Nessuna riga `room selected` in questo passo.

## Esito
PASS se le verifiche 1–7, 9 e 10 sono soddisfatte · FAIL altrimenti.

## Da rimandare al visore
La mano fantasma si capisce senza spiegazioni da una persona che non conosce l'app; dimensione, distanza e velocità dell'animazione; non disturba il campo visivo stretto dei Meta VR Glasses (voci M1 in `qa/device/DEBT.md`).

## Changelog
- 2026-10-05: verifica 1 riscritta senza ambiguità (1a ordine dei log: `onboarding step=pinch` UNA sola volta per caricamento, subito dopo il primo `miniature placed` fuori sessione, e non ripetuto all'avvio sessione; 1b secondo `miniature placed` a inizio sessione senza nuova riga `step=pinch`; 1c `ui:ghost-hand-right` assente fuori sessione e presente solo dopo ≥ 1,0 s di quiete dal primo fotogramma con la posa della testa, verificata a ≥ 1,5 s) e passo 1 adeguato (ricerca delle mani fantasma prima della sessione, subito dopo l'accettazione e dopo 4 s) — motivo: V1 era AMBIGUA nel report `qa/reports/M1-2026-10-05.md` (`step=pinch` esce al caricamento della pagina, 1,65 s prima del `miniature placed` di sessione; le mani fantasma compaiono solo in sessione).
- 2026-10-05: aggiunte le verifiche 9 e 10 (passi 10 e 11) per le due vie d'uscita con una mano implementate in M1: selezione di stanza al passo `two-hands` → `step=done` e mani fantasma sparite; nessuna azione → `step=done` per timeout 9,0 s dopo l'inizio del passo (3 × 3,0 s; verificato 781.45 → 790.45); la sezione Esito include ora anche 9 e 10 — motivo: comportamento nuovo (commit "let one-handed users finish the onboarding by selecting a room or after a timeout") non coperto dallo scenario, requisito di accessibilità a una mano di CLAUDE.md.
