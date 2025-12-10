{{/*
Expand the name of the chart.
*/}}
{{- define "universal-app.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "universal-app.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- .Values.global.appName | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "universal-app.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "universal-app.labels" -}}
helm.sh/chart: {{ include "universal-app.chart" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: {{ .Values.global.appName }}
{{- if .Values.global.labels }}
{{ toYaml .Values.global.labels }}
{{- end }}
{{- end }}

{{/*
Component labels - accepts a dict with root context and component
*/}}
{{- define "universal-app.componentLabels" -}}
{{ include "universal-app.labels" .root }}
app.kubernetes.io/name: {{ .component.name }}
app.kubernetes.io/instance: {{ .root.Release.Name }}-{{ .component.name }}
app.kubernetes.io/component: {{ .component.type | default "backend" }}
{{- end }}

{{/*
Selector labels for a component
*/}}
{{- define "universal-app.componentSelectorLabels" -}}
app.kubernetes.io/name: {{ .component.name }}
app.kubernetes.io/instance: {{ .root.Release.Name }}-{{ .component.name }}
app.kubernetes.io/part-of: {{ .root.Values.global.appName }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "universal-app.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "universal-app.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Get component replicas with fallback to defaults
*/}}
{{- define "universal-app.componentReplicas" -}}
{{- .component.replicas | default .root.Values.componentDefaults.replicas | default 1 }}
{{- end }}

{{/*
Get component resources with fallback to defaults
*/}}
{{- define "universal-app.componentResources" -}}
{{- if .component.resources }}
{{- toYaml .component.resources }}
{{- else }}
{{- toYaml .root.Values.componentDefaults.resources }}
{{- end }}
{{- end }}

{{/*
Database connection string for PostgreSQL
*/}}
{{- define "universal-app.postgresConnectionString" -}}
{{- if .Values.databases.simplePostgresql.enabled }}
postgresql://{{ .Values.databases.simplePostgresql.auth.username }}:{{ .Values.databases.simplePostgresql.auth.password }}@{{ include "universal-app.fullname" . }}-postgresql:5432/{{ .Values.databases.simplePostgresql.auth.database }}
{{- else if .Values.databases.postgresql.enabled }}
postgresql://{{ .Values.databases.postgresql.auth.username }}:{{ .Values.databases.postgresql.auth.password }}@{{ .Release.Name }}-postgresql:5432/{{ .Values.databases.postgresql.auth.database }}
{{- end }}
{{- end }}

