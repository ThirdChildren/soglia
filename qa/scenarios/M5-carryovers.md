# S5.8 · Riporti dal gate di M4 (Blocco R)

> **Changelog 2026-11-06**: scenario creato dal piano M5 (D63; T5.R1–T5.R6). Le correzioni agli scenari esistenti (riporto 6) non sono parte di questo scenario: sono applicate nei file interessati (vedi il piano, "Riporti: correzioni agli scenari").
> **Changelog 2026-11-06 (gate A/B)**: S5.8 era PASS (R1–R6). Aggiustamenti: (1) **R2 passo 2**: `state saved … parked=1` non compare con la sola ricarica: si legge **dopo la prima modifica dello stato** (per esempio un cambio di ruolo dal pannello: `state saved … pieces=0 … role=visitor parked=1`); (2) **R2 passo 3**: la riga `state restored pieces=1 key=…` **non** riporta `parked=0` (il campo compare solo se > 0): `parked=0` si legge dal salvataggio successivo; `historyLength` resta 0 (lo storico è quello della sessione senza catalogo); (3) **R5**: la riga da pizzicare dipende dall'ordine dell'elenco: se `issue-014` è già `Resolved` l'ordine è `013, 012, 014, 010` e `issue-013` è `ui:issue-row-0` (altrimenti `row-1`): leggere `items=` e scegliere la riga di `issue-013` da lì; (4) i profili del browser gestito **persistono tra i `dev up`**: un avvio può trovare già uno stato salvato (`access text=large source=saved`): `reset=1` all'inizio di ogni scenario è obbligatorio.
> **Changelog 2026-11-06 (scostamenti del Blocco R chiuso da `xr-engineer`)**: (R2) nella sessione senza catalogo lo storico di annulla si svuota; (R3) con il chip Agent nascosto la griglia ha `Visitor` in alto a sinistra e `Tenant`/`Landlord` sotto, posizioni invariate; (R4) righe a due righe, 4 per pagina (`ui:issue-row-0…3`), troncamento con `...` ASCII (l'atlante Inter non ha U+2026), margine 0,5 cm solo sulla testa del dettaglio (stato e urgenza); (R5) anche il verbale si apre con un solo pizzico e il log `issues row selected` non esiste più; (R6) `glyphs=1` richiede `debug=1`.

**Milestone**: M5 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime` e `npm test`) · **Regole di `CLAUDE.md`**: 4 (pausa e ripresa), 7, 9 · Vedi `docs/plans/M5.md`, D63. Convenzioni: `qa/scenarios/M4-issue-create.md`.

## Parte R1 · il ruolo viene dallo store
**Passi**: `npm test -- state issue-state permissions` (o i file equivalenti); `grep` (strumento di ricerca del repository) di `transitionIssue(` in `src/`: nessuna chiamata passa un ruolo. Runtime con `role=landlord&reset=1&seed=1&debug=1&pinch=grip&time=2026-11-04T10:00`: "Take on" su `issue-014` (la crea prima da tenant come in S4.3 passo 1), poi "Resolved"; log `pattern: "issue transition"`.
**Verifiche**: la firma di `transitionIssue` non ha il parametro `role` (il compilatore lo impedisce: `npm run typecheck` ok); i test coprono tutte le coppie ruolo × azione; le righe `issue transition id=… by=landlord` coincidono con il ruolo corrente dello store, mai con un altro.

## Parte R2 · persistenza anche senza catalogo
**Precondizioni**: `house=apartment-a&role=tenant&reset=1&seed=1&debug=1&pinch=grip&time=2026-11-04T10:00`.
**Passi**: (1) preparazione standard; posare `chair` in soggiorno a `W(1,5; 3,0)` e creare una segnalazione dalla lavatrice (S4.1 passi 2–4); attesa 1,5 s (`state saved`). (2) Riscrivere il file **senza** `reset=1` e **senza** `role=` ma con `failcatalog=1`; ricaricare: log `pattern: "state restored|parked|role|issues|catalog"`; `ecs_find_entities` `^pin:`, `^furniture:`. (3) Posare nulla; ricaricare **senza** `failcatalog`: log; `^furniture:`, `^pin:`.
**Verifiche**: al passo 2 `state restored pieces=0 parked=1 catalog=missing key=…`, `role set tenant source=saved`, i 4 `pin:issue-*` ci sono, 0 `furniture:*`; `state saved … parked=1` (il pezzo non viene perso al salvataggio successivo); al passo 3 ricompare `furniture:chair#1` e `parked=0`; **nella sessione senza catalogo lo storico di annulla è vuoto** (`[soglia:state]` ha `historyLength` 0); alla ricarica del passo 3 lo storico resta quello salvato dalla sessione senza catalogo (vuoto: l'Undo non ripristina la posa della `chair`, che resta nello store); `failcatalog=1` senza `debug=1` è ignorato con `param failcatalog ignored: needs debug=1` (warn); nessun `error`.

## Parte R3 · il chip "Agent" non promette
**Passi**: `grep` di `coming soon` e `Info points for agents` in `src/`; aprire il pannello Issues e `ui_inspect` (**4 chip** dal gate di M5, T5.10 è consegnato: `Visitor`, `Agent`, `Tenant`, `Landlord`) con `ecs_query_entity` `["Transform"]` sui `ui:issue-role-*`. (La verifica storica con 3 chip valeva solo tra T5.R3 e T5.10 e al gate non si può rieseguire: si legge dal commit.)
**Verifiche**: nessun testo `coming soon` né `Info points for agents` in nessuna schermata; **4** chip, ciascuno con una funzione (`ui:issue-role-agent` apre `Furnish`/`Clear`, S5.3); `strings.issues.comingSoon` non esiste più. (Cronaca: tra T5.R3 e T5.10 il chip era nascosto e la griglia aveva `Visitor` in alto a sinistra e `Tenant`/`Landlord` sotto, nelle stesse posizioni di M4.)

## Parte R4 · elenco accessibile
**Passi**: ruolo `landlord`, pannello Issues → `Issues (4)` (S4.3 passo 2): `ui_inspect` delle righe; il dettaglio di `issue-013`: `ui_inspect`; verbale (S4.5): colore del segnaposto.
**Verifiche**: ogni riga è su **due righe**: sopra pallino + **parola di stato** (`Open`, `Progress`, `Resolved`, `Archived`) + urgenza, sotto il testo fino a **22 caratteri** (21–22 con i punti, **anche a metà parola**: `Scratch on the par...`, `A tile came loose n...`; F-C2-4), troncato con tre punti ASCII `...` (non `…`: l'atlante Inter non ha U+2026); le righe sono **4 per pagina**: `ecs_find_entities` `^ui:issue-row-` → `ui:issue-row-0…3`, **nessun** `ui:issue-row-4`; con il seme + `issue-014` l'elenco è `page=1/1` con 4 righe; nessuna riga esce dalla sua colonna; nel dettaglio la **testa** (stato e urgenza, per esempio `Medium`) ha un margine ≥ 0,5 cm dal bordo del pannello (il margine non vale per le altre righe del dettaglio); il segnaposto del verbale è `color=violet` (`pin color id=baseline-001 color=violet`), distinto dal blu dei pilastri (`viewpoint:*`) nello screenshot; il test `issue-list` fissa la regola.

## Parte R5 · un solo pizzico apre il dettaglio
**Passi**: ruolo `landlord`, pannello → lista; pizzico **una volta** su `ui:issue-row-1`; log `pattern: "issues"`. Poi `ui:issue-back`, `ui:issue-back` (home), `ui:issue-open-movein` e **un solo** pizzico su `ui:issue-row-0` del verbale.
**Verifiche**: `issues screen=detail id=issue-013` dopo il **primo** pizzico (nessuna riga intermedia di sola selezione e **nessuna** riga `issues row selected`: quel log non esiste più); il pin di `issue-013` si evidenzia nel dettaglio; `Back` torna alla lista; anche il verbale si apre con un solo pizzico (`issues screen=detail id=baseline-001`).

## Parte R6 · log e pulizia
**Passi**: `grep` di `console.error` in `src/index.ts`; ricaricare con `glyphs=1` **senza** `debug=1`; `xr_end_session`; log senza filtro.
**Verifiche**: nessun `console.error` fuori da un blocco `catch` finale con prefisso (`[soglia] …`); `glyphs=1` senza `debug=1` produce `param glyphs ignored: needs debug=1` (warn) e nessun pannello `ui:glyph-test` (con `debug=1&glyphs=1`, come in S2.0, il pannello c'è); dopo `xr_end_session` l'unica riga di livello `warn` attesa è `THREE.WebGLRenderer: Can't change size while VR device is presenting.` (contratto dei log di M5); nessun altro `warn` né `error`.

## Esito
PASS se tutte le parti R1–R6 sono soddisfatte · FAIL altrimenti (ogni parte è bloccante: sono prerequisiti).

## Da rimandare al visore
Nessuna voce nuova (il riporto 10, conferma completa del punto di vista e W4, resta in `DEBT.md` come in M4).
