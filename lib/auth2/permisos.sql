-- Rol de la aplicación para el acceso v2. Se crea con SQL (no desde la consola de Neon: los roles de la consola heredan permisos de todo).
-- Reemplazar <CLAVE> por una clave larga y aleatoria antes de correr (no se guarda en el repositorio).
CREATE ROLE app_auth LOGIN PASSWORD '<CLAVE>';
GRANT USAGE ON SCHEMA public TO app_auth;
GRANT SELECT, INSERT, UPDATE, DELETE ON usuarios, sesiones, dispositivos_confiables, codigos_recuperacion, intentos_2fa TO app_auth;
GRANT INSERT, SELECT ON accesos TO app_auth;
GRANT USAGE ON SEQUENCE usuarios_id_seq, dispositivos_confiables_id_seq, codigos_recuperacion_id_seq, intentos_2fa_id_seq, accesos_id_seq TO app_auth;
REVOKE CREATE ON SCHEMA public FROM app_auth;
