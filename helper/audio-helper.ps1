<#
  audio-config helper
  -------------------
  Pequeno servidor HTTP local que a extensao Spicetify usa para listar e trocar
  o dispositivo de saida de audio do Windows.

  Rotas (todas em http://localhost:37549):
    GET  /health          -> { ok, version, mode, target }
    GET  /devices         -> [ { id, name, isDefault } ]
    POST /default         -> body { id }  -> troca o dispositivo
    POST /shutdown        -> encerra o helper

  Modos:
    "app"    - roteia SOMENTE o Spotify, se SoundVolumeView.exe estiver nesta pasta
    "system" - troca o dispositivo padrao do Windows (o Spotify segue o padrao)

  Uso: powershell -ExecutionPolicy Bypass -File audio-helper.ps1
#>

[CmdletBinding()]
param(
    [int]$Port = 37549,
    [string]$TargetProcess = "Spotify.exe"
)

$ErrorActionPreference = "Stop"
$Version = "1.0.0"

# ---------------------------------------------------------------------------
# Core Audio (MMDevice API + IPolicyConfig)
# ---------------------------------------------------------------------------

$coreAudioSource = @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

namespace AudioConfigHelper
{
    internal enum EDataFlow { eRender = 0, eCapture = 1, eAll = 2 }
    internal enum ERole { eConsole = 0, eMultimedia = 1, eCommunications = 2 }

    [StructLayout(LayoutKind.Sequential)]
    internal struct PropertyKey
    {
        public Guid fmtid;
        public int pid;
    }

    // Em x64 o union do PROPVARIANT comeca no offset 8 (vt + 3 reservados).
    [StructLayout(LayoutKind.Explicit)]
    internal struct PropVariant
    {
        [FieldOffset(0)] public short vt;
        [FieldOffset(8)] public IntPtr pointerValue;
    }

    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    internal class MMDeviceEnumeratorComObject { }

    [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IMMDeviceEnumerator
    {
        int EnumAudioEndpoints(EDataFlow dataFlow, int dwStateMask, out IMMDeviceCollection ppDevices);
        int GetDefaultAudioEndpoint(EDataFlow dataFlow, ERole role, out IMMDevice ppEndpoint);
        int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string pwstrId, out IMMDevice ppDevice);
        int RegisterEndpointNotificationCallback(IntPtr pClient);
        int UnregisterEndpointNotificationCallback(IntPtr pClient);
    }

    [Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IMMDeviceCollection
    {
        int GetCount(out int pcDevices);
        int Item(int nDevice, out IMMDevice ppDevice);
    }

    [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IMMDevice
    {
        int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams,
                     [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
        int OpenPropertyStore(int stgmAccess, out IPropertyStore ppProperties);
        int GetId([MarshalAs(UnmanagedType.LPWStr)] out string ppstrId);
        int GetState(out int pdwState);
    }

    [Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IPropertyStore
    {
        int GetCount(out int cProps);
        int GetAt(int iProp, out PropertyKey pkey);
        int GetValue(ref PropertyKey key, out PropVariant pv);
        int SetValue(ref PropertyKey key, ref PropVariant propvar);
        int Commit();
    }

    [ComImport, Guid("870AF99C-171D-4F9E-AF0D-E63DF40C2BC9")]
    internal class PolicyConfigClientComObject { }

    [Guid("F8679F50-850A-41CF-9C72-430F290290C8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IPolicyConfig
    {
        // A ordem dos metodos define o vtable; so SetDefaultEndpoint e chamado.
        int GetMixFormat([MarshalAs(UnmanagedType.LPWStr)] string deviceId, out IntPtr format);
        int GetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string deviceId, int isDefault, out IntPtr format);
        int ResetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string deviceId);
        int SetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string deviceId, IntPtr endpointFormat, IntPtr mixFormat);
        int GetProcessingPeriod([MarshalAs(UnmanagedType.LPWStr)] string deviceId, int isDefault, IntPtr defaultPeriod, IntPtr minimumPeriod);
        int SetProcessingPeriod([MarshalAs(UnmanagedType.LPWStr)] string deviceId, IntPtr period);
        int GetShareMode([MarshalAs(UnmanagedType.LPWStr)] string deviceId, IntPtr mode);
        int SetShareMode([MarshalAs(UnmanagedType.LPWStr)] string deviceId, IntPtr mode);
        int GetPropertyValue([MarshalAs(UnmanagedType.LPWStr)] string deviceId, int isFxStore, ref PropertyKey key, out PropVariant value);
        int SetPropertyValue([MarshalAs(UnmanagedType.LPWStr)] string deviceId, int isFxStore, ref PropertyKey key, ref PropVariant value);
        int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string deviceId, ERole role);
        int SetEndpointVisibility([MarshalAs(UnmanagedType.LPWStr)] string deviceId, int isVisible);
    }

    public class AudioDevice
    {
        public string Id;
        public string Name;
        public bool IsDefault;
    }

    public static class CoreAudio
    {
        private const int DEVICE_STATE_ACTIVE = 0x00000001;
        private const int STGM_READ = 0x00000000;

        // PKEY_Device_FriendlyName -> "Alto-falantes (Realtek Audio)"
        private static PropertyKey PKEY_Device_FriendlyName = new PropertyKey
        {
            fmtid = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"),
            pid = 14
        };

        private static void Check(int hr, string what)
        {
            if (hr != 0) Marshal.ThrowExceptionForHR(hr);
        }

        // Liberar RCW e apenas limpeza: nunca deve derrubar a enumeracao.
        private static void Release(object comObject)
        {
            try
            {
                if (comObject != null && Marshal.IsComObject(comObject))
                    Marshal.ReleaseComObject(comObject);
            }
            catch { }
        }

        public static List<AudioDevice> ListRenderDevices()
        {
            var result = new List<AudioDevice>();
            var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());

            string defaultId = null;
            IMMDevice defaultDevice;
            if (enumerator.GetDefaultAudioEndpoint(EDataFlow.eRender, ERole.eMultimedia, out defaultDevice) == 0)
            {
                defaultDevice.GetId(out defaultId);
                Release(defaultDevice);
            }

            IMMDeviceCollection collection;
            Check(enumerator.EnumAudioEndpoints(EDataFlow.eRender, DEVICE_STATE_ACTIVE, out collection), "EnumAudioEndpoints");

            int count;
            Check(collection.GetCount(out count), "GetCount");

            for (int i = 0; i < count; i++)
            {
                IMMDevice device;
                if (collection.Item(i, out device) != 0) continue;

                string id;
                device.GetId(out id);

                string name = id;
                IPropertyStore store;
                if (device.OpenPropertyStore(STGM_READ, out store) == 0)
                {
                    PropVariant pv;
                    if (store.GetValue(ref PKEY_Device_FriendlyName, out pv) == 0 && pv.pointerValue != IntPtr.Zero)
                    {
                        name = Marshal.PtrToStringUni(pv.pointerValue);
                    }
                    Release(store);
                }

                result.Add(new AudioDevice
                {
                    Id = id,
                    Name = name,
                    IsDefault = (defaultId != null && string.Equals(id, defaultId, StringComparison.OrdinalIgnoreCase))
                });

                Release(device);
            }

            Release(collection);
            Release(enumerator);
            return result;
        }

        public static void SetDefaultDevice(string deviceId)
        {
            var config = (IPolicyConfig)(new PolicyConfigClientComObject());
            try
            {
                // Console + Multimedia + Communications: troca "tudo" de uma vez.
                Check(config.SetDefaultEndpoint(deviceId, ERole.eConsole), "eConsole");
                Check(config.SetDefaultEndpoint(deviceId, ERole.eMultimedia), "eMultimedia");
                Check(config.SetDefaultEndpoint(deviceId, ERole.eCommunications), "eCommunications");
            }
            finally
            {
                Release(config);
            }
        }
    }
}
'@

Add-Type -TypeDefinition $coreAudioSource -Language CSharp | Out-Null

# ---------------------------------------------------------------------------
# Modo de operacao
# ---------------------------------------------------------------------------

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$svv = Join-Path $scriptDir "SoundVolumeView.exe"
$statePath = Join-Path $scriptDir "state.json"

# Avaliado a cada requisicao: instalar o SoundVolumeView depois nao exige
# reiniciar o helper.
function Test-AppMode { Test-Path -LiteralPath $svv }

<#
  O Windows nao expoe uma leitura simples de "para onde este app esta roteado":
  as linhas de Application do SoundVolumeView trazem o adaptador, nao o endpoint,
  e dois endpoints podem compartilhar o mesmo adaptador. Entao guardamos o que
  aplicamos. Sem estado, o app segue o padrao do sistema - que e exatamente o
  que reportamos como ativo.
#>
function Get-AppDeviceId {
    if (-not (Test-Path -LiteralPath $statePath)) { return $null }
    try {
        return (Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json).appDeviceId
    }
    catch {
        return $null
    }
}

function Set-AppDeviceId {
    param([string]$DeviceId)
    @{ appDeviceId = $DeviceId } | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
}

# ---------------------------------------------------------------------------
# Helpers HTTP
# ---------------------------------------------------------------------------

$allowedOriginPattern = '^https?://[^/]*spotify[^/]*$'

function Write-Json {
    param(
        [System.Net.HttpListenerContext]$Context,
        [int]$Status,
        $Body
    )
    $json = $Body | ConvertTo-Json -Depth 6 -Compress
    if ($null -eq $json) { $json = "null" }
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)

    $res = $Context.Response
    $res.StatusCode = $Status
    $res.ContentType = "application/json; charset=utf-8"
    $res.Headers["Access-Control-Allow-Origin"] = "*"
    $res.Headers["Access-Control-Allow-Headers"] = "Content-Type"
    $res.Headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    $res.Headers["Cache-Control"] = "no-store"
    $res.ContentLength64 = $bytes.Length
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
    $res.OutputStream.Close()
}

function Read-JsonBody {
    param([System.Net.HttpListenerContext]$Context)
    $reader = New-Object System.IO.StreamReader($Context.Request.InputStream, [System.Text.Encoding]::UTF8)
    $raw = $reader.ReadToEnd()
    $reader.Close()
    if ([string]::IsNullOrWhiteSpace($raw)) { return $null }
    return $raw | ConvertFrom-Json
}

function Get-Devices {
    $devices = [AudioConfigHelper.CoreAudio]::ListRenderDevices()

    # No modo app, "ativo" e para onde o Spotify aponta - nao o padrao do PC.
    $activeId = $null
    if (Test-AppMode) {
        $stored = Get-AppDeviceId
        if ($stored -and ($devices | Where-Object { $_.Id -eq $stored })) { $activeId = $stored }
    }

    $out = @()
    foreach ($d in $devices) {
        $isActive = if ($activeId) { $d.Id -eq $activeId } else { [bool]$d.IsDefault }
        $out += [ordered]@{
            id        = $d.Id
            name      = $d.Name
            isDefault = [bool]$isActive
        }
    }
    return , $out
}

function Set-OutputDevice {
    param(
        [string]$DeviceId,
        [ValidateSet("app", "system")][string]$Scope
    )

    if ($Scope -eq "app") {
        # Roteia somente o processo alvo, sem mexer no padrao do sistema.
        # O Item ID do SoundVolumeView e o mesmo id do MMDevice que enumeramos.
        $svvArgs = @("/SetAppDefault", $DeviceId, "all", $TargetProcess)
        $p = Start-Process -FilePath $svv -ArgumentList $svvArgs -NoNewWindow -Wait -PassThru
        if ($p.ExitCode -ne 0) {
            throw "SoundVolumeView retornou codigo $($p.ExitCode)"
        }
        Set-AppDeviceId -DeviceId $DeviceId
    }
    else {
        [AudioConfigHelper.CoreAudio]::SetDefaultDevice($DeviceId)
    }
}

# ---------------------------------------------------------------------------
# Servidor
# ---------------------------------------------------------------------------

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try { $listener.Prefixes.Add("http://127.0.0.1:$Port/") } catch { }

try {
    $listener.Start()
}
catch {
    Write-Host ""
    Write-Host "Nao foi possivel abrir a porta $Port." -ForegroundColor Red
    Write-Host "Se o erro for de permissao, rode uma vez como administrador:" -ForegroundColor Yellow
    Write-Host "  netsh http add urlacl url=http://localhost:$Port/ user=$env:USERNAME" -ForegroundColor Yellow
    Write-Host "Detalhe: $($_.Exception.Message)"
    exit 1
}

Write-Host "audio-config helper v$Version" -ForegroundColor Green
Write-Host "  escutando em http://localhost:$Port"
if (Test-AppMode) {
    Write-Host "  modo: app - roteia apenas $TargetProcess, sem tocar no padrao do Windows" -ForegroundColor Green
}
else {
    Write-Host "  modo: system - SoundVolumeView.exe ausente" -ForegroundColor Yellow
    Write-Host "  a troca por aplicativo ficara indisponivel ate voce rodar:" -ForegroundColor Yellow
    Write-Host "    powershell -ExecutionPolicy Bypass -File install-soundvolumeview.ps1" -ForegroundColor Yellow
}
Write-Host "  Ctrl+C para encerrar."
Write-Host ""

$running = $true
while ($running -and $listener.IsListening) {
    $context = $null
    try {
        $context = $listener.GetContext()
        $req = $context.Request
        $path = $req.Url.AbsolutePath.TrimEnd('/')
        if ($path -eq "") { $path = "/" }

        if ($req.HttpMethod -eq "OPTIONS") {
            Write-Json -Context $context -Status 204 -Body $null
            continue
        }

        # So aceita chamadas vindas do Spotify (ou sem Origin, ex.: curl local).
        $origin = $req.Headers["Origin"]
        if ($origin -and ($origin -notmatch $allowedOriginPattern)) {
            Write-Json -Context $context -Status 403 -Body @{ error = "origem nao permitida: $origin" }
            continue
        }

        switch ("$($req.HttpMethod) $path") {

            "GET /health" {
                $appMode = Test-AppMode
                Write-Json -Context $context -Status 200 -Body ([ordered]@{
                        ok               = $true
                        version          = $Version
                        mode             = $(if ($appMode) { "app" } else { "system" })
                        appModeAvailable = [bool]$appMode
                        target           = $TargetProcess
                    })
            }

            "GET /devices" {
                Write-Json -Context $context -Status 200 -Body (Get-Devices)
            }

            "POST /default" {
                $body = Read-JsonBody -Context $context
                if (-not $body -or -not $body.id) {
                    Write-Json -Context $context -Status 400 -Body @{ error = "campo 'id' obrigatorio" }
                    break
                }

                # Padrao e "app": nunca mexemos no PC inteiro sem pedido explicito.
                $scope = if ($body.scope) { [string]$body.scope } else { "app" }
                if ($scope -ne "app" -and $scope -ne "system") {
                    Write-Json -Context $context -Status 400 -Body @{ error = "scope invalido: $scope" }
                    break
                }
                if ($scope -eq "app" -and -not (Test-AppMode)) {
                    Write-Json -Context $context -Status 409 -Body ([ordered]@{
                            code  = "app-mode-unavailable"
                            error = "SoundVolumeView.exe nao encontrado em $scriptDir"
                        })
                    break
                }

                try {
                    Set-OutputDevice -DeviceId $body.id -Scope $scope
                    Write-Host "[$(Get-Date -Format HH:mm:ss)] [$scope] saida -> $($body.id)"
                    Write-Json -Context $context -Status 200 -Body ([ordered]@{
                            ok      = $true
                            scope   = $scope
                            devices = (Get-Devices)
                        })
                }
                catch {
                    Write-Json -Context $context -Status 500 -Body @{ error = $_.Exception.Message }
                }
            }

            "POST /shutdown" {
                Write-Json -Context $context -Status 200 -Body @{ ok = $true }
                $running = $false
            }

            default {
                Write-Json -Context $context -Status 404 -Body @{ error = "rota desconhecida: $path" }
            }
        }
    }
    catch {
        Write-Host "Erro: $($_.Exception.Message)" -ForegroundColor Red
        if ($context) {
            try { Write-Json -Context $context -Status 500 -Body @{ error = $_.Exception.Message } } catch { }
        }
    }
}

$listener.Stop()
$listener.Close()
Write-Host "Helper encerrado."
