<#
  Faz o helper subir sozinho no login do Windows, sem janela de console
  e sem precisar de administrador.

  Instalar:    powershell -ExecutionPolicy Bypass -File install-autostart.ps1
  Desinstalar: powershell -ExecutionPolicy Bypass -File install-autostart.ps1 -Uninstall
#>

[CmdletBinding()]
param(
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"

$scriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$helperPath = Join-Path $scriptDir "audio-helper.ps1"
$launcher   = Join-Path $scriptDir "start-helper-hidden.vbs"
$startup    = [Environment]::GetFolderPath("Startup")
$shortcut   = Join-Path $startup "Spicetify audio-config helper.lnk"

if ($Uninstall) {
    foreach ($path in @($shortcut, $launcher)) {
        if (Test-Path -LiteralPath $path) {
            Remove-Item -LiteralPath $path -Force
            Write-Host "Removido: $path" -ForegroundColor Yellow
        }
    }
    Write-Host "Auto-start desinstalado." -ForegroundColor Green
    return
}

if (-not (Test-Path -LiteralPath $helperPath)) {
    throw "audio-helper.ps1 nao encontrado em $scriptDir"
}

# O .vbs existe so para engolir a janela do PowerShell (WindowStyle Hidden
# ainda pisca um console; o WScript.Shell com modo 0 nao pisca).
$vbs = @"
' Gerado por install-autostart.ps1 - inicia o helper sem janela visivel.
Set shell = CreateObject("WScript.Shell")
shell.Run "powershell -NoProfile -ExecutionPolicy Bypass -File ""$helperPath""", 0, False
"@
Set-Content -LiteralPath $launcher -Value $vbs -Encoding ASCII

$wshell = New-Object -ComObject WScript.Shell
$link = $wshell.CreateShortcut($shortcut)
$link.TargetPath       = "wscript.exe"
$link.Arguments        = """$launcher"""
$link.WorkingDirectory = $scriptDir
$link.Description      = "Helper de saida de audio da extensao Spicetify audio-config"
$link.Save()

Write-Host "Auto-start instalado." -ForegroundColor Green
Write-Host "  Atalho: $shortcut"
Write-Host "  Alvo:   $launcher"
Write-Host ""
Write-Host "Iniciando o helper agora..." -ForegroundColor Cyan
Start-Process -FilePath "wscript.exe" -ArgumentList """$launcher""" -WorkingDirectory $scriptDir
Write-Host "Pronto. Teste em http://localhost:37549/health"
