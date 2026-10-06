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

## Barrios
Se toman del domicilio (texto posterior al último " - ") solo para Córdoba Capital. Variantes se unifican en `pipelines/banco_gente/barrios_alias.csv`. La lista `data/banco_gente/barrios_revisar.json` muestra barrios poco frecuentes o sin dato para depurar.
