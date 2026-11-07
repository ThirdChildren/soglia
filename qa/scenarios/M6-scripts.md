# S6.4 · Script per il visore (`npm run quest:*`), senza visore

> **Changelog 2026-11-07**: scenario creato dal piano M6 (D69; T6.A9, T6.A11). Si esegue **senza visore e senza `adb` collegato** (anche sulla macchina cloud): tutto con `--dry-run` e con codici di uscita. I comandi `adb`/`metavr` stampati sono quelli **da verificare sul visore** (`docs/plans/M6.md`, R61–R63): qui si verifica la forma, non l'effetto. Questo scenario usa la shell, non gli strumenti MCP dell'emulatore.

**Milestone**: M6 (fase A) · **Tipo**: PC (shell) · **Regole di `CLAUDE.md`**: nessuna dipendenza pesante senza chiedere, tutto in inglese · Piano: `docs/plans/M6.md`.
Prerequisiti di implementazione: T6.A9 (e T6.A11 per il passo 9). Eseguire dalla radice del repository.

## Passi
1. **`quest:check`**. `npm run quest:check -- --dry-run` stampa i comandi che eseguirebbe (`adb devices -l`, `adb reverse --list`, lo stato del server) e termina con codice 0 senza eseguirli. `npm run quest:check` (senza dry-run) su un PC **senza visore** termina con codice ≠ 0 e **un messaggio in inglese** che dice cosa manca (`adb` non trovato oppure nessun dispositivo autorizzato) e cosa fare (rimando a `docs/QUEST_SETUP.md`); nessuna traccia dello stack.
2. **`quest:reverse` e `quest:unreverse`**. `npm run quest:reverse -- --dry-run --serial TEST123` stampa `adb -s TEST123 reverse tcp:8081 tcp:8081`; `quest:unreverse` stampa `adb -s TEST123 reverse --remove tcp:8081`. Senza `--serial` e con la porta letta da `dev status` o da `--port`: la porta è sempre quella dello stato, mai fissa a 8081 se il server dice altro (`--port 8082` si riflette nel comando).
3. **`quest:open`**. `npm run quest:open -- smoke --dry-run --serial TEST123` stampa un comando `adb -s TEST123 shell am start -a android.intent.action.VIEW -d "https://localhost:8081/?…"` con l'URL tra virgolette; `--mode vr` stampa il lancio in VR (`am broadcast -n com.oculus.vrshell/.ShellControlBroadcastReceiver -a com.oculus.vrshell.intent.action.LAUNCH -d apk://com.oculus.browser -e uri "ovrweb://vr?uri=<URL codificato>"`) con l'URL interno **codificato** (`?` → `%3F`, `&` → `%26`, `:` → `%3A`, `=` → `%3D`: nessun `&` o `?` nudo dopo `uri=`). Un URL completo come argomento (`https://localhost:8081/?debug=1`) è accettato; un URL con host diverso da `localhost` o dall'IP di rete è rifiutato con un messaggio chiaro.
4. **Preset sconosciuto**. `npm run quest:open -- nope --dry-run`: codice ≠ 0, messaggio `unknown preset` con l'elenco dei preset validi.
5. **Due dispositivi**. Con un `adb` finto in una cartella temporanea del PATH (script di shell che stampa due seriali `AAA111 device` e `BBB222 device` per `devices -l`): `npm run quest:check` e `quest:open -- smoke` **si fermano** con un messaggio che chiede `--serial` e non scelgono; con `--serial BBB222` procedono. (Il test unitario `pickSerial` lo dimostra; qui lo si vede con la CLI.)
6. **`quest:links` e i preset**. `npm run quest:links` stampa tutti i preset di `qa/device/presets.json` (almeno `smoke`, `a-clean`, `b-clean`, `tenant`, `landlord`, `agent`, `sun-winter-10`, `sun-summer-14`, `contrast-text`, `grip`, `perf-worst`, `resume`) con l'URL completo e scrive `qa/device/links.md` (file in inglese). `npm test -- quest-scripts` è verde e prova che **ogni query di preset** passa `parseParams` e `parseTuningText` **senza alcun avviso** e che `resume` non contiene `reset=1`.
7. **`quest:tune`**. `npm run quest:tune -- longPress=1.1 palmOpenHold=0.6` scrive in `tuning.local.txt` esattamente `t_longPress=1.1&t_palmOpenHold=0.6` (una riga, a capo finale); `npm run quest:tune -- --clear` cancella il file; `npm run quest:tune -- bogus=1` esce con codice ≠ 0, messaggio `unknown tuning name` con l'elenco, e **non** tocca il file; un valore fuori limite si scrive com'è (il clamp è dell'app) ma lo script avvisa. `git check-ignore tuning.local.txt` → ignorato.
8. **`quest:console`, `quest:perf`, `quest:capture`, `quest:preview`, `quest:serve`** con `--dry-run`: `quest:console` dice quale canale userebbe (protocollo di debug se `typeof WebSocket === 'function'`, altrimenti `adb logcat`) e dove scriverebbe (`qa/device/logs/<data>.log`); `quest:perf -- --seconds 10` stampa `npx metavr perf capture --app com.oculus.browser --mode vr --duration 10000` (sottocomando e flag **da verificare** con `npx metavr perf --help`: se l'ingegnere ha scelto altro, vale quello scritto in "Esiti" di `docs/plans/M6.md`) e la cartella `qa/device/traces/`; `quest:capture -- shot` e `-- video` stampano il comando di `npx metavr capture`; `quest:preview` stampa la sequenza `npm run build` + `vite preview` sulla porta 4173; `quest:serve` stampa `npx @iwsdk/cli dev up --no-open`. Nessuno di questi esegue `adb` o `metavr` col `--dry-run`.
9. **Pagina di avvio** (T6.A11; ➖ se tagliato). `npm run quest:links` crea `public/dev/quest.html` (in inglese, solo HTML e CSS, link grandi uno per preset); `npm run build` e poi: `dist/dev/` **non esiste**, `dist/qa/` e `dist/scripts/` non esistono; il file generato è ignorato da git.
10. **Igiene della build**. `npm run build` verde; in `dist/` nessun file `tuning.local.txt`, `presets.json`, `links.md`, `quest.html`.
11. **Dipendenze**. `git diff -- package.json` (o confronto con `jq`): cambia **solo** la sezione `scripts` (aggiunte `quest:*`); `dependencies` e `devDependencies` identiche a M5; `package-lock.json` invariato.
12. **Lingua e accenti**. `grep -rnE "[àèéìòù]" scripts/ qa/device/presets.json public/dev 2>/dev/null` → nessuna riga (script, preset e pagina sono in inglese; i commenti includono).
13. **Coerenza con la guida**. Ogni `quest:<nome>` citato in `docs/QUEST_SETUP.md` (sezione 11) esiste in `package.json`, e ogni nome `t_<nome>` della tabella della sezione 11.2 esiste nella tabella di `src/logic/tuning.ts` (i nomi opzionali non cablati sono tolti dalla guida da T6.A12). Comando suggerito: `grep -o "quest:[a-z]*" docs/QUEST_SETUP.md | sort -u` confrontato con `jq -r '.scripts | keys[]' package.json | grep quest`.

## Verifiche (tutte obbligatorie)
1. **Passo 1**: dry-run con codice 0; senza visore, codice ≠ 0 con messaggio inglese e senza stack.
2. **Passi 2–3**: comandi stampati esatti (seriale, porta, virgolette, codifica dell'URL).
3. **Passo 4**: `unknown preset` con elenco.
4. **Passo 5**: con due dispositivi non sceglie.
5. **Passo 6**: tutti i preset validi e senza avvisi; `resume` senza `reset=1`.
6. **Passo 7**: formato esatto del file, `--clear`, nome sconosciuto rifiutato, file ignorato da git.
7. **Passo 8**: nessun comando reale eseguito in dry-run; flag di `metavr` annotati come "da verificare".
8. **Passi 9–10**: la build non contiene nulla di tutto ciò (9 solo se T6.A11).
9. **Passo 11**: nessuna dipendenza nuova.
10. **Passi 12–13**: niente italiano; la guida e `package.json`/la tabella dicono gli stessi nomi.
11. **Solo visore** (alta): ogni comando stampato funziona davvero (R61–R63): `adb reverse`, `am start`, `ovrweb://vr?uri=`, il socket di debug remoto, `metavr perf capture`, `metavr capture`.

## Esito
PASS se le verifiche 1–8, 10 e 11 (9 se T6.A11 c'è) sono soddisfatte · FAIL altrimenti.

## Da rimandare al visore
Voce "Script `quest:*`" di `docs/plans/M6.md`; S0 di fase B.
