# Modelo de datos: plataforma de entrega

Este spec modela entidades del proceso de entrega, no entidades de negocio de cafetería. Las entidades pueden proceder de GitHub, CI, SonarQube y proveedores; no se propone una base de datos de aplicación nueva.

## Entidades

### Pull request (propuesta de cambio)

| Campo lógico | Tipo/ejemplo | Reglas |
|---|---|---|
| id | número/ID GitHub | Único dentro del repositorio |
| headSha, baseSha | SHA Git | La ejecución valida exactamente el rango candidato |
| autor, revisores | IDs GitHub | Acceso conforme a permisos del repositorio |
| estado | abierta, aprobada, bloqueada, integrada, cerrada | Solo se integra con aprobación y checks requeridos verdes |
| checks | colección de CheckRun | Cada check corresponde a un workflow/job estable y reporta conclusión |
| previewUrl | URL opcional | Se crea solo tras pasar build/controles previos; no contiene secretos |

**Relaciones:** contiene uno o más commits y ejecuciones; puede originar cero o más despliegues preview.

### Commit

| Campo lógico | Tipo/ejemplo | Reglas |
|---|---|---|
| sha | SHA Git | Inmutable |
| tipo | feat, fix, docs, refactor, test, build, ci, chore, revert | Según Conventional Commits acordado |
| alcance | módulo/capa, p. ej. api, web, ci | Obligatorio según config commitlint; excepciones de merge/revert explícitas |
| descripción | texto | No vacía; un cambio lógico por commit |
| estado verificable | checks asociados | Debe poder compilar y pasar pruebas relevantes individualmente |

**Relaciones:** pertenece a una rama y puede estar en una o más propuestas según el historial/rebase.

### Ejecución de pipeline

| Campo lógico | Tipo/ejemplo | Reglas |
|---|---|---|
| runId | ID de proveedor | Único por repositorio |
| trigger | pull_request, push-main, release, schedule | Determina permisos y secrets disponibles |
| sha | SHA Git | Checks/deploy apuntan a commit inmutable |
| estado | queued, in_progress, success, failure, cancelled | Fallos de CI obligatorios bloquean merge |
| inicio, fin, duración | timestamps/segundos | UTC; duración calculada |
| jobs | nombre, estado, duración | Nombres estables para branch protection |
| artefactos | URL/digest, retención | Sin credenciales ni datos personales innecesarios |

### Resultado de calidad

| Campo lógico | Tipo/ejemplo | Reglas |
|---|---|---|
| commitSha / pullRequestId | referencia | Debe coincidir con el cambio evaluado |
| scope | código nuevo y módulos afectados | Excluir documentación/código no ejecutable según configuración |
| coverage | porcentaje | ≥80%; ≥95% en promociones/pedidos/pagos cuando existan |
| newBugs, newVulnerabilities | conteos | Ambos 0 |
| securityHotspotsReviewed | porcentaje | 100% |
| duplication | porcentaje | <3% |
| ratings | mantenibilidad, fiabilidad, seguridad | A |
| verdict | passed, failed, not-computed | `not-computed` no debe presentarse como gate aprobado; investigar baseline/reportes |

**Relaciones:** una ejecución puede producir un resultado; un PR integra solo con resultado `passed` y check requerido satisfactorio.

### Entorno

| Campo lógico | Tipo/ejemplo | Reglas |
|---|---|---|
| nombre | preview, staging, prod | Conjunto cerrado |
| proveedor | Vercel, Render, GitHub | Define mecanismo de promoción |
| configuración | URL, región, servicios, flags | Versionada sin valores secretos |
| secreto | nombre/referencia, nunca valor | Valor inyectado desde el almacén cifrado del proveedor/environment |
| política | autoDeploy, aprobador, privacidad de datos | autoDeploy Git desactivado; prod exige aprobador; datos reales solo en prod |

### Despliegue

| Campo lógico | Tipo/ejemplo | Reglas |
|---|---|---|
| deploymentId | ID proveedor/pipeline | Único |
| environment | preview/staging/prod | FK lógico a Entorno |
| sha | SHA Git | Identifica fuente del build validado |
| artifact | digest de imagen o referencia a `.vercel/output` | Se promueve sin recompilar; conservar anterior para rollback |
| estado | queued, deploying, healthy, failed, rolled_back | Smoke tests determinan health final |
| fechas | solicitado, iniciado, completado | UTC |
| aprobador | ID autorizado opcional | Obligatorio en prod |
| rollbackOf | deploymentId opcional | Relaciona reversión con release fallida |

**Relaciones:** pertenece a una ejecución; producción promueve un artefacto que pasó staging; rollback referencia el despliegue sustituido.

### Métrica del equipo

| Campo lógico | Tipo/ejemplo | Reglas |
|---|---|---|
| métrica | frecuencia despliegue, lead time, change failure rate, MTTR, PR/review/test/doc, salud/calidad | Definiciones documentadas y consistentes |
| sujeto | equipo o persona autorizada | Individual solo con aviso y ACL; nunca ranking |
| periodo | rango de fechas | UTC y agregación explícita |
| valor/unidad | número/porcentaje/tiempo | No inferir calidad individual desde conteo de commits |
| fuente | GitHub, Actions, SonarQube, despliegue | Identificar frescura y huecos |
| collectedAt | timestamp | Retención limitada al propósito y política del equipo |

### Feature flag

| Campo lógico | Tipo/ejemplo | Reglas |
|---|---|---|
| key | `catalog.new-menu` | Namespace de módulo (`identity.*`, `customers.*`, `catalog.*`, `promotions.*`) |
| enabled | boolean | Ausencia/valor inválido se resuelve como `false` (default-off) |
| updatedAt | timestamp UTC opcional | No se almacena autor/PII en el valor de runtime |
| audience | `server`, allowlist `web` | Solo flags allowlisted se exponen en lectura pública |

Almacenamiento en Redis local/Render Key Value. Un operador autorizado cambia la flag por CLI dentro de red privada; la API aplica flags en servidor.

### Registro de migración

| Campo lógico | Tipo/ejemplo | Reglas |
|---|---|---|
| migrationId | prefijo timestamp + módulo + intención | Único globalmente; ordenable y detecta prefijos duplicados |
| module | `identity`, `customers`, `catalog`, `promotions`, etc. | Solo modifica el schema de ese módulo |
| status | pendiente, ejecutada, fallida | Una sola ejecución activa gracias al advisory lock |
| appliedAt | timestamp UTC | Registrado en ledger compartido Postgres |
| source | archivo `.ts` en directorio del módulo | SQL/TypeScript; cambios compatibles expand/contract |

Ledger central de `node-pg-migrate`; los módulos no editan la tabla ni directorios de otro módulo.

## Límites de datos y privacidad

- No introducir persistencia de negocio en el stack de la plataforma. GitHub/Sonar/Grafana son fuentes de control/observabilidad.
- No almacenar tokens, secretos, contenido de env files, payloads de usuarios ni datos reales del cliente en artefactos/logs.
- Los IDs y contribuciones individuales se tratan como datos personales; comunicar finalidad, restringir dashboard y evitar comparativas/rankings.
- Los entornos preview/staging usan datos de prueba o anonimizados; solo producción usa datos reales.
