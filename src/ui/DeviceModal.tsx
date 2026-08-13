import React from "react";
import {
	APP_MODE_UNAVAILABLE,
	AudioDevice,
	HelperError,
	HelperOfflineError,
	Scope,
	helper,
} from "../lib/helper";
import { storage } from "../lib/storage";

// Em tempo de build o esbuild resolve "react" para Spicetify.React,
// entao os hooks vem do React que o proprio Spotify ja carregou.
const { useState, useEffect, useCallback, useRef } = React;

type Status = "loading" | "online" | "offline";

/**
 * O Marketplace instala apenas o bundle .js — quem vier de lá não tem a pasta
 * do projeto, então as instruções precisam apontar para o repositório.
 */
const REPO_URL = "https://github.com/misterbot-gtx/spicetify-audio-config";

/** Enquanto o popup esta aberto, reflete trocas feitas fora do Spotify. */
const REFRESH_MS = 4000;

interface Props {
	onDeviceChange?: (device: AudioDevice) => void;
}

export default function DeviceModal({ onDeviceChange }: Props) {
	const [status, setStatus] = useState<Status>("loading");
	const [appModeAvailable, setAppModeAvailable] = useState(true);
	const [target, setTarget] = useState<string | null>(null);
	const [devices, setDevices] = useState<AudioDevice[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [busyId, setBusyId] = useState<string | null>(null);
	/** Dispositivo que o helper recusou por falta do modo por aplicativo. */
	const [blocked, setBlocked] = useState<AudioDevice | null>(null);
	const [autoApply, setAutoApply] = useState(storage.getAutoApply());

	// Evita setState depois do popup fechar (o intervalo pode estar no ar).
	const mounted = useRef(true);
	useEffect(() => () => { mounted.current = false; }, []);

	const load = useCallback(async () => {
		try {
			const health = await helper.health();
			const list = await helper.listDevices();
			if (!mounted.current) return;
			setAppModeAvailable(health.appModeAvailable);
			setTarget(health.target);
			setDevices(list);
			setStatus("online");
			setError(null);
		} catch (e) {
			if (!mounted.current) return;
			if (e instanceof HelperOfflineError) {
				setStatus("offline");
			} else {
				setError((e as Error).message);
				setStatus("online");
			}
		}
	}, []);

	useEffect(() => {
		load();
		const id = setInterval(load, REFRESH_MS);
		return () => clearInterval(id);
	}, [load]);

	const select = async (device: AudioDevice, scope: Scope = "app") => {
		if (busyId) return;
		if (device.isDefault && scope === "app") return;

		setBusyId(device.id);
		setError(null);
		setBlocked(null);
		try {
			const updated = await helper.setDevice(device.id, scope);
			if (!mounted.current) return;
			setDevices(updated);
			storage.setLastDeviceId(device.id);
			Spicetify.showNotification(
				scope === "app" ? `Spotify → ${device.name}` : `Saída do Windows: ${device.name}`
			);
			onDeviceChange?.(device);
		} catch (e) {
			if (!mounted.current) return;
			if (e instanceof HelperOfflineError) {
				setStatus("offline");
			} else if (e instanceof HelperError && e.code === APP_MODE_UNAVAILABLE) {
				// O helper se recusou a mexer no PC inteiro: quem decide é você.
				setAppModeAvailable(false);
				setBlocked(device);
			} else {
				setError((e as Error).message);
			}
		} finally {
			if (mounted.current) setBusyId(null);
		}
	};

	const toggleAutoApply = () => {
		const next = !autoApply;
		setAutoApply(next);
		storage.setAutoApply(next);
	};

	if (status === "loading") {
		return <div className="audiocfg-empty">Procurando o helper local…</div>;
	}

	if (status === "offline") {
		return (
			<div className="audiocfg-offline">
				<p className="audiocfg-offline-title">Helper local não está rodando</p>
				<p>
					A troca de dispositivo precisa de um helper que roda fora do Spotify, porque o
					Spotify Desktop toca áudio pela camada nativa do Windows — fora do alcance do
					JavaScript da interface. Ele acompanha o projeto, não o bundle da extensão:
				</p>
				<a className="audiocfg-link" href={REPO_URL} target="_blank" rel="noreferrer">
					{REPO_URL}
				</a>
				<p className="audiocfg-hint">
					Já tem o projeto? Rode <code>helper\install-autostart.ps1</code> uma vez e o helper
					passa a subir sozinho no login.
				</p>
				<button className="audiocfg-retry" onClick={load}>Tentar novamente</button>
			</div>
		);
	}

	return (
		<div className="audiocfg-root">
			<div className="audiocfg-mode">
				{appModeAvailable
					? `Afeta apenas ${target ?? "o Spotify"} — o resto do Windows não muda`
					: "Modo por aplicativo indisponível"}
			</div>

			{error && <div className="audiocfg-error">{error}</div>}

			{blocked && (
				<div className="audiocfg-warn">
					<p>
						Não troquei nada: sem o SoundVolumeView eu só conseguiria mudar a saída do
						Windows inteiro, e não é isso que você pediu.
					</p>
					<code className="audiocfg-code">npm run helper:svv</code>
					<button className="audiocfg-force" onClick={() => select(blocked, "system")}>
						Trocar o PC inteiro para “{blocked.name}” mesmo assim
					</button>
				</div>
			)}

			<ul className="audiocfg-list">
				{devices.map((device) => (
					<li key={device.id}>
						<button
							className={`audiocfg-item${device.isDefault ? " audiocfg-item--active" : ""}`}
							onClick={() => select(device)}
							disabled={busyId !== null}
							aria-pressed={device.isDefault}
						>
							<span className="audiocfg-icon">{device.isDefault ? "🔊" : "🔈"}</span>
							<span className="audiocfg-name">{device.name}</span>
							{busyId === device.id && <span className="audiocfg-badge">trocando…</span>}
							{device.isDefault && busyId !== device.id && (
								<span className="audiocfg-badge audiocfg-badge--active">ativo</span>
							)}
						</button>
					</li>
				))}
			</ul>

			{devices.length === 0 && (
				<div className="audiocfg-empty">Nenhum dispositivo de saída ativo encontrado.</div>
			)}

			<label className="audiocfg-toggle">
				<input type="checkbox" checked={autoApply} onChange={toggleAutoApply} />
				<span>Reaplicar este dispositivo ao abrir o Spotify</span>
			</label>
		</div>
	);
}
