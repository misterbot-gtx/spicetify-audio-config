# audio-config

Extensão [Spicetify](https://spicetify.app/) para trocar o **dispositivo de saída de áudio** sem sair do Spotify: **clique com o botão direito no ícone de volume** da barra do player e escolha a saída numa lista dos dispositivos ativos do Windows. Nenhum ícone novo é adicionado à interface.

## Por que existe um helper

O Spotify Desktop desenha a interface em CEF (Chromium), mas **não** reproduz o áudio no renderer — a reprodução vai pela camada nativa do Windows (WASAPI). É por isso que ele aparece como `Spotify.exe` no Mixer de Volume, e é por isso que a rota "web" de trocar saída (`HTMLMediaElement.setSinkId()` / `AudioContext.setSinkId()`) não tem efeito aqui: não existe elemento de mídia tocando para redirecionar.

Então a extensão delega o trabalho a um **helper local em PowerShell**, que fala com a Core Audio API do Windows (`IMMDeviceEnumerator` para listar, `IPolicyConfig` para trocar) e expõe isso num pequeno servidor HTTP em `localhost:37549`. Sem DLLs de terceiros nem downloads — só COM do próprio Windows.

```
Spotify (Chromium)                     PowerShell
┌──────────────────────┐               ┌─────────────────────────┐
│ contextmenu no       │  fetch HTTP   │ HttpListener :37549     │
│ ícone de volume      │ ────────────► │ IMMDeviceEnumerator     │
│ popup React ancorado │               │ IPolicyConfig           │
└──────────────────────┘               └───────────┬─────────────┘
                                                   ▼
                                          Windows Core Audio
```

## Instalação

```powershell
cd "$env:APPDATA\spicetify\Extensions\audio_config"

npm install
npm run build              # gera ..\audio-config.js
npm run helper:svv         # baixa o SoundVolumeView (troca por aplicativo)
npm run helper:autostart   # helper sobe junto com o Windows, sem janela

spicetify apply            # fecha e reabre o Spotify
```

`spicetify config extensions audio-config.js` já foi aplicado. `spicetify apply` reinicia o Spotify.

## Uso

**Clique com o botão direito no controle de volume** da barra do player (o ícone ou a barrinha). Um popup abre logo acima dele, listando os dispositivos de saída ativos e marcando o atual com **ativo**. Um clique troca e fecha o popup; `Esc` ou um clique fora também fecham.

A opção **"Reaplicar este dispositivo ao abrir o Spotify"** guarda a escolha e a reaplica na próxima vez que o Spotify iniciar.

## Escopo da troca

A troca é **por aplicativo**: só o Spotify muda de saída, o resto do Windows fica onde está. Esse é o escopo padrão de toda requisição, e o helper **recusa** (`409 app-mode-unavailable`) em vez de silenciosamente cair para uma troca global.

| Escopo | Quando | O que faz |
|---|---|---|
| `app` (padrão) | requer `SoundVolumeView.exe` em `helper/` | Roteia **apenas o Spotify**, via `/SetAppDefault`. O dispositivo padrão do Windows não é tocado. |
| `system` | só quando você pede explicitamente no popup | Troca o dispositivo **padrão do Windows** — afeta todos os aplicativos. |

Se o SoundVolumeView sumir, o popup mostra um aviso com o comando para reinstalá-lo e um botão secundário para forçar a troca global naquele momento — nunca automaticamente.

```powershell
npm run helper:svv   # baixa o SoundVolumeView para helper/
```

O helper reavalia a disponibilidade a cada requisição: instalar o SoundVolumeView depois **não** exige reiniciá-lo.

### Como o "ativo" é determinado no modo `app`

O Windows não expõe uma leitura simples de "para onde este aplicativo está roteado" — as linhas de `Application` do SoundVolumeView trazem o *adaptador*, não o endpoint, e dois endpoints podem compartilhar o mesmo adaptador (aqui, "Alto-falantes" e "Digital Audio (S/PDIF)" são ambos `High Definition Audio Device`). Então o helper guarda o que aplicou em `helper/state.json`. Sem estado, ele reporta o padrão do sistema — que é de fato onde o Spotify toca quando não há override. A consequência: uma troca feita por fora (pelo app do NirSoft ou pelas Configurações do Windows) não aparece marcada como ativa.

## Helper

```powershell
npm run helper                       # roda em primeiro plano (útil para depurar)
npm run helper:autostart             # instala no Startup do Windows
powershell -File helper\install-autostart.ps1 -Uninstall   # remove o auto-start
```

Rotas — todas em `http://localhost:37549`:

| Rota | Resposta |
|---|---|
| `GET /health` | `{ ok, version, mode, appModeAvailable, target }` |
| `GET /devices` | `[ { id, name, isDefault } ]` — `isDefault` = saída ativa **do Spotify** no modo `app` |
| `POST /default` | body `{ id, scope? }` (`scope` = `"app"` por padrão) → `{ ok, scope, devices }`, ou `409 { code: "app-mode-unavailable" }` |
| `POST /shutdown` | encerra o helper |

**Segurança:** o servidor escuta só em `localhost` e rejeita (403) requisições cujo header `Origin` não seja do Spotify. Requisições sem `Origin` (curl, scripts locais) são aceitas — a superfície é a máquina local e a ação é trocar dispositivo de áudio, mas vale saber que qualquer processo local pode chamá-lo.

## Desenvolvimento

```powershell
npm run watch      # rebuild a cada alteração; recarregue o Spotify com Ctrl+R
npm run typecheck
```

| Arquivo | Papel |
|---|---|
| [src/app.tsx](src/app.tsx) | Entrypoint: captura do `contextmenu` no volume, reaplicação na inicialização |
| [src/ui/popup.tsx](src/ui/popup.tsx) | Popup ancorado: posicionamento, ciclo de vida do React root, fechamento |
| [src/ui/DeviceModal.tsx](src/ui/DeviceModal.tsx) | Lista de dispositivos, estados de carregando/offline/erro |
| [src/lib/helper.ts](src/lib/helper.ts) | Cliente HTTP do helper (com timeout) |
| [src/lib/storage.ts](src/lib/storage.ts) | Preferências em `Spicetify.LocalStorage` |
| [helper/audio-helper.ps1](helper/audio-helper.ps1) | Servidor HTTP + interop COM da Core Audio |
| [helper/install-autostart.ps1](helper/install-autostart.ps1) | Atalho no Startup + launcher `.vbs` sem console |
| [helper/install-soundvolumeview.ps1](helper/install-soundvolumeview.ps1) | Baixa o SoundVolumeView, que habilita a troca por aplicativo |

O build usa `spicetify-creator`, que **exige** que o entrypoint se chame `src/app.tsx` (o campo `main` do `settings.json` é ignorado nessa escolha) e mapeia `react`/`react-dom` para `Spicetify.React`/`Spicetify.ReactDOM` — por isso `import React from "react"` funciona sem embutir o React no bundle.

## Limitações conhecidas

- **Windows apenas.** O helper usa COM da Core Audio API.
- O roteamento por aplicativo do Windows vale para **novos fluxos de áudio**: se uma música já estiver tocando, pode ser preciso pausar e dar play para o Spotify reabrir o endpoint no dispositivo novo.
- Uma troca feita por fora não aparece marcada como ativa no modo `app` (veja a seção sobre `state.json` acima).
- Dispositivos desabilitados ou desconectados não aparecem (a listagem filtra por `DEVICE_STATE_ACTIVE`).
- O gatilho depende dos seletores do controle de volume (`data-testid="volume-bar"`, com `.volume-bar` e `.main-nowPlayingBar-volumeBar` como fallback). Uma reescrita grande da playbar pelo Spotify pode exigir atualizar `VOLUME_BAR` em [src/app.tsx](src/app.tsx).
- O clique direito sobre o volume substitui o menu de contexto nativo do Chromium naquela região; no resto da interface ele continua normal.
