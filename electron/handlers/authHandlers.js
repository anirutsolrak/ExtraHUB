const { runTask, parseDate, formatDate } = require('./utils');
const path = require('path');
const fs = require('fs');

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

function registerAuthHandlers(ipcMain, logging, { BrowserWindow, session, getGoogleAuthClient, google, mainWindow }) {
    
    let activeLoginWindow = null;
    
    const createLoginFlow = (loginURL, partition, title) => {
        return new Promise((resolve, reject) => {
            if (activeLoginWindow && !activeLoginWindow.isDestroyed()) {
                activeLoginWindow.focus();
                return reject(new Error("Uma janela de login já está ativa."));
            }

            mainWindow.webContents.send('assisted-login-started');

            activeLoginWindow = new BrowserWindow({
                parent: mainWindow,
                width: 800, height: 700, title: title,
                webPreferences: { partition: partition, devTools: true }
            });

            activeLoginWindow.loadURL(loginURL);

            const onClosed = () => {
                activeLoginWindow = null;
                mainWindow.webContents.send('assisted-login-finished');
                reject(new Error(`Janela de login (${title}) fechada antes da confirmação.`));
            };
            activeLoginWindow.once('closed', onClosed);

            ipcMain.once('login-confirmed', () => {
                if (activeLoginWindow && !activeLoginWindow.isDestroyed()) {
                    activeLoginWindow.removeListener('closed', onClosed);
                    mainWindow.webContents.send('assisted-login-finished');
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
                mainWindow.webContents.send('assisted-login-finished');
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

    ipcMain.handle('auth:app-login', (event, { username, password, userType }) => runTask('Autenticação do Usuário', async () => {
        const sheets = google.sheets({ version: 'v4', auth: getGoogleAuthClient() });
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;

        if (!userType) {
            throw new Error("O tipo de perfil (Gestor ou Analista) não foi especificado.");
        }

        if (userType === 'gestor') {
            const [managersResponse, accessResponse] = await Promise.all([
                sheets.spreadsheets.values.get({ spreadsheetId, range: 'Gestores!A:D' }),
                sheets.spreadsheets.values.get({ spreadsheetId, range: 'Acessos_Quadros!A:B' }),
            ]);
            const managers = arraysToObjects(managersResponse.data.values);
            const accessRules = arraysToObjects(accessResponse.data.values);
            const foundManager = managers.find(m => m.Nome_Gestor === username && m.CPF_Gestor === password);
            if (foundManager) {
                const allowedBoardIds = accessRules.filter(rule => rule.ID_Gestor_Trello === foundManager.ID_Trello).map(rule => rule.ID_Quadro_Trello);
                const user = { 
                    name: foundManager.Nome_Gestor, 
                    trelloId: foundManager.ID_Trello, 
                    trelloUsername: foundManager.Username_Trello, 
                    allowedBoardIds,
                    role: 'gestor'
                };
                logging.log(`Usuário Gestor '${username}' autenticado. Acesso a ${allowedBoardIds.length} quadro(s).`);
                return { success: true, user };
            } else {
                throw new Error("Nome de gestor ou CPF inválidos.");
            }
        } else if (userType === 'analista') {
            const analystsResponse = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Analistas!A:D' });
            const analysts = arraysToObjects(analystsResponse.data.values);
            const foundAnalyst = analysts.find(a => a.Nome_Analista === username && a.CPF_Analista === password);
            if (foundAnalyst) {
                const user = {
                    name: foundAnalyst.Nome_Analista,
                    role: 'analista',
                    boardId: foundAnalyst.ID_Quadro_Trello,
                    trelloLabelName: foundAnalyst.Nome_Analista
                };
                logging.log(`Usuário Analista '${username}' autenticado. Associado ao quadro ${user.boardId}.`);
                return { success: true, user };
            } else {
                throw new Error("Nome de analista ou CPF inválidos.");
            }
        } else {
            throw new Error(`Tipo de perfil desconhecido: ${userType}`);
        }
    }, logging));
    
    ipcMain.handle('auth:check-google-status', () => ({ isConnected: !!getGoogleAuthClient() }));

    ipcMain.handle('auth:check-trello-session', async () => {
        try {
            const trelloCookies = await session.fromPartition('persist:trello_session').cookies.get({ url: 'https://trello.com' });
            return { isAuthenticated: trelloCookies.length > 0 };
        } catch (error) {
            logging.errorTask(`Erro ao verificar a sessão do Trello: ${error.message}`);
            return { isAuthenticated: false };
        }
    });

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

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        let finalEndDate = endDate ? parseDate(endDate) : new Date(today.getTime() - 86400000);
        
        if (finalEndDate >= today) {
            logging.log(`Data final (${formatDate(finalEndDate)}) é inválida. Ajustando para ontem.`);
            finalEndDate = new Date(today.getTime() - 86400000);
        }

        let currentDate = startDate ? parseDate(startDate) : new Date(new Date().setFullYear(finalEndDate.getFullYear() - 5));

        while (currentDate <= finalEndDate) {
            let periodEndDate = new Date(currentDate);
            periodEndDate.setDate(periodEndDate.getDate() + 59);
            if (periodEndDate > finalEndDate) {
                periodEndDate = finalEndDate;
            }

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
            currentDate = new Date(periodEndDate.getTime() + 86400000);
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
        
        const reportTitles = [];
        for (const empresa of EMPRESAS) {
            logging.log(`\n--- Gerando relatório para: ${empresa} ---`);
            const reportTitle = `Relatorio_${empresa.replace(/\s/g, '_')}_${new Date().toISOString().replace(/[:.]/g, '-')}`;
            reportTitles.push(reportTitle);
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

        logging.log("\n--- Relatórios solicitados. Iniciando monitoramento para downloads... ---");
        
        const downloadedReports = new Set();
        const MAX_WAIT_MINUTES = 20;
        const CHECK_INTERVAL_SECONDS = 20;
        const startTime = Date.now();

        while (downloadedReports.size < reportTitles.length) {
            if (Date.now() - startTime > MAX_WAIT_MINUTES * 60 * 1000) {
                throw new Error(`Tempo limite de ${MAX_WAIT_MINUTES} minutos atingido. Nem todos os relatórios foram baixados.`);
            }

            logging.log(`Verificando status dos relatórios... (${downloadedReports.size}/${reportTitles.length} baixados)`);
            
            const reportsToDownload = await activeWindow.webContents.executeJavaScript(`
                (() => {
                    const reports = [];
                    const reportElements = document.querySelectorAll('div.my-reports ul.content li.item');
                    reportElements.forEach((item, index) => {
                        const titleElement = item.querySelector('h5');
                        const buttonElement = item.querySelector('button[ng-click^="download"]');
                        if (titleElement && buttonElement && !buttonElement.classList.contains('disabled') && buttonElement.offsetParent !== null) {
                           reports.push({
                               title: titleElement.innerText.trim(),
                               clickIndex: index 
                           });
                        }
                    });
                    return reports;
                })();
            `);
            
            for(const report of reportsToDownload) {
                if(reportTitles.includes(report.title) && !downloadedReports.has(report.title)) {
                     logging.log(`Relatório "${report.title}" está pronto. Iniciando download...`);
                     await activeWindow.webContents.executeJavaScript(`
                        document.querySelectorAll('div.my-reports ul.content li.item')[${report.clickIndex}].querySelector('button[ng-click^="download"]').click();
                     `);
                     downloadedReports.add(report.title);
                     await new Promise(r => setTimeout(r, 2000)); 
                }
            }

            if (downloadedReports.size < reportTitles.length) {
                logging.log(`Aguardando ${CHECK_INTERVAL_SECONDS} segundos antes da próxima verificação...`);
                await new Promise(r => setTimeout(r, CHECK_INTERVAL_SECONDS * 1000));
                
                logging.log("Forçando atualização da interface do HugMe recarregando a página...");
                await activeWindow.webContents.reload();
                await new Promise(r => setTimeout(r, 5000));
            }
        }
        logging.log("Todos os relatórios solicitados foram baixados.");
    }));
    
    ipcMain.handle('automation:run-proconsp-download', assistedAutomationRunner('https://fornecedor2.procon.sp.gov.br/#/login', 'persist:proconsp_session', 'Login Procon-SP', async ({ basePath, startDate, endDate, activeWindow }) => {
        const downloadsPath = path.join(basePath, "Relatorios_PROCON_SP");
        fs.mkdirSync(downloadsPath, { recursive: true });

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let finalEndDate = endDate ? parseDate(endDate) : new Date(today.getTime() - 86400000);
        if (finalEndDate >= today) {
            logging.log(`Data final (${formatDate(finalEndDate)}) é inválida. Ajustando para ontem.`);
            finalEndDate = new Date(today.getTime() - 86400000);
        }
        
        const defaultStartDate = new Date(2023, 4, 1);
        let currentDate = startDate ? parseDate(startDate) : defaultStartDate;
        
        let lastProcessedDate;

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
             if (periodEndDate > finalEndDate) {
                periodEndDate = finalEndDate;
            }
            const sDate = formatDate(currentDate);
            const eDate = formatDate(periodEndDate);
            lastProcessedDate = new Date(currentDate);

            logging.log(`--- Processando lote: ${sDate} a ${eDate} ---`);
            try {
                await activeWindow.webContents.executeJavaScript(`
                    Array.from(document.querySelectorAll('button')).find(btn => btn.textContent.trim().includes('Exportar para csv')).click();
                    new Promise(resolve => setTimeout(resolve, 2000)).then(() => {
                        document.querySelector("app-date-field[labeltext='De'] input[mask]").value = "${sDate}";
                        document.querySelector("app-date-field[labeltext='Até'] input[mask]").value = "${eDate}";
                        Array.from(document.querySelectorAll("mat-dialog-actions button")).find(btn => btn.textContent.trim().includes('Gerar csv')).click();
                    });
                `);
                await new Promise(resolve => setTimeout(resolve, 3000));
            } catch (e) {
                logging.errorTask(`Falha ao executar o script para o lote de ${sDate}: ${e.message}`);
                try {
                    const closedPopup = await activeWindow.webContents.executeJavaScript(`
                        const okButton = Array.from(document.querySelectorAll("button")).find(b => b.textContent.trim() === 'Ok');
                        if (okButton) {
                            okButton.click();
                            return true;
                        }
                        return false;
                    `);
                    if (closedPopup) {
                        logging.log("Pop-up 'Nenhum item' fechado.");
                    }
                } catch (popupError) {
                    logging.log("Não foi possível interagir com o pop-up de erro ou ele não estava presente.");
                }
            }
            currentDate = new Date(periodEndDate.getTime() + 86400000);
        }
    }));
}

module.exports = { registerAuthHandlers };