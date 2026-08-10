# Clone local Postgres DB, seed dirty fixtures, diagnose, migrate (rehearsal).
# NEVER points at production. Target DB default: agenda_pro_mig_safety_r4
#
# Usage (repo root):
#   powershell -File .\scripts\migration-safety\run-clone-migrate.ps1
#   powershell -File .\scripts\migration-safety\run-clone-migrate.ps1 -SkipSeed
#   powershell -File .\scripts\migration-safety\run-clone-migrate.ps1 -ResolveOverlapsBeforeMigrate

param(
  [string]$SourceDb = 'agenda_pro',
  [string]$CloneDb = 'agenda_pro_mig_safety_r4',
  [string]$Container = 'agenda-pro-postgres',
  [string]$User = 'agenda',
  [string]$Password = '',
  [switch]$SkipSeed,
  [switch]$ResolveOverlapsBeforeMigrate,
  [switch]$SkipMigrate
)

$ErrorActionPreference = 'Stop'
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $repoRoot

$evidenceDir = Join-Path $PSScriptRoot 'evidence'
if (-not (Test-Path $evidenceDir)) {
  New-Item -ItemType Directory -Path $evidenceDir | Out-Null
}
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$evidenceLog = Join-Path $evidenceDir "clone-migrate-$stamp.log"

function Write-Log([string]$Message) {
  $line = '[{0}] {1}' -f (Get-Date -Format 'o'), $Message
  Write-Host $line
  Add-Content -Path $evidenceLog -Value $line
}

function Invoke-PsqlFile([string]$Db, [string]$File) {
  if (-not (Test-Path $File)) { throw "SQL file missing: $File" }
  Get-Content -Raw -Path $File | docker exec -i $Container psql -U $User -d $Db -v ON_ERROR_STOP=1 -f -
  if ($LASTEXITCODE -ne 0) { throw "psql failed on $File (db=$Db, exit=$LASTEXITCODE)" }
}

function Invoke-PsqlCmd([string]$Db, [string]$Sql) {
  docker exec -i $Container psql -U $User -d $Db -v ON_ERROR_STOP=1 -c $Sql
  if ($LASTEXITCODE -ne 0) { throw "psql -c failed (db=$Db, exit=$LASTEXITCODE)" }
}

function Invoke-Diagnose([string]$Db, [string]$JsonOut, [switch]$Verbose) {
  $diag = Join-Path $PSScriptRoot 'diagnose.mjs'
  $argList = @($diag, '--db', $Db, '--json-out', $JsonOut)
  if ($Verbose) { $argList += '--verbose' }
  # Capture stdout/stderr without polluting function return (PS returns all pipeline output)
  $output = & node $argList 2>&1 | ForEach-Object { "$_" }
  $code = $LASTEXITCODE
  foreach ($line in $output) { Write-Log $line }
  return [int]$code
}

function Resolve-PrismaCmd {
  $candidates = @(
    (Join-Path $repoRoot 'node_modules\.bin\prisma.cmd'),
    (Join-Path $repoRoot 'node_modules\.bin\prisma'),
    (Join-Path $repoRoot '..\agenda-pro\node_modules\.bin\prisma.cmd'),
    (Join-Path $repoRoot '..\agenda-pro\node_modules\.bin\prisma')
  )
  foreach ($c in $candidates) {
    if (Test-Path $c) { return (Resolve-Path $c).Path }
  }
  return $null
}

function Invoke-MigrateDeploy([string]$Db, [string]$OutFile) {
  $pw = $Password
  if (-not $pw) { $pw = $env:POSTGRES_PASSWORD }
  if (-not $pw) { $pw = 'agenda_secret' }
  $env:DATABASE_URL = "postgresql://${User}:${pw}@localhost:5432/${Db}?schema=public"
  Write-Log "DATABASE_URL host=localhost db=$Db (password redacted)"

  $schema = Join-Path $repoRoot 'apps\api\prisma\schema.prisma'
  $prisma = Resolve-PrismaCmd
  if (-not $prisma) {
    Write-Log 'ERROR: Prisma CLI v6 not found (worktree node_modules or sibling agenda-pro). Refusing npx latest.'
    Set-Content -Path $OutFile -Value 'Prisma CLI missing — install deps or link sibling node_modules' -Encoding utf8
    return 127
  }
  Write-Log "prisma cli=$prisma"
  # cmd.exe avoids PowerShell NativeCommandError on npm/prisma stderr when ErrorActionPreference=Stop
  $cmd = "`"$prisma`" migrate deploy --schema `"$schema`" > `"$OutFile`" 2>&1"
  cmd /c $cmd
  $code = $LASTEXITCODE
  if (Test-Path $OutFile) {
    Get-Content -Path $OutFile | ForEach-Object { Write-Log $_ }
  }
  Write-Log "migrate exit=$code"
  return [int]$code
}

