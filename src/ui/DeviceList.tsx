import React from "react";
import {
	AudioDevice,
	FOLLOW_SYSTEM,
	getSelectedDeviceId,
	isSupported,
	listDevices,
	selectDevice,
} from "../lib/audio";

import { DeviceIcon, SystemIcon } from "./icons";

const { useState, useEffect, useCallback, useRef } = React;

/** Enquanto o popup está aberto, reflete dispositivos conectados/removidos. */
const REFRESH_MS = 3000;

interface Props {
	onSelected?: () => void;
}

export default function DeviceList({ onSelected }: Props) {
	const [supported] = useState(isSupported);
	const [devices, setDevices] = useState<AudioDevice[]>([]);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [busyId, setBusyId] = useState<string | null>(null);

	// Evita setState depois do popup fechar (o intervalo pode estar no ar).
	const mounted = useRef(true);
	useEffect(() => () => { mounted.current = false; }, []);

	const load = useCallback(async () => {
		try {
			const [list, selected] = await Promise.all([listDevices(), getSelectedDeviceId()]);
			if (!mounted.current) return;
			setDevices(list);
			setSelectedId(selected);
			setError(null);
		} catch (e) {
			if (mounted.current) setError((e as Error).message);
		} finally {
			if (mounted.current) setLoading(false);
		}
	}, []);

	useEffect(() => {
		if (!supported) {
			setLoading(false);
			return;
		}
		load();
		const id = setInterval(load, REFRESH_MS);
		return () => clearInterval(id);
	}, [supported, load]);

	const choose = async (id: string, label: string) => {
		if (busyId) return;
		setBusyId(id);
		setError(null);
		try {
			await selectDevice(id);
			if (!mounted.current) return;
			setSelectedId(id || null);
			Spicetify.showNotification(`Spotify → ${label}`);
			onSelected?.();
		} catch (e) {
			if (mounted.current) setError((e as Error).message);
		} finally {
			if (mounted.current) setBusyId(null);
		}
	};

	if (!supported) {
		return (
			<div className="audiocfg-offline">
				<p className="audiocfg-offline-title">Cliente sem suporte</p>
				<p>
					Este Spotify não expõe <code>AudioOutputDevicesAPI</code>/<code>ExclusiveModeAPI</code>.
					A extensão precisa de uma versão do Spotify Desktop que traga essas APIs.
				</p>
			</div>
		);
	}

	if (loading) return <div className="audiocfg-empty">Lendo dispositivos…</div>;

	const followingSystem = selectedId === null;

	return (
		<div className="audiocfg-root">
			<div className="audiocfg-mode">Afeta apenas o Spotify — o resto do Windows não muda</div>

			{error && <div className="audiocfg-error">{error}</div>}

			<ul className="audiocfg-list">
				{devices.map((device) => {
					const active = device.id === selectedId;
					return (
						<li key={device.id}>
							<button
								className={`audiocfg-item${active ? " audiocfg-item--active" : ""}`}
								onClick={() => choose(device.id, device.name)}
								disabled={busyId !== null}
								aria-pressed={active}
							>
								<span className="audiocfg-icon">
									<DeviceIcon device={device} active={active} />
								</span>
								<span className="audiocfg-name">
									{device.name}
									{device.isSystemDefault && (
										<span className="audiocfg-sub">padrão do Windows</span>
									)}
								</span>
								{busyId === device.id && <span className="audiocfg-badge">trocando…</span>}
								{active && busyId !== device.id && (
									<span className="audiocfg-badge audiocfg-badge--active">ativo</span>
								)}
							</button>
						</li>
					);
				})}
			</ul>

			{devices.length === 0 && (
				<div className="audiocfg-empty">Nenhum dispositivo de saída encontrado.</div>
			)}

			<button
				className={`audiocfg-item audiocfg-follow${followingSystem ? " audiocfg-item--active" : ""}`}
				onClick={() => choose(FOLLOW_SYSTEM, "padrão do Windows")}
				disabled={busyId !== null}
			>
				<span className="audiocfg-icon">
					<SystemIcon />
				</span>
				<span className="audiocfg-name">Seguir o padrão do Windows</span>
				{followingSystem && <span className="audiocfg-badge audiocfg-badge--active">ativo</span>}
			</button>
		</div>
	);
}
