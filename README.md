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
El barrio se toma del domicilio (texto posterior al último "-") solo para Córdoba Capital y se concilia con la base oficial `pipelines/banco_gente/barrios_cordoba.xlsx` (hoja "Barrios"):

- **Motor:** `pipelines/banco_gente/depurar_barrios.py` (el script del equipo, sin cambios): normaliza tildes/abreviaturas/ordinales, alias internos, orden de palabras, fonética, VILLA/GENERAL/PARQUE, loteos de Horizonte, texto sobrante y parecido aproximado. También se puede correr solo sobre un Excel: `python pipelines/banco_gente/depurar_barrios.py base.xlsx barrios_cordoba.xlsx salida.xlsx`.
- **Adaptador:** `barrios_match.py` lo usa en el pipeline y agrega el circuito de cada barrio. Un nombre repetido en el Excel va al circuito del barrio oficial; si quedan circuitos distintos se asigna el barrio sin circuito.
- **Overrides manuales:** `barrios_alias.csv` (`variante,barrio`) tiene prioridad sobre el motor.

Qué ve el tablero:
1. Concilia → nombre depurado (barrio oficial) y su circuito.
2. Sin coincidencia o ambiguo → queda el nombre original que trae la base, sin circuito.
3. Vacío → queda vacío: el crédito cuenta para Capital, sin barrio ("Sin barrio" en la tabla).

El log del Action imprime el % de barrios y de créditos por método. `data/banco_gente/barrios_revisar.json` lista sin coincidencia, ambiguos, dudosos y asignados sin circuito (con candidatos), por créditos, y `barrios_conciliacion.json` guarda el resumen. Para corregir: completar `barrios_alias.csv` y volver a correr el Action con "forzar".

Si se actualiza `depurar_barrios.py` (por ejemplo con nuevos ALIAS), reemplazar el archivo completo. Ojo: valida que cada ALIAS apunte a un barrio que exista en `barrios_cordoba.xlsx`; si no, el pipeline se detiene con un error claro.

Tests: `pip install pytest && python -m pytest pipelines/banco_gente/tests`.

### Mapa de circuitos
`pipelines/banco_gente/geo/build_circuitos_paths.py` (script único, ya ejecutado) convierte `circuitos_cordoba.json` (TopoJSON) en `circuitos_paths.json`. Si cambia el TopoJSON, volver a correrlo y commitear el resultado.
