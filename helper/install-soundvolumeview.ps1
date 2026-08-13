<#
  Baixa o SoundVolumeView (NirSoft) para a pasta helper/.

  Ele e o que permite rotear APENAS o Spotify, sem mexer no dispositivo padrao
  do Windows. Sem ele o helper fica limitado ao modo "system".

  Uso: powershell -ExecutionPolicy Bypass -File install-soundvolumeview.ps1
#>

[CmdletBinding()]
param(
    [string]$Url = "https://www.nirsoft.net/utils/soundvolumeview-x64.zip"
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$target    = Join-Path $scriptDir "SoundVolumeView.exe"

if (Test-Path -LiteralPath $target) {
    Write-Host "SoundVolumeView.exe ja esta em $scriptDir" -ForegroundColor Green
    return
}

# PowerShell 5.1 ainda negocia TLS 1.0 por padrao; nirsoft.net exige 1.2.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$temp = Join-Path ([IO.Path]::GetTempPath()) ("svv-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $temp -Force | Out-Null
$zip = Join-Path $temp "soundvolumeview.zip"

try {
    Write-Host "Baixando $Url ..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri $Url -OutFile $zip -UseBasicParsing -UserAgent "Mozilla/5.0"

    $size = (Get-Item $zip).Length
    Write-Host "  recebido: $size bytes"
    if ($size -lt 20000) { throw "Arquivo pequeno demais ($size bytes) - provavelmente nao e o zip esperado." }

    Expand-Archive -LiteralPath $zip -DestinationPath $temp -Force

    $exe = Get-ChildItem -LiteralPath $temp -Filter "SoundVolumeView.exe" -Recurse | Select-Object -First 1
    if (-not $exe) { throw "SoundVolumeView.exe nao encontrado dentro do zip." }

    Copy-Item -LiteralPath $exe.FullName -Destination $target -Force

    $info = (Get-Item $target).VersionInfo
    Write-Host ""
    Write-Host "Instalado em: $target" -ForegroundColor Green
    Write-Host "  versao:    $($info.FileVersion)"
    Write-Host "  descricao: $($info.FileDescription)"
    Write-Host ""
    Write-Host "Reinicie o helper para ele entrar no modo 'app':" -ForegroundColor Yellow
    Write-Host "  Invoke-WebRequest -Uri http://localhost:37549/shutdown -Method POST -UseBasicParsing"
    Write-Host "  e abra novamente (ou faca logoff/logon se usa o auto-start)."
}
finally {
    Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
}
