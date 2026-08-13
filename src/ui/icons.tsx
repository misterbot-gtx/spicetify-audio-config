import React from "react";
import { AudioDevice } from "../lib/audio";

/**
 * Os ícones do Spicetify são markup interno de SVG desenhado para
 * `viewBox="0 0 16 16"` — os personalizados abaixo seguem o mesmo grid para
 * alinhar com o resto da interface do Spotify.
 */
function spicetifyIcon(name: string): string | null {
	return Spicetify?.SVGIcons?.[name] ?? null;
}

const HEADPHONES = `<path d="M8 1a6 6 0 0 0-6 6v3.5A2.5 2.5 0 0 0 4.5 13H5a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1H3V7a5 5 0 0 1 10 0v1h-2a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h.5A2.5 2.5 0 0 0 14 10.5V7a6 6 0 0 0-6-6z"/>`;

const MONITOR = `<path d="M2 2.5A1.5 1.5 0 0 1 3.5 1h9A1.5 1.5 0 0 1 14 2.5v7a1.5 1.5 0 0 1-1.5 1.5H9v2h2a.5.5 0 0 1 0 1H5a.5.5 0 0 1 0-1h2v-2H3.5A1.5 1.5 0 0 1 2 9.5v-7zm1.5-.5a.5.5 0 0 0-.5.5v7a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5v-7a.5.5 0 0 0-.5-.5h-9z"/>`;

/** Círculo simples: só aparece se o cliente não trouxer os ícones nativos. */
const FALLBACK = `<circle cx="8" cy="8" r="3"/>`;

function Glyph({ markup }: { markup: string }) {
	return (
		<svg
			className="audiocfg-glyph"
			role="img"
			aria-hidden="true"
			width="16"
			height="16"
			viewBox="0 0 16 16"
			fill="currentColor"
			// Markup estático: vem do próprio Spicetify ou das constantes acima.
			dangerouslySetInnerHTML={{ __html: markup }}
		/>
	);
}

function isHeadphones(device: AudioDevice): boolean {
	return (
		device.transportType === "bluetooth" ||
		device.terminalType === "headphones" ||
		device.terminalType === "headset"
	);
}

/**
 * O ícone mostra o tipo do dispositivo; o estado ativo vira o alto-falante com
 * duas ondas, para casar com o anel verde e o selo "ativo".
 */
export function DeviceIcon({ device, active }: { device: AudioDevice; active: boolean }) {
	if (active) {
		return <Glyph markup={spicetifyIcon("volume-two-wave") ?? FALLBACK} />;
	}
	if (isHeadphones(device)) {
		return <Glyph markup={HEADPHONES} />;
	}
	return <Glyph markup={spicetifyIcon("volume-one-wave") ?? FALLBACK} />;
}

export function SystemIcon() {
	return <Glyph markup={MONITOR} />;
}
