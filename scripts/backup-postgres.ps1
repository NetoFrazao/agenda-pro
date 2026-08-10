# Backup lógico do Postgres (pg_dump via container Docker).
# Uso (raiz do repo):
#   powershell -ExecutionPolicy Bypass -File .\scripts\backup-postgres.ps1
#   powershell -ExecutionPolicy Bypass -File .\scripts\backup-postgres.ps1 -DryRun
# Nunca assume produção. Restore: BACKUP.md / DISASTER-RECOVERY.md

param(
  [switch]$DryRun,
  [string]$ComposeFile = 'docker-compose.yml',
  [string]$Service = 'postgres',
  [string]$OutDir = 'backups',
  # Cópia off-host: diretório local montado (ex. sync Drive) ou path de rede.
  # Alternativa: $env:BACKUP_OFFHOST_DIR
  [string]$OffHostDir = ''
)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

$user = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { 'agenda' }
$db = if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { 'agenda_pro' }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$outFile = Join-Path $OutDir "agenda-pro-$stamp.sql"
$offHost = if ($OffHostDir) { $OffHostDir } elseif ($env:BACKUP_OFFHOST_DIR) { $env:BACKUP_OFFHOST_DIR } else { '' }
$hook = if ($env:BACKUP_ALERT_WEBHOOK_URL) { $env:BACKUP_ALERT_WEBHOOK_URL } elseif ($env:HEALTH_ALERT_WEBHOOK_URL) { $env:HEALTH_ALERT_WEBHOOK_URL } else { '' }

function Send-BackupAlert([string]$Message) {
  Write-Warning $Message
  if (-not $hook) { return }
  try {
    $payload = @{ text = $Message; content = $Message } | ConvertTo-Json
    Invoke-RestMethod -Uri $hook -Method POST -Body $payload -ContentType 'application/json' | Out-Null
  } catch {
    Write-Warning "Falha ao postar alerta: $($_.Exception.Message)"
  }
}

Write-Host "==> Compose: $ComposeFile  service: $Service  db: $db"
Write-Host "==> Destino: $outFile"
if ($offHost) { Write-Host "==> Off-host: $offHost" }

if ($DryRun) {
  Write-Host "[dry-run] docker compose -f $ComposeFile exec -T $Service pg_dump -U $user -d $db --no-owner --format=plain > $outFile"
  if ($offHost) {
    Write-Host "[dry-run] Copy-Item $outFile $offHost"
  }
  Write-Host '[dry-run] nenhum arquivo escrito.'
  exit 0
}

if (-not (Test-Path $OutDir)) {
  New-Item -ItemType Directory -Path $OutDir | Out-Null
}

try {
  docker compose -f $ComposeFile exec -T $Service `
    pg_dump -U $user -d $db --no-owner --format=plain | Set-Content -Path $outFile -Encoding utf8
  if ($LASTEXITCODE -ne 0) {
    throw "pg_dump falhou (exit $LASTEXITCODE)"
  }
} catch {
  Send-BackupAlert "[Agenda Pro] BACKUP FALHOU: $($_.Exception.Message)"
  throw
}

$size = (Get-Item $outFile).Length
if ($size -lt 100) {
  Send-BackupAlert "[Agenda Pro] BACKUP FALHOU dump suspeito ($size bytes)"
  Write-Error "Dump suspeitamente pequeno ($size bytes)"
  exit 1
}

Write-Host "OK backup: $outFile ($size bytes)"

if ($offHost) {
  if (-not (Test-Path $offHost)) {
    New-Item -ItemType Directory -Path $offHost -Force | Out-Null
  }
  $dest = Join-Path $offHost (Split-Path $outFile -Leaf)
  Copy-Item -Path $outFile -Destination $dest -Force
  Write-Host "OK off-host: $dest"
} else {
  Write-Host 'Aviso: BACKUP_OFFHOST_DIR não definido — cópia off-host não feita (RPO local only).'
}

Write-Host 'Restore: .\scripts\restore-postgres.ps1 -DumpFile <arquivo> -DryRun'
Write-Host 'Drill: .\scripts\restore-drill.ps1 -DumpFile <arquivo>'
