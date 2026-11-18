# Observabilidad y telemetría de entrega

## Recolección actual

`.github/workflows/telemetry.yml` consume únicamente eventos `workflow_run` completados del CI de `main` y consulta el objeto de ejecución suministrado por GitHub: nombre, branch, SHA, resultado e intervalo. Genera un registro JSONL con métrica en segundos y sujeto `team`; no recoge nombres de personas ni datos de commits individuales. El job escribe y retiene el artefacto JSONL durante 30 días antes de intentar la exportación OTLP de métricas. Los fallos transitorios reintentan hasta tres veces con espera exponencial; si Grafana no responde o no está configurado, el job deja advertencia y conserva el artefacto para reintento/importación. El workflow solo usa permisos de lectura y un secreto dedicado de ingestión; nunca recibe secretos de despliegue.

Configurar `GRAFANA_OTLP_METRICS_ENDPOINT` como variable del repositorio con la URL HTTPS completa de métricas OTLP, cuyo path termina en /v1/metrics y `GRAFANA_OTLP_AUTHORIZATION` como secreto de Actions con el valor de autorización generado por el portal de Grafana Cloud. No usar token personal ni copiar credenciales al repositorio. El secreto no se imprime en logs.

Esta salida durable no afirma que la fuente Grafana esté conectada. La ingestión remota necesita una cuenta/stack Grafana Cloud, datasource aprobado, política de retención y credencial de alcance mínimo añadida como secreto de Actions del repositorio; configurar esos valores es una puerta externa de T059.

## Configuración de Grafana pendiente

1. Crear datasource Prometheus o Grafana Cloud Metrics en el workspace de proyecto y obtener UID propio del entorno; no guardar tokens en el repositorio.
2. Conceder lectura solo a las fuentes aprobadas (GitHub, pipeline y SonarQube) y restringir escritura a una identidad de ingestión.
3. Configurar paneles JSON desde `infra/grafana/dashboards/` tras confirmar nombres reales de métricas y UID del datasource.
4. Definir retención mínima necesaria, responsable, ACL y canal de alertas antes de activar datos individuales.
5. Para sujeto individual exigir aviso al equipo y acceso autorizado; evitar ranking y no inferir calidad individual a partir del número de commits.

El endpoint OTLP recomendado está descrito por la [documentación oficial de Grafana Cloud](https://grafana.com/docs/grafana-cloud/send-data/otlp/send-data-otlp/). La conexión real, autenticación, importación y consulta de métricas siguen pendientes de T059; un artefacto retenido no prueba ingestión.

El dashboard individual no debe publicarse hasta completar `docs/privacy/team-metrics.md` y las ACL del workspace. Los registros del artefacto no sustituyen la revisión de privacidad.

## Fuentes declarativas y configuración externa

`infra/grafana/datasources.yaml` contiene el estado deseado de la fuente GitHub y de la fuente Prometheus que lee las métricas OTLP. Todos los valores sensibles se resuelven desde variables del entorno de provisionamiento; el archivo no contiene tokens, URLs reales ni claves. En Grafana Cloud, instalar el plugin GitHub desde el catálogo y aplicar este estado mediante el mecanismo soportado por el stack (UI, API o Terraform); el archivo por sí solo no crea una fuente en la nube.

Pasos que requieren a un administrador autorizado:

1. Usar un stack Grafana Cloud ya disponible o confirmar la disponibilidad y condiciones del plan gratuito antes de crear uno. No habilitar un plan con costo sin aprobación.
2. Instalar el plugin GitHub y crear una GitHub App instalada solo en `magomez36/cafeteria_Arquitectura-de-Software`. Conceder solo lectura a Metadata, Contents, Issues, Pull requests, Packages, Repository security advisories y Projects. Guardar App ID, Installation ID y clave privada en el gestor de secretos de Grafana; mapearlos a los nombres del YAML y ejecutar **Save & test**.
3. Crear credenciales de solo lectura para consultar Grafana Cloud Metrics y mapear URL, usuario e identificador de credencial a `GRAFANA_CLOUD_PROMETHEUS_URL`, `GRAFANA_CLOUD_METRICS_USER` y `GRAFANA_CLOUD_METRICS_READ_TOKEN`. La fuente Prometheus debe conservar el UID `DS_PROMETHEUS` usado por los dashboards.
4. Para emitir desde Actions, crear además la variable `GRAFANA_OTLP_METRICS_ENDPOINT` (path terminado en `/v1/metrics`) y el secreto de repositorio `GRAFANA_OTLP_AUTHORIZATION`; son distintos de las credenciales de lectura de Prometheus.
5. La fuente SonarQube sigue pendiente: primero completar T031 con una organización/proyecto SonarQube Cloud real y después escoger y probar una integración de consulta con token de proyecto de solo lectura. No existe en este repositorio una URL, token ni datasource SonarQube probado; no completar T059 hasta registrar esa decisión y verificar **Save & test** o su equivalente.
6. Una vez integradas estas fuentes, comparar sus UID y nombres reales con las consultas de `infra/grafana/dashboards/`, validar alertas y documentar fecha, responsable y resultado sin adjuntar valores secretos.

Grafana describe el uso de GitHub Apps de solo lectura y el provisioning con `secureJsonData` en su [guía del datasource GitHub](https://grafana.com/docs/plugins/grafana-github-datasource/latest/configure/) y [guía de provisioning](https://grafana.com/docs/grafana/latest/administration/provisioning/). La activación en Cloud y las pruebas reales siguen pendientes.
