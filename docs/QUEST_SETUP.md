# Soglia sul Meta Quest 3S: guida per l'utente (Fedora)

Guida pratica per mettere Soglia sul visore appena arriva (martedì 10 novembre 2026), dal PC
Fedora, senza Windows, senza Meta Quest Link e senza Meta Quest Developer Hub: si usano `adb`,
Chromium e la Meta VR CLI. È un documento di lavoro per te, non per i giudici.

Stato delle verifiche (scritta il 2026-11-07, prima dell'arrivo del visore):

- **Verificato nel repository** (script, porte, URL, comandi della CLI): lo trovi indicato come tale.
- **Da verificare**: tutto ciò che dipende dal visore, dai menu di Meta o da pacchetti Fedora che
  non ho potuto provare. Dove un nome di menu o un comando potrebbe essere cambiato, c'è scritto
  "da verificare". Se qualcosa non corrisponde, fidati della pagina ufficiale e segnalalo.
- Le pagine ufficiali (IWSDK "Testing Your Experience", documentazione Meta) non erano raggiungibili
  dalla sessione in cui ho scritto questa guida: i passi su Meta e adb vengono dalla conoscenza
  generale e dai file del progetto, non da una lettura di quelle pagine oggi.

Documenti collegati (non li ripeto, li richiamo):

| Documento | A cosa serve |
|---|---|
| `docs/DEVICE_CHECKLIST.md` | la checklist completa per milestone, da eseguire sul visore |
| `qa/device/DEBT.md` | le prove rimandate (una riga per voce, con priorità) |
| `docs/ROADMAP.md` (sezione M6) | gate e calendario dell'integrazione con il visore |
| `.claude/agents/quest-integrator.md` | l'agente che esegue il gate visore con te |
| `.claude/skills/iwsdk-native-xr-test/SKILL.md` | prova guidata da Claude sul visore reale (vedi sezione 10) |
| `docs/SETUP_CLOUD.md` | **non** vale per il PC Fedora: è per le sessioni cloud (headless, niente visore) |

Chi fa cosa: **tu** fai le azioni fisiche (indossare il visore, accettare i permessi, pizzicare);
Claude (agente `quest-integrator`) prepara, legge log e misure e scrive il report.

---

## 1. Prerequisiti su Fedora

### 1.1 Node.js

Il progetto richiede Node 22.12 o più recente (`.nvmrc` dice `22.12.0`; il campo `engines` di
`package.json` accetta anche 20.19+ e 24+). Controlla prima cosa hai già:

```bash
node --version
npm --version
```

Se manca o è troppo vecchio, la via più semplice è `nvm`, che legge `.nvmrc` da solo:

```bash
# controlla l'ultima versione di nvm su https://github.com/nvm-sh/nvm e sostituisci v0.40.3 se serve
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
```

Chiudi e riapri il terminale, poi:

```bash
cd ~/soglia        # il percorso reale della tua copia del repository
nvm install        # installa la versione indicata da .nvmrc
nvm use
node --version     # deve stampare v22.12.0 o più recente
```

In alternativa, dai pacchetti di Fedora: `sudo dnf install nodejs npm` (la versione dipende dalla
tua release di Fedora: controllala con `node --version`; da verificare).

### 1.2 git, adb (android-tools), jq

```bash
sudo dnf install git android-tools jq
adb version
```

`jq` serve solo per leggere gli URL del server in modo comodo (sezione 4). Il pacchetto
`android-tools` contiene `adb`.

### 1.3 Permessi USB per il Quest (regola udev)

Il visore ha il vendor USB `2833`. Con `android-tools` recente i permessi potrebbero essere già a
posto (da verificare: `ls /usr/lib/udev/rules.d | grep -i android`). Se più avanti `adb devices`
non mostra il visore, o mostra `no permissions`, crea la regola a mano:

```bash
echo 'SUBSYSTEM=="usb", ATTR{idVendor}=="2833", MODE="0660", TAG+="uaccess"' \
  | sudo tee /etc/udev/rules.d/51-quest.rules
sudo udevadm control --reload-rules
sudo udevadm trigger
```

Scollega e ricollega il cavo, poi riavvia il server di adb:

```bash
adb kill-server
adb start-server
```

`TAG+="uaccess"` dà il permesso all'utente che ha la sessione grafica aperta: non serve aggiungerti
a nessun gruppo.

### 1.4 Chromium o Chrome (debug remoto)

```bash
sudo dnf install chromium
```

Va bene anche Google Chrome (da installare dal suo repository). Serve per `chrome://inspect`
(sezione 5). Il Chromium "gestito" che il progetto apre da solo con `npm run dev` è un'altra cosa
(è l'emulatore sul PC) e non serve per le prove sul visore.

---

## 2. Preparare il codice

Dal repository, sul ramo `main`:

```bash
cd ~/soglia
git checkout main
git pull
```

```bash
npm ci
```

```bash
npm run typecheck
npm test
npm run build
```

Gli script reali sono in `package.json` (verificato): `dev`, `dev:runtime`, `dev:agent`,
`dev:collab`, `dev:down`, `dev:status`, `typecheck`, `test`, `build`, `preview`. Se uno dei tre
controlli sopra fallisce, **non** andare avanti: sistema prima il PC.

Il pacchetto `@meta-quest/metavr` (la Meta VR CLI) è già una dipendenza di sviluppo e `npm ci` lo
installa; il suo programma vero e proprio (il "binario") si scarica dalla CDN di Meta al primo uso
(sezione 5.3). Servono quindi internet e un PC senza proxy restrittivi.

---

## 3. Preparare il Quest 3S

### 3.1 Account e organizzazione sviluppatore (una volta, da fare presto)

1. Account Meta con il visore già configurato e collegato all'app **Meta Horizon** sul telefono
   (da verificare: il nome dell'app può cambiare).
2. Per attivare la modalità sviluppatore serve un'**organizzazione sviluppatore** sul sito
   `developers.meta.com` (si crea con lo stesso account; Meta può chiedere la verifica
   dell'account, ad esempio con l'autenticazione a due fattori: da verificare). **Falla prima di
   martedì**, dal PC o dal telefono: è il passo che più spesso blocca.

### 3.2 Modalità sviluppatore

Dall'app Meta Horizon sul telefono (nomi dei menu da verificare):

1. Apri l'app, vai tra i dispositivi e scegli il Quest 3S.
2. Impostazioni del visore, poi **Developer Mode**, e attivala.
3. Riavvia il visore.

### 3.3 Collegamento USB e debug USB

1. Collega il visore al PC con un cavo USB-C **che trasmetta dati** (non uno solo da ricarica).
2. Indossa il visore: compare la richiesta **Allow USB debugging**. Spunta "Always allow from this
   computer" e conferma. La richiesta compare solo a visore acceso e indossato.
3. Sul PC:

```bash
adb devices
```

Deve comparire una riga con il numero di serie e `device`. Se compare `unauthorized` o non compare
nulla, vedi la sezione 8. **Annota il numero di serie**: serve nel passo opzionale della sezione 10.

### 3.4 Mani, controller, browser

- **Tracciamento delle mani attivo** (nelle impostazioni del visore, sezione sul tracciamento dei
  movimenti, "Hand tracking"; nome da verificare). Per le prove di Soglia **appoggia i controller
  e spegnili**: con i controller accesi il visore può passare ai controller (e la regola 1 del
  progetto è che tutto si fa con le mani).
- **Quest Browser aggiornato** (impostazioni di sistema, aggiornamenti; da verificare dove). Una
  versione vecchia può non avere API come i giunti delle mani; annota la versione del browser nel
  report (in `chrome://inspect` o in `navigator.userAgent`).
- Siediti: il progetto è pensato per stare **da seduti**, con le interazioni entro circa 60 cm.

---

## 4. Aprire Soglia sul visore

Il server di sviluppo del progetto parte in **HTTPS** sulla porta **8081** con un certificato di
sviluppo autofirmato (verificato: `https://localhost:8081/`). WebXR richiede un "contesto sicuro":
`localhost` e `https` lo sono. Il certificato è autofirmato, quindi il Quest Browser mostrerà un
avviso la prima volta, anche su `localhost`: va accettato (sezione 4.3).

### 4.1 Avviare il server

Per le prove sul visore non serve la finestra dell'emulatore sul PC: avvia il server **senza aprire
il browser gestito**.

```bash
cd ~/soglia
npx @iwsdk/cli dev up --no-open
```

Il comando ritorna subito e il server resta in esecuzione in background (verificato). Per vederne i
log nel terminale puoi aggiungere `--foreground` (opzione elencata da `dev up --help`, non provata a
lungo).

Alternativa, con la finestra dell'emulatore (uguale al tuo uso solito): `npm run dev`
(= `iwsdk dev restart --open --foreground`, dal `package.json`).

Per leggere gli URL (il campo è `data.runtimeUrls`, verificato):

```bash
npx @iwsdk/cli dev status | jq '.data.runtimeUrls'
```

Esempio di risposta (l'IP sarà quello del tuo PC):

```json
{
  "local": "https://localhost:8081/",
  "network": [ "https://192.168.1.20:8081/" ]
}
```

Se la porta 8081 è occupata, il server può scegliere un'altra porta: **leggi sempre la porta
dallo status** e sostituiscila negli esempi qui sotto. Per fermare tutto:

```bash
npm run dev:down
```

### 4.2 Modo (a), consigliato: USB con `adb reverse`

Il visore collegato al PC vede il server del PC come `localhost`. Niente Wi-Fi, niente IP.

```bash
adb devices
adb reverse tcp:8081 tcp:8081
adb reverse --list
```

Poi, nel **Quest Browser** (dal visore), apri:

```
https://localhost:8081/?debug=1
```

Per non scrivere l'URL con la tastiera virtuale puoi lanciarlo dal PC (da verificare: l'intento
Android standard dovrebbe aprire il Quest Browser). **Attenzione alle `&`**: `adb shell` incolla gli
argomenti in una sola stringa e la shell **del visore** la rilegge, quindi il comando remoto deve
essere **un solo argomento tra apici singoli, con l'URL tra virgolette doppie** dentro. La forma senza
apici esterni (`adb shell am start ... -d "https://...&..."`) si rompe con le `&` (la parte dopo la
prima `&` diventa un comando in background):

```bash
adb shell 'am start -a android.intent.action.VIEW -d "https://localhost:8081/?house=apartment-a&debug=1"'
```

Lo script `npm run quest:open -- <preset>` (sezione 11) costruisce già il comando giusto.

Un altro modo per non digitare URL: i parametri possono stare nel file `dev-params.local.txt` nella
radice del progetto (ignorato da git, letto **solo dal server di sviluppo**; vedi sezione 6).

Il collegamento `adb reverse` si perde se scolleghi il cavo o riavvii adb: rifallo.

### 4.3 Il certificato

Alla prima apertura il Quest Browser mostra un avviso sulla connessione non privata. Scegli
l'opzione avanzata e prosegui verso `localhost` (il testo esatto è da verificare). Fallo una volta
per ogni indirizzo (`localhost` e l'IP di rete sono due siti diversi per il browser).

### 4.4 Modo (b): Wi-Fi con l'URL di rete

Utile se non hai il cavo sotto mano; è meno comodo per il debug. Visore e PC devono stare sulla
**stessa rete** (e la rete non deve isolare i dispositivi, come fanno molte reti ospiti).

1. Prendi l'URL `network` dallo status (sezione 4.1), ad esempio `https://192.168.1.20:8081/`.
2. Aprilo nel Quest Browser e accetta l'avviso del certificato.
3. Se non si apre: il firewall di Fedora potrebbe bloccare la porta. Prova (vale fino al riavvio del
   firewall):

```bash
sudo firewall-cmd --add-port=8081/tcp
```

Il server ascolta su tutte le interfacce (`host: '0.0.0.0'` in `vite.config.ts`, verificato).

### 4.5 L'emulatore non deve attivarsi sul visore

In sviluppo il server inietta l'emulatore IWER (quello che usi sul PC). Il plugin lo disattiva per
lo user agent `OculusBrowser` (impostazione di default del plugin, verificata nel codice; la voce
"IWER non si attiva su host non-localhost nella build di produzione" resta in `DEBT.md`). Sul
visore, quindi, non devono comparire i controlli dell'emulatore: se compaiono, annotalo come
problema.

### 4.6 Entrare in VR

`iwsdk.config.json` ha `xr.mode: "vr"`, `offer: "always"` e `handTracking: true` (verificato): la
pagina offre un pulsante per entrare in VR (di solito "Enter VR", nome da verificare). Premilo col
dito o con il puntatore del browser, e alla **prima volta** accetta il permesso WebXR (e quello del
tracciamento delle mani, se richiesto) dentro il visore.

---

## 5. Debug remoto, screenshot, registrazione

### 5.1 Console e prestazioni con `chrome://inspect`

Con il cavo collegato, il debug USB autorizzato e il Quest Browser con la pagina aperta:

1. Sul PC apri Chromium e vai a `chrome://inspect/#devices`.
2. Spunta "Discover USB devices". Il Quest compare con le sue schede aperte.
3. Sulla scheda di Soglia premi **inspect**: si apre DevTools con console, rete e prestazioni
   della pagina **sul visore**.

Nella console filtra per `[soglia` per vedere solo i log dell'app. Cosa aspettarsi (formato
verificato nel codice):

- `[soglia] params source=url house=apartment-a role=visitor reset=false seed=1 debug=true time=-`:
  conferma che i parametri dell'URL sono stati letti;
- `[soglia] hand visuals: local models`: le mani vengono dai modelli locali;
- `[soglia:stats] fps=72 calls=... views=2 callsPerView=... triangles=...` ogni 2 secondi con
  `debug=1`. In una sessione VR vera `views=2`;
- nel percorso normale **nessun `error`** in console.

Se il Quest non compare: sezione 8. Se compare ma non si può ispezionare durante la sessione
immersiva, annotalo (da verificare).

### 5.2 Screenshot e registrazione

- **Dal visore**: il pulsante Meta, poi la condivisione (foto e video). I file finiscono sul visore
  (cartelle tipo `/sdcard/Oculus/Screenshots` e `/sdcard/Oculus/VideoShots`: da verificare) e si
  copiano sul PC con `adb pull`:

```bash
adb pull /sdcard/Oculus/Screenshots ~/quest-shots
adb pull /sdcard/Oculus/VideoShots ~/quest-videos
```

- **Specchio sul PC con scrcpy** (comodo per le prove e per il video; il pacchetto potrebbe non
  essere nei repository base di Fedora e il ritaglio per mostrare un solo occhio è da verificare):

```bash
sudo dnf install scrcpy
scrcpy
```

- Ricorda per il video del concorso: niente persone riconoscibili né marchi nelle riprese.

### 5.3 Meta VR CLI (`metavr`)

Il progetto la include (`@meta-quest/metavr` in `package.json`, versione `^1.8.1`). Dalla radice:

```bash
npx metavr --help
```

Al **primo avvio scarica il suo programma dalla CDN di Meta** (non ho potuto provarlo: la mia
sessione non raggiungeva quella CDN, quindi i dettagli dei sottocomandi sono da verificare con
`--help`). Dalla documentazione del pacchetto, i gruppi di comandi sono: `device` (elenco, info,
batteria), `app`, `capture` (screenshot e registrazioni), `files`, `log` (logcat), `shell`, `perf`
(tracce Perfetto), `docs`, `adb`, `mcp`.

Esempi da provare (i nomi esatti dei sottocomandi e dei flag vanno controllati con `--help`):

```bash
npx metavr device --help
npx metavr capture --help
npx metavr perf --help
```

Per usarla da Claude Code come server MCP, la strada del progetto è:

```bash
npx @iwsdk/cli adapter sync
```

Crea `.mcp.json` (non committato) con i server `iwsdk-runtime`, `iwsdk-reference` e `metavr`; poi
riavvia Claude Code perché li carichi (vedi `docs/SETUP_CLOUD.md`, sezione 3, per le avvertenze
sui file che il comando crea). In alternativa il comando del pacchetto è `metavr mcp install
claude-code`. Le skill ufficiali di Meta sono facoltative.

---

## 6. Parametri URL utili

Letti da `src/logic/params.ts` (verificato). Un valore non valido torna al valore di default e
scrive un avviso in console. Se una chiave compare due volte vale la prima.

| Parametro | Valori | Default | Effetto |
|---|---|---|---|
| `house` | `apartment-a`, `apartment-b` | `apartment-a` | la casa da aprire |
| `role` | `visitor`, `agent`, `tenant`, `landlord` | `visitor` | il ruolo; se è nominato nell'URL batte quello salvato |
| `reset` | `1` / `0` | `0` | `1` ignora lo stato salvato (parti da zero) |
| `seed` | intero | `1` | seme per la logica deterministica |
| `time` | `2026-12-21T10:00` | ora attuale | ora del sole (anno entro i limiti del modulo del sole) |
| `debug` | `1` / `0` | `0` | statistiche a schermo e `[soglia:stats]` in console |
| `contrast` | `1` / `0` | salvato | alto contrasto; se nominato batte la preferenza salvata |
| `text` | `normal` / `large` | salvato | testo normale o grande (3,0 cm); se nominato batte il salvato |
| `pinch` | `auto` / `grip` / `joints` | `auto` | da dove si prende il punto di pizzico: giunti delle mani, o il "grip" (per confrontare) |
| `furnish` | `none` / `scandinavian` | `none` | parte con l'arredo di esempio (aiuto di sviluppo) |
| `mr` | `1` / `0` | `0` | letto ma **senza effetto**: la realtà mista è tagliata da M5 |
| `glyphs`, `failmodels`, `failmy`, `failcatalog` | `1` | `0` | aiuti per lo sviluppo; funzionano solo insieme a `debug=1`: non servono sul visore |
| `hud` | `1` / `0` | `1` con `debug=1` | `hud=0` spegne il pannello di statistiche nel visore (per le misure finali); senza `debug=1` è ignorato con un avviso |
| `t_<nome>` | numero | vedi sezione 11.2 | manopole di taratura (soglie del pizzico, raggi, palmo, distanze, timer, `foveation`, `fovMask`); solo con `debug=1` |

Il `?` iniziale e le `&` separano i parametri. L'ora si scrive con i due punti: `time=2026-12-21T10:00`.

**Attenzione a `reset=1`**: se resta nell'URL, ogni ricarica azzera lo stato. Per le prove di
pausa e ripresa **non** usarlo (o usalo solo la prima volta e poi riapri l'URL senza).

Le prove si possono anche dare via file: in sviluppo l'app legge `dev-params.local.txt` nella
radice del progetto (una riga, ad esempio `house=apartment-a&debug=1`, **senza** il `?`). Vale
sul visore solo se la pagina arriva dal server di sviluppo (non dalla build pubblica) e **un
parametro nell'URL vince su quello del file**. Cancellalo a fine prova.

URL pronti (con `adb reverse`; con il Wi-Fi sostituisci `https://localhost:8081` con l'URL di rete):

```
Avvio pulito, con statistiche:
https://localhost:8081/?house=apartment-a&role=visitor&reset=1&seed=1&debug=1

Senza reset (per la ripresa e per l'uso normale):
https://localhost:8081/?debug=1

Casa B:
https://localhost:8081/?house=apartment-b&reset=1&debug=1

Inquilino, per le segnalazioni:
https://localhost:8081/?house=apartment-a&role=tenant&reset=1&debug=1

Agente (punti informativi, Furnish e Clear):
https://localhost:8081/?house=apartment-a&role=agent&reset=1&debug=1

Sole del solstizio d'inverno, ore 10:
https://localhost:8081/?reset=1&debug=1&time=2026-12-21T10:00

Alto contrasto e testo grande:
https://localhost:8081/?reset=1&debug=1&contrast=1&text=large

Punto di pizzico dal grip (confronto con le mani vere):
https://localhost:8081/?debug=1&pinch=grip
```

---

## 7. Cosa provare: prova di fumo di 10-15 minuti

Scopo: capire in un quarto d'ora se **tutto il percorso base regge sul visore**. Non sostituisce la
checklist. Controlli e frasi attese vengono dai testi dell'app (`src/ui/strings.ts`) e dagli
scenari QA; sul visore possono differire nei dettagli, annotali.

Prima: controller spenti e messi via, seduto, `chrome://inspect` aperto sul PC con la console
filtrata su `[soglia`, URL con `debug=1`.

1. **Avvio.** Apri l'URL; accetta il certificato; premi il pulsante per entrare in VR. L'avvio a
   freddo dovrebbe stare sotto i 10 s (voce M0 di `DEBT.md`). Console: riga `params ...`.
2. **Mani.** Si vedono entrambe le mani (modelli locali), nessun controller, nessun errore. Controlla
   `hand visuals: local models`. Se l'app resta avviabile anche con il tracciamento delle mani
   spento è una voce a parte di `DEBT.md` (M0): annotala se la provi.
3. **Plastico e pizzico.** Il plastico (scala 1:20) sta a un'altezza e distanza comode da seduti.
   Pizzica una stanza: compare l'etichetta (ad esempio "Study · 12.0 m²"). Prova il pizzico a due
   mani: ruota e ingrandisce senza scatti. L'onboarding con la mano fantasma si capisce?
4. **Menu.** Apri il menu del palmo con una mano a palmo in su (prova sinistra e destra, senza aperture
   accidentali). Poi chiudilo e apri il menu con il pulsante "Menu" accanto al plastico (una mano
   sola).
5. **Arredare.** Prendi un mobile dal menu e posalo in una stanza; rilascialo. Ruotalo (torsione
   del polso, tocco dell'altra mano o pulsante "Rotate", che compare circa 12 s dopo la posa).
6. **Porta che blocca.** Metti un mobile davanti a una porta: deve diventare non valido con il
   motivo "Blocks the door".
7. **Mobili propri.** Scheda "Mine": porta il divano di esempio verso il soggiorno della casa A.
   Atteso, dagli scenari: "Won't fit: the door is 80 cm wide, the sofa's shortest side is 85 cm".
8. **Metro.** Scheda "Measure": pizzica due punti sulla finestra dello studio. Atteso circa 140 cm
   (errore ammesso ≤ 2 cm, voce M3 della checklist).
9. **Punto di vista.** Pizzica un pilastro blu (punto di vista V1): dissolvenza e stanza a scala
   reale (altezza occhi 1,2 m). Torna al plastico con il pulsante "Tabletop". Nessuna nausea? La
   dissolvenza dura troppo o troppo poco? (misure in `DEBT.md`, M3 e M5).
10. **Segnalazione.** Imposta il ruolo "Tenant" (pulsante "Issues", poi la casella del ruolo, oppure
    `role=tenant` nell'URL). **Pizzico prolungato** (circa 0,8 s) sulla lavatrice: scegli categoria e
    frase, "Report". Deve comparire un segnaposto e nessuno per sbaglio con i pizzichi normali.
11. **Ruoli.** Passa a "Landlord": elenco delle segnalazioni (ci sono dati di esempio, etichettati
    "Sample data"), "Take on", "Resolved". Passa ad "Agent": punti informativi, "Furnish" e "Clear".
12. **Sole.** Pulsante "View": cambia ora e mese; le chiazze di sole sul pavimento cambiano. Compare
    la dicitura "Simplified light".
13. **Accessibilità.** Nel pannello "View": "Contrast" On e "Text" Large; i testi restano leggibili e
    dentro il campo visivo. Prova qualche azione con **una sola mano**.
14. **Pausa e ripresa.** Togli il visore per circa 10 secondi e rimettilo: l'app riparte da dove l'hai
    lasciata (pezzi, ruolo, segnalazioni, punto di vista). Poi ricarica la pagina **senza `reset=1`**
    e controlla che ritrovi lo stesso stato.
15. **Prestazioni.** In `chrome://inspect` leggi le righe `[soglia:stats]` nei punti più pesanti
    (menu aperto con molti pezzi, Furnish appena premuto, scala reale con il sole): `fps` ≥ 60
    (obiettivo 72), `callsPerView` ≤ 100, `triangles` ≤ 150000. Annota il caso peggiore.

Se qualcosa va storto, **non** correggere il codice sul momento: annota il problema con i passi per
riprodurlo (è il lavoro di `quest-integrator`; il codice lo tocca poi `xr-engineer`).

### 7.1 Poi: prove complete e come annotare

- Elenco completo delle prove: `docs/DEVICE_CHECKLIST.md` (per milestone) e le righe di
  `qa/device/DEBT.md`. Ordine consigliato se il tempo è poco: prima le voci con priorità **alta**,
  per milestone da M1 a M5 (sono la maggior parte; Claude può ordinarle con te).
- Realtà mista: tagliata dalla demo e **fuori dal gate** (decisione D74 di `docs/plans/M6.md`, conferma
  di M5). La checklist è stata riallineata il 2026-11-07 (niente realtà mista, "chiazze di luce" al posto
  delle ombre, tastiera e microfono non applicabili).
- **Report**: un file per sessione in `qa/device/`, nome `M<n>-<AAAA-MM-GG>.md` (per la prova di
  fumo: `M6-2026-11-10.md`). Formato, come da `quest-integrator`:

```markdown
# Prova sul visore · <data>

Visore: Quest 3S · Quest Browser <versione> · PC Fedora <versione> · URL: <url usato>

## Voci della checklist
| Voce | Esito (OK / PROBLEMA / N/A) | Misura o nota |
|---|---|---|

## Misure
fps (min / tipico), callsPerView, triangoli, nei punti: <elenco>

## Problemi
1. <titolo> · passi per riprodurlo: ... · atteso / visto: ... · log: ...

## Raccomandazioni (in ordine di impatto)
1. ...
```

- Aggiorna la colonna "Esito sul visore" di `qa/device/DEBT.md` e lo stato Device-done in
  `docs/ROADMAP.md` **solo** per prove fatte davvero sul visore. Mai scrivere "funziona sul visore"
  per ciò che è stato provato solo nell'emulatore.
- Le soglie che vuoi cambiare (pizzico, distanze, altezza del plastico, testo) si **propongono** a
  `xr-engineer` con il valore misurato: non si cambiano di nascosto.

---

## 8. Problemi comuni

| Sintomo | Cosa fare |
|---|---|
| `adb devices` vuoto | cavo solo di ricarica o porta sbagliata: prova un altro cavo/porta; indossa il visore e guarda se compare la richiesta di debug USB; controlla la regola udev (1.3); `adb kill-server && adb start-server`; verifica che la modalità sviluppatore sia attiva e che il visore sia stato riavviato |
| `unauthorized` | indossa il visore e accetta "Allow USB debugging"; se non compare: `adb kill-server`, scollega e ricollega, e nel visore revoca le autorizzazioni USB di debug dalle impostazioni sviluppatore (da verificare dove), poi riprova |
| `no permissions` | regola udev mancante o non ricaricata (1.3); scollega e ricollega il cavo |
| `offline` | scollega e ricollega; `adb kill-server`; riavvia il visore |
| Chrome non vede il Quest in `chrome://inspect` | spunta "Discover USB devices"; chiudi altri programmi che usano adb (Android Studio, scrcpy) o fai `adb kill-server`; apri la pagina nel Quest Browser (deve essere una scheda aperta) |
| La pagina non si apre su `localhost` | manca `adb reverse` (rifallo, è per porta); il server non è acceso (`npx @iwsdk/cli dev status`); la porta è diversa da 8081 |
| Avviso del certificato | normale (certificato di sviluppo autofirmato): vai avanti dall'opzione avanzata; va rifatto per ogni indirizzo |
| Manca il pulsante per entrare in VR | controlla `chrome://inspect`: errori in console? verifica che l'URL sia `https`; ricarica dopo aver accettato il certificato; verifica che non sia comparso l'emulatore (4.5); se compare solo su `localhost` ma non sull'IP di rete, o viceversa, annotalo (sono contesti diversi); prova il modo USB. Che il browser supporti `immersive-vr` è da verificare con `navigator.xr.isSessionSupported('immersive-vr')` dalla console |
| Mani non rilevate | controlla che il tracciamento delle mani sia attivo nelle impostazioni del visore; **controller spenti e messi via**; buona luce, mani nel campo delle telecamere; esci dalla sessione e riprova. Prova `pinch=grip` o `pinch=joints` per capire se è il punto di pizzico |
| Porta già occupata (8081) | un altro `dev up` è ancora attivo: `npm run dev:down`, poi riavvia; oppure leggi la nuova porta con `dev status` e rifai `adb reverse` con quella |
| Cache Vite / modifiche non visibili | ferma il server (`npm run dev:down`), cancella la cache (`rm -rf node_modules/.vite`) e riavvia; sul visore ricarica la pagina (e se serve svuota la cache del Quest Browser dalle sue impostazioni; da verificare) |
| La ricarica azzera tutto | hai lasciato `reset=1` nell'URL (sezione 6) |
| Il Wi-Fi non raggiunge il PC | stessa rete? rete ospite con isolamento? firewall (`sudo firewall-cmd --add-port=8081/tcp`)? Usa il modo USB |
| `metavr` non parte | al primo uso scarica un programma dalla CDN di Meta: servono internet e nessun blocco di rete; ritenta; i dettagli in 5.3 |
| Non hai l'IP | `npx @iwsdk/cli dev status` o `ip -4 addr` |

---

## 9. A fine sessione

```bash
adb reverse --remove tcp:8081
npm run dev:down
rm -f dev-params.local.txt
```

Poi i commit del report e di `DEBT.md` li fai tu.

---

## 10. Opzionale: far leggere a Claude il visore reale

Il progetto ha una skill (`.claude/skills/iwsdk-native-xr-test/SKILL.md`) e la CLI ha il comando
`runtime pair-headset` per collegare un visore al server di sviluppo e dare a Claude lo stato della
pagina (ECS, sessione XR, posizioni) mentre tu fai le prove. La parte che ho verificato qui, senza
visore:

```bash
npx @iwsdk/cli dev up --no-open
adb -s <SERIALE> reverse tcp:8081 tcp:8081
npx @iwsdk/cli runtime pair-headset --input-json '{"headsetId":"<SERIALE>"}' --raw
npx @iwsdk/cli runtime targets --raw
```

`pair-headset` risponde con un URL del tipo `https://localhost:8081/?__iwsdk_headset=<token>`: va
aperto **nel visore** (con `adb reverse` attivo), poi `runtime targets` mostra la pagina con il suo
`runtimeTarget` (da copiare per intero nei comandi successivi). Screenshot, snapshot e console
della CLI funzionano solo sul browser gestito del PC, non sul visore ("host-only", da `AGENTS.md`):
per la console del visore si usa `chrome://inspect`.

Attenzione: l'opzione `--native-xr-control` (per i test automatizzati della skill) **sostituisce i
controller veri con controller sintetici** e per questo **non** va usata per le prove con le mani
vere. Per le prove di Soglia usa il percorso normale delle sezioni 4-7.

---

## 11. Strumenti di M6

> **Stato (2026-11-07, sera)**: la fase A del piano M6 è **implementata** (T6.A1–T6.A11) e questa sezione
> è stata riletta contro il codice (`scripts/quest/`, `src/logic/tuning.ts`, `src/debug/`,
> `qa/device/presets.json`). Tutto è provato **sul PC** (test unitari, `--dry-run`, un `adb` e un server di
> debug finti, l'emulatore): **nulla è provato sul visore**. Ogni comando che parla con un Quest vero
> (`adb reverse`, l'apertura dell'URL, `--mode vr`, il socket di debug remoto, `logcat`, `metavr`) è
> **da verificare** martedì; se uno non funziona, annotalo (è il lavoro della sessione S0 di `docs/plans/M6.md`)
> e gli script si correggono in meno di un'ora. Se un nome qui non corrisponde al codice, fidati del codice
> (`npm run` elenca gli script).

### 11.0 Procedimento per martedì (sessione S0, circa 1,5 h)

Prima: Fedora pronta (sezione 1), `npm ci`, `npm test`, `npm run build` verdi, visore in modalità sviluppatore e
collegato con il cavo dati (sezione 3), tracciamento delle mani attivo, controller spenti, seduto.

```bash
cd ~/soglia
npm run quest:check                          # 1. vede il visore? modello, batteria, reverse attivi, stato del server
npm run quest:serve                          # 2. avvia il server di sviluppo senza aprire il browser dell'emulatore
npm run quest:reverse                        # 3. adb reverse sulla porta che il server dichiara (di solito 8081)
npm run quest:open -- smoke                  # 4. apre https://localhost:<porta>/?house=apartment-a&role=visitor&reset=1&seed=1&debug=1
npm run quest:console                        # 5. (in un secondo terminale) salva la console del visore in qa/device/logs/
# nel visore: accetta l'avviso del certificato (prima volta), premi "Enter VR", accetta il permesso WebXR
npm run quest:tune -- pinnedDistance=0.62    # 6. cambia una soglia a sessione aperta, senza ricaricare (vedi 11.2)
```

Controlla con `quest:check` prima di partire; se il passo 4 apre il browser ma non l'URL, usa
`npm run quest:open -- smoke --mode browser` oppure digita a mano l'URL stampato da `quest:links`. Se
`quest:console` non trova il socket di debug, usa `chrome://inspect` (sezione 5.1) e annota che il canale
automatico non ha funzionato. Alternativa senza `adb` per cambiare scenario: apri nel visore
`https://localhost:<porta>/dev/quest.html` (pagina con un link grande per preset, 11.1). A fine sessione:
`npm run quest:unreverse`, `npm run dev:down`, `rm -f tuning.local.txt dev-params.local.txt`.

Cosa guardare per prima cosa nella console o nel pannello `ui:debug-hud` (vedi 11.3): `[soglia:env]` con
`iwer=no` e tutti gli indizi della riga `[soglia] env iwer clues` a `0`; `views=2`; `readyMs` e `startMs` (avvio a
freddo); poi `[soglia:frames]` con `hz`, `fps` e `class`. Per le **misure finali** di fps non usare il server di
sviluppo ma `npm run quest:preview` con `hud=0` (sezione 11.1).

### 11.1 Script npm `quest:*` (task T6.A9, T6.A11)

Undici script, tutti con `--dry-run` (stampa i comandi senza eseguirli; l'unica lettura che fanno è
`npx @iwsdk/cli dev status` per sapere la porta). `--serial <numero>` vale per quelli che parlano con un
dispositivo (`check`, `reverse`, `unreverse`, `open`, `console`, `perf`, `capture`): se `adb` vede **più di
un dispositivo** e non dai `--serial`, lo script **si ferma** e non ne sceglie uno (D69). Senza `adb` o senza
visore esce con codice 1 e un messaggio in inglese. **Porta**: `--port` > quella che dichiara `dev status` > 8081.

| Comando | Cosa fa |
|---|---|
| `npm run quest:check` | elenca il visore (`adb devices -l`), modello e batteria, i collegamenti `adb reverse` attivi e lo stato del server |
| `npm run quest:serve` | `npx @iwsdk/cli dev up --no-open` e stampa gli URL (porta letta da `dev status`) |
| `npm run quest:reverse` / `quest:unreverse` | `adb reverse tcp:<porta> tcp:<porta>` / `adb reverse --remove tcp:<porta>` |
| `npm run quest:open -- <preset\|url> [--mode browser\|vr] [--base <url>]` | apre un preset (`qa/device/presets.json`) o un URL nel Quest Browser dal PC. `--mode browser` (predefinito) = intento Android `VIEW`; `--mode vr` = `am broadcast … ovrweb://vr?uri=<URL codificato>` (da verificare: dovrebbe entrare in VR da solo). Apre solo `localhost` e indirizzi di rete privati. Il comando remoto è **un solo argomento** con l'URL tra virgolette doppie, quindi le `&` non rompono nulla (sezione 4.2) |
| `npm run quest:links` | stampa i **12 preset** con gli URL (`smoke`, `a-clean`, `b-clean`, `tenant`, `landlord`, `agent`, `sun-winter-10`, `sun-summer-14`, `contrast-text`, `grip`, `perf-worst`, `resume`), scrive `qa/device/links.md` e genera la **pagina di avvio** `public/dev/quest.html` (solo sviluppo, ignorata da git, esclusa dalla build; link relativi, quindi vale qualunque porta). Nel visore: `https://localhost:<porta>/dev/quest.html`, tocca uno scenario, poi "Enter VR" |
| `npm run quest:tune -- nome=valore …` | scrive `tuning.local.txt` (una riga `t_nome=valore&…`, ignorato da git; **aggiunge il prefisso `t_` da solo**); il server di sviluppo lo rilegge ogni 2 s e l'app applica i valori **senza ricaricare**. Un nome sconosciuto o un valore non numerico non scrive nulla; fuori limite avvisa (il limite lo applica l'app). `quest:tune -- --clear` cancella il file |
| `npm run quest:console` | salva la console del Quest Browser in `qa/device/logs/console-<data>-<ora>.log` (e la stampa). Canale **CDP** se il PC ha Node 22+ (`WebSocket` globale): `adb forward tcp:9222 localabstract:chrome_devtools_remote` (`--socket` per cambiare nome), mostra console, eccezioni e richieste di rete a host diversi da quello della pagina (utile per "nessuna richiesta alla CDN"); altrimenti `adb logcat` filtrato su `[soglia`. Opzioni: `--seconds`, `--match`, `--all`, `--channel cdp\|logcat`. Se nessuno dei due funziona vale `chrome://inspect` (5.1) |
| `npm run quest:perf -- [--seconds 10] [-- <parole di metavr>]` | traccia di prestazioni con `npx metavr perf capture --app com.oculus.browser --mode vr --duration <ms>`, salvata sotto `qa/device/traces/` (ignorata da git). I sottocomandi e i flag di `metavr` sono **da verificare** con `npx metavr perf --help` (le parole dopo `--` si aggiungono così come sono); il dispositivo per `metavr` si sceglie con la variabile `ANDROID_SERIAL` |
| `npm run quest:capture -- shot\|video [--seconds n]` | screenshot o registrazione con `npx metavr capture …`, sotto `qa/device/captures/` (ignorata da git); flag da verificare con `npx metavr capture --help`. Senza `metavr`: `adb pull` come in 5.2 |
| `npm run quest:preview` | `npm run build` + `vite preview` (HTTP sulla porta 4173) per le **misure finali di fps** su build di produzione; con `adb reverse tcp:4173 tcp:4173` si apre `http://localhost:4173/?debug=1&hud=0` (`localhost` in HTTP è un contesto sicuro, senza avviso del certificato: da verificare) |

### 11.2 Parametri di taratura e di diagnostica (solo con `debug=1`)

Sono letti da `src/logic/tuning.ts` (26 manopole, **tutte cablate**: le "opzionali" del piano ci sono) e da
`src/logic/params.ts` (`hud`). Senza `debug=1` sono ignorati con un avviso `[soglia] tuning ignored name=… reason=needs-debug`
(uno per nome). Un valore fuori limite viene ricondotto al limite più vicino (`tuning clamped`), un nome
sconosciuto o un valore non numerico si scarta (`reason=unknown|not-a-number`), `t_palmCloseDeg` deve restare sopra
`t_palmOpenDeg` (`reason=order`). **Tre strati, dal più forte**: file vivo `tuning.local.txt` (riletto ogni 2 s dal server di
sviluppo; **vuole il prefisso `t_`**: `t_fovMask=45`, senza prefisso è ignorato senza alcuna riga di log), URL (`?…&t_nome=valore`), `dev-params.local.txt`;
poi il default. La taratura **non si salva**: a ogni avvio si riparte da default + URL/file.

| Parametro | Default | Limiti | Unità | Si applica |
|---|---|---|---|---|
| `hud` | `1` (con `debug=1`) | `0` / `1` | – | `hud=0` spegne il pannello di statistiche nel visore |
| `t_longPress` | 0,8 | 0,4 - 1,6 | s | subito (pizzico prolungato) |
| `t_longPressMove` | 0,015 | 0,005 - 0,04 | m | subito |
| `t_pinchWait` | 0,15 | 0 - 0,4 | s | subito (attesa del punto di pizzico dai giunti) |
| `t_pinRadius` | 0,02 | 0,01 - 0,05 | m del mondo | subito (presa dei segnaposto) |
| `t_viewpointRadius` | 0,025 | 0,01 - 0,06 | m del mondo | subito (presa dei marcatori dei punti di vista) |
| `t_pickMargin` | 0,015 | 0,005 - 0,05 | m del mondo | subito (presa dei pezzi) |
| `t_pickDepth` | 0,05 | 0,02 - 0,10 | m | subito (profondità di selezione di voci e pulsanti) |
| `t_settleMs` | 150 | 0 - 400 | ms | subito (assestamento del pizzico a due mani e della traslazione) |
| `t_deadZone` | 0,005 | 0,001 - 0,02 | m | subito (zona morta dei gesti) |
| `t_palmOpenDeg` / `t_palmCloseDeg` | 35 / 55 | 20-50 / 40-75 (chiusura > apertura) | gradi | subito |
| `t_palmOpenHold` / `t_palmCloseHold` | 0,4 / 0,25 | 0,2-1,0 / 0,1-0,8 | s | subito |
| `t_pinnedDistance` / `t_pinnedDrop` | 0,55 / 0,20 | 0,45-0,75 / 0,05-0,35 | m | alla prossima apertura del menu o del pannello |
| `t_anchorForward` / `t_anchorDown` | 0,45 / 0,25 | 0,35-0,65 / 0,10-0,40 | m | al prossimo posizionamento (avvio sessione o `Recenter`) |
| `t_rotateWindow` / `t_coachTimeout` | 12 / 20 | 6-30 / 8-60 | s | alla prossima comparsa |
| `t_longPressSettle`, `t_fixtureSnap`, `t_measureSnap`, `t_releaseGuard`, `t_buttonRing` | 0,15 s, 0,02 m del mondo, 0,012 m del mondo, 0,3 s, 0,45 m | 0-0,4 s, 0,01-0,05, 0,006-0,03, 0,1-0,8 s, 0,35-0,60 m | s / m | subito (`buttonRing`: letto a ogni chiamata, senza ricostruzioni) |
| `t_foveation` | non impostato | 0 - 1 | – | subito (`renderer.xr.setFoveation`, solo se esiste: `tuning foveation applied=…` / `restored=…` / `skipped reason=no-api\|failed`) |
| `t_fovMask` | 0 (spento) | 20 - 55 (0 = spento) | gradi (semiangolo) | subito, **solo in sessione** (anello nero a 1,5 m solidale con la testa che simula un campo visivo stretto, `debug:fov-mask`; `fov-mask on halfAngleDeg=…`) |

`pinnedDistance` e `pinnedDrop` valgono per i pannelli a testo **normale**: a testo grande restano i valori del
progetto. L'URL e il file vivo seguono lo stesso formato: `https://localhost:8081/?debug=1&t_longPress=1.1&t_palmOpenHold=0.6`;
dal PC, mentre sei nel visore e senza ricaricare: `npm run quest:tune -- longPress=1.1 palmOpenHold=0.6`. L'elenco
aggiornato dei nomi, dei limiti e dei default è la tabella in `src/logic/tuning.ts` (la riga di log `tuning table count=26`
la annuncia all'avvio). **Il passaggio dall'URL è coperto solo da test unitari**: sul PC le prove usano `dev-params.local.txt`.

### 11.3 Cosa si vede nel visore con `debug=1`

- Un pannello `ui:debug-hud` **solo in sessione**, a sinistra del plastico e un po' oltre (circa 0,8 m dalla testa,
  36° dalla linea di vista), aggiornato una volta al secondo: fps con `OK`/`LOW`/`FAIL` (`OK` ≥ 70, `LOW` ≥ 60),
  tempo per frame (medio, p95, massimo), chiamate per vista e triangoli, fps minimo e frame peggiore della sessione,
  sorgente dei giunti (`joints`/`grip`) e ultimo pizzico, fino a 4 righe di log (anche `warn` e `uncaught …`).
  Si legge senza togliere il visore. **Costo: circa +2 chiamate** (nel gruppo `hud` di `[soglia:stats:groups]`,
  che finisce con `hud=<n>`; la maschera del campo visivo conta lì). Per le **misure finali** usa `hud=0`
  (`hud hidden reason=hud0`).
- In console: `[soglia:env]` (user agent breve, `iwer=`, funzioni del browser, `readyMs=` e `startMs=`) al primo
  fotogramma e, **2 s dopo l'inizio di ogni sessione**, la riga `session` (modo, funzioni concesse, `frameRate`,
  `rates`, `views`, `inputs`); `[soglia] env iwer clues …` (le prove del riconoscimento dell'emulatore: in IWER
  sono tutte a 1, sul Quest devono essere tutte a 0; l'user agent non conta, IWER ne imposta uno da Quest);
  `[soglia:frames]` ogni 2 s con `hz`, `fps`, `class` e `hzFrom=session|est`; `[soglia:stats:summary]` ogni
  10 s di sessione, a fine sessione e quando la pagina va in background.
- Le funzioni del browser che la sonda elenca (`hand`, `anchors`, `hitTest`, `planes`, `meshes`, `speech`,
  `mediaRecorder`, `getUserMedia`, `virtualKeyboard`) sono solo rilevamento: `iface` = l'interfaccia c'è, non
  prova che funzioni.

### 11.4 Dove si annotano i valori misurati

Un file per sessione, `qa/device/M6-<AAAA-MM-GG>-S<n>.md`, con il modello del piano M6 (sezione "Fase B"): per ogni
manopola il valore provato, il numero di prove e l'esito; i valori scelti come nuovi default li applica
`xr-engineer` (commit `fix(tuning): ...`), non si cambiano di nascosto.
