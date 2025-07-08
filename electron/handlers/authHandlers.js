// Dependências combinadas de ambas as versões
const { runTask, parseDate, formatDate } = require('./utils');
const path = require('path');
const fs = require('fs');

/**
 * Converte um array de arrays (onde a primeira linha é o cabeçalho) em um array de objetos.
 */
function arraysToObjects(arrays) {
    if (!arrays || arrays.length === 0) return [];
    const [headers, ...rows] = arrays;
    return rows.map(row => {
        const obj = {};
        headers.forEach((header, i) => {
            obj[header] = row[i] !== undefined ? row[i] : null;
        });
        return obj;
    });
}

/**
 * Registra todos os handlers de IPC para autenticação e automação.
 */
function registerAuthHandlers(ipcMain, logging, { BrowserWindow, session, getGoogleAuthClient, google }) {
    
    // Variável para controlar a janela de login assistido
    let activeLoginWindow = null;
    
    //==================================================================
    //  HELPER FUNCTIONS PARA AUTOMAÇÃO ASSISTIDA (Da versão maior)
    //==================================================================
    
    const createLoginFlow = (loginURL, partition, title) => {
        return new Promise((resolve, reject) => {
            if (activeLoginWindow && !activeLoginWindow.isDestroyed()) {
                activeLoginWindow.focus();
                return reject(new Error("Uma janela de login já está ativa."));
            }

            activeLoginWindow = new BrowserWindow({
                width: 800, height: 700, title: title,
                webPreferences: { partition: partition, devTools: true }
            });

            activeLoginWindow.loadURL(loginURL);

            const onClosed = () => {
                activeLoginWindow = null;
                reject(new Error(`Janela de login (${title}) fechada antes da confirmação.`));
            };
            activeLoginWindow.once('closed', onClosed);

            ipcMain.once('login-confirmed', () => {
                if (activeLoginWindow && !activeLoginWindow.isDestroyed()) {
                    activeLoginWindow.removeListener('closed', onClosed);
                    logging.log(`Login para '${title}' confirmado pelo usuário.`);
                    resolve(activeLoginWindow);
                } else {
                    reject(new Error("Janela de login não está mais disponível."));
                }
            });

            ipcMain.once('login-canceled', () => {
                if (activeLoginWindow && !activeLoginWindow.isDestroyed()) {
                    activeLoginWindow.close();
                }
                activeLoginWindow = null;
                reject(new Error(`Login para '${title}' cancelado pelo usuário.`));
            });
        });
    };
    
    const runAssistedAutomation = async (taskFunction, args) => {
        try {
            await taskFunction(args);
            logging.finishTask("Automação assistida concluída!");
        } catch (error) {
            logging.errorTask(`ERRO na automação assistida: ${error.message}`);
        } finally {
            if (activeLoginWindow && !activeLoginWindow.isDestroyed()) {
                activeLoginWindow.close();
            }
            activeLoginWindow = null;
        }
    };
    
    const assistedAutomationRunner = (loginUrl, partition, title, taskLogic) => async (event, args) => {
        try {
            const activeWindow = await createLoginFlow(loginUrl, partition, title);
            await runAssistedAutomation(taskLogic, { ...args, activeWindow });
        } catch(error){
            logging.errorTask(`Falha no fluxo de login assistido: ${error.message}`);
        }
    };

    //==================================================================
    //  HANDLERS DE AUTENTICAÇÃO E STATUS
    //==================================================================

    // Autenticação principal do aplicativo via Google Sheets
    ipcMain.handle('auth:app-login', (event, { username, password }) => runTask('Autenticação do Usuário', async () => {
        const sheets = google.sheets({ version: 'v4', auth: getGoogleAuthClient() });
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;
        const [managersResponse, accessResponse] = await Promise.all([
             sheets.spreadsheets.values.get({ spreadsheetId, range: 'Gestores!A:D' }),
             sheets.spreadsheets.values.get({ spreadsheetId, range: 'Acessos_Quadros!A:B' }),
        ]);
        const managers = arraysToObjects(managersResponse.data.values);
        const accessRules = arraysToObjects(accessResponse.data.values);
        const foundManager = managers.find(m => m.Nome_Gestor === username && m.CPF_Gestor === password);
        if (foundManager) {
            const allowedBoardIds = accessRules.filter(rule => rule.ID_Gestor_Trello === foundManager.ID_Trello).map(rule => rule.ID_Quadro_Trello);
            const user = { name: foundManager.Nome_Gestor, trelloId: foundManager.ID_Trello, trelloUsername: foundManager.Username_Trello, allowedBoardIds };
            logging.log(`Usuário '${username}' autenticado. Acesso a ${allowedBoardIds.length} quadro(s).`);
            return { success: true, user };
        } else {
            throw new Error("Nome de usuário ou CPF inválidos.");
        }
    }, logging));
    
    // Verifica o status da conexão com o Google
    ipcMain.handle('auth:check-google-status', () => ({ isConnected: !!getGoogleAuthClient() }));

    // [RESTAURADO] Verifica se existe uma sessão ativa no Trello
    ipcMain.handle('auth:check-trello-session', async () => {
        try {
            const trelloCookies = await session.fromPartition('persist:trello_session').cookies.get({ url: 'https://trello.com' });
            return { isAuthenticated: trelloCookies.length > 0 };
        } catch (error) {
            logging.errorTask(`Erro ao verificar a sessão do Trello: ${error.message}`);
            return { isAuthenticated: false };
        }
    });

    // [RESTAURADO] Abre uma janela para o usuário fazer login no Trello
    ipcMain.handle('auth:interactive-trello-login', () => runTask('Login Interativo Trello', () => {
        return new Promise((resolve, reject) => {
            const trelloLoginWindow = new BrowserWindow({
                width: 800,
                height: 700,
                title: 'Login Trello',
                webPreferences: {
                    partition: 'persist:trello_session',
                    nodeIntegration: false,
                    contextIsolation: true,
                }
            });

            trelloLoginWindow.loadURL('https://trello.com/login');
            
            trelloLoginWindow.webContents.on('did-navigate', (event, url) => {
                // Checa se o usuário foi redirecionado para a página de quadros ou para seu perfil
                if (url.includes('trello.com') && (url.endsWith('/boards') || url.includes('/u/'))) {
                    logging.log('Login no Trello detectado, fechando janela automaticamente.');
                    trelloLoginWindow.close();
                }
            });

            trelloLoginWindow.on('closed', () => {
                logging.log("Janela de login do Trello fechada.");
                resolve({ success: true });
            });

            trelloLoginWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
                 reject(new Error(`Falha ao carregar a página de login do Trello: ${errorDescription}`));
            });
        });
    }, logging));
    
    //==================================================================
    //  HANDLERS DE AUTOMAÇÃO ASSISTIDA (DOWNLOAD DE RELATÓRIOS)
    //==================================================================

    ipcMain.handle('automation:run-gov-download', assistedAutomationRunner('https://consumidor.gov.br/pages/administrativo/login', 'persist:gov_session', 'Login Gov.br', async ({ basePath, startDate, endDate, activeWindow }) => {
        await activeWindow.webContents.loadURL("https://consumidor.gov.br/pages/exportacao-dados/novo");
        logging.log("Aguardando formulário...");
        await activeWindow.webContents.executeJavaScript(`new Promise(r => { const i = setInterval(() => { if(document.querySelector('form#exportacaoDadosForm')) { clearInterval(i); r(); } }, 500); })`);
        logging.log("Formulário encontrado! Iniciando downloads...");
        const downloadsPath = path.join(basePath, "Relatorios_Consumidor_Gov");
        fs.mkdirSync(downloadsPath, { recursive: true });

        activeWindow.webContents.session.on('will-download', (event, item) => {
            const filePath = path.join(downloadsPath, `relatorio_Gov_${new Date().getTime()}.xls`);
            item.setSavePath(filePath);
            item.once('done', (e, state) => {
                if (state === 'completed') logging.log(`Download salvo: ${path.basename(filePath)}`);
                else logging.log(`Download de ${path.basename(filePath)} falhou: ${state}`);
            });
        });

        const finalEndDate = endDate ? parseDate(endDate) : new Date(new Date() - 86400000);
        let currentDate = startDate ? parseDate(startDate) : new Date(new Date().setFullYear(finalEndDate.getFullYear() - 5));

        while (currentDate <= finalEndDate) {
            let periodEndDate = new Date(currentDate);
            periodEndDate.setDate(periodEndDate.getDate() + 59);
            if (periodEndDate > finalEndDate) periodEndDate = finalEndDate;
            const sDate = formatDate(currentDate);
            const eDate = formatDate(periodEndDate);
            logging.log(`Processando lote: ${sDate} a ${eDate}`);
            await activeWindow.webContents.executeJavaScript(`
                document.getElementById('dataIniPeriodo').value = '${sDate}';
                document.getElementById('dataFimPeriodo').value = '${eDate}';
                document.querySelector('label[for="colunasExportadas1"]').click();
                document.getElementById('btnExportar').click();
            `);
            await new Promise(r => setTimeout(r, 5000));
            currentDate = new Date(periodEndDate.setDate(periodEndDate.getDate() + 1));
        }
    }));
    
    ipcMain.handle('automation:run-hugme-download', assistedAutomationRunner('https://app.hugme.com.br/', 'persist:hugme_session', 'Login HugMe', async ({ basePath, startDate, endDate, activeWindow }) => {
        const EXPORT_PAGE_URL = "https://app.hugme.com.br/app.html#/dados/tickets/exportar/";
        const EMPRESAS = ["Ciasprev", "Você Seguradora", "Hoje Previdência", "AKRK Promotora", "Click Bank Digital", "Capital Consig"];

        await activeWindow.webContents.loadURL(EXPORT_PAGE_URL);
        logging.log("Aguardando formulário de relatório...");
        await activeWindow.webContents.executeJavaScript(`new Promise(r => { const i = setInterval(() => { if (angular.element(document.querySelector('div.create-report-wrapper')).scope()?.headerDomains?.empresa.length > 1) { clearInterval(i); r(); } }, 500); setTimeout(() => { clearInterval(i); r(); }, 30000); })`);
        logging.log("Formulário carregado.");

        const downloadsPath = path.join(basePath, "Relatorios_HUGME");
        fs.mkdirSync(downloadsPath, { recursive: true });
        activeWindow.webContents.session.on('will-download', (event, item) => {
            const filePath = path.join(downloadsPath, item.getFilename());
            item.setSavePath(filePath);
            item.once('done', (e, state) => {
                if (state === 'completed') logging.log(`Download salvo: ${item.getFilename()}`);
                else logging.log(`Download de ${item.getFilename()} falhou: ${state}`);
            });
        });

        for (const empresa of EMPRESAS) {
            logging.log(`\n--- Gerando relatório para: ${empresa} ---`);
            const reportTitle = `Relatorio_${empresa.replace(/\s/g, '_')}_${new Date().toISOString().replace(/[:.]/g, '-')}`;
            let sDate = startDate || formatDate(new Date(new Date().setFullYear(new Date().getFullYear() - 5)));
            let eDate = endDate || formatDate(new Date());

            await activeWindow.webContents.executeJavaScript(`
                (() => {
                    const scope = angular.element(document.querySelector('div.create-report-wrapper')).scope();
                    const opt = scope.headerDomains.empresa.find(e => e.nomeRaResponde === '${empresa}');
                    if (!opt) throw new Error('Empresa "${empresa}" não encontrada.');
                    scope.header.empresa = opt.idEmpresa;
                    scope.header.titulo = '${reportTitle}';
                    scope.periodoPreDef = 'false';
                    scope.$apply();
                    scope.header.periodo.ini = '${sDate}';
                    scope.header.periodo.fim = '${eDate}';
                    if (!document.getElementById('selAll').checked) document.getElementById('selAll').click();
                    scope.$apply();
                    document.querySelector('button[ng-click="submitFilter();"]').click();
                })();
            `);
            logging.log(`-> Relatório '${reportTitle}' solicitado.`);
            await new Promise(r => setTimeout(r, 4000));
        }
        await new Promise(r => setTimeout(r, 10000));
    }));
    
    ipcMain.handle('automation:run-proconsp-download', assistedAutomationRunner('https://fornecedor2.procon.sp.gov.br/#/login', 'persist:proconsp_session', 'Login Procon-SP', async ({ basePath, startDate, endDate, activeWindow }) => {
        const downloadsPath = path.join(basePath, "Relatorios_PROCON_SP");
        fs.mkdirSync(downloadsPath, { recursive: true });

        const finalEndDate = endDate ? parseDate(endDate) : new Date(new Date() - 86400000);
        const defaultStartDate = new Date(2023, 4, 1);
        let currentDate = startDate ? parseDate(startDate) : defaultStartDate;
        let lastProcessedDate = new Date(currentDate);

        activeWindow.webContents.session.on('will-download', (event, item) => {
            const dateSuffix = `${lastProcessedDate.getFullYear()}-${String(lastProcessedDate.getMonth() + 1).padStart(2, '0')}-${String(lastProcessedDate.getDate()).padStart(2, '0')}`;
            const fileName = `relatorio_SP_${dateSuffix}_auto.csv`;
            const savePath = path.join(downloadsPath, fileName);
            item.setSavePath(savePath);
            item.once('done', (e, state) => {
                if (state === 'completed') logging.log(`Download salvo: ${fileName}`);
                else logging.log(`Download ${fileName} falhou: ${state}`);
            });
        });

        while (currentDate <= finalEndDate) {
            let periodEndDate = new Date(currentDate);
            periodEndDate.setDate(periodEndDate.getDate() + 29);
            if (periodEndDate > finalEndDate) periodEndDate = finalEndDate;
            const sDate = formatDate(currentDate);
            const eDate = formatDate(periodEndDate);
            lastProcessedDate = new Date(currentDate);

            logging.log(`--- Processando lote: ${sDate} a ${eDate} ---`);
            try {
                await activeWindow.webContents.executeJavaScript(`
                    document.querySelector('button:has-text("Exportar para csv")').click();
                    new Promise(resolve => setTimeout(resolve, 1500)).then(() => {
                        document.querySelector("app-date-field[labeltext='De'] input[mask]").value = "${sDate}";
                        document.querySelector("app-date-field[labeltext='Até'] input[mask]").value = "${eDate}";
                        document.querySelector("mat-dialog-actions button span.mat-button-wrapper:has-text('Gerar csv')").click();
                    });
                `);
                await new Promise(resolve => setTimeout(resolve, 3000));
            } catch (e) {
                logging.log(`AVISO: Falha ao gerar lote de ${sDate}.`);
                const okBtnVisible = await activeWindow.webContents.executeJavaScript(`document.querySelector("button span:has-text('Ok')") !== null`);
                if (okBtnVisible) {
                    await activeWindow.webContents.executeJavaScript(`document.querySelector("button span:has-text('Ok')").click()`);
                    logging.log("Pop-up 'Nenhum item' fechado.");
                }
            }
            currentDate = new Date(periodEndDate.setDate(periodEndDate.getDate() + 1));
        }
    }));
}

module.exports = { registerAuthHandlers };