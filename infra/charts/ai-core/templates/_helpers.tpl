{{- define "ai-core.name" -}}
{{- .Chart.Name }}
{{- end }}

{{- define "ai-core.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{- define "ai-core.labels" -}}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
app.kubernetes.io/name: {{ include "ai-core.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "ai-core.selectorLabels" -}}
app.kubernetes.io/name: {{ include "ai-core.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
