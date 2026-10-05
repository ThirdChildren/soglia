# QA

- `scenarios/` — scenari di accettazione per l'emulatore, uno per file (`M<n>-<nome>.md`).
  Li scrive `milestone-planner`, li esegue `emulator-qa` con il server MCP `iwsdk-runtime`.
- `reports/` — report del gate PC (`M<n>-<AAAA-MM-GG>.md`), scritti da `emulator-qa`.
- `device/` — prove sul visore (`M<n>-<AAAA-MM-GG>.md`) e `DEBT.md` con le prove rimandate,
  gestiti da `quest-integrator`.

## Modello di scenario

```markdown
# S<milestone>.<n> · <titolo>

**Milestone**: M<n> · **Tipo**: PC (emulatore) | solo visore

## Precondizioni
- URL: `/?house=apartment-a&role=visitor&reset=1&seed=1`
- Sessione XR accettata, input: mani, testa a (0, 1.2, 0.45) rispetto al plastico

## Passi
1. `xr_set_transform` mano destra su ...
2. `xr_select` (pizzico) ...

## Verifiche (tutte obbligatorie)
- `ecs_find_entities` → esiste `<StableId>` con ...
- console: nessun errore; presente `[soglia] ...`
- screenshot allegato al report

## Esito
PASS se ... · FAIL altrimenti
```
