import React from "react";
import DeviceModal from "./DeviceModal";

const GAP = 8;
const VIEWPORT_MARGIN = 8;

interface OpenOptions {
	/** Retangulo do elemento que disparou o popup (o controle de volume). */
	anchor: DOMRect;
}

let open: { element: HTMLElement; dispose: () => void } | null = null;

export function closeDevicePopup(): void {
	open?.dispose();
	open = null;
}

export function isDevicePopupOpen(): boolean {
	return open !== null;
}

/**
 * Posiciona o popup acima da âncora (a playbar fica no rodapé), centralizado
 * nela e preso dentro da viewport. Se não couber acima, cai para baixo.
 */
function position(element: HTMLElement, anchor: DOMRect): void {
	const { width, height } = element.getBoundingClientRect();

	let left = anchor.left + anchor.width / 2 - width / 2;
	left = Math.min(left, window.innerWidth - width - VIEWPORT_MARGIN);
	left = Math.max(VIEWPORT_MARGIN, left);

	const above = anchor.top - height - GAP;
	const top = above >= VIEWPORT_MARGIN ? above : Math.min(anchor.bottom + GAP, window.innerHeight - height - VIEWPORT_MARGIN);

	element.style.left = `${Math.round(left)}px`;
	element.style.top = `${Math.round(Math.max(VIEWPORT_MARGIN, top))}px`;
	element.style.visibility = "visible";
}

export function openDevicePopup({ anchor }: OpenOptions): void {
	closeDevicePopup();

	const element = document.createElement("div");
	element.className = "audiocfg-popup";
	element.setAttribute("role", "dialog");
	element.setAttribute("aria-label", "Saída de áudio");
	// Medimos antes de mostrar para não piscar na posição errada.
	element.style.visibility = "hidden";

	const header = document.createElement("div");
	header.className = "audiocfg-popup-title";
	header.textContent = "Saída de áudio";
	element.appendChild(header);

	const body = document.createElement("div");
	element.appendChild(body);
	document.body.appendChild(element);

	// Escolher um dispositivo fecha o popup, como em qualquer menu de contexto.
	// Adiado para não desmontar a raiz React de dentro do próprio handler.
	const node = React.createElement(DeviceModal, {
		onDeviceChange: () => setTimeout(closeDevicePopup, 0),
	});
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

	position(element, anchor);
	// O conteúdo troca de tamanho quando a lista de dispositivos chega.
	const observer = new ResizeObserver(() => position(element, anchor));
	observer.observe(element);

	const onPointerDown = (event: PointerEvent) => {
		if (!element.contains(event.target as Node)) closeDevicePopup();
	};
	const onKeyDown = (event: KeyboardEvent) => {
		if (event.key === "Escape") {
			event.stopPropagation();
			closeDevicePopup();
		}
	};

	document.addEventListener("pointerdown", onPointerDown, true);
	document.addEventListener("keydown", onKeyDown, true);
	window.addEventListener("resize", closeDevicePopup);
	window.addEventListener("blur", closeDevicePopup);

	open = {
		element,
		dispose: () => {
			observer.disconnect();
			document.removeEventListener("pointerdown", onPointerDown, true);
			document.removeEventListener("keydown", onKeyDown, true);
			window.removeEventListener("resize", closeDevicePopup);
			window.removeEventListener("blur", closeDevicePopup);
			unmount();
			element.remove();
		},
	};
}
