# S6.3 · Sonda delle funzioni del browser (`[soglia:env]`)

> **Changelog 2026-11-07**: scenario creato dal piano M6 (D65, D70; T6.A5). In IWER la sonda **non può** dimostrare cosa c'è nel Quest Browser: qui si verifica che la riga esista, sia ben formata, **non lanci eccezioni**, **non richieda alcuna sessione né funzione opzionale** e riconosca l'emulatore (il caso positivo di `iwer=yes`; il caso `iwer=no` è solo visore).

**Milestone**: M6 (fase A) · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`) · **Regole di `CLAUDE.md`**: 5 (feature detection sempre, con alternativa) · Piano: `docs/plans/M6.md`.
Prerequisito di implementazione: T6.A5. Convenzioni: `qa/scenarios/M5-gate-notes.md`.

## Precondizioni
- `BASE` = `house=apartment-a&role=visitor&reset=1&seed=1&debug=1&pinch=grip`.
- Preparazione standard di M5 (file, `browser_reload_page`, `xr_accept_session`, `xr_set_input_mode {mode: "hand"}`, attesa 4 s).

## Passi
1. **Prima della sessione**. Scrivere `BASE`, ricaricare **senza** accettare la sessione. `xr_get_session_status` → `sessionActive: false`, `sessionOffered: true`. Log `pattern: "soglia:env"`: una riga `[soglia:env] ua=… iwer=… secure=… storage=… vr=… ar=… hand=… anchors=… hitTest=… planes=… meshes=… speech=… mediaRecorder=… getUserMedia=… virtualKeyboard=… startMs=…`.
2. **Formato**. Ogni campo ha un valore del suo tipo: `ua` senza spazi né markup, lunghezza ≤ 40 (in IWER `HeadlessChrome/<versione>` o simile); `iwer`, `secure`, `vr`, `ar` ∈ {`yes`, `no`, `n/a`}; `storage` ∈ {`ok`, `blocked`, `missing`}; le funzioni ∈ {`yes`, `no`, `iface`, `n/a`} (`iface` = l'interfaccia c'è, il funzionamento non è provato); `startMs` numero > 0.
3. **Caso positivo di IWER**. `iwer=yes` e `storage=ok` (il progetto salva in `localStorage`: la sonda scrive e rilegge una chiave di prova e **la cancella**; `ecs`/log non devono mostrare residui; controllare che le chiavi `soglia:v1:state:*` non siano state toccate: la riga `state saved` dello scenario precedente resta uguale).
4. **Nessun effetto collaterale**. Dopo la riga, `xr_get_session_status` ancora `sessionActive: false` (la sonda non ha chiamato `requestSession`); nessun permesso richiesto; nessuna richiesta di rete (log di rete assente o invariato).
5. **Sessione**. `xr_accept_session`, mani, attesa 4 s. Log `pattern: "soglia:env"`: una seconda riga `[soglia:env] session mode=immersive-vr features=<elenco> space=<tipo> frameRate=<n|n/a> rates=<elenco|n/a> views=<1|2> inputs=<elenco>`; i dati non disponibili sono `n/a`, mai `undefined`/`NaN`/vuoto; compare **una sola volta** per sessione (dopo `xr_end_session` e nuova sessione, una nuova riga).
6. **Senza `debug=1`**. `house=apartment-a&reset=1&seed=1` (nessun `debug`): nessuna riga `[soglia:env]`.
7. **Con funzioni mancanti** (provato dai test unitari `env-probe.test.ts`, non qui): la riga con tutte le interfacce `undefined`, un `isSessionSupported` che non si risolve entro 1,5 s e un `localStorage` che lancia produce una riga valida con `n/a`/`blocked`. Il gate cita `npm test` e il numero di test del file.
8. Log senza filtro (`error`, `uncaught`, `Cannot read`, `Missing glyph`): nessuna riga; pulizia.

## Verifiche (tutte obbligatorie)
1. **Passo 1**: la riga `[soglia:env]` esiste prima della sessione, con tutte le chiavi elencate.
2. **Passo 2**: tipi e vincoli dei campi (nessun `undefined`/`NaN`).
3. **Passo 3**: `iwer=yes` in IWER; `storage=ok`; nessun residuo della chiave di prova.
4. **Passo 4**: la sonda non ha aperto sessioni né chiesto permessi (`sessionActive: false` prima dell'accettazione).
5. **Passo 5**: riga `session` con i campi del contratto, una per sessione.
6. **Passo 6**: assente senza `debug=1`.
7. **Passo 7**: `npm test` verde con i test della sonda (≥ 15).
8. Console: 0 `error`, 0 `warn` della sonda.
9. **Solo visore** (alta): `iwer=no`; `ua=OculusBrowser/<versione>`; quali interfacce esistono davvero (`hand`, `anchors`, `hitTest`, `planes`, `meshes`), `speech`, `mediaRecorder`, `getUserMedia`, `virtualKeyboard`; `frameRate`/`rates` della sessione; `views=2`; `startMs` (avvio a freddo < 10 s è un'altra misura: dalla pressione del link al plastico visibile).

## Esito
PASS se le verifiche 1–8 sono soddisfatte · FAIL altrimenti.

## Da rimandare al visore
Voce "`[soglia:env]` sul Quest Browser" di `docs/plans/M6.md`; la sessione S0 di fase B la chiude.
