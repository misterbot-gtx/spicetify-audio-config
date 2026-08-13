const PREFIX = "audio-config:";

function read(key: string): string | null {
	try {
		return Spicetify.LocalStorage.get(PREFIX + key);
	} catch {
		return null;
	}
}

function write(key: string, value: string): void {
	try {
		Spicetify.LocalStorage.set(PREFIX + key, value);
	} catch {
		/* storage indisponivel: preferencia vira sessao unica */
	}
}

export const storage = {
	/** Ultimo dispositivo escolhido pela extensao. */
	getLastDeviceId: () => read("lastDeviceId"),
	setLastDeviceId: (id: string) => write("lastDeviceId", id),

	/** Reaplicar esse dispositivo quando o Spotify abrir. */
	getAutoApply: () => read("autoApply") === "true",
	setAutoApply: (value: boolean) => write("autoApply", String(value)),
};
