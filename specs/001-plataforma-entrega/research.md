# Research: Plataforma de entrega continua

**Fuente normativa:** `.specify/memory/constitution.md` 1.0.0. Las fuentes de producto/arquitectura son `promtp.md` §§4–9 y `ROADMAP.md`, fase 0. Esta investigación concreta el diseño del plan; no altera el spec.

## Decisiones

### Monorepo TypeScript

- **Decision:** pnpm workspaces + Turborepo, Node.js LTS fijado en el repositorio y CI, un lockfile compartido. Aplicaciones `apps/web` (Next.js), `apps/api` (NestJS modular), `apps/worker` (proceso aparte); paquetes compartidos pequeños para contratos, configuración TS y ESLint. Paquetes internos se referencian con `workspace:*`; el grafo de Turbo define dependencias `^build`, cachea outputs de build y no cachea procesos de desarrollo persistentes.
- **Rationale:** coincide con stack y topología de la hoja de ruta, reduce deriva de dependencias y permite compilar solo el grafo afectado. API y worker se despliegan por separado sin convertir dominios NestJS en microservicios.
- **Alternatives considered:** repos separados o Nx/Nest CLI monorepo. Se descartan por duplicar configuración/contratos o añadir otro orquestador; reconsiderar solo con evidencia de que Turbo no cubre una necesidad concreta.
- **Sources:** [pnpm workspaces](https://pnpm.io/workspaces/), [Turborepo configuration](https://turborepo.dev/docs/reference/configuration), [internal packages](https://turborepo.dev/docs/crafting-your-repository/creating-an-internal-package), [Next.js transpilePackages](https://nextjs.org/docs/pages/api-reference/config/next-config-js/transpilePackages), [Nest CLI monorepo mode](https://docs.nestjs.com/cli/monorepo).

### Servicios locales y pruebas

- **Decision:** Docker Compose para Postgres, Redis-compatible service, RabbitMQ y correo local; versiones estables fijadas. Vitest para Next.js y paquetes compartidos; Jest para NestJS API/worker; Testcontainers para pruebas de integración reales y Playwright + axe para E2E/accesibilidad.
- **Rationale:** la arquitectura depende de las tres tecnologías de datos/mensajería y exige pruebas de integración real; Docker reduce diferencias entre estaciones de los tres integrantes. El servicio de correo local mantiene el flujo de notificaciones fuera de proveedores externos.
- **Alternatives considered:** mocks en todas las suites o servicios compartidos remotos. Los mocks no verifican persistencia/mensajería real (constitución VI); remotos añaden secretos, costo y acoplamiento al desarrollo diario.
- **Sources:** requisito del proyecto en `.specify/memory/constitution.md` VI y `ROADMAP.md` fase 0; [Next.js Vitest guide](https://nextjs.org/docs/app/guides/testing/vitest) documenta Vitest para unit tests y recomienda E2E para async Server Components. Nest CLI genera configuración Jest estándar. La elección no introduce un servicio de producción nuevo.

### Migraciones modulares de Postgres

- **Decision:** `node-pg-migrate` con `pg`, migrations escritas en TypeScript y cargadas desde los directorios de cada módulo con glob: `apps/api/src/modules/*/migrations/`. Un ledger compartido registra ejecuciones; cada archivo solo toca el schema de su módulo. Convención de nombre `<timestamp UTC>_<module>_<intent>.ts`; CI detecta prefijos duplicados y orden incorrecto. El runner aplica en orden, con advisory lock y transacción. Predeploy ejecuta `pnpm db:migrate`; solo migraciones expand/contract compatibles se permiten.
- **Rationale:** mantiene una sola herramienta/ledger/orden operacional y evita que módulos compartan ownership de archivos o schemas. El glob permite carpetas de migración por dominio; nombres y check de orden reducen conflictos al integrar ramas. El advisory lock previene ejecución concurrente de releases.
- **Alternatives considered:** añadir ORM completo o carpetas de migración globales propiedad de todos. ORM añade una abstracción no requerida; una carpeta compartida incrementa conflictos de merge. Migrations `down` para cambios productivos se descartan por la regla de migración compensatoria de la constitución.
- **Sources:** [node-pg-migrate TypeScript support](https://salsita.github.io/node-pg-migrate/faq/typescript), [CLI and migration directory](https://salsita.github.io/node-pg-migrate/cli), [run options, order and lock](https://salsita.github.io/node-pg-migrate/), [multiple migration glob support](https://github.com/salsita/node-pg-migrate/blob/main/src/runner.ts).

### Feature flags y contratos de módulos

- **Decision:** implementar una interfaz propia mínima en `packages/feature-flags`, con almacenamiento dinámico Redis usando node-redis y default-off. API es la autoridad de enforcement; endpoint read-only publica un allowlist seguro para UI; operador autorizado cambia valores por CLI dentro de red privada, sin endpoint de escritura público. Namespaces evitan colisiones por módulo. Las dependencias de lectura Redis y flag store se inyectan detrás de interfaces públicas.
- **Rationale:** cumple toggle sin redeploy usando la infraestructura Redis ya aprobada, sin incorporar un servicio externo ni UI administrativa ni lógica de dominio. El default-off y enforcement en servidor son seguros ante key ausente.
- **Alternatives considered:** variables de entorno (requieren reinicio/deploy), CRUD público (innecesario antes de Identity/RBAC) y servicio SaaS dedicado (costo/operación adicionales no justificados).
- **Source:** [Redis official Node.js client guide](https://redis.io/docs/latest/develop/clients/nodejs/) recomienda node-redis para Node.js.
- **Contract boundary:** `packages/contracts` publica referencias Identity/Customer sin PII, `ProductSummary`, `Money` en unidades menores enteras, `PriceQuote`, y `CatalogPort`/`PricingPort`. Catálogo publica producto; Promociones consume producto y el port de precio. No se comparten modelos de persistencia ni se implementan esos dominios en Spec #1.
- **Collaboration rule:** Spec #1 preregistra módulos y exports públicos. Después del merge, owners de Spec #2, #3 y #5 trabajan en `identity/`, `customers/`, `catalog/` y `promotions/` respectivamente. Cambios a app.module/config raíz/lockfile pasan por integrador; contratos públicos se versionan de forma aditiva y se aterrizan antes de consumers concurrentes.

### Git y CI

- **Decision:** Conventional Commits validados localmente por commitlint/Husky y de nuevo en CI; lint-staged para cambios locales; PR workflows con permisos mínimos, `pull_request`, acciones fijadas a SHA, concurrencia por rama y checks estables. Proteger `main` con PR, aprobación, checks y linear history una vez disponibles los primeros checks. release-please cuando existan cambios releasables.
- **Rationale:** hooks ayudan al autor, pero CI y reglas remotas son la autoridad; workflows de PR no necesitan secretos de despliegue. La configuración se separa por triggers para que código no confiable de PR no reciba tokens de deploy.
- **Alternatives considered:** confiar solo en hooks locales o ejecutar despliegue en workflow de PR. Los hooks se pueden saltar; los secretos no deben exponerse a código propuesto.
- **Sources:** [commitlint setup](https://commitlint.js.org/guides/getting-started), [GitHub protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches), [GitHub Actions environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments), [GitHub Actions `pull_request_target` security](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target), [release-please](https://github.com/googleapis/release-please).

### SonarQube y Quality Gate

- **Decision:** el Quality Gate de la constitución se mantiene obligatorio. SonarQube Cloud es la hipótesis inicial del spec, pero P2 debe comenzar con una prueba de integración en el repo monorepo: LCOV por workspace, definición de código nuevo y verificación de que un fallo del gate produce un check requerido y bloquea un PR. Si el check nativo de monorepo no está soportado por la configuración elegida, evaluar proyectos por aplicación o un job agregador mediante API; no dar por cumplida la puerta hasta observar el bloqueo real.
- **Rationale:** la documentación oficial señala limitaciones en la decoración/bloqueo de PRs para proyectos SonarCloud configurados como monorepo. El plan no finge que Sonar Cloud garantiza por sí solo la política. Mantener el requisito constitucional y resolver el wiring como spike de P2 antes de implementación extensiva.
- **Alternatives considered:** aceptar status informativo o reducir el gate; ambos incumplen la constitución. SonarQube autohospedado queda como alternativa condicionada a costo/operación y se debe documentar si resulta necesario.
- **Sources:** [SonarQube Cloud GitHub integration](https://docs.sonarsource.com/sonarqube-cloud/managing-your-projects/administering-your-projects/devops-platform-integration/github), [SonarQube Cloud GitHub integration details](https://docs.sonarsource.com/sonarqube-cloud/discovering-sonarcloud/integration-with-devops-platforms/github), [Quality Gates](https://docs.sonarsource.com/sonarqube-cloud/standards/quality-gates).

### Despliegue y proveedores

- **Decision:** `vercel build` + `vercel deploy --prebuilt` para promover build validado; desactivar despliegues Git automáticos. Render Blueprint para API, worker y servicios, con trigger de auto deploy apagado; publicar imagen GHCR identificada por SHA/digest y retener la anterior para rollback. Render preview env solo si el plan lo habilita; compartir staging para backend preview como fallback documentado por el spec. Primero staging; producción requiere Environment protegido y aprobación manual.
- **Rationale:** satisface el requisito de mismo artefacto probado y el despliegue exclusivo mediante pipeline. Blueprint hace versionable la topología. Las cuentas y planes no bloquean P0/P1.
- **Alternatives considered:** despliegue Git automático del proveedor, reconstrucción al desplegar, preview Render por PR siempre. Contradicen el principio de despliegue exclusivo, identidad del artefacto o disponibilidad/costo del plan.
- **Sources:** [Vercel CLI deploy](https://vercel.com/docs/cli/deploy), [Vercel Git configuration](https://vercel.com/docs/project-configuration/git-configuration), [Render Blueprint spec](https://render.com/docs/blueprint-spec), [Render preview environments](https://render.com/docs/preview-environments), [Render deploy image](https://render.com/docs/deploying-an-image), [Render rollbacks](https://render.com/docs/rollbacks).
- **Caveat:** en Vercel `--prebuilt`, las variables de sistema disponibles en build deben resolverse explícitamente; no copiar valores secretos en artefactos. `preDeployCommand` de Render y preview environments dependen del plan. Mantener digests usados en despliegues que aún puedan requerir rollback.

### Métricas

- **Decision:** Grafana Cloud por defecto, sujeto a confirmar cuenta y permisos. Empezar P4 con eventos básicos de Actions (duración, resultado, SHA y despliegue); ampliar a fuentes GitHub/SonarQube, DORA, flujo, calidad, salud, alertas y contribuciones con revisión de privacidad/ACL. Sin ranking individual.
- **Rationale:** los dashboards solo son útiles cuando hay ejecuciones y releases estables; reducir integraciones iniciales baja el costo de operación. La constitución trata actividad de desarrolladores como dato personal.
- **Alternatives considered:** operar Grafana/Prometheus/Loki/Tempo propios desde el primer día. Se aplaza por la carga operativa; stack gestionado sigue el supuesto del spec.
- **Sources:** [Grafana data sources](https://grafana.com/docs/grafana/latest/datasources/), [Grafana GitHub data source](https://grafana.com/docs/plugins/grafana-github-datasource/latest/configure/).

## Incertidumbres convertidas en puertas de decisión

No quedan `NEEDS CLARIFICATION` de diseño que impidan P0. Antes de P2 se comprueba la integración bloqueante real de SonarQube en monorepo. Antes de P3 se confirman planes/costos, región común, variables/secrets, rollback y permisos de GitHub/Vercel/Render. Antes de P4 se confirma cuenta Grafana, política de acceso individual y mecanismo de exportación de métricas. Para RabbitMQ, seleccionar Render privado o CloudAMQP antes de provisionar staging; ambos mantienen el protocolo y el Compose local.
