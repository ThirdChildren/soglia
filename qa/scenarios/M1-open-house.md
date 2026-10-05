# S1.1 · Apri la casa e ruota il plastico con due mani

**Milestone**: M1 · **Tipo**: PC (emulatore)
Esempio di riferimento per il formato: `milestone-planner` lo completa quando pianifica M1.

## Precondizioni
- Runtime: `npx @iwsdk/cli dev up --ai-mode agent` (o `collaborate` se l'utente vuole guardare).
- URL: `/?house=apartment-a&role=visitor&reset=1&seed=1&debug=1`
- `xr_accept_session`, poi `xr_set_input_mode` → mani. Testa da seduti a ~1,2 m di altezza.

## Passi
1. Attendi il log `[soglia] house loaded apartment-a`.
2. `ecs_find_entities` per `house:apartment-a` e per le entità `room:*` e `wall:*`.
3. Porta entrambe le mani ai lati del plastico (`xr_set_transform`), pizzico con entrambe
   (`xr_set_select_value` a 1 su sinistra e destra).
4. Allontana le mani di ~20 cm con `xr_animate_to`, poi rilascia (`xr_set_select_value` a 0).
5. Ripeti il pizzico a due mani e ruota le mani di ~90° attorno al centro del plastico, poi rilascia.
6. `browser_screenshot`.

## Verifiche
- Esiste `house:apartment-a` con 5 entità `room:*` e 13 entità `wall:*`.
- Dopo il passo 4 la scala del plastico è aumentata (confronto `ecs_snapshot` / `ecs_diff`).
- Dopo il passo 5 la rotazione attorno all'asse verticale è cambiata di 90° ± 10°.
- Console senza errori; `[soglia:stats]` con draw call ≤ 100 e triangoli ≤ 150k.

## Esito
PASS se tutte le verifiche sono soddisfatte. FAIL altrimenti, con atteso vs ottenuto nel report.

## Da rimandare al visore
Comfort dell'altezza del plastico, affidabilità del pizzico a due mani reale, fps reali.
