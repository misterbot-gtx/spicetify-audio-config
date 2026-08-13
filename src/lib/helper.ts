/**
 * Cliente HTTP do helper local (helper/audio-helper.ps1).
 *
 * O Spotify Desktop reproduz audio pela camada nativa (WASAPI), fora do
 * renderer Chromium — por isso `setSinkId()` nao tem efeito aqui. A troca real
 * de dispositivo acontece no helper, que expoe a Core Audio API do Windows.
 */

export const HELPER_URL = "http://localhost:37549";

/** localhost e "potentially trustworthy" no Chromium, entao nao ha mixed content. */
const TIMEOUT_MS = 4000;

export interface AudioDevice {
	id: string;
	name: string;
	isDefault: boolean;
}

/** "app" roteia só o Spotify; "system" troca o dispositivo padrão do Windows. */
export type Scope = "app" | "system";

export interface HelperHealth {
	ok: true;
	version: string;
	mode: Scope;
	/** false quando o SoundVolumeView não está instalado ao lado do helper. */
	appModeAvailable: boolean;
	target: string | null;
}

export class HelperOfflineError extends Error {
	constructor() {
		super("helper offline");
		this.name = "HelperOfflineError";
	}
}

/** Erro do helper que carrega o `code` da resposta, quando houver. */
export class HelperError extends Error {
	constructor(message: string, readonly code?: string) {
		super(message);
		this.name = "HelperError";
	}
}

export const APP_MODE_UNAVAILABLE = "app-mode-unavailable";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

	let response: Response;
	try {
		response = await fetch(`${HELPER_URL}${path}`, {
			...init,
			signal: controller.signal,
			headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
		});
	} catch {
		// Rede caiu, porta fechada ou timeout: para a UI, tudo isso e "offline".
		throw new HelperOfflineError();
	} finally {
		clearTimeout(timer);
	}

	const payload = await response.json().catch(() => null);

	if (!response.ok) {
		throw new HelperError(payload?.error ?? `HTTP ${response.status}`, payload?.code);
	}

	return payload as T;
}

export const helper = {
	health: () => request<HelperHealth>("/health"),

	listDevices: () => request<AudioDevice[]>("/devices"),

	/**
	 * Troca a saída e devolve a lista já atualizada.
	 * O escopo padrão é "app": o helper recusa (409 `app-mode-unavailable`)
	 * em vez de silenciosamente mexer no áudio do PC inteiro.
	 */
	setDevice: async (id: string, scope: Scope = "app"): Promise<AudioDevice[]> => {
		const result = await request<{ ok: boolean; scope: Scope; devices: AudioDevice[] }>("/default", {
			method: "POST",
			body: JSON.stringify({ id, scope }),
		});
		return result.devices;
	},
};
