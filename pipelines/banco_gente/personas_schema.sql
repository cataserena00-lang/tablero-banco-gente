-- Preparación ÚNICA de la base de Neon para la vista de personas (datos NOMINALES).
-- Se ejecuta como propietario de la base (consola de Neon > SQL Editor, o psql).
-- Antes hay que crear dos roles desde la consola de Neon (Roles & Databases):
--   carga    -> lo usa la GitHub Action para reconstruir la tabla (secreto NEON_DATABASE_URL_CARGA)
--   lectura  -> lo usa el tablero en Vercel, solo lectura (variable DATABASE_URL_LECTURA)

CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- índice de búsqueda por nombre

-- "carga" arma tablas en el esquema public; todo lo que cree queda legible para "lectura".
GRANT USAGE, CREATE ON SCHEMA public TO carga;
GRANT USAGE ON SCHEMA public TO lectura;
ALTER DEFAULT PRIVILEGES FOR ROLE carga IN SCHEMA public GRANT SELECT ON TABLES TO lectura;

-- Registro de accesos: ingresos al tablero, consultas de personas y exportables generados (quién y cuándo).
-- "lectura" puede INSERTAR y LEER (la solapa de actividad del perfil admin lee esta tabla); nunca modificar ni borrar.
CREATE TABLE IF NOT EXISTS accesos (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  creado    timestamptz NOT NULL DEFAULT now(),
  usuario   text NOT NULL,
  rol       text NOT NULL,
  accion    text NOT NULL,          -- 'busqueda' | 'ficha' | 'exportacion' | 'ingreso' | 'exportable'
  detalle   jsonb,                  -- filtros usados o id de la ficha
  resultados integer
);
CREATE INDEX IF NOT EXISTS ix_accesos_creado ON accesos (creado DESC);
GRANT INSERT, SELECT ON accesos TO lectura;
GRANT USAGE ON SEQUENCE accesos_id_seq TO lectura;

-- La conexión "lectura" no puede crear nada ni tocar otras tablas.
REVOKE CREATE ON SCHEMA public FROM lectura;

-- RECOMENDADO: un rol de lectura realmente de solo lectura. Los roles que se crean desde la consola de Neon quedan dentro de
-- "neon_superuser" y heredan permisos de escritura sobre todo. Un rol creado con SQL no los hereda:
--   CREATE ROLE lectura_ro LOGIN PASSWORD '<clave larga>';
--   GRANT USAGE ON SCHEMA public TO lectura_ro;
--   GRANT INSERT, SELECT ON accesos TO lectura_ro;
--   GRANT USAGE ON SEQUENCE accesos_id_seq TO lectura_ro;
-- (el SELECT sobre personas y personas_resumen lo otorga el cargador en cada carga, porque esas tablas son de "carga").
-- Después se usa lectura_ro en DATABASE_URL_LECTURA.
