import "./style.css";
import { closeDevicePopup, isDevicePopupOpen, openDevicePopup } from "./ui/popup";
import { watchSettingsPage } from "./ui/settings";

/**
 * Controle de volume da playbar. Confirmado no bundle do Spotify (5095.js);
 * os seletores antigos ficam como rede de segurança entre versões.
 */
const VOLUME_BAR = '[data-testid="volume-bar"], .volume-bar, .main-nowPlayingBar-volumeBar';
const VOLUME_ICON = '[data-testid="volume-bar-toggle-mute-button"], .volume-bar__icon-button';

/**
 * O menu Reprodução do app lista ações por atalho (Ctrl+↑ / Ctrl+↓ para volume),
 * mas é desenhado nativamente e nenhuma extensão o alcança — verificado com o
 * menu aberto na tela enquanto uma sentinela varria o DOM, e confirmado no
 * i18n do xpui, que não tem os títulos dele. Este atalho é o equivalente
 * possível: mesma forma de acesso, sem depender do menu.
 */
function onKeyDown(event: KeyboardEvent) {
	if (!event.ctrlKey || !event.shiftKey || event.altKey) return;
	if (event.code !== "KeyO") return;

	event.preventDefault();
	event.stopPropagation();
	togglePopupAtVolume();
}

function togglePopupAtVolume() {
	if (isDevicePopupOpen()) {
		closeDevicePopup();
		return;
	}

	const bar = document.querySelector(VOLUME_BAR);
	const anchor = bar
		? (bar.querySelector(VOLUME_ICON) ?? bar).getBoundingClientRect()
		: // Sem playbar: ancora no rodapé direito, onde ela ficaria.
			new DOMRect(window.innerWidth - 240, window.innerHeight - 80, 48, 48);

	openDevicePopup({ anchor });
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
	document.addEventListener("keydown", onKeyDown, true);

	// Segunda porta de entrada: uma seção na página de Configurações do Spotify.
	watchSettingsPage();
}
