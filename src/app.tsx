import "./style.css";
import { closeDevicePopup, isDevicePopupOpen, openDevicePopup } from "./ui/popup";
import { helper } from "./lib/helper";
import { storage } from "./lib/storage";

/**
 * Controle de volume da playbar. Confirmado no bundle do Spotify (5095.js);
 * os seletores antigos ficam como rede de segurança entre versões.
 */
const VOLUME_BAR = '[data-testid="volume-bar"], .volume-bar, .main-nowPlayingBar-volumeBar';
const VOLUME_ICON = '[data-testid="volume-bar-toggle-mute-button"], .volume-bar__icon-button';

/**
 * Reaplica o último dispositivo escolhido, se o usuário pediu isso.
 * Silencioso de propósito: se o helper ainda não subiu, não há o que avisar.
 */
async function restoreLastDevice(): Promise<void> {
	if (!storage.getAutoApply()) return;

	const lastId = storage.getLastDeviceId();
	if (!lastId) return;

	try {
		const devices = await helper.listDevices();
		const wanted = devices.find((d) => d.id === lastId);
		if (wanted && !wanted.isDefault) await helper.setDevice(lastId);
	} catch {
		/* helper offline: o usuário resolve pelo popup quando quiser */
	}
}

function onContextMenu(event: MouseEvent) {
	const target = event.target as HTMLElement | null;
	const bar = target?.closest?.(VOLUME_BAR);
	if (!bar) return;

	// Substitui o menu nativo do Chromium sobre o controle de volume.
	event.preventDefault();
	event.stopPropagation();

	if (isDevicePopupOpen()) {
		closeDevicePopup();
		return;
	}

	// Ancora no ícone quando o clique veio do slider, para o popup não pular de lugar.
	const anchor = (bar.querySelector(VOLUME_ICON) ?? bar).getBoundingClientRect();
	openDevicePopup({ anchor });
}

export default async function main() {
	while (!Spicetify?.React || !Spicetify?.ReactDOM || !Spicetify?.showNotification) {
		await new Promise((resolve) => setTimeout(resolve, 200));
	}

	// Delegação no document: a playbar remonta várias vezes durante a sessão,
	// e um listener preso ao elemento morreria junto com ele.
	document.addEventListener("contextmenu", onContextMenu, true);

	await restoreLastDevice();
}
