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

-- Registro de accesos: quién buscó o abrió qué. "lectura" solo puede INSERTAR (no leer ni borrar).
CREATE TABLE IF NOT EXISTS accesos (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  creado    timestamptz NOT NULL DEFAULT now(),
  usuario   text NOT NULL,
  rol       text NOT NULL,
  accion    text NOT NULL,          -- 'busqueda' | 'ficha' | 'exportacion'
  detalle   jsonb,                  -- filtros usados o id de la ficha
  resultados integer
);
GRANT INSERT ON accesos TO lectura;
GRANT USAGE ON SEQUENCE accesos_id_seq TO lectura;

-- La conexión "lectura" no puede crear nada ni tocar otras tablas.
REVOKE CREATE ON SCHEMA public FROM lectura;
