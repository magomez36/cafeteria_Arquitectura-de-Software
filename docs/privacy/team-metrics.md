# Privacidad de métricas del equipo

## Propósito y límites

Las métricas soportan mejoras del flujo de entrega y de la salud del sistema. Los primeros eventos se agregan por equipo y contienen el nombre del workflow, SHA, resultado y duración; no almacenan nombres de autores, contenido de commits, datos de clientes ni secretos. El SHA permite relacionar evidencia técnica con una ejecución y debe tratarse como dato operacional restringido.

No se crean rankings individuales ni se infiere calidad, productividad o desempeño personal a partir del número de commits. Las revisiones, tests y documentación se presentan como aportes agregados del equipo.

## Antes de activar datos individuales

1. Informar previamente a todo el equipo sobre finalidad, fuentes, campos, personas con acceso y retención.
2. Recibir aprobación de la política y documentar base/finalidad de tratamiento según el inventario de privacidad.
3. Crear un rol `authorized_contributor_metrics_reader` con acceso mínimo en Grafana; no asignarlo por defecto.
4. Aplicar retención limitada al propósito y revisar trimestralmente usuarios, alertas y exportaciones.
5. Ejecutar prueba de acceso con una identidad autorizada y otra no autorizada; guardar evidencia sin copiar PII.

`infra/grafana/access.yaml` deja `individual_dashboard: disabled`; es un registro de estado deseado, no una ACL ya aplicada. La comunicación al equipo y la configuración real del workspace siguen pendientes.
