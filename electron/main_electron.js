const { app, BrowserWindow, ipcMain, dialog, screen, session } = require('electron');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const { google } = require('googleapis');

const { registerAutomationHandlers } = require('./handlers/automationHandlers');
const { registerDataHandlers } = require('./handlers/dataHandlers');
const { registerAuthHandlers } = require('./handlers/authHandlers');

let mainWindow;
let googleAuthClient = null;

const isDev = !app.isPackaged;
const backendPath = isDev ? path.join(__dirname, '..', 'backend') : path.join(process.resourcesPath, 'app.asar.unpacked', 'backend');
dotenv.config({ path: path.join(backendPath, '.env') });

async function initializeGoogleAuth(logging) {
    try {
        const keyPath = isDev ? path.join(__dirname, '..', 'backend', 'service_account.json') : path.join(process.resourcesPath, 'app.asar.unpacked', 'backend', 'service_account.json');
        
        if (!fs.existsSync(keyPath)) {
            logging.errorTask("Arquivo de conta de serviço (service_account.json) não encontrado.");
            return;
        }

        const auth = new google.auth.GoogleAuth({
            keyFile: keyPath,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const client = await auth.getClient();
        googleAuthClient = client;
        logging.log("Autenticação com Google via Conta de Serviço bem-sucedida.");

    } catch (error) {
        logging.errorTask(`Falha na autenticação com Google: ${error.message}`);
        googleAuthClient = null;
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({ 
        width: 1280, 
        height: 800, 
        minWidth: 1100, 
        minHeight: 700, 
        title: 'ExtraHub', 
        icon: path.join(__dirname, '..', 'frontend', 'assets', 'icon.ico'),
        webPreferences: { 
            preload: path.join(__dirname, 'preload.js'), 
            contextIsolation: true, 
            nodeIntegration: false,
            webviewTag: true
        } 
    });
    mainWindow.loadFile(path.join(__dirname, '..', 'frontend', 'index.html'));

    if (isDev) {
        mainWindow.webContents.openDevTools();
    }

    const log = (message) => { if (mainWindow) mainWindow.webContents.send('log', message); };
    const finishTask = (message) => { if (mainWindow) mainWindow.webContents.send('task-finished', message); };
    const errorTask = (error) => { if (mainWindow) mainWindow.webContents.send('task-error', error.toString()); };

    const loggingUtils = { log, finishTask, errorTask };

    initializeGoogleAuth(loggingUtils);

    ipcMain.handle('dialog:selectDirectory', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, { 
            title: 'Selecione a Pasta Principal', 
            properties: ['openDirectory'] 
        });
        return !canceled ? filePaths[0] : null;
    });

    registerAutomationHandlers(ipcMain, loggingUtils);
    registerDataHandlers(ipcMain, loggingUtils, { getGoogleAuthClient: () => googleAuthClient, google });
    registerAuthHandlers(ipcMain, loggingUtils, { BrowserWindow, session, getGoogleAuthClient: () => googleAuthClient, google, mainWindow });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});