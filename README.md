# audio-config

Extensão [Spicetify](https://spicetify.app/) para trocar a **saída de áudio do Spotify** sem sair do player: **clique com o botão direito no controle de volume** e escolha o dispositivo. A troca vale só para o Spotify — o padrão do Windows não muda.

Sem instalação extra, sem processos em segundo plano, sem dependências. Só o arquivo `.js`.

## Como funciona

O áudio do Spotify Desktop **não passa pelo renderer Chromium**. Isso foi medido, não suposto: com música tocando, o documento tem zero elementos de mídia audíveis e zero `AudioContext` — o único `<video>` presente é o Canvas, mudo. Ou seja, `HTMLMediaElement.setSinkId()` não teria em que atuar.

Mas o cliente publica uma ponte para a camada nativa em `Spicetify.Platform`, e é ela que a extensão usa:

| API | Papel |
|---|---|
| `Spicetify.Platform.AudioOutputDevicesAPI.getDevices()` | Lista os endpoints de saída do Windows, com os mesmos IDs da Core Audio API (`{0.0.0.00000000}.{guid}`), nome completo, tipo de terminal e de transporte. |
| `Spicetify.Platform.ExclusiveModeAPI.getSelectedAudioOutputDevice()` | Dispositivo escolhido, ou vazio quando o Spotify está seguindo o padrão do sistema. |
| `Spicetify.Platform.ExclusiveModeAPI.setSelectedAudioOutputDevice(id, exclusivo)` | Aplica a escolha. Passar `""` volta a seguir o padrão do sistema. |

O nome `ExclusiveModeAPI` é pouco óbvio — é o serviço que controla o modo exclusivo do WASAPI — mas é onde o cliente guarda o dispositivo selecionado. O segundo argumento (`exclusivo`) fica sempre `false`: ligá-lo faria o Spotify tomar o dispositivo e calar os outros aplicativos.

O Spotify **persiste a escolha sozinho**, entre reinícios. A extensão não guarda estado nenhum.

## Instalação

```powershell
cd "$env:APPDATA\spicetify\Extensions\audio_config"
npm install
npm run build
npm run install-local
spicetify apply
```

`spicetify apply` é obrigatório mesmo depois de copiar o arquivo: o Spotify serve as extensões de dentro do próprio bundle (`xpui.app.spotify.com/extensions/`), e é o `apply` que copia para lá. Sem ele, o Spotify continua rodando a versão anterior.

## Uso

Clique com o botão direito no controle de volume da barra do player — no ícone ou na barrinha. O popup abre logo acima, lista os dispositivos ativos, marca qual é o **padrão do Windows** e qual está **ativo** no Spotify. Um clique troca e fecha; `Esc` ou um clique fora também fecham.

O item **"Seguir o padrão do Windows"** desfaz a escolha e devolve o Spotify ao comportamento normal.

## Desenvolvimento

```powershell
npm run watch      # rebuild a cada alteração
npm run typecheck
```

| Arquivo | Papel |
|---|---|
| [src/app.tsx](src/app.tsx) | Entrypoint: captura do `contextmenu` no controle de volume |
| [src/ui/popup.tsx](src/ui/popup.tsx) | Popup ancorado: posicionamento, ciclo de vida do React root, fechamento |
| [src/ui/DeviceList.tsx](src/ui/DeviceList.tsx) | Lista de dispositivos e estados de carregando/erro |
| [src/lib/audio.ts](src/lib/audio.ts) | Acesso às APIs nativas do Spotify |
| [scripts/install-local.js](scripts/install-local.js) | Copia `dist/` para a pasta Extensions do Spicetify |

O build usa `spicetify-creator`, que **exige** que o entrypoint se chame `src/app.tsx` (o campo `main` do `settings.json` é ignorado nessa escolha) e mapeia `react`/`react-dom` para `Spicetify.React`/`Spicetify.ReactDOM` — por isso `import React from "react"` funciona sem embutir o React no bundle.

A saída vai para `dist/`, que **é commitada de propósito**: o Marketplace baixa o `.js` direto do repositório.

## Limitações conhecidas

- Depende de APIs internas do Spotify (`AudioOutputDevicesAPI`, `ExclusiveModeAPI`). Elas não são documentadas nem estáveis por contrato — se sumirem, o popup mostra "Cliente sem suporte" em vez de quebrar.
- O gatilho depende dos seletores do controle de volume (`data-testid="volume-bar"`, com `.volume-bar` e `.main-nowPlayingBar-volumeBar` como fallback). Uma reescrita grande da playbar pode exigir atualizar `VOLUME_BAR` em [src/app.tsx](src/app.tsx).
- O clique direito sobre o volume substitui o menu de contexto nativo do Chromium naquela região; no resto da interface ele continua normal.
- Só lista dispositivos que o Windows reporta como presentes.
