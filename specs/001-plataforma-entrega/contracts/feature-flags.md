# Contrato de feature flags

## Tipos y comportamiento

- La interfaz TypeScript `FeatureFlagReader` lee un boolean por key namespaced (`identity.<key>`, `customers.<key>`, `catalog.<key>`, `promotions.<key>`).
- El store se aloja en Redis local/Render Key Value. La API aplica la decisión en servidor; ausencia de key, error de parseo o valor inválido se resuelve como **disabled** (default-off) y se registra sin incluir PII.
- La API expone solo un allowlist de flags seguras para presentación web mediante `GET /api/v1/platform/feature-flags`; no expone detalles internos ni valores administrativos.
- Cambios de valor se hacen sin despliegue mediante comando operativo autenticado ejecutado dentro de la red privada. No hay endpoint público de escritura, UI administrativa ni dependencia de Identity/RBAC para el control del entorno.
- Comando propuesto: `pnpm --filter @cafeteria/api flags:set <module.key> <true|false>`; producción se ejecuta desde shell/job autorizado dentro de la red privada de Render y desarrollo local apunta al Redis de Compose.
- El cliente web solo usa flags publicadas por el API para mostrar/ocultar presentación. La API repite la verificación de autorización/flag para cualquier operación protegida; ocultar UI no es control de acceso.
- Un fallo de Redis resulta en comportamiento conservador: funcionalidades flag-gated quedan apagadas. No guardar sesión/flags como estado mutable en memoria local de una réplica.

## Validación

Probar flag ausente, true, false, valor malformado, Redis no disponible, cambio en runtime sin reiniciar procesos y rechazo de escritura desde API pública. Local usa el Redis del Compose; producción requiere operador autorizado y conexión privada.
