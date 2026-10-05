# S1.4 · Budget grafico di M1 (draw call e triangoli)

**Milestone**: M1 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`); i valori in fps sono **solo informativi**
Prerequisiti di implementazione: T1.8, T1.9, T1.14 (vedi `docs/plans/M1.md`).

## Precondizioni
- Runtime headless. Headset a (0; 1,2; 0), mani.
- Due esecuzioni consecutive, cambiando `dev-params.local.txt` e facendo `browser_reload_page` tra l'una e l'altra:
  - **Esecuzione 0 (senza debug)**: `house=apartment-a&role=visitor&reset=1&seed=1`
  - **Esecuzione 1**: `house=apartment-a&role=visitor&reset=1&seed=1&debug=1`
  - **Esecuzione 2**: `house=apartment-b&role=visitor&reset=1&seed=1&debug=1`

## Passi
1. Esecuzione 0: `xr_accept_session`, `xr_set_input_mode` `mode: "hand"`, attesa 6 s, `browser_get_console_logs` con `pattern: "soglia:(stats|state)"`.
2. Esecuzione 1: stessa preparazione, attesa **7 s**, poi `browser_get_console_logs` con `pattern: "soglia:stats"`, `count: 50`.
3. `scene_get_render_stats` (registrare tutto: `calls`, `triangles`, `textures`, `geometries`, `programs`, `shadow casters`, campioni di tempo per fotogramma).
4. `browser_profile` con `action: "start"`, `mode: "rendering"`, `maxDurationMs: 5000`; attesa 5 s; `action: "stop"`. Registrare il tempo medio per fotogramma (informativo).
5. Caso peggiore: zoom massimo con la sequenza della fase C di `qa/scenarios/M1-two-hands.md` (passo 10, scala 0,12), attesa 3 s, di nuovo `browser_get_console_logs` con `pattern: "soglia:stats"`.
6. Esecuzione 2 (casa B): stessa preparazione dell'esecuzione 1, attesa 7 s, passi 2–3.
7. `browser_get_console_logs` senza filtro per ogni esecuzione (cercare `error`).

## Verifiche (tutte obbligatorie)
1. Esecuzione 0: **nessuna** riga `[soglia:stats]` né `[soglia:state]` (le statistiche compaiono solo con `debug=1`).
2. Esecuzioni 1 e 2: almeno 3 righe `[soglia:stats]` a circa 2 s di distanza, nel formato
   `[soglia:stats] fps=<n> calls=<n> views=<1|2> callsPerView=<n> triangles=<n> geometries=<n> textures=<n>`.
3. **Budget (decide l'esito)**, sull'ultima riga di ciascuna esecuzione e sulla riga dopo lo zoom massimo: `callsPerView` ≤ 100 e `triangles` ≤ 150 000. Nota: `callsPerView = calls / views`.
4. **Obiettivo interno di M1** (non decide l'esito, ma va riportato come AVVISO se superato): `callsPerView` ≤ 50 e `triangles` ≤ 20 000.
5. Coerenza con `scene_get_render_stats`: `calls` di quello strumento è uguale a `calls` della riga `[soglia:stats]` oppure a `callsPerView` (± 20 %); se non lo è, riportare entrambi i valori e la spiegazione ipotizzata (non decide l'esito).
6. `textures` ≤ 4 e nessuna texture oltre 1024 px (M1 non usa texture di contenuto; solo l'atlante dei font del pannello).
7. Nessuna voce `error` in console in nessuna esecuzione; nessuna ombra attiva (`shadow casters` = 0).
8. Il report include una tabella con `callsPerView`, `triangles`, `fps` e tempo per fotogramma per ogni esecuzione e dichiara in chiaro: "gli fps sul PC non rappresentano il Quest".

## Esito
PASS se le verifiche 1, 2, 3, 6 e 7 sono soddisfatte per entrambe le case · FAIL altrimenti. Gli avvisi della verifica 4 non fanno fallire ma vanno in `qa/device/DEBT.md` come "misurare sul Quest".

## Da rimandare al visore
fps reali ≥ 60 sul Quest con A e B, draw call e triangoli reali letti via debug remoto, tempo per fotogramma; temperatura/sostenibilità non richieste in M1.
