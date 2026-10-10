# Smoke test IWER nel cloud — 2026-10-10

Ambiente: macchina cloud Linux, runtime già avviato headless (`dev up --ai-mode agent --headless`, porta 8081,
SwiftShader = rendering software). Strumenti MCP `xr_*`/`browser_*`/`ecs_*` non disponibili in sessione:
usata la CLI `npx @iwsdk/cli`. Nessun codice dell'app modificato. Parametri: `house=apartment-a&reset=1&debug=1`
tramite `dev-params.local.txt` (ignorato da git).

## Esito per passo

| # | Passo | Esito | Verifica |
|---|---|---|---|
| 0 | `dev status` | PASS | `"browserConnected": true`, `"browserCommandReady": true` |
| 1 | Sessione XR: stato + accettazione | PASS | prima `sessionActive: false`, `sessionOffered: true`; dopo `xr enter` → `"sessionActive": true`, `"sessionMode": "immersive-vr"`, `enabledFeatures: ["local-floor","bounded-floor","hand-tracking","viewer","local"]` |
| 2 | Input a mani | PASS | `xr set-input-mode {"mode":"hand"}` → `"activeDevices": ["hand-left","hand-right"]` |
| 3 | App viva (S1.1) | PASS | `ecs find ^house:` → `house:apartment-a` (entityIndex 13); `^room:` → 5 entità; `^wall:` → 13 entità. Log: `[soglia] house loaded apartment-a rooms=5 walls=13 doors=5 windows=7` |
| 4 | Console senza errori | PASS | buffer di 43 righe (`count: 200`, nessun filtro): 38 `log` + 5 `info` (navigazioni), **0 `error`, 0 `warn`**; riverifica a fine prova con filtro error/warn: `"result": []` |
| 5 | Screenshot | PASS | `qa/reports/cloud-smoke-2026-10-10.png` (800x800, 45 KB) |
| 6 | Report | PASS | questo file |

## Log citati (dopo il reload con `dev-params.local.txt`)

```
[soglia] params source=dev-file house=apartment-a role=visitor reset=true seed=1 debug=true time=-
[soglia:state] {"version":1,"houseId":"apartment-a","role":"visitor","miniature":{"scale":0.05,"yawDeg":0,"offset":[0,0]},"selectedRoomId":null,"prefs":{"onboardingStep":"pinch","menuOpened":false},"furniture":[],"nextInstance":{},"historyLength":0}
[soglia] hand visuals: local models
[soglia] controller visuals: local shape
[soglia] font ready family=inter weight=normal atlas=512x512 glyphs=111
[soglia] font ready family=inter weight=bold atlas=512x512 glyphs=111
[soglia] world ready
[soglia] catalog loaded items=16 furniture=14 mobility=2
[soglia] miniature placed x=0.000 y=0.950 z=-0.450 yawDeg=0.0 scale=0.0500
[soglia] house loaded apartment-a rooms=5 walls=13 doors=5 windows=7
[soglia] onboarding step=pinch
[soglia] furniture models loaded=14 fallback=0
[soglia] miniature placed x=0.000 y=1.350 z=-0.450 yawDeg=0.0 scale=0.0500   (dopo l'ingresso in XR)
```

Statistiche (`[soglia:stats]`), fuori sessione XR e poi in XR:

```
[soglia:stats] fps=5 calls=25 views=1 callsPerView=25 triangles=1468 geometries=37 textures=3
[soglia:stats] fps=6 calls=70 views=2 callsPerView=35 triangles=21592 geometries=46 textures=5
[soglia:stats] fps=8 calls=70 views=2 callsPerView=35 triangles=21592 geometries=46 textures=5   (ultima riga letta)
```

Budget CLAUDE.md (≤ 100 draw call, ≤ 150k triangoli): 70 draw call totali (35 per vista), 21.592 triangoli → entro il budget
(indicativo; solo plastico + onboarding, casa vuota). Gli fps (5–9) non sono significativi (SwiftShader).

Nota sul buffer: contiene anche il primo caricamento, precedente alla scrittura del file, con
`[soglia] params source=default house=apartment-a role=visitor reset=false seed=1 debug=false time=-`.
Il passaggio a `source=dev-file` conferma che il canale D1 funziona nel cloud.

