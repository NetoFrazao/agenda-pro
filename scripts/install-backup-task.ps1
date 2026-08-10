# Instala Task Scheduler diário para backup (Windows).
# Uso (Admin recomendado):
#   powershell -ExecutionPolicy Bypass -File .\scripts\install-backup-task.ps1
#   powershell -File .\scripts\install-backup-task.ps1 -DryRun
#   powershell -File .\scripts\install-backup-task.ps1 -Time '03:15'

param(
  [switch]$DryRun,
  [string]$TaskName = 'AgendaPro-Backup',
  [string]$Time = '03:15',
  [string]$ComposeFile = ''
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$script = Join-Path $PSScriptRoot 'backup-postgres.ps1'

$composeArg = if ($ComposeFile) { " -ComposeFile `"$ComposeFile`"" } elseif ($env:COMPOSE_FILE) { " -ComposeFile `"$env:COMPOSE_FILE`"" } else { '' }
$actionArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$script`"$composeArg"
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $actionArgs -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -Daily -At $Time
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries

Write-Host "==> Task: $TaskName @ $Time"
Write-Host "==> Action: powershell.exe $actionArgs"

if ($DryRun) {
  Write-Host '[dry-run] Task Scheduler não alterado'
  exit 0
}

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Write-Host "OK task registrada. Verifique: Get-ScheduledTask -TaskName $TaskName"
Write-Host 'Defina BACKUP_OFFHOST_DIR e BACKUP_ALERT_WEBHOOK_URL no ambiente do usuário/serviço da task.'
