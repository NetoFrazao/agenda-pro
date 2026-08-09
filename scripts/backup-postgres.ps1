# Backup lógico do Postgres (pg_dump via container Docker).
# Uso (raiz do repo):
#   powershell -ExecutionPolicy Bypass -File .\scripts\backup-postgres.ps1
#   powershell -ExecutionPolicy Bypass -File .\scripts\backup-postgres.ps1 -DryRun
# Nunca assume produção. Restore: BACKUP.md / DISASTER-RECOVERY.md

param(
  [switch]$DryRun,
  [string]$ComposeFile = 'docker-compose.yml',
  [string]$Service = 'postgres',
  [string]$OutDir = 'backups'
)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

$user = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { 'agenda' }
$db = if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { 'agenda_pro' }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$outFile = Join-Path $OutDir "agenda-pro-$stamp.sql"

Write-Host "==> Compose: $ComposeFile  service: $Service  db: $db"
Write-Host "==> Destino: $outFile"

if ($DryRun) {
  Write-Host "[dry-run] docker compose -f $ComposeFile exec -T $Service pg_dump -U $user -d $db --no-owner --format=plain > $outFile"
  Write-Host '[dry-run] nenhum arquivo escrito.'
  exit 0
}

if (-not (Test-Path $OutDir)) {
  New-Item -ItemType Directory -Path $OutDir | Out-Null
}

docker compose -f $ComposeFile exec -T $Service `
  pg_dump -U $user -d $db --no-owner --format=plain | Set-Content -Path $outFile -Encoding utf8

if ($LASTEXITCODE -ne 0) {
  Write-Error "pg_dump falhou (exit $LASTEXITCODE)"
  exit $LASTEXITCODE
}

$size = (Get-Item $outFile).Length
Write-Host "OK backup: $outFile ($size bytes)"
Write-Host 'Restore: .\scripts\restore-postgres.ps1 -DumpFile <arquivo> -DryRun'
