# S0.1 · Toolchain: test, build, CI, indice dei dati

**Milestone**: M0 · **Tipo**: PC (riga di comando, senza emulatore)

## Precondizioni
- Directory di lavoro: la radice del progetto. Nessun runtime IWSDK in esecuzione necessario.
- Albero git pulito dopo i commit di M0 (`git status --porcelain` vuoto) oppure modifiche elencate nel report.

## Passi
1. `node -v` → registra la versione.
2. `npm ci` → registra il codice di uscita.
3. `npm run typecheck` → codice di uscita.
4. `npm test 2>&1 | tee` → registra codice di uscita, elenco dei file di test e numero di test.
5. `npm run build` → codice di uscita; poi `ls dist dist/houses dist/catalog dist/demo`.
6. Ricerca di dipendenze esterne:
   - `grep -rIlE "https?://" src public iwsdk.config.json index.html | xargs grep -hoE "https?://[A-Za-z0-9.-]+" | sort -u`
     → **deve essere vuoto** (il codice del progetto non contiene URL esterni).
   - Host presenti nel bundle: `grep -ohE "https?://[A-Za-z0-9.-]+" dist/assets/*.js | sort -u`.
     Ammessi **solo**:
     - namespace e identificatori di schema, mai richiesti: `www.w3.org`, `json-schema.org`,
       `jcgt.org`, `iwsdk.dev`, `iwsdk.local`;
     - default di `@iwsdk/core` 1.0.1, senza opzione per cambiarli (vedi `docs/RULES.md`):
       `unpkg.com` (decoder Draco/KTX2: scatta solo caricando un glTF compresso, vietato),
       `cdn.jsdelivr.net` (profili e modelli dei controller: i glb delle mani sono locali dal
       2026-10-05, restano i controller; l'host resta nel bundle come default di `@iwsdk/xr-input`),
       `api.dicebear.com` (immagine di default del componente Avatar di uikit-horizon: scatta solo
       se si usa un Avatar senza `src`, vietato).
     Qualsiasi altro host è un fallimento.
   - Nel runtime nessuna richiesta di rete verso gli host del secondo gruppo.
7. Ricerca di contenuto del template: `ls src` e `ls public` → registra l'elenco.
8. Lettura statica dei workflow:
   - `grep -c "npm test" .github/workflows/ci.yml`, idem `npm run build`, `npm run typecheck`;
   - `grep -nE "^\s*(push|pull_request|schedule):" .github/workflows/pages.yml`;
   - `grep -n "workflow_dispatch" .github/workflows/pages.yml`;
   - `grep -n "2026-11-18T20:00:00Z" .github/workflows/pages.yml`.
9. `npx @iwsdk/cli adapter status` → deve elencare `iwsdk-runtime` come configurato.
10. Voce **informativa** (non decide l'esito): `grep -il "iwer" dist/assets/*.js` → registra se il bundle di produzione contiene l'emulatore e, in caso, come si attiva (`activation` di `iwsdk.config.json`).

## Verifiche (tutte obbligatorie, salvo la 10)
1. Node ≥ 20.19.0 (atteso 22.x dal file `.nvmrc`).
2. `npm ci`, `npm run typecheck`, `npm test`, `npm run build` escono tutti con codice 0.
3. L'output di `npm test` **non** contiene "No test files found" e nomina almeno `schemas.test.ts`, `data-consistency.test.ts`, `repo-hygiene.test.ts`.
4. L'output di `npm test` mostra che sono stati validati `apartment-a.json`, `apartment-b.json` e `issues-apartment-a.json` (nomi nei titoli dei test o nell'elenco `it`). Riportare il numero totale di test (atteso ≥ 30).
5. `dist/houses/apartment-a.json`, `dist/houses/apartment-b.json`, `dist/catalog/catalog.json`, `dist/demo/issues-apartment-a.json` e `dist/demo/my-furniture.json` esistono.
6. Il passo 6 non stampa nulla.
7. `src/` non contiene `robot.ts`, `robot-component.ts`, `panel.ts`; `public/` non contiene `gltf/`, `audio/`, `textures/` né `ui/welcome.uikitml`.
8. `ci.yml` contiene i tre comandi (conteggio ≥ 1 ciascuno). `pages.yml` contiene `workflow_dispatch`, la data di congelamento e **nessuna** riga `push:`, `pull_request:`, `schedule:`.
9. `adapter status` riporta `iwsdk-runtime` configurato.

## Esito
PASS se le verifiche 1–9 sono tutte soddisfatte · FAIL altrimenti, con comando, codice di uscita e ultime 30 righe di output nel report.

## Da rimandare al visore
Niente per questo scenario. Il verde della CI su GitHub si conferma dopo il primo push (indicarlo come "da confermare dall'utente").

## Changelog

- 2026-10-05: lista degli host al passo 6 corretta. Prima diceva che `cdn.jsdelivr.net` scatta solo con controller collegati; in realtà serviva anche il modello delle mani (`generic-hand`). Le mani ora sono locali (`public/models/hands/`), i controller restano su CDN. Motivo: decisione di gate M1 (B1).
