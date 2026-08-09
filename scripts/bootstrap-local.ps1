# Bootstrap local após Docker Desktop + WSL estarem ok (pós-reboot se necessário).
# Uso: powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-local.ps1

$ErrorActionPreference = 'Stop'
$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')
Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host '==> Checando Docker engine...'
$ready = $false
for ($i = 1; $i -le 30; $i++) {
  $pinfo = New-Object System.Diagnostics.ProcessStartInfo
  $pinfo.FileName = 'docker'
  $pinfo.Arguments = 'info --format {{.ServerVersion}}'
  $pinfo.RedirectStandardOutput = $true
  $pinfo.RedirectStandardError = $true
  $pinfo.UseShellExecute = $false
  $pinfo.CreateNoWindow = $true
  $p = New-Object System.Diagnostics.Process
  $p.StartInfo = $pinfo
  [void]$p.Start()
  if (-not $p.WaitForExit(8000)) {
    try { $p.Kill() } catch {}
    Write-Host "  try $i timeout"
  } else {
    $out = $p.StandardOutput.ReadToEnd().Trim()
    if ($p.ExitCode -eq 0 -and $out) {
      Write-Host "  Docker OK: $out"
      $ready = $true
      break
    }
    Write-Host "  try $i exit=$($p.ExitCode)"
  }
  Start-Sleep -Seconds 4
}

if (-not $ready) {
  Write-Host 'Docker engine ainda não responde. Abra o Docker Desktop e aguarde ficar verde, depois rode este script de novo.'
  exit 1
}

Write-Host '==> docker compose up -d'
docker compose up -d

Write-Host '==> Aguardando Postgres...'
for ($i = 1; $i -le 30; $i++) {
  docker compose exec -T postgres pg_isready -U agenda -d agenda_pro 2>$null
  if ($LASTEXITCODE -eq 0) { break }
  Start-Sleep -Seconds 2
}

Write-Host '==> npm install / prisma / seed'
npm install
npm run db:generate
npm run db:migrate
npm run prisma:seed -w @agenda-pro/api

Write-Host ''
Write-Host 'Pronto. Em dois terminais:'
Write-Host '  npm run dev:api'
Write-Host '  npm run dev:web'
Write-Host ''
Write-Host 'Swagger: http://localhost:3001/docs'
Write-Host 'Web:     http://localhost:3000'
Write-Host 'Seed:    dono@demo.local / SenhaDemo123!  →  /u/demo-barbearia'
