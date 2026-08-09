# Monitora GET /api/health/ready e alerta via webhook (Discord/Slack/generic).
# Uso:
#   $env:HEALTH_READY_URL = 'http://localhost:3001/api/health/ready'
#   $env:HEALTH_ALERT_WEBHOOK_URL = 'https://hooks.slack.com/...'
#   powershell -File .\scripts\watch-ready.ps1
# Agendar: Task Scheduler a cada 1–5 min.

param(
  [string]$ReadyUrl = '',
  [string]$WebhookUrl = '',
  [int]$TimeoutSec = 5
)

$ErrorActionPreference = 'Stop'
$url = if ($ReadyUrl) { $ReadyUrl } elseif ($env:HEALTH_READY_URL) { $env:HEALTH_READY_URL } else { 'http://localhost:3001/api/health/ready' }
$hook = if ($WebhookUrl) { $WebhookUrl } elseif ($env:HEALTH_ALERT_WEBHOOK_URL) { $env:HEALTH_ALERT_WEBHOOK_URL } else { '' }

try {
  $res = Invoke-WebRequest -Uri $url -Method GET -TimeoutSec $TimeoutSec -UseBasicParsing
  $code = [int]$res.StatusCode
  $body = $res.Content
} catch {
  $code = 0
  $body = $_.Exception.Message
}

$ok = $code -eq 200
Write-Host "$(Get-Date -Format o) ready=$ok status=$code"

if ($ok) { exit 0 }

$payload = @{
  text = "[Agenda Pro] /api/health/ready FALHOU status=$code body=$body"
  content = "[Agenda Pro] /api/health/ready FALHOU status=$code"
} | ConvertTo-Json

if ($hook) {
  try {
    Invoke-RestMethod -Uri $hook -Method POST -Body $payload -ContentType 'application/json' | Out-Null
    Write-Host 'Alerta enviado ao webhook.'
  } catch {
    Write-Warning "Falha ao postar webhook: $($_.Exception.Message)"
  }
} else {
  Write-Warning 'HEALTH_ALERT_WEBHOOK_URL não definido — só log local.'
}

exit 1