Write-Log '==> migration-safety clone/migrate'
Write-Log "repo=$repoRoot source=$SourceDb clone=$CloneDb container=$Container"
Write-Log "evidence=$evidenceLog"

if ($SourceDb -match 'prod|production' -or $CloneDb -match 'prod|production') {
  throw 'Refusing source/clone name that looks like production.'
}

Write-Log "==> DROP/CREATE clone database $CloneDb (from dump of $SourceDb)"
Invoke-PsqlCmd 'postgres' "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$CloneDb' AND pid <> pg_backend_pid();"
Invoke-PsqlCmd 'postgres' "DROP DATABASE IF EXISTS `"$CloneDb`";"
Invoke-PsqlCmd 'postgres' "CREATE DATABASE `"$CloneDb`" WITH OWNER `"$User`" TEMPLATE template0 ENCODING 'UTF8';"

$dumpFile = Join-Path $evidenceDir "source-dump-$stamp.sql"
Write-Log "==> pg_dump $SourceDb -> $dumpFile"
docker exec -i $Container pg_dump -U $User -d $SourceDb --no-owner --format=plain | Set-Content -Path $dumpFile -Encoding utf8
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed (exit=$LASTEXITCODE)" }
$size = (Get-Item $dumpFile).Length
if ($size -lt 100) { throw "Dump suspiciously small ($size bytes)" }
Write-Log "dump size=$size bytes"

Write-Log "==> restore into $CloneDb"
Get-Content -Raw -Path $dumpFile | docker exec -i $Container psql -U $User -d $CloneDb -v ON_ERROR_STOP=1 -f -
if ($LASTEXITCODE -ne 0) { throw "restore failed (exit=$LASTEXITCODE)" }

Write-Log '==> unwind architecture_integrity on clone (so migrate can re-apply)'
Invoke-PsqlFile $CloneDb (Join-Path $PSScriptRoot 'unwind-architecture-integrity.sql')

if (-not $SkipSeed) {
  Write-Log '==> seed dirty fixtures (overlaps + phone dups + waitlist dups)'
  Invoke-PsqlFile $CloneDb (Join-Path $PSScriptRoot 'seed-dirty-fixtures.sql')
}

$preJson = Join-Path $evidenceDir "diagnose-pre-$stamp.json"
Write-Log "==> diagnose PRE-migrate -> $preJson"
$preExit = Invoke-Diagnose -Db $CloneDb -JsonOut $preJson -Verbose
Write-Log "diagnose pre exit=$preExit"

if ($ResolveOverlapsBeforeMigrate) {
  Write-Log '==> resolve overlaps BEFORE first migrate attempt'
  Invoke-PsqlFile $CloneDb (Join-Path $PSScriptRoot 'resolve-overlaps-cancel-later.sql')
  $preResolved = Join-Path $evidenceDir "diagnose-pre-resolved-$stamp.json"
  $null = Invoke-Diagnose -Db $CloneDb -JsonOut $preResolved
}

$migrateExit = 'skipped'
$migrateRetryExit = 'n/a'
$migrateOut = Join-Path $evidenceDir "migrate-attempt1-$stamp.txt"
$migrateOut2 = Join-Path $evidenceDir "migrate-attempt2-$stamp.txt"

