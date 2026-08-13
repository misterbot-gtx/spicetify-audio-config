import React from "react";
import DeviceList from "./DeviceList";

/**
 * Injeta uma seção "Saída de áudio" na página de Configurações do Spotify.
 *
 * O menu do app (Arquivo/Editar/Exibir/Reprodução) é desenhado nativamente,
 * fora do Chromium — nenhum texto dele existe no DOM, então extensão nenhuma
 * alcança. E `Spicetify.Menu.Item` não funciona nesta versão: o menu do perfil
 * foi reescrito e não passa mais pelo ContextMenuV2 que o Spicetify engancha
 * (o item registra sem erro, mas nunca é renderizado). A página de
 * Configurações é HTML comum, e é o lugar de "configuração" que sobra.
 */

const SECTION_ID = "audiocfg-settings-section";
const CONTAINER = ".x-settings-container";
const SECTION = ".x-settings-section";
/** Vizinho temático: entramos logo depois de "Qualidade do áudio". */
const NEIGHBOUR = /qualidade do .udio|audio quality/i;

const MOUNT_POLL_MS = 400;

let mounted: { section: HTMLElement; dispose: () => void } | null = null;

function neighbourOf(container: Element): Element | null {
	const sections = Array.from(container.querySelectorAll(SECTION));
	return sections.find((s) => NEIGHBOUR.test(s.querySelector("h2")?.textContent ?? "")) ?? null;
}

function inject(): void {
	const container = document.querySelector(CONTAINER);
	if (!container || document.getElementById(SECTION_ID)) return;

	const section = document.createElement("div");
	section.id = SECTION_ID;
	section.className = "x-settings-section";

	const heading = document.createElement("h2");
	// Copia as classes de um título existente: os nomes do Encore são versionados
	// e mudam entre builds, então herdar é mais estável que fixar.
	heading.className = container.querySelector(`${SECTION} h2`)?.className ?? "";
	heading.textContent = "Saída de áudio";
	section.appendChild(heading);

	const body = document.createElement("div");
	body.className = "audiocfg-settings";
	section.appendChild(body);

	const neighbour = neighbourOf(container);
	if (neighbour?.nextSibling) container.insertBefore(section, neighbour.nextSibling);
	else container.appendChild(section);

	const node = React.createElement(DeviceList, {});
	const createRoot = (Spicetify.ReactDOM as any).createRoot;
	let unmount: () => void;

	if (typeof createRoot === "function") {
		const root = createRoot(body);
		root.render(node);
		unmount = () => root.unmount();
	} else {
		(Spicetify.ReactDOM as any).render(node, body);
		unmount = () => (Spicetify.ReactDOM as any).unmountComponentAtNode(body);
	}

	// A página de Configurações é destruída ao navegar: descarta a raiz React
	// junto, senão o intervalo de refresh da lista ficaria rodando à toa.
	const watcher = setInterval(() => {
		if (section.isConnected) return;
		clearInterval(watcher);
		unmount();
		mounted = null;
	}, MOUNT_POLL_MS);

	mounted = {
		section,
		dispose: () => {
			clearInterval(watcher);
			unmount();
			section.remove();
			mounted = null;
		},
	};
}

/**
 * A rota muda antes da página existir, e o Spotify remonta a lista de seções
 * algumas vezes — daí a tentativa repetida em vez de uma injeção única.
 */
export function watchSettingsPage(): void {
	let attempts = 0;
	let timer: number | undefined;

	const stop = () => {
		if (timer !== undefined) clearInterval(timer);
		timer = undefined;
	};

	const onRoute = (pathname: string) => {
		stop();
		if (!pathname.startsWith("/preferences")) {
			mounted?.dispose();
			return;
		}
		attempts = 0;
		timer = setInterval(() => {
			inject();
			// ~12s de tentativas: cobre carregamento lento sem girar para sempre.
			if (++attempts > 30) stop();
		}, MOUNT_POLL_MS) as unknown as number;
	};

	Spicetify.Platform.History.listen((location: { pathname: string }) => onRoute(location.pathname));
	onRoute(Spicetify.Platform.History.location.pathname);
}
