# CLAUDE.md — Tablero Banco de la Gente

Tablero web (Next.js) con login que muestra datos agregados del Banco de la Gente. Los datos salen de un Excel en Google Drive, se procesan con Python en una GitHub Action y se publican en Vercel. Todo el contexto de puesta en marcha está en `README.md`; este archivo resume lo necesario para trabajar sin romper nada.

## Flujo de datos

```
Drive (.xlsx) -> GitHub Action semanal -> pipelines/banco_gente/procesar.py -> data/banco_gente/*.json -> commit a main -> Vercel redeploya
```

- La Action ("Actualizar datos", `.github/workflows/actualizar-datos.yml`) corre los lunes 06:00 hora Argentina o a mano con "Run workflow" (opción `forzar`).
- La Action commitea los JSON de `data/` directo a `main`. Antes de pushear una rama, hacer `git fetch origin main` y rebase/merge, para no pisar datos nuevos.
- El repo y el proyecto de Vercel son de la cuenta de Catalina (`cataserena00-lang`). Los secretos (`GOOGLE_SERVICE_ACCOUNT_JSON`, `BG_DRIVE_FILE_ID` en GitHub; `AUTH_SECRET`, `DASHBOARD_USERS` en Vercel) no están en el repo y no se piden ni se escriben acá.

## Estructura

- `app/`: páginas de Next.js (App Router). `app/page.tsx` es el inicio con las tarjetas de tableros, `app/banco-gente/page.tsx` el tablero, `app/login` y `app/api/{login,logout}` el acceso.
- `components/Tablero.tsx`: lógica del tablero (filtros, colores, escalas, tooltip, selección). `components/mapa/`: mapa de circuitos con Leaflet, solo dibuja y se carga con `next/dynamic` (`ssr:false`).
- `lib/datos.ts`: `cargar(dataset, archivo)` lee `data/<dataset>/<archivo>.json`. `lib/auth.ts` y `middleware.ts`: sesión por cookie, todo requiere login salvo `/login` y `/api/login`.
- `pipelines/banco_gente/`: `procesar.py` (entrada del pipeline), `config.yaml`, `barrios_match.py` (adaptador de barrios y circuitos), `depurar_barrios.py` (motor del equipo), `barrios_cordoba.xlsx` (base oficial de barrios), `barrios_alias.csv` (overrides manuales), `circuitos_cordoba.json` (TopoJSON), `geo/build_circuitos_geojson.py`, `tests/`.
- `data/banco_gente/`: salida del pipeline (JSON agregados y `circuitos.geojson`). Se commitea.
- `actualizar-datos.yml` en la raíz es un duplicado suelto: GitHub solo ejecuta el de `.github/workflows/`.

## Reglas importantes

- **Datos personales:** el repo es privado y los JSON de `data/` son agregados, sin datos personales. No commitear el Excel de origen, bases con personas, claves ni `.env`.
- **Datos nominales (nombre, domicilio, contacto, detalle del crédito):** nunca van al repo, a su historial, a `data/` ni a una preview. Si el tablero llega a mostrarlos (por ejemplo para preparar un acto), deben vivir en un almacenamiento protegido y el servidor debe verificar el rol en cada solicitud; ocultarlos solo en pantalla no alcanza. Perfil completo: Director Malvasio y los dos administradores. El resto ve solo agregados. Antes de implementarlo hay que acordar la arquitectura (hoy `DASHBOARD_USERS` no tiene roles) y proteger también los exportables.
- **No editar a mano `data/banco_gente/*.json`** (salvo `circuitos.geojson`, que se regenera con el script de `geo/`): los pisa la próxima corrida del pipeline. Los cambios de datos se hacen en `pipelines/`.
- **`depurar_barrios.py` es el script del equipo.** No modificarlo por cuenta propia: si cambia (por ejemplo nuevos ALIAS), se reemplaza el archivo completo. Los ajustes puntuales van en `barrios_alias.csv` (`variante,barrio`), que tiene prioridad sobre el motor. Cada ALIAS debe apuntar a un barrio que exista en `barrios_cordoba.xlsx`, o el pipeline se detiene.
- **Mapa:** el mapa solo dibuja; colores y filtros se calculan en `Tablero.tsx`. Cambiar fechas o Monto/Cantidad solo restila capas, no debe remontar el mapa ni resetear el zoom. Los tiles son de OpenStreetMap (con atribución visible); no hacer precarga ni descargas masivas de tiles.
- **Sumar otra base:** crear `pipelines/<base>/` que escriba en `data/<base>/`, agregar un job al workflow, y crear `app/<base>/page.tsx` más una tarjeta en `app/page.tsx`.

## Comandos

- Frontend: `npm install`, `npm run dev`, `npm run build` (usar `npm run build` para verificar tipos antes de abrir un PR).
- Hash de claves: `AUTH_SECRET=<secreto> npm run hash -- "la clave"`.
- Pipeline local: `pip install -r pipelines/requirements.txt && python pipelines/banco_gente/procesar.py --input base.xlsx`.
- Tests: `pip install pytest && python -m pytest pipelines/banco_gente/tests`.
- Regenerar geometría de circuitos: `python pipelines/banco_gente/geo/build_circuitos_geojson.py` y commitear el resultado.

## Cómo colaborar

- Cada persona trabaja en su propia rama y pasa a `main` por pull request; Vercel genera una preview por PR para revisar antes de producción.
- Un push a `main` redeploya producción, así que `main` tiene que compilar siempre.
- Idioma: la interfaz, los mensajes y los commits van en español rioplatense.
