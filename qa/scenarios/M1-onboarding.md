# S1.6 · Onboarding con la mano fantasma (senza testo)

**Milestone**: M1 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`)
Scenario aggiunto dal pianificatore. Prerequisito: T1.13. Se T1.13 slitta a M2 (decisione dell'utente) questo scenario è BLOCKED e fuori dal gate di M1.

## Precondizioni
- Runtime headless; `dev-params.local.txt` = `house=apartment-a&role=visitor&reset=1&seed=1&debug=1`; `browser_reload_page`.
- Headset a (0; 1,2; 0); `xr_accept_session`; `xr_set_input_mode` `mode: "hand"`.
- Le mani restano **lontane dal plastico** e senza pizzico: `hand-left` a (−0,40; 1,40; 0,20), `hand-right` a (0,40; 1,40; 0,20), select a 0.
- **O** = origine letta dall'ultima riga `miniature placed`.

## Passi
1. Dopo `xr_accept_session`, attendere 4 s. `browser_get_console_logs` con `pattern: "onboarding|miniature placed"`.
2. `ecs_find_entities` con `namePattern: "^ui:ghost-hand-"`.
3. `browser_screenshot` → allegare (mano fantasma sopra il plastico).
4. Primo pizzico: `hand-right` a (Ox; Oy + 0,10; Oz + 0,10), `xr_select` con `device: "hand-right"`, `duration: 0.2`. Attesa 1 s. `browser_get_console_logs` con `pattern: "onboarding"`; `ecs_find_entities` con `namePattern: "^ui:ghost-hand-"`.
5. `browser_screenshot` → allegare (due mani fantasma).
6. Gesto a due mani: fase A di `qa/scenarios/M1-two-hands.md` (passi 1–5, mani a ±0,15 m → ±0,25 m, poi rilascio). Attesa 1 s. `browser_get_console_logs` con `pattern: "onboarding"`; `ecs_find_entities` con `namePattern: "^ui:ghost-hand-"`.
7. `browser_reload_page` (stessi parametri), `xr_accept_session`, attesa 4 s. `browser_get_console_logs` con `pattern: "onboarding"`.
8. Controllo sulle stringhe, da riga di comando: `grep -n -i "onboard\|ghost\|hand" src/ui/strings.ts`.
9. `browser_get_console_logs` senza filtro (`error`).

## Verifiche (tutte obbligatorie)
1. Passo 1: `[soglia] onboarding step=pinch` compare **dopo** `miniature placed` e entro 4 s da esso (ritardo previsto: 1,0 s di inattività).
2. Passo 2: esattamente 1 entità, `ui:ghost-hand-right`; **nessuna** `ui:ghost-hand-left`.
3. Passo 4: compare `[soglia] onboarding step=two-hands`; ora esistono `ui:ghost-hand-left` **e** `ui:ghost-hand-right` (2 entità).
4. Passo 6: compare `[soglia] onboarding step=done`; la ricerca restituisce **0** entità `ui:ghost-hand-*`.
5. Passo 7: dopo il ricaricamento la sequenza ricomincia (`step=pinch`): in M1 non c'è persistenza (arriva in M4; questa verifica va invertita in S4.4 quando `prefs.onboardingStep` verrà salvato).
6. Passo 8: nessuna riga trovata che contenga testo di onboarding (l'onboarding è senza testo); eventuali corrispondenze sono solo nomi di funzioni/chiavi e non frasi visibili.
7. Nessuna voce `error` in console. Nessun uso di controller (`xr_set_input_mode` resta `hand`).
8. Gli screenshot mostrano (descrizione a parole nel report): la mano fantasma sopra il plastico, poi due mani; **nessun testo** sovrapposto.

## Esito
PASS se le verifiche 1–7 sono soddisfatte · FAIL altrimenti.

## Da rimandare al visore
La mano fantasma si capisce senza spiegazioni da una persona che non conosce l'app; dimensione, distanza e velocità dell'animazione; non disturba il campo visivo stretto dei Meta VR Glasses (voci M1 in `qa/device/DEBT.md`).
