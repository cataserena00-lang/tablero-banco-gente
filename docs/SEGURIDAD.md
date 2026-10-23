# Seguridad del tablero del Ministerio

Resumen de cómo está protegido el tablero (Banco de la Gente, Córdoba me capacita y los programas que se sumen), qué hace cada capa y qué hacer ante un problema. Está escrito para el equipo, sin jerga innecesaria.

## 1. Qué hay que proteger

| Clase | Qué es | Dónde vive | Quién lo ve |
|---|---|---|---|
| Público/interno | Código del tablero, datos **agregados** (cantidades por zona, curso, estado) | Repositorio (`data/`) | Cualquier persona con sesión; el repo hoy es público (ver §8) |
| Confidencial | Datos de personas: nombre, DNI, CUIL, teléfono, mail, domicilio, detalle del crédito o del curso | Base de Neon, nunca el repo | Perfiles `completo` y `admin` |
| Sensible (Ley 25.326) | Discapacidad, situación laboral, edad de personas identificables | Base de Neon | Perfiles `completo` y `admin` |
| Secretos | Claves de la base, clave de cifrado, cuenta de Google | Variables de Vercel y secretos de GitHub | Solo quien administra Vercel/GitHub |

## 2. Capas de protección

1. **Todo exige sesión.** El `middleware.ts` rechaza cualquier pedido sin una sesión válida (salvo el ingreso). Además cada página y cada ruta `/api` vuelve a verificar la sesión y el perfil **en el servidor** (`lib/sesion.ts`: `exigirRol`). Ocultar un botón nunca alcanza.
2. **Perfiles:** `agregado` (solo datos agregados) < `completo` (además ve datos de personas) < `admin` (además gestiona usuarios y ve la actividad). Cada usuario tiene además la lista de programas que puede ver.
3. **Ingreso con dos factores** (acceso v2, `AUTH_MODO=v2`): contraseña + código de una aplicación autenticadora (Google Authenticator, Microsoft Authenticator, Authy…). Es obligatorio para todos.
4. **Contraseñas:** scrypt (N=2^17, r=8, p=1), mínimo 12 caracteres, se rechazan las más comunes. Nunca se guardan ni se muestran; la contraseña provisoria de un usuario nuevo se ve una sola vez.
5. **Autenticador:** el secreto de cada persona está cifrado con AES-256-GCM (clave en `CLAVE_CIFRADO`); un mismo código no se puede usar dos veces; tras 10 códigos incorrectos hay una pausa de 15 minutos; cada persona tiene 10 códigos de recuperación de un solo uso.
6. **Sesiones en la base:** la cookie lleva un token al azar (en la base solo se guarda su hash). Vencen a las 12 h o a las 2 h sin actividad, se pueden cerrar desde el servidor y dejan de valer al instante si se desactiva al usuario o se cambia su perfil. Cookie `__Host-sesion`: `HttpOnly`, `Secure`, `SameSite=Lax` (Lax y no Strict para que los enlaces al tablero compartidos por chat o mail abran sin pedir ingresar de nuevo; el CSRF se cubre con la verificación de origen).
7. **Dispositivo de confianza (opcional, 30 días):** evita **solo el código** del autenticador, nunca la contraseña. Máximo 5 por persona; se revocan al cambiar la contraseña, reiniciar el autenticador, desactivar al usuario o cerrar sesiones.
8. **CSRF:** todos los pedidos que modifican algo verifican que vengan de esta misma página (`lib/auth2/origen.ts`).
9. **Cabeceras:** CSP con nonce (los scripts solo corren si traen el nonce del pedido), `frame-ancestors 'none'`, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.
10. **Base de datos con mínimo privilegio:** la aplicación usa dos roles sin permisos de DDL: `lectura_ro` (lee personas y escribe en `accesos`) y `app_auth` (solo las tablas de acceso e insertar en `accesos`). Los pipelines usan `carga`. `accesos` es de solo agregar: la aplicación no puede modificarla ni borrarla.
11. **Registro de actividad** (`accesos`, solapa «Actividad de usuarios» del admin): ingresos, intentos fallidos, códigos incorrectos, cambios de contraseña, altas y cambios de usuarios, búsquedas, fichas y exportaciones de datos de personas.
12. **SQL parametrizado:** los valores van siempre como parámetros; lo único que se arma como texto son nombres de columnas de listas cerradas.

## 3. Variables de entorno (Vercel)

| Variable | Para qué | Notas |
|---|---|---|
| `AUTH_MODO` | `v2` activa el acceso nuevo; sin ella rige el acceso anterior | Es el «interruptor» para volver atrás |
| `DATABASE_URL_AUTH` | Conexión del rol `app_auth` (usuarios y sesiones) | Rotar la clave del rol en Neon y actualizar acá |
| `CLAVE_CIFRADO` | 32 bytes en base64: cifra los secretos de los autenticadores | **No cambiarla** sin plan: ver §6 |
| `DATABASE_URL_LECTURA` | Conexión del rol `lectura_ro` (datos de personas y registro) | |
| `AUTH_SECRET` | Firma del acceso anterior | Solo se usa con `AUTH_MODO` apagado y para verificar claves viejas durante la migración |
| `DASHBOARD_USERS`, `DASHBOARD_USERS_EXTRA`, `DASHBOARD_COMPLETOS`, `DASHBOARD_ADMIN`, `DASHBOARD_PROGRAMAS` | Usuarios del acceso anterior | Se migran solos a la base en el primer ingreso; después se pueden borrar |

