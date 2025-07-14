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

    const datePart = str.split(' ')[0];
    const parts = datePart.split('/');
    if (parts.length !== 3) return null;

    const [day, month, year] = parts.map(p => parseInt(p, 10));

    if (isNaN(day) || isNaN(month) || isNaN(year) || year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return null;

    const date = new Date(Date.UTC(year, month - 1, day));

    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
        return null;
    }

    return date;
};

const formatDate = (date) => {
    if (!(date instanceof Date) || isNaN(date)) return '';
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = date.getUTCFullYear();
    return `${day}/${month}/${year}`;
};

module.exports = {
    runTask,
    getChromiumPath,
    parseDate,
    formatDate,
};