Screenshot (in sessione XR, mani attive): si vede dall'alto il plastico bianco/grigio della casa con i pavimenti in legno
sul tavolo scuro, sotto un cielo sfumato azzurro, con i due contorni bianchi delle mani fantasma ai lati e un oggetto
azzurro semitrasparente al centro (presumibilmente l'indicazione dell'onboarding "pinch", non verificato).

## Comandi CLI esatti che hanno funzionato (per docs/SETUP_CLOUD.md)

Da `/home/user/soglia`:

```bash
npx @iwsdk/cli dev status                                   # controllare browserCommandReady: true
echo "house=apartment-a&reset=1&debug=1" > dev-params.local.txt
npx @iwsdk/cli browser reload --input-json '{}'             # ricarica e rilegge dev-params.local.txt
npx @iwsdk/cli xr status --input-json '{}'
npx @iwsdk/cli xr enter --input-json '{}'                   # = xr_accept_session (NON "accept-session")
npx @iwsdk/cli xr set-input-mode --input-json '{"mode":"hand"}'
npx @iwsdk/cli ecs find --input-json '{"namePattern":"^house:"}'   # idem "^room:" (5) e "^wall:" (13)
npx @iwsdk/cli browser logs --input-json '{"count":200}'
npx @iwsdk/cli browser logs --input-json '{"count":200,"level":["error","warn"]}'
npx @iwsdk/cli browser logs --input-json '{"count":200,"pattern":"soglia:stats"}'
npx @iwsdk/cli browser screenshot --input-json '{}' --output-file /home/user/soglia/qa/reports/cloud-smoke-2026-10-10.png
```

## Differenze rispetto al flusso MCP

- Nomi delle azioni diversi: `xr enter` (non `accept-session`), `browser logs`, `browser reload`, `ecs find`, `ecs systems`.
  Mappatura MCP → CLI nell'help di ogni azione (`... --help`, riga "MCP tool:").
- Ogni comando è un processo `npx` separato: l'output è una busta JSON `{"ok":..., "data":{"result":...}}`.
  `--raw` dà il risultato grezzo; `--output-file` per gli screenshot (altrimenti file temporaneo in `data.screenshotPath`).
- `browser logs` restituisce JSON molto verboso (ogni riga con args/frameUrl/ecc.; il banner IWSDK è multilinea):
  conviene salvare l'output in un file e filtrarlo (`python3 -I`) o usare `pattern`/`level`.
- Non ci sono statistiche di profilo né `ecs snapshot/diff` provati in questa smoke (non richiesti).

## Tempi osservati

- Avvio runtime (log di `dev status`): lancio browser 09:10:38 → `running` 09:11:02 (~24 s).
- App dopo il reload: `world ready` ~4,5 s dopo la navigazione; scena completa (modelli mobili) ~5,5 s.
- `dev status` ~1 s; `xr status`/`xr enter` ~1 s; `browser reload` ~3,3 s; `browser screenshot` ~5,6 s (SwiftShader).

## Trappole

1. Scrivere `dev-params.local.txt` NON basta: serve `browser reload` dopo la scrittura (altrimenti resta `source=default`).
2. L'ordine corretto è reload → `xr enter` → `set-input-mode`: il reload chiude la sessione XR (`sessionOffered: true` di nuovo).
3. Nel buffer dei log restano le righe del caricamento precedente al reload: leggere per timestamp o per `source=dev-file`.
4. `dev-params.local.txt` è rimasto nella radice (ignorato da git, `.gitignore:48`): cancellarlo o riscriverlo prima della prova successiva.
5. L'help di `xr` senza azione esce con `ok:false` / `cli_error` (è solo l'elenco delle azioni, non un errore reale).

## Cosa l'emulatore headless con SwiftShader NON dimostra

- fps e tempo per frame reali (qui 5–9 fps con rendering software), quindi nemmeno il 60/72 fps su Quest;
- precisione e comfort del tracciamento delle mani reali, pizzico reale, affaticamento da seduti;
- passthrough/MR reali, appoggio sul tavolo, plane/mesh detection, ancore;
- microfono e riconoscimento vocale;
- draw call/triangoli sul Quest (qui contati sul renderer desktop, utili come indicazione di regressione);
- aspetto reale di colori, ombre e testo sui display del visore; campo visivo dei Meta VR Glasses;
- percezione di scala/profondità in stereo reale (qui 2 viste emulate, screenshot monoscopico 800x800).

Nessuna di queste è una prova "sul visore": restano debito per `qa/device/DEBT.md`.
