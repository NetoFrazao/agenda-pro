# Restore a partir de dump .sql gerado por backup-postgres.ps1
# DESTRUTIVO no banco alvo — exige -ConfirmRestore
# Uso:
#   powershell -File .\scripts\restore-postgres.ps1 -DumpFile backups\arquivo.sql -DryRun
#   powershell -File .\scripts\restore-postgres.ps1 -DumpFile backups\arquivo.sql -ConfirmRestore

param(
  [Parameter(Mandatory = $true)][string]$DumpFile,
  [switch]$DryRun,
  [switch]$ConfirmRestore,
  [string]$ComposeFile = 'docker-compose.yml',
  [string]$Service = 'postgres'
)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

$user = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { 'agenda' }
$db = if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { 'agenda_pro' }

if (-not (Test-Path $DumpFile)) {
  Write-Error "Dump não encontrado: $DumpFile"
  exit 1
}

Write-Host "==> Restore alvo: $db @ $Service (compose $ComposeFile)"
Write-Host "==> Dump: $DumpFile"

if ($DryRun) {
  Write-Host "[dry-run] Get-Content $DumpFile | docker compose -f $ComposeFile exec -T $Service psql -U $user -d $db -v ON_ERROR_STOP=1"
  Write-Host '[dry-run] nenhum dado alterado.'
  exit 0
}

if (-not $ConfirmRestore) {
  Write-Error 'Recuse implícita: passe -ConfirmRestore para aplicar (ou -DryRun para simular).'
  exit 2
}

Write-Host 'ATENÇÃO: isso aplica o dump no banco alvo (pode sobrescrever objetos).'
Get-Content -Path $DumpFile -Raw | docker compose -f $ComposeFile exec -T $Service `
  psql -U $user -d $db -v ON_ERROR_STOP=1

if ($LASTEXITCODE -ne 0) {
  Write-Error "psql restore falhou (exit $LASTEXITCODE)"
  exit $LASTEXITCODE
}
Write-Host 'OK restore concluído. Se o dump for antigo vs schema atual, rode npm run db:migrate.'
