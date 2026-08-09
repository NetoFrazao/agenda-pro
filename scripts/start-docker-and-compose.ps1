$ErrorActionPreference = 'Continue'
$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')

$dockerExe = (Get-Command docker).Source
$root = (Get-Item -LiteralPath $dockerExe).Directory.Parent.Parent.FullName
$desktop = Join-Path $root 'Docker Desktop.exe'

Write-Host "Starting Docker Desktop: $desktop"
if (Test-Path -LiteralPath $desktop) {
  Start-Process -FilePath $desktop
} else {
  Write-Host 'Docker Desktop.exe not found'
  exit 1
}

Write-Host 'Waiting for Docker engine...'
$ready = $false
for ($i = 1; $i -le 40; $i++) {
  $pinfo = New-Object System.Diagnostics.ProcessStartInfo
  $pinfo.FileName = 'docker'
  $pinfo.Arguments = 'info --format {{.ServerVersion}}'
  $pinfo.RedirectStandardOutput = $true
  $pinfo.RedirectStandardError = $true
  $pinfo.UseShellExecute = $false
  $pinfo.CreateNoWindow = $true
  $p = New-Object System.Diagnostics.Process
  $p.StartInfo = $pinfo
  try {
    [void]$p.Start()
    if (-not $p.WaitForExit(10000)) {
      try { $p.Kill() } catch {}
      Write-Host "try $i timeout"
    } else {
      $out = $p.StandardOutput.ReadToEnd().Trim()
      if ($p.ExitCode -eq 0 -and $out) {
        Write-Host "READY server=$out after $i tries"
        $ready = $true
        break
      }
      Write-Host "try $i exit=$($p.ExitCode)"
    }
  } catch {
    Write-Host "try $i error: $($_.Exception.Message)"
  }
  Start-Sleep -Seconds 5
}

if (-not $ready) {
  Write-Host 'ENGINE_TIMEOUT'
  exit 1
}

Set-Location 'C:\Users\João Neto\Projects\agenda-pro'
docker compose up -d
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
docker compose ps
Write-Host 'COMPOSE_OK'
