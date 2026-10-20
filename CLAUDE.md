# CLAUDE.md — Tablero Banco de la Gente

Tablero web (Next.js) con login que muestra datos agregados del Banco de la Gente. Los datos salen de un Excel en Google Drive, se procesan con Python en una GitHub Action y se publican en Vercel. Todo el contexto de puesta en marcha está en `README.md`; este archivo resume lo necesario para trabajar sin romper nada.

## Flujo de datos

```
Drive (.xlsx) -> GitHub Action semanal -> pipelines/banco_gente/procesar.py -> data/banco_gente/*.json -> commit a main -> Vercel redeploya
```

- Las bases salen de una carpeta de Drive (`BG_DRIVE_CARPETA_ID`) con dos archivos de nombre fijo: `BASE PENDIENTES` y `BASE ESTADO DE CREDITOS` (ver README, «Bases semanales en Drive»; `pipelines/banco_gente/drive_carpeta.py`).
- Las Actions ("Actualizar datos", `.github/workflows/actualizar-datos.yml`, y "Actualizar personas") corren los lunes 16:00 y los miércoles 14:00 hora Argentina o a mano con "Run workflow" (opción `forzar`).
- La Action commitea los JSON de `data/` directo a `main`. Antes de pushear una rama, hacer `git fetch origin main` y rebase/merge, para no pisar datos nuevos.
- El repo y el proyecto de Vercel son de la cuenta de Catalina (`cataserena00-lang`). Los secretos (`GOOGLE_SERVICE_ACCOUNT_JSON` en GitHub; `AUTH_SECRET`, `DASHBOARD_USERS` en Vercel) no están en el repo y no se piden ni se escriben acá.

## Estructura

- `app/`: páginas de Next.js (App Router). `app/page.tsx` es el inicio con las tarjetas de tableros, `app/banco-gente/page.tsx` el tablero, `app/login` y `app/api/{login,logout}` el acceso.
- `components/Tablero.tsx`: lógica del tablero (filtros, colores, escalas, tooltip, selección). `components/mapa/`: mapa de circuitos con Leaflet, solo dibuja y se carga con `next/dynamic` (`ssr:false`).
- `app/banco-gente/exportar` + `components/ExportarFichas.tsx` + `lib/exportarFichas.ts`: exportación de fichas agregadas (todos los roles) por impresión del navegador.
- `lib/estados.ts` (categorías de estado), `lib/formato.ts` (`lineaCanonica`: L2/L4/PE) y `pipelines/banco_gente/procesar_estados.py` → `data/banco_gente/estados.json` (agregados por estado, sin datos personales; lo genera el job `estados` de *Actualizar personas*).
- `lib/datos.ts`: `cargar(dataset, archivo)` lee `data/<dataset>/<archivo>.json`. `lib/auth.ts` y `middleware.ts`: sesión por cookie, todo requiere login salvo `/login` y `/api/login`.
- `pipelines/banco_gente/`: `procesar.py` (entrada del pipeline), `config.yaml`, `barrios_match.py` (adaptador de barrios y circuitos), `depurar_barrios.py` (motor del equipo), `barrios_cordoba.xlsx` (base oficial de barrios), `barrios_alias.csv` (overrides manuales), `circuitos_cordoba.json` (TopoJSON), `geo/build_circuitos_geojson.py`, `tests/`.
- `data/banco_gente/`: salida del pipeline (JSON agregados y `circuitos.geojson`). Se commitea.
- `actualizar-datos.yml` en la raíz es un duplicado suelto: GitHub solo ejecuta el de `.github/workflows/`.

## Reglas importantes

