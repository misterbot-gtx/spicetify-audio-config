/*
 * Copia o bundle de dist/ para a pasta Extensions do Spicetify.
 *
 * O build gera dentro do repositorio (dist/) porque o Marketplace baixa o .js
 * direto do GitHub; para testar localmente ele ainda precisa estar em Extensions/.
 */

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const BUNDLE = "audio-config.js";
const source = path.join(__dirname, "..", "dist", BUNDLE);

if (!fs.existsSync(source)) {
	console.error(`dist/${BUNDLE} nao existe. Rode "npm run build" antes.`);
	process.exit(1);
}

let extensionsDir;
try {
	const configPath = execFileSync("spicetify", ["-c"], { encoding: "utf8" }).trim();
	extensionsDir = path.join(path.dirname(configPath), "Extensions");
} catch {
	console.error('Nao consegui rodar "spicetify -c". O Spicetify esta no PATH?');
	process.exit(1);
}

fs.mkdirSync(extensionsDir, { recursive: true });
const target = path.join(extensionsDir, BUNDLE);
fs.copyFileSync(source, target);

console.log(`Instalado: ${target}`);
console.log('Rode "spicetify apply" (ou Ctrl+R no Spotify, se ja aplicou antes).');
