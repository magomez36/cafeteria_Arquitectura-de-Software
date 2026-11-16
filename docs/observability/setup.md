# Observabilidad y telemetría de entrega

## Recolección actual

`.github/workflows/telemetry.yml` consume únicamente eventos `workflow_run` completados del CI de `main` y consulta el objeto de ejecución suministrado por GitHub: nombre, branch, SHA, resultado e intervalo. Genera un registro JSONL con métrica en segundos y sujeto `team`; no recoge nombres de personas ni datos de commits individuales. El artefacto tiene retención de 30 días para permitir reintento/importación si Grafana no está disponible. El workflow no tiene permisos de escritura ni recibe secretos de despliegue.

Esta salida durable no afirma que la fuente Grafana esté conectada. La ingestión remota necesita una cuenta/stack Grafana Cloud, datasource aprobado, política de retención y credencial de alcance mínimo añadida como GitHub Environment secret; configurar esos valores es una puerta externa de T059.

## Configuración de Grafana pendiente

1. Crear datasource Prometheus o Grafana Cloud Metrics en el workspace de proyecto y obtener UID propio del entorno; no guardar tokens en el repositorio.
2. Conceder lectura solo a las fuentes aprobadas (GitHub, pipeline y SonarQube) y restringir escritura a una identidad de ingestión.
3. Configurar paneles JSON desde `infra/grafana/dashboards/` tras confirmar nombres reales de métricas y UID del datasource.
4. Definir retención mínima necesaria, responsable, ACL y canal de alertas antes de activar datos individuales.
5. Para sujeto individual exigir aviso al equipo y acceso autorizado; evitar ranking y no inferir calidad individual a partir del número de commits.

El dashboard individual no debe publicarse hasta completar `docs/privacy/team-metrics.md` y las ACL del workspace. Los registros del artefacto no sustituyen la revisión de privacidad.
