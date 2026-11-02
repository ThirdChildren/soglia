# S4.2 · Nota vocale (opzionale) e assenza di pulsanti morti

> **Changelog 2026-11-02**: scenario creato dal piano M4 (D40, T4.15). Vale la parte A **sempre**; la parte B solo se T4.15 è stato eseguito.

**Milestone**: M4 · **Tipo**: PC (emulatore IWER via MCP) · **Regole di `CLAUDE.md`**: 5 (feature detection con alternativa), 1, 10
Prerequisiti di implementazione: T4.7 (parte A); T4.15 (parte B). Vedi `docs/plans/M4.md`, D40, "Il problema del testo con le sole mani". Convenzioni: `qa/scenarios/M4-issue-create.md`.

## Precondizioni
- `dev-params.local.txt` = `house=apartment-a&role=tenant&reset=1&seed=1&debug=1&pinch=grip&time=2026-11-04T10:00`; preparazione standard. Chrome desktop espone `MediaRecorder` e `navigator.mediaDevices.getUserMedia`, ma **senza microfono** nell'ambiente headless `getUserMedia` fallisce (`NotFoundError`); il Quest Browser può non averli: l'app deve funzionare in entrambi i casi.

## Parte A · senza T4.15 (obbligatoria)
1. Aprire una bozza dalla lavatrice (S4.1 passo 2) e `ui_inspect` sul pannello; `ecs_find_entities` con `^ui:issue-(voice|record|note)` (→ 0).
2. Completare la segnalazione con una frase e `ui:issue-report` (S4.1 passi 3–4).
3. Log `pattern: "voice|audio|microphone|keyboard|feature"` e log senza filtro.

**Verifiche A**: nessuna entità `ui:issue-voice*`, `ui:issue-record*`, `ui:issue-note*`; nessun testo `Record`/`Voice`/`Note` nel pannello; la segnalazione si completa con le sole frasi; nessuna richiesta di permesso al microfono; nessuna riga `error`. È un PASS pieno: la voce non è una funzione promessa.

## Parte B · con T4.15 (solo se eseguito)
1. **Con le API presenti** (Chrome): la bozza mostra `ui:issue-voice` (testo `Record`, ≥ 2,4 cm). Pizzico → log `voice permission requested`; senza microfono: `voice unavailable reason=NotFoundError` e **il pulsante sparisce** dalla bozza (nessun errore, la segnalazione si completa con la frase).
2. **Con un microfono virtuale** (`--use-fake-device-for-media-stream`, se l'ambiente lo consente): `voice recording start`, attesa 2 s, `voice recording stop bytes=<n>`; la segnalazione creata ha `audio` (percorso logico `idb:issue-014`), nel dettaglio compare `ui:issue-voice-play`; la nota si salva in IndexedDB (riga `voice saved key=issue-014`), non in `localStorage`.
3. **Senza le API** (non riproducibile in Chrome): coperto da un test unitario di `hasVoiceSupport(globalThis)` con un oggetto finto.
4. `reset=1` cancella anche la nota (`state cleared reason=reset keys=<n> idb=<m>`).

**Verifiche B**: i passi 1–4 con le righe indicate; nessuna registrazione parte senza un pizzico esplicito; nessun `error`; la privacy: nessun dato lascia il browser (nessuna richiesta di rete).

## Esito
Parte A PASS sempre; parte B PASS solo se T4.15 è fatto e i passi 1, 3 e 4 sono soddisfatti (il passo 2 solo se l'ambiente ha un microfono virtuale, altrimenti "non provabile" e voce in `DEBT.md`).

## Da rimandare al visore
Microfono e `MediaRecorder` nel Quest Browser (consenso, qualità, comodità); voce in `qa/device/DEBT.md` (bassa).
