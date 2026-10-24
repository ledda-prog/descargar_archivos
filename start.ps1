$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $projectRoot

$machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$env:Path = "$machinePath;$userPath"

foreach ($command in @('node', 'yt-dlp', 'ffmpeg')) {
  if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
    throw "Falta $command en PATH. Cerrá y abrí la terminal, o reinstalá la dependencia."
  }
}

$server = Start-Process -FilePath 'node' -ArgumentList '.\backend\server.js' -WorkingDirectory $projectRoot -NoNewWindow -PassThru
try {
  Start-Sleep -Seconds 2
  if ($server.HasExited) { throw 'El servidor no pudo iniciar.' }
  Start-Process 'http://127.0.0.1:3000'
  Write-Host 'MediaHub está activo. Cerrá esta ventana o presioná Ctrl+C para detenerlo.'
  Wait-Process -Id $server.Id
} finally {
  if (-not $server.HasExited) { Stop-Process -Id $server.Id -Force }
}
