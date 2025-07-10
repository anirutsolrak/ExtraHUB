const { app } = require('electron');
const path = require('path');
const fs = require('fs');

async function runTask(taskName, logic, logging, args) {
    logging.log(`>>> Iniciando tarefa: ${taskName}...`);
    try {
        const result = await logic(args, logging);
        logging.finishTask(`Tarefa '${taskName}' concluída com sucesso!`);
        return result;
    } catch (error) {
        logging.errorTask(`ERRO na tarefa '${taskName}': ${error.message}`);
        throw error;
    }
}

function getChromiumPath() {
    let chromiumPath;
    try {
        chromiumPath = require('playwright').chromium.executablePath();
    } catch (e) {
        console.error("Playwright não encontrado, tentando caminho alternativo para empacotado.");
    }

    if (app.isPackaged) {
        const browserDir = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'playwright', '.local-browsers');
        if (fs.existsSync(browserDir)) {
            const chromiumFolder = fs.readdirSync(browserDir).find(f => f.startsWith('chromium-'));
            if (chromiumFolder) {
                const manualPath = path.join(browserDir, chromiumFolder, 'chrome-win', 'chrome.exe');
                if (fs.existsSync(manualPath)) {
                    console.log("Usando caminho do Chromium empacotado:", manualPath);
                    return manualPath;
                }
            }
        }
    }
    console.log("Usando caminho padrão do Playwright:", chromiumPath);
    return chromiumPath;
}

const parseDate = (str) => {
    if (!str || typeof str !== 'string') return null;
    const parts = str.split('/');
    if (parts.length !== 3) return null;
    const [day, month, year] = parts.map(Number);
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
    return new Date(year, month - 1, day);
};

const formatDate = (date) => {
    if (!(date instanceof Date) || isNaN(date)) return '';
    return date.toLocaleDateString('pt-BR', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

module.exports = {
    runTask,
    getChromiumPath,
    parseDate,
    formatDate,
};