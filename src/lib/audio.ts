/**
 * Troca de saída de áudio usando as APIs nativas que o próprio Spotify expõe.
 *
 * O áudio do Spotify Desktop não passa pelo renderer Chromium — medido: com
 * música tocando, o documento tem zero elementos de mídia audíveis e zero
 * AudioContext, então `setSinkId()` não teria em que atuar. Mas o cliente
 * publica uma ponte para a camada nativa em `Spicetify.Platform`, e é ela que
 * usamos aqui: a seleção vale só para o Spotify e não mexe no padrão do Windows.
 */

export interface AudioDevice {
	id: string;
	/** Nome completo, como "Alto-falantes (High Definition Audio Device)". */
	name: string;
	/** "speakers", "headphones", "unknown"… */
	terminalType: string;
	/** "usb", "bluetooth", "display_device"… */
	transportType: string;
	/** Se este é o dispositivo padrão do Windows. */
	isSystemDefault: boolean;
}

/** Passar "" ao Spotify significa "volte a seguir o padrão do sistema". */
export const FOLLOW_SYSTEM = "";

export class UnsupportedClientError extends Error {
	constructor() {
		super("APIs de saída de áudio ausentes neste cliente");
		this.name = "UnsupportedClientError";
	}
}

interface RawDevice {
	id: string;
	name: string;
	fullName: string;
	terminalType: string;
	transportType: string;
	isDefaultDevice: boolean;
}

function devicesApi() {
	const api = Spicetify?.Platform?.AudioOutputDevicesAPI;
	if (!api?.getDevices) throw new UnsupportedClientError();
	return api;
}

/**
 * A seleção vive na ExclusiveModeAPI — o mesmo serviço que controla o modo
 * exclusivo do WASAPI. Nome pouco óbvio, mas é onde o cliente guarda o
 * dispositivo escolhido.
 */
function selectionApi() {
	const api = Spicetify?.Platform?.ExclusiveModeAPI;
	if (!api?.setSelectedAudioOutputDevice) throw new UnsupportedClientError();
	return api;
}

export function isSupported(): boolean {
	try {
		devicesApi();
		selectionApi();
		return true;
	} catch {
		return false;
	}
}

export async function listDevices(): Promise<AudioDevice[]> {
	const raw: RawDevice[] = await devicesApi().getDevices();
	return raw.map((d) => ({
		id: d.id,
		name: d.fullName || d.name,
		terminalType: d.terminalType,
		transportType: d.transportType,
		isSystemDefault: Boolean(d.isDefaultDevice),
	}));
}

/** `null` quando o Spotify está apenas seguindo o padrão do Windows. */
export async function getSelectedDeviceId(): Promise<string | null> {
	const selected = await selectionApi().getSelectedAudioOutputDevice();
	return selected || null;
}

export async function selectDevice(id: string): Promise<void> {
	// O segundo argumento é o modo exclusivo do WASAPI: manter desligado, senão
	// o Spotify toma o dispositivo e cala todos os outros aplicativos.
	await selectionApi().setSelectedAudioOutputDevice(id, false);
}
