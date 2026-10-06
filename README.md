# Tablero de datos (Vercel + GitHub Actions)

```
Drive (.xlsx) ─► GitHub Actions (semanal) ─► pipelines/<base>/procesar.py ─► data/<base>/*.json (agregados, sin datos personales)
                                                                          └─► commit ─► Vercel redeploya ─► tablero con login
```

## Puesta en marcha
1. **Repo privado** en GitHub con este contenido.
2. **Cuenta de servicio de Google**: en Google Cloud crear una, habilitar Drive API, generar clave JSON, y compartir el archivo de Drive (solo lectura) con el mail de la cuenta de servicio.
3. En GitHub > Settings > Secrets and variables > Actions:
   - Secret `GOOGLE_SERVICE_ACCOUNT_JSON` = contenido del JSON.
   - Variable `BG_DRIVE_FILE_ID` = ID del archivo (el tramo largo de la URL de Drive).
4. **Vercel**: importar el repo. En Environment Variables definir:
   - `AUTH_SECRET` = cadena larga aleatoria.
   - `DASHBOARD_USERS` = `usuario:hash,otro:hash`. Cada hash se genera con
     `AUTH_SECRET=<el mismo secreto> npm run hash -- "la clave"`.
5. Actions > "Actualizar datos" > Run workflow para la primera corrida (después corre solo los lunes).

Probar el pipeline local: `pip install -r pipelines/requirements.txt && python pipelines/banco_gente/procesar.py --input base.xlsx`

## Sumar otra base
1. Crear `pipelines/<base>/` (config + `procesar.py`) que escriba JSON en `data/<base>/`.
2. Agregar un job (o paso) en el workflow.
3. Crear `app/<base>/page.tsx` y una tarjeta en `app/page.tsx`.
Si una base llega a cientos de MB o necesita consultas dinámicas, esa salida pasa a Vercel Blob o Postgres (Neon) sin cambiar el resto.

## Barrios y circuitos (Capital)
El barrio se toma del domicilio (texto posterior al último " - ") solo para Córdoba Capital y se concilia con la base oficial `pipelines/banco_gente/barrios_cordoba.xlsx` (hoja "Barrios") en `pipelines/banco_gente/barrios_match.py`. Capas, en orden:
1. **alias**: overrides manuales de `barrios_alias.csv` (`variante,barrio`), prioridad máxima.
2. **exacto**: coincidencia tras normalizar (mayúsculas, sin tildes ni puntuación).
3. **limpieza**: se quitan prefijos/sufijos (`B°`, `BARRIO`, `SECTOR`, `ANEXO`, `I`, `II`, `2`…); antes de descartar `VILLA` se prueba el nombre completo contra la base.
4. **fuzzy** (rapidfuzz, umbral 90): no mezcla números, meses ni puntos cardinales distintos y no asigna si hay dos candidatos cercanos.

Si un nombre está repetido en la base se prefiere el barrio oficial; si quedan circuitos distintos queda **ambiguo** (no se elige al azar). Lo que no concilia queda **sin clasificar** (conserva su nombre original en la tabla de barrios y no se pinta en el mapa de circuitos).

El log del Action imprime el % de barrios y de créditos por método. `data/banco_gente/barrios_revisar.json` lista no conciliados y dudosos (con candidatos sugeridos), ordenados por créditos, y `barrios_conciliacion.json` guarda el resumen. Para corregir: completar `barrios_alias.csv` y volver a correr el Action con "forzar".

Tests: `pip install pytest && python -m pytest pipelines/banco_gente/tests`.

### Mapa de circuitos
`pipelines/banco_gente/geo/build_circuitos_paths.py` (script único, ya ejecutado) convierte `circuitos_cordoba.json` (TopoJSON) en `circuitos_paths.json`. Si cambia el TopoJSON, volver a correrlo y commitear el resultado.
