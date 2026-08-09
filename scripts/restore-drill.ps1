# Restore drill (não destrutivo por padrão): valida dump + dry-run do restore.
# Uso:
#   powershell -File .\scripts\restore-drill.ps1 -DumpFile backups\agenda-pro-XXXX.sql
# Para restore real em ambiente descartável:
#   powershell -File .\scripts\restore-drill.ps1 -DumpFile ... -Apply

param(
  [Parameter(Mandatory = $true)][string]$DumpFile,
  [switch]$Apply,
  [string]$ComposeFile = 'docker-compose.yml'
)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

if (-not (Test-Path $DumpFile)) {
  Write-Error "Dump não encontrado: $DumpFile"
  exit 1
}

$item = Get-Item $DumpFile
Write-Host "==> Dump: $($item.FullName) ($($item.Length) bytes, $($item.LastWriteTimeUtc) UTC)"
if ($item.Length -lt 100) {
  Write-Error 'Dump suspeitamente pequeno — abortando drill.'
  exit 1
}

# Smoke: arquivo parece SQL
$head = Get-Content $DumpFile -TotalCount 5 -ErrorAction SilentlyContinue
if (-not ($head -join "`n" | Select-String -Pattern 'PostgreSQL|CREATE|SET' -Quiet)) {
  Write-Warning 'Conteúdo não parece pg_dump plain — revise manualmente.'
}

Write-Host '==> Dry-run restore'
& powershell -ExecutionPolicy Bypass -File .\scripts\restore-postgres.ps1 -DumpFile $DumpFile -DryRun -ComposeFile $ComposeFile
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (-not $Apply) {
  Write-Host 'OK drill (validação + dry-run). Para aplicar em DB descartável: -Apply'
  Write-Host 'Checklist: BACKUP.md § Restore + smoke GET /api/health e /api/health/ready'
  exit 0
}

Write-Host '==> APPLY restore (destrutivo no DB alvo)'
& powershell -ExecutionPolicy Bypass -File .\scripts\restore-postgres.ps1 -DumpFile $DumpFile -ConfirmRestore -ComposeFile $ComposeFile
exit $LASTEXITCODE
