# S5.10 · Regressione rapida dopo M5

> **Changelog 2026-11-06**: scenario creato dal piano M5; ricalca `qa/scenarios/M4-regression.md`. Usa gli scenari esistenti **con i punti di partenza corretti** (S1.2, S2.6, S2.9, S3.0, S3.2, S3.3) e, **solo se l'utente ha approvato** le correzioni proposte nel piano M5 ("Riporti: correzioni proposte"), anche quelle di S3.0 (verifica 4 e fase 2), S3.5 (passo 3), S4.3 (passo 4) e S4.5 (passi 2 e 5).

**Milestone**: M5 · **Tipo**: PC (emulatore IWER via MCP `iwsdk-runtime`) · **Regole di `CLAUDE.md`**: tutte · Vedi `docs/plans/M5.md`.

## Cosa cambia in M5 e può rompere i vecchi scenari
- Compaiono **sei** pulsanti fissi (due "View" in più) e un quadrante con chiazze: i pizzichi vicino a `ui:view-button-*` (quota 1,635) non devono finire sui pulsanti "Issues"/"Menu" (rettangoli disgiunti) e viceversa.
- `transitionIssue` non riceve più il ruolo (R1); la persistenza funziona senza catalogo (R2); il chip "Agent" c'è dal gate; il dettaglio si apre con **un** pizzico (R5); il colore del verbale è viola (R4).
- Il pulsante "Rotate" compare per 12 s dopo ogni posa: non deve essere sulla traiettoria dei pizzichi degli scenari (a ≥ 0,50 m dalla testa, accanto al pezzo); se lo è, la ricetta si sposta di 0,05 m.
- Il suggerimento `Palm up for the menu` e il coach a freddo cambiano le letture dei draw call (+3…+4): vedi `M5-budget.md`.
- `pinch=grip` come in M4; i marcatori `viewpoint:V*` hanno ancora raggio 0,025 m.

## Precondizioni
- `dev-params.local.txt` per scenario come da ciascuno, **più `time=2026-12-21T10:00`** quando serve il sole; `pinch=grip`; preparazione standard.

## Passi
Ordine (dal più economico): S2.1 → S2.2 → S2.5 → S2.3 → S2.4 → S2.7 → S2.6 → S2.9 → S1.2 → S1.3 → S1.6 → S3.7 → S3.8 → S3.0 → S3.1 → S3.2 → S3.3 → S3.4 → S3.5 → S4.1 → S4.3 → S4.4 → S4.5 → S4.6 → S4.7 → S4.8 → S3.9/S5.9 (budget). S1.1, S1.4 e S1.5 si leggono dai log di S2.8/S5.9 e di un caricamento di B; S2.0 è nel giro delle etichette.
Dopo S3.7 e S4.6 verificare in più: `ecs_find_entities` `^ui:(menu|issue|view)-button-` (→ 6 in tabletop, 0 in scala reale, dove c'è `ui:tabletop-button`).

## Verifiche (tutte obbligatorie)
1. Ogni scenario dell'elenco **PASS** (o PASS con avvisi già noti di M3/M4); nessun FAIL.
2. In tabletop i sei pulsanti fissi sono presenti; in scala reale solo `ui:tabletop-button`.
3. Console senza `error`; nessun `Missing glyph`, `reading 'add'` o `budget exceeded` nell'insieme dei passi; l'unico `warn` atteso è quello di framework dopo `xr_end_session`.
4. Il caso peggiore di draw call della regressione è ≤ 100 (dichiarato e confrontato con K4 di S5.9).
5. Un fallimento dovuto a un **punto di partenza non libero** (per esempio sotto "Rotate") si corregge nel punto, senza cambiare il criterio, con riga di changelog nello scenario interessato.

## Esito
PASS se le verifiche 1–4 sono soddisfatte · FAIL altrimenti.

## Da rimandare al visore
Nessuna voce nuova: le prove su visore sono nelle voci di M1–M5 di `qa/device/DEBT.md`.
