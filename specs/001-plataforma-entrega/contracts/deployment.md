# Contrato de promoción y despliegue

## Artefacto inmutable

- Cada build se identifica por SHA del commit y digest del artefacto. Frontend se construye en CI con Vercel Build y se publica como prebuilt output; API/worker se construyen una vez y se publican en GHCR por digest.
- Las pruebas, previews y promoción consumen el mismo artefacto. Ninguna etapa vuelve a compilar el código al promover.
- Conservar las versiones actualmente activas y candidatas necesarias para rollback. No borrar en GHCR el digest previo durante la ventana operativa.

## Entornos y transiciones

| Estado destino | Trigger | Reglas |
|---|---|---|
| Preview | PR con checks preliminares verdes | Datos de prueba; frontend Vercel; backend efímero si plan Render lo permite, si no backend staging compartido. No exponer secretos de prod. |
| Staging | Merge a `main` tras CI/gate | Git deploy desactivado en proveedores; pipeline despliega imagen/digest validado, migración compatible y frontend prebuilt; smoke tests; datos de prueba/anonimizados. Objetivo <20 min. |
| Producción | Release aprobado en GitHub Environment `production` | Aprobación explícita de persona autorizada; serializado; migración/predeploy antes de activar backend; backend primero y frontend después; secretos exclusivos de prod. |
| Rollback | Smoke tests de prod fallan | Volver Render y Vercel a identificadores anteriores; avisar al equipo; objetivo <5 min. Registrar despliegue fallido y rollback relacionado. |

## Servicios Render

Blueprint versionado describe API web service, worker, Postgres/backup/réplica según plan, Key Value y RabbitMQ (Render privado o CloudAMQP, decisión de operación). `autoDeployTrigger: off`; workers, DB, Key Value y RabbitMQ no se exponen públicamente. Healthcheck de API `GET /health`. Migraciones con `preDeployCommand` compatible con versión anterior; si falla no se activa la versión nueva. Configuración del mismo grupo regional que Vercel.

## Proveedor de frontend

Desactivar deploys automáticos por Git. El pipeline crea prebuilt output y lo publica con credenciales de entorno. Resolver explícitamente variables de build disponibles en CI y no incluir secretos en cliente/artefacto. Rollback apunta a una versión Vercel conocida.

## Secretos y permisos

- Secrets distintos por preview/staging/production; almacenar en GitHub Environments y gestores cifrados de Vercel/Render.
- Workflows PR no tienen tokens con capacidad de despliegue. Tokens con scopes mínimos y rotables.
- Confirmar `main`/Environment protection, reviewers, cuotas y disponibilidad de Preview/pre-deploy del plan contratado antes de habilitar promociones.

## Fallos y recuperación

- Deploy a staging fallido: no reemplaza la versión sana anterior, falla el check y envía alerta.
- Migración fallida: cancelar antes de activar backend; no automatizar un rollback de esquema destructivo.
- Smoke de producción fallido: rollback de las dos capas y notificación. Si la reversión de datos necesita cambio, aplicar migración nueva expand/contract; preservar datos.
- Despliegues de producción se serializan para impedir carreras entre releases.