- **Datos personales:** el repo es privado y los JSON de `data/` son agregados, sin datos personales. No commitear el Excel de origen, bases con personas, claves ni `.env`.
- **Datos nominales (nombre, domicilio, contacto, detalle del crédito):** nunca van al repo, a su historial, a `data/` ni a una preview. Si el tablero llega a mostrarlos (por ejemplo para preparar un acto), deben vivir en un almacenamiento protegido y el servidor debe verificar el rol en cada solicitud; ocultarlos solo en pantalla no alcanza. Perfil completo: Director Malvasio y los dos administradores. El resto ve solo agregados. Hay un tercer perfil, `admin` (`DASHBOARD_ADMIN` en Vercel), que además ve la actividad de usuarios de todos los programas (`/actividad`, accesible solo desde el inicio del Ministerio; tabla `accesos`, `lib/actividad.ts`); `tieneRol()`/`exigirRol()` en `lib/auth.ts` y `lib/sesion.ts` ordenan admin > completo > agregado. Antes de implementarlo hay que acordar la arquitectura y proteger también los exportables. Ya existe el control de acceso por rol: los usuarios tienen perfil `completo` o `agregado` (`lib/auth.ts`, sufijo `|rol` en `DASHBOARD_USERS`/`DASHBOARD_USERS_EXTRA`; sin rol = `agregado`) y el servidor lo verifica en cada solicitud con `exigirRol("completo")` (`lib/sesion.ts`). La vista nominal (`/banco-gente/personas`, `lib/personas.ts`, `components/VistaPersonas.tsx`; exporta a PDF hasta 5.000 filas con `/api/personas/exportar`, solo perfil completo y registrado en `accesos`) lee de una base Postgres en Neon que carga `cargar_personas.py` (cada fila del CSV es una solicitud; `personas` guarda las solicitudes y `personas_resumen` una fila por persona con su última solicitud, ver README); sin `DATABASE_URL_LECTURA` queda inactiva. Los tests del cargador usan solo datos inventados; para probar con volumen, `generar_csv_sintetico.py`.
- **No editar a mano `data/banco_gente/*.json`** (salvo `circuitos.geojson`, que se regenera con el script de `geo/`): los pisa la próxima corrida del pipeline. Los cambios de datos se hacen en `pipelines/`.
- **`depurar_barrios.py` es el script del equipo.** No modificarlo por cuenta propia: si cambia (por ejemplo nuevos ALIAS), se reemplaza el archivo completo. Los ajustes puntuales van en `barrios_alias.csv` (`variante,barrio`), que tiene prioridad sobre el motor. Cada ALIAS debe apuntar a un barrio que exista en `barrios_cordoba.xlsx`, o el pipeline se detiene.
- **Mapa:** el mapa solo dibuja; colores y filtros se calculan en `Tablero.tsx`. Cambiar fechas o Monto/Cantidad solo restila capas, no debe remontar el mapa ni resetear el zoom. Los tiles son de OpenStreetMap (con atribución visible); no hacer precarga ni descargas masivas de tiles.
- **Programas del Ministerio:** el tablero es del Ministerio de Desarrollo Social y Promoción del Empleo y tiene un inicio (`app/page.tsx`) con una tarjeta por programa: Banco de la Gente (`/banco-gente`), Córdoba me capacita (`/cba-me-capacita`) y el Programa Primer Paso (próximamente; código `pe`, en `DASHBOARD_PROGRAMAS` también vale `ppp`). Quién ve cada programa sale de `DASHBOARD_PROGRAMAS` en Vercel (`usuario:bg+cmc,otro:cmc`; sin entrada = solo Banco de la Gente; el admin ve todos), en `lib/programas.ts`. Se verifica en el servidor: los layouts de cada programa redirigen al inicio y `exigirRol(rol, programa)` (`lib/sesion.ts`) protege las rutas `/api`. Cada programa conserva su logo y colores (`.tema-cmc` en `globals.css`).
- **Córdoba me capacita:** `pipelines/cba_me_capacita/procesar_cmc.py` lee `REPORTE CURSOS` y `REPORTE ASECOR` de la carpeta de Drive (`CBA_DRIVE_CARPETA_ID`, por defecto la de Córdoba me capacita) y escribe `data/cba_me_capacita/cursos.json` (un registro por curso + perfil agregado de sus inscriptos, sin datos personales) y `meta.json`; lo corre el workflow "Actualizar Córdoba me capacita" (martes y miércoles 14:00 hora Argentina). Solo cursos desde 2024 y sin planificaciones desaprobadas, canceladas o en «EDITANDO ADMIN» (no son cursos dictados). La zona es la del curso, no el domicilio de la persona. Tablero: `components/cmc/TableroCmc.tsx` + `lib/cmc.ts`, con la misma estructura que el de Banco de la Gente (resumen general → departamento → localidad, cada uno con menú Exportar: resumen en PDF con `HojasResumenCmc.tsx`, cuyas hojas fluyen con `HojasFlujo.tsx` —mide cada bloque con los estilos reales y reparte en páginas A4 sin dejar hojas casi vacías—, y bases en Excel; la tabla de cursos tiene sus propios filtros de institución, curso y sector). **Año:** el año de un curso es el de su etapa; el tablero tiene un filtro rápido «2025 y 2026 / 2025 / 2026» (`f.etapa`, arriba de los filtros) y el Exportar ofrece resumen «agregado» o «anual» (cada año por separado). **Salvedad 2025:** 2025 fue el primer año de uso del sistema y la carga está incompleta (2026 es confiable y completo); el texto vive en `SALVEDAD_DATOS` (`lib/cmc.ts`), se muestra arriba del tablero (`AvisoDatos.tsx`) y va siempre en los reportes PDF y en la hoja «Detalle» de los Excel. Páginas aparte: `/cba-me-capacita/exportar` (se tildan varios departamentos y localidades: un resumen por zona más uno conjunto, y los Excel de las zonas elegidas con `?z=DEP&z=DEP~LOC`), y `/participantes` (una fila por persona; al tocarla se despliegan todos sus cursos y el estado de cada uno, `/api/cmc/participantes/cursos`) y `/capacitadores` (nominales, solo completo; al tocar un capacitador se despliegan los cursos que dio y sus fechas, `/api/cmc/capacitadores/cursos`). Lo nominal (participantes, capacitadores, costos) nunca va al repo: `cargar_nominal_cmc.py` lo carga a Neon (tablas `cmc_cursos`, `cmc_capacitadores`, `cmc_participantes`; mismo workflow) y lo sirven las rutas `/api/cmc/{participantes,capacitadores,resumen,exportar}` con `exigirRol("completo", "cmc")` (`lib/cmcNominal.ts`, `lib/excelCmc.ts`, `components/cmc/VistaNominalCmc.tsx`); cada búsqueda y exportación se registra en `accesos`.
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
