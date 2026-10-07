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
   - Opcional: `DASHBOARD_USERS_EXTRA` = más usuarios (mismo formato `usuario:hash`). Acepta hashes que no dependen de
     `AUTH_SECRET`, generados con `node scripts/hash-password.mjs --pbkdf2 "la clave"` (queda `usuario:pbkdf2.100000.sal.hash`; se evita el `$` porque algunas herramientas lo interpretan como variable).
     Sirve para sumar un usuario sin tener que volver a escribir `DASHBOARD_USERS` (en Vercel las variables
     *sensitive* no se pueden leer). Después de cambiar variables hay que volver a desplegar.
   - Al iniciar sesión se entra directo a `/banco-gente`.
   - **Perfiles (roles):** cada entrada puede terminar en `|completo` o `|agregado`, por ejemplo `ana:pbkdf2.100000.sal.hash|completo`. `agregado` (el valor por defecto si no se indica rol) ve solo los datos agregados; `completo` es el perfil para la futura vista nominal. El rol viaja dentro de la cookie de sesión firmada con `AUTH_SECRET`, así que el navegador no puede cambiarlo. En el servidor se lee con `sesionActual()` / `exigirRol("completo")` (`lib/sesion.ts`) y `GET /api/sesion` devuelve `{usuario, rol}` del usuario logueado. Todo lo nominal debe pedir `exigirRol("completo")` en una ruta o componente de servidor.
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

### Mapa de circuitos (Leaflet + OpenStreetMap)
La vista de barrios de Capital dibuja los circuitos como capa GeoJSON de Leaflet sobre un mapa base de calles (`components/mapa/`). Colores, escala, tooltip, selección y filtros los calcula `components/Tablero.tsx`; el mapa solo dibuja y se carga con `next/dynamic` (`ssr:false`). Cambiar fechas o Monto/Cantidad solo restila las capas: no remonta el mapa ni resetea el zoom.

- **Geometría:** `data/banco_gente/circuitos.geojson` (119 circuitos en lon/lat, `properties: {codigo, nombre}`). Lo genera una sola vez `python pipelines/banco_gente/geo/build_circuitos_geojson.py` a partir de `pipelines/banco_gente/circuitos_cordoba.json` (TopoJSON). Si cambia el TopoJSON, volver a correrlo y commitear el resultado (Python puro, sin dependencias).
- **Zoom:** botones +/− arriba a la izquierda. La rueda del mouse solo hace zoom después de hacer clic en el mapa. En pantallas táctiles un dedo mueve la página y dos dedos mueven/amplían el mapa.

#### Tiles del mapa base y política de uso de OpenStreetMap
Por defecto se usan los tiles estándar de OpenStreetMap (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`) con la atribución visible "© OpenStreetMap contributors". Esos servidores son un recurso comunitario gratuito y tienen una [política de uso](https://operations.osmfoundation.org/policies/tiles/):

- Es obligatorio mostrar la atribución (ya está en el mapa).
- Está pensado para uso liviano: nada de descargas masivas ni precarga de tiles, y no se debe ocultar el `Referer` del navegador (OSM bloquea las peticiones sin identificar).
- OSM puede limitar o bloquear el servicio en cualquier momento y no ofrece garantías de disponibilidad. Para un tablero con mucho tráfico conviene un proveedor de tiles propio o comercial.

Para cambiar de proveedor sin tocar código, definir en Vercel (Settings → Environment Variables) y volver a desplegar, porque se incorporan en el build:

| Variable | Qué hace | Por defecto |
|---|---|---|
| `NEXT_PUBLIC_TILES_URL` | URL de tiles con `{z}/{x}/{y}` | OSM estándar |
| `NEXT_PUBLIC_TILES_ATTRIBUTION` | Atribución (HTML) que exige el proveedor | © OpenStreetMap contributors |

Si el mapa base no carga, el tablero sigue funcionando: los circuitos se muestran igual y aparece un aviso.
