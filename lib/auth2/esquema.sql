-- Acceso v2 (usuarios, sesiones y segundo factor en Neon). Idempotente: se puede correr más de una vez.
-- Lo aplica el dueño de la base (no el rol de la aplicación). Los permisos del rol app_auth están en permisos.sql.

CREATE TABLE IF NOT EXISTS usuarios (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario            text NOT NULL UNIQUE,                       -- en minúsculas; el CUIL (solo dígitos) o un nombre de usuario
  nombre             text,
  rol                text NOT NULL CHECK (rol IN ('admin', 'completo', 'agregado')),
  programas          text[] NOT NULL DEFAULT ARRAY['bg'],        -- bg, cmc, pe (el admin ve todos)
  clave_hash         text NOT NULL,                              -- scrypt$N$r$p$sal$hash
  debe_cambiar_clave boolean NOT NULL DEFAULT true,
  clave_cambiada     timestamptz,
  totp_secreto       text,                                       -- cifrado con AES-256-GCM (clave en CLAVE_CIFRADO)
  totp_confirmado    boolean NOT NULL DEFAULT false,
  totp_ultimo_paso   bigint,                                     -- evita reutilizar un mismo código
  activo             boolean NOT NULL DEFAULT true,
  origen             text NOT NULL DEFAULT 'panel',              -- 'panel' o 'vercel' (migrado de las variables de entorno)
  creado             timestamptz NOT NULL DEFAULT now(),
  ultimo_ingreso     timestamptz
);

CREATE TABLE IF NOT EXISTS sesiones (
  id               text PRIMARY KEY,                             -- sha256 del token de la cookie (el token no se guarda)
  usuario_id       bigint NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  etapa            text NOT NULL CHECK (etapa IN ('clave', 'completa')),   -- 'clave': puso la clave y falta el código
  creada           timestamptz NOT NULL DEFAULT now(),
  ultima_actividad timestamptz NOT NULL DEFAULT now(),
  expira           timestamptz NOT NULL,
  agente           text
);
CREATE INDEX IF NOT EXISTS ix_sesiones_usuario ON sesiones (usuario_id);

CREATE TABLE IF NOT EXISTS dispositivos_confiables (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id  bigint NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  creado      timestamptz NOT NULL DEFAULT now(),
  expira      timestamptz NOT NULL,
  ultimo_uso  timestamptz,
  agente      text
);
CREATE INDEX IF NOT EXISTS ix_dispositivos_usuario ON dispositivos_confiables (usuario_id);

CREATE TABLE IF NOT EXISTS codigos_recuperacion (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id  bigint NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  codigo_hash text NOT NULL,
  usado       timestamptz
);
CREATE INDEX IF NOT EXISTS ix_codigos_usuario ON codigos_recuperacion (usuario_id);

CREATE TABLE IF NOT EXISTS intentos_2fa (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id bigint NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  creado     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_intentos_2fa ON intentos_2fa (usuario_id, creado DESC);

-- Registro de accesos (el mismo de siempre): en las pruebas locales se crea acá; en Neon ya existe.
CREATE TABLE IF NOT EXISTS accesos (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  creado     timestamptz NOT NULL DEFAULT now(),
  usuario    text NOT NULL,
  rol        text NOT NULL,
  accion     text NOT NULL,
  detalle    jsonb,
  resultados integer
);