Los secretos no se guardan en el repositorio, ni se escriben en chats ni en capturas.

## 4. Usuarios

- **Alta:** panel «Usuarios y seguridad» (solo admin) → «Nuevo usuario». Se muestra una contraseña provisoria **una sola vez**; la persona elige la suya y configura el autenticador en su primer ingreso.
- **Migración de los usuarios de las variables de Vercel:** al ingresar por primera vez con el acceso nuevo, la persona entra con su contraseña de siempre, el sistema la pasa a la base (con el mismo perfil, nombre y programas) y le pide elegir una contraseña nueva y configurar el autenticador. Los usuarios de prueba `completo_1/2` y `agregado_1/2` están dados de baja y no se migran.
- **Baja:** «Desactivar» en el panel (rige al instante). Para alguien que nunca ingresó con el acceso nuevo, además hay que quitar su entrada de la variable de Vercel.
- **Perdió el celular:** puede entrar con un código de recuperación; si no los tiene, un admin usa «Reiniciar autenticador» y la persona lo configura de nuevo.
- **Olvidó la contraseña:** hoy no hay recuperación automática (decisión de diseño por ahora). Un admin desactiva el usuario y crea uno nuevo con contraseña provisoria.
- **Administradores:** solo dos personas. Cada admin es una cuenta individual; no usar cuentas compartidas.

## 5. Revocar accesos

- Una persona: panel → «Desactivar» (cierra sus sesiones y quita sus dispositivos).
- Solo cerrar sesiones: «Cerrar sesiones»; solo dispositivos: «Quitar dispositivos».
- Todos a la vez (emergencia): borrar `AUTH_MODO` de Vercel y redeployar apaga el acceso nuevo; o, en Neon, `DELETE FROM sesiones;` con el rol dueño.

## 6. Rotar secretos

- **Clave del rol `app_auth`:** en Neon (`ALTER ROLE app_auth PASSWORD '…'` con el rol dueño) y actualizar `DATABASE_URL_AUTH` en Vercel; redeploy.
- **`CLAVE_CIFRADO`:** cambiarla vuelve ilegibles todos los secretos de autenticador guardados. Solo hacerlo ante una filtración, y después reiniciar el autenticador de todas las personas (`UPDATE usuarios SET totp_secreto = NULL, totp_confirmado = false;` con el rol dueño; cada persona lo vuelve a configurar al ingresar).
- **`AUTH_SECRET`:** puede cambiarse cuando ya no queden usuarios sin migrar.
- **Cuenta de servicio de Google:** crear una clave nueva en Google Cloud, actualizar `GOOGLE_SERVICE_ACCOUNT_JSON` en GitHub y borrar la anterior.

## 7. Si hay un incidente

1. **Contener:** desactivar a las personas involucradas en el panel; si no se sabe quién, apagar `AUTH_MODO` (acceso anterior) o cerrar todas las sesiones (§5).
2. **Registrar:** la solapa «Actividad de usuarios» tiene quién ingresó, qué buscó y qué exportó, con fecha. Filtrar por «Seguridad y cuentas» para ver intentos fallidos y cambios.
3. **Rotar** lo que pudo quedar expuesto (§6): claves de la base, clave de cifrado, cuenta de servicio.
4. **Restaurar** si hubo cambios en la base: Neon permite volver atrás hasta 6 horas; antes de cambios grandes se crea una rama `respaldo-AAAA-MM-DD`.
5. **Avisar:** a las autoridades del Ministerio y, si se expusieron datos de personas, al área legal (Ley 25.326: ver §9).
6. **Anotar** qué pasó y qué se cambió.

## 8. Pendientes y decisiones abiertas

- **El repositorio es público** (decisión provisoria). No guarda datos de personas ni secretos, pero sí código y datos agregados. Pasarlo a privado en cuanto se pueda.
- Recuperación de contraseña y avisos por mail: necesitan un dominio institucional para enviar mails.
- Rama de Neon de producción sin protección y restauración de solo 6 horas (plan gratuito).
- Cifrado a nivel campo de DNI y CUIL: evaluar; complica las búsquedas.
- Política de retención de datos (cuánto tiempo se guardan solicitudes e inscripciones).

## 9. Temas para el área legal (Ley 25.326 y normativa aplicable)

No es un dictamen: son puntos a revisar con el área legal.

- Inscripción de las bases ante la AAIP y finalidad declarada.
- Base legal para usar datos de ASECOR y de las solicitudes de crédito en un tablero y en exportaciones.
- Las bases de origen se editan desde cuentas personales de Gmail: evaluar cuentas institucionales.
- Proveedores en el exterior (Vercel, GitHub, Neon en AWS São Paulo, Google): transferencia internacional de datos.
- Quién accede a datos de personas y con qué constancia.
- Retención y borrado; atención de pedidos de acceso, rectificación y supresión.

## 10. Verificación

- `npm run typecheck`, `npm run build`, `npm run test:seguridad` y `python -m pytest pipelines`: los corre el CI en cada Pull Request (`.github/workflows/ci.yml`), junto con `npm audit` y `gitleaks`.
- `seguridad/advisories-revisados.json`: avisos de dependencias revisados a mano y si afectan o no.
- `npm run test:seguridad` prueba contraseñas, cifrado, autenticador (con los vectores del RFC 6238), migración de usuarios, sesiones (inactividad, vencimiento, cierre, baja), dispositivos de confianza, códigos de recuperación, freno de códigos y verificación de origen.