if (-not $SkipMigrate) {
  Write-Log "==> prisma migrate deploy attempt #1 against clone $CloneDb"
  $migrateExit = Invoke-MigrateDeploy -Db $CloneDb -OutFile $migrateOut

  if ($migrateExit -ne 0 -and -not $ResolveOverlapsBeforeMigrate) {
    Write-Log '==> attempt #1 FAILED (expected if overlaps seeded). Resolving overlaps then retry.'
    Invoke-PsqlFile $CloneDb (Join-Path $PSScriptRoot 'resolve-overlaps-cancel-later.sql')
    $midJson = Join-Path $evidenceDir "diagnose-mid-resolved-$stamp.json"
    $null = Invoke-Diagnose -Db $CloneDb -JsonOut $midJson

    $prisma = Resolve-PrismaCmd
    $schema = Join-Path $repoRoot 'apps\api\prisma\schema.prisma'
    if ($prisma) {
      Write-Log '==> prisma migrate resolve --rolled-back (clear failed attempt marker)'
      $resolveOut = Join-Path $evidenceDir "migrate-resolve-$stamp.txt"
      $cmd = "`"$prisma`" migrate resolve --rolled-back 20260810010000_architecture_integrity --schema `"$schema`" > `"$resolveOut`" 2>&1"
      cmd /c $cmd
      Write-Log "migrate resolve exit=$LASTEXITCODE"
      if (Test-Path $resolveOut) { Get-Content $resolveOut | ForEach-Object { Write-Log $_ } }
    }

    Write-Log '==> prisma migrate deploy attempt #2 (after overlap resolve)'
    $migrateRetryExit = Invoke-MigrateDeploy -Db $CloneDb -OutFile $migrateOut2
  }
}

$postJson = Join-Path $evidenceDir "diagnose-post-$stamp.json"
Write-Log "==> diagnose POST -> $postJson"
$postExit = Invoke-Diagnose -Db $CloneDb -JsonOut $postJson
Write-Log "diagnose post exit=$postExit"

Write-Log '==> constraint/index presence on clone'
$checkSql = @"
SELECT
  EXISTS(SELECT 1 FROM pg_constraint WHERE conname = 'appointments_no_overlap_active') AS has_exclude,
  EXISTS(SELECT 1 FROM pg_indexes WHERE indexname = 'clients_tenantId_phone_active_key') AS has_phone_unique,
  EXISTS(SELECT 1 FROM pg_indexes WHERE indexname = 'waitlist_tenant_date_phone_open_key') AS has_waitlist_unique,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'slotRange') AS has_slot_range,
  (SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name = '20260810010000_architecture_integrity' AND finished_at IS NOT NULL) AS migration_applied;
"@
Invoke-PsqlCmd $CloneDb $checkSql

Write-Log '==> post-migration seed row states'
Invoke-PsqlFile $CloneDb (Join-Path $PSScriptRoot 'seed-state.sql')

$finalMigrate = if ($migrateRetryExit -ne 'n/a') { $migrateRetryExit } else { $migrateExit }
$summaryPath = Join-Path $evidenceDir "RESULT-$stamp.md"
@"
# Clone migrate result ($stamp)

- **Source:** ``$SourceDb`` (local Docker ``$Container``) — NOT production
- **Clone:** ``$CloneDb``
- **Seed dirty:** $(-not $SkipSeed)
- **Resolve overlaps before migrate:** $ResolveOverlapsBeforeMigrate
- **Diagnose pre exit:** $preExit (0=OK, 2=WARN_DEDUP, 1=BLOCK)
- **Migrate attempt #1 exit:** $migrateExit
- **Migrate attempt #2 exit:** $migrateRetryExit
- **Final migrate exit:** $finalMigrate
- **Diagnose post exit:** $postExit
- Artifacts: ``diagnose-pre-$stamp.json``, ``migrate-attempt1-$stamp.txt``, ``diagnose-post-$stamp.json``, ``$(Split-Path $evidenceLog -Leaf)``

## Interpretação

- Se attempt #1 falhou com overlap seed: esperado — EXCLUDE GiST é blocker; Prisma aborta a transaction (dedup também reverte).
- Attempt #2 após cancelar overlap posterior: deve aplicar FKs/CHECKs/uniques/EXCLUDE + dedup de phone/waitlist.

"@ | Set-Content -Path $summaryPath -Encoding utf8

Write-Log "OK written $summaryPath"
if (($finalMigrate -is [int]) -and ($finalMigrate -ne 0)) {
  Write-Log "WARNING: final migrate exit=$finalMigrate"
  exit 1
}
Write-Log 'Done.'
exit 0
