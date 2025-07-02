const { app, BrowserWindow, ipcMain, dialog, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

function getChromiumPath() {
    // Caminho padrão do Playwright (dev)
    let chromiumPath = chromium.executablePath();

    // Se empacotado, tenta o caminho do build
    if (app.isPackaged) {
        // Ajuste o número da versão conforme a pasta baixada
        const browserDir = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'playwright', '.local-browsers');
        // Descobre a pasta chromium-xxxx dinamicamente
        const chromiumFolder = fs.readdirSync(browserDir).find(f => f.startsWith('chromium-'));
        if (chromiumFolder) {
            const manualPath = path.join(browserDir, chromiumFolder, 'chrome-win', 'chrome.exe');
            if (fs.existsSync(manualPath)) {
                chromiumPath = manualPath;
            }
        }
    }
    return chromiumPath;
}

const dotenv = require('dotenv');
const XLSX = require('xlsx');

// --- Configuração Inicial ---
let mainWindow;
let activeLoginWindow = null;

const isDev = !app.isPackaged;
const backendPath = isDev ? path.join(__dirname, 'backend') : path.join(process.resourcesPath, 'app.asar.unpacked', 'backend');
dotenv.config({ path: path.join(backendPath, '.env') });

function createWindow() {
    mainWindow = new BrowserWindow({ 
        width: 1280, 
        height: 800, 
        minWidth: 1100, 
        minHeight: 700, 
        title: 'ExtraHub', 
        icon: path.join(__dirname, 'frontend/assets/icon.ico'),
        webPreferences: { 
            preload: path.join(__dirname, 'preload.js'), 
            contextIsolation: true, 
            nodeIntegration: false 
        } 
    });
    mainWindow.loadFile(path.join(__dirname, 'frontend', 'index.html'));
}

// --- Funções Auxiliares de Comunicação ---
const log = (message) => { if (mainWindow) mainWindow.webContents.send('log', message); };
const finishTask = (message) => { if (mainWindow) mainWindow.webContents.send('task-finished', message); };
const errorTask = (error) => { if (mainWindow) mainWindow.webContents.send('task-error', error.toString()); };

// --- Handler para seleção de diretório ---
ipcMain.handle('dialog:selectDirectory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, { 
        title: 'Selecione a Pasta Principal', 
        properties: ['openDirectory'] 
    });
    return !canceled ? filePaths[0] : null;
});

// --- Funções Auxiliares de Data ---
const parseDate = (str) => { const [day, month, year] = str.split('/'); return new Date(year, month - 1, day); };
const formatDate = (date) => date.toLocaleDateString('pt-BR', { year: 'numeric', month: '2-digit', day: '2-digit' });

// --- Lógica de Automação Genérica ---
const runAutomation = async (taskName, logic, useLoginWindow = false) => {
    log(`>>> Iniciando automação ${taskName}...`);
    let browser;
    let page;
    try {
        if (useLoginWindow) {
            if (!activeLoginWindow || activeLoginWindow.isDestroyed()) {
                throw new Error("A janela de login não está mais disponível.");
            }
            // Correção: Não existe .page em BrowserWindow. 
            // Você deve obter a página do Playwright de outra forma, 
            // ou adaptar a lógica para não depender de Playwright nesse fluxo.
            // Aqui, vamos lançar um erro claro para evitar uso incorreto:
            throw new Error("Automação com login assistido via Electron não está implementada corretamente. O controle Playwright não pode ser feito diretamente sobre BrowserWindow.");
        } else {
            const chromiumPath = getChromiumPath();
            console.log('Usando Chromium em:', chromiumPath);
            browser = await chromium.launch({ headless: false, executablePath: chromiumPath });
            page = await browser.newPage();
        }
        await logic(page);
        finishTask(`Automação ${taskName} concluída!`);
    } catch (error) {
        errorTask(`ERRO na automação ${taskName}: ${error}`);
    } finally {
        if (browser) {
            await browser.close();
        }
        if (useLoginWindow && activeLoginWindow && !activeLoginWindow.isDestroyed()) {
            activeLoginWindow.close();
            activeLoginWindow = null;
        }
    }
};

// --- Funções de Tarefas (Mapeadas do Índice) ---

// --- 1. [PROCON-SP]: Download ---
ipcMain.handle('automation:run-proconsp-download', async (event, args) => {
    log(`>>> Iniciando automação Procon-SP...`);
    try {
        if (!activeLoginWindow || activeLoginWindow.isDestroyed()) {
            throw new Error("A janela de login do Procon-SP não está mais disponível.");
        }
        const { basePath, startDate: startDateStr, endDate: endDateStr } = args;
        const downloadsPath = path.join(basePath, "Relatorios_PROCON_SP");
        fs.mkdirSync(downloadsPath, { recursive: true });

        const finalEndDate = endDateStr ? parseDate(endDateStr) : new Date(new Date() - 86400000);
        const defaultStartDate = new Date(2023, 4, 1);
        let currentDate = startDateStr ? parseDate(startDateStr) : defaultStartDate;
        let lastProcessedDate = new Date(currentDate);

        activeLoginWindow.webContents.session.on('will-download', (event, item) => {
            const dateSuffix = `${lastProcessedDate.getFullYear()}-${String(lastProcessedDate.getMonth() + 1).padStart(2, '0')}-${String(lastProcessedDate.getDate()).padStart(2, '0')}`;
            const fileName = `relatorio_SP_${dateSuffix}_auto.csv`;
            const savePath = path.join(downloadsPath, fileName);
            item.setSavePath(savePath);
            item.once('done', (e, state) => {
                if (state === 'completed') log(`Download salvo: ${fileName}`);
                else log(`Download ${fileName} falhou: ${state}`);
            });
        });

        while (currentDate <= finalEndDate) {
            let periodEndDate = new Date(currentDate);
            periodEndDate.setDate(periodEndDate.getDate() + 29);
            if (periodEndDate > finalEndDate) periodEndDate = finalEndDate;
            const sDate = formatDate(currentDate);
            const eDate = formatDate(periodEndDate);
            lastProcessedDate = new Date(currentDate);

            log(`--- Processando lote: ${sDate} a ${eDate} ---`);
            try {
                await activeLoginWindow.webContents.executeJavaScript(`
                    document.querySelector('button:has-text("Exportar para csv")').click();
                    new Promise(resolve => setTimeout(resolve, 1500)).then(() => {
                        document.querySelector("app-date-field[labeltext='De'] input[mask]").value = "${sDate}";
                        document.querySelector("app-date-field[labeltext='Até'] input[mask]").value = "${eDate}";
                        document.querySelector("mat-dialog-actions button span.mat-button-wrapper:has-text('Gerar csv')").click();
                    });
                `);
                await new Promise(resolve => setTimeout(resolve, 3000));
            } catch (e) {
                log(`AVISO: Falha ao gerar lote de ${sDate}.`);
                const okBtnVisible = await activeLoginWindow.webContents.executeJavaScript(`document.querySelector("button span:has-text('Ok')") !== null`);
                if (okBtnVisible) {
                    await activeLoginWindow.webContents.executeJavaScript(`document.querySelector("button span:has-text('Ok')").click()`);
                    log("Pop-up 'Nenhum item' fechado.");
                }
            }

            currentDate = new Date(periodEndDate.setDate(periodEndDate.getDate() + 1));
        }
        finishTask("Automação Procon-SP concluída!");
    } catch (error) {
        errorTask(`ERRO na automação Procon-SP: ${error}`);
    } finally {
        if (activeLoginWindow && !activeLoginWindow.isDestroyed()) {
            activeLoginWindow.close();
            activeLoginWindow = null;
        }
    }
});

// --- 2. [HugMe]: Download ---
ipcMain.handle('automation:run-hugme-download', async (event, args) => {
    log(`>>> Iniciando automação HugMe...`);
    try {
        if (!activeLoginWindow || activeLoginWindow.isDestroyed()) {
            throw new Error("A janela de login do HugMe não está mais disponível.");
        }
        const { basePath, startDate, endDate } = args;
        const EXPORT_PAGE_URL = "https://app.hugme.com.br/app.html#/dados/tickets/exportar/";
        const EMPRESAS = ["Ciasprev", "Você Seguradora", "Hoje Previdência", "AKRK Promotora", "Click Bank Digital", "Capital Consig"];

        await activeLoginWindow.webContents.loadURL(EXPORT_PAGE_URL);
        log("Aguardando formulário de relatório...");
        await activeLoginWindow.webContents.executeJavaScript(`new Promise(r => { const i = setInterval(() => { if (angular.element(document.querySelector('div.create-report-wrapper')).scope()?.headerDomains?.empresa.length > 1) { clearInterval(i); r(); } }, 500); setTimeout(() => { clearInterval(i); r(); }, 30000); })`);
        log("Formulário carregado.");

        const downloadsPath = path.join(basePath, "Relatorios_HUGME");
        fs.mkdirSync(downloadsPath, { recursive: true });
        activeLoginWindow.webContents.session.on('will-download', (event, item) => {
            const filePath = path.join(downloadsPath, item.getFilename());
            item.setSavePath(filePath);
            item.once('done', (e, state) => {
                if (state === 'completed') log(`Download salvo: ${item.getFilename()}`);
                else log(`Download de ${item.getFilename()} falhou: ${state}`);
            });
        });

        for (const empresa of EMPRESAS) {
            log(`\n--- Gerando relatório para: ${empresa} ---`);
            const reportTitle = `Relatorio_${empresa.replace(/\s/g, '_')}_${new Date().toISOString().replace(/[:.]/g, '-')}`;
            let sDate = startDate || formatDate(new Date(new Date().setFullYear(new Date().getFullYear() - 5)));
            let eDate = endDate || formatDate(new Date());

            await activeLoginWindow.webContents.executeJavaScript(`
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
            log(`-> Relatório '${reportTitle}' solicitado.`);
            await new Promise(r => setTimeout(r, 4000));
        }

        log("\n--- Relatórios solicitados. A automação será encerrada em breve. ---");
        await new Promise(r => setTimeout(r, 10000));
        finishTask("Automação HugMe concluída!");
    } catch (error) {
        errorTask(`ERRO na automação HugMe: ${error}`);
    } finally {
        if (activeLoginWindow && !activeLoginWindow.isDestroyed()) {
            activeLoginWindow.close();
            activeLoginWindow = null;
        }
    }
});

// --- 3. [Consumidor.gov]: Download ---
ipcMain.handle('automation:run-gov-download', async (event, args) => {
    log(`>>> Iniciando automação Consumidor.gov...`);
    try {
        if (!activeLoginWindow || activeLoginWindow.isDestroyed()) {
            throw new Error("A janela de login do Consumidor.gov não está mais disponível.");
        }
        const { basePath, startDate: startDateStr, endDate: endDateStr } = args;
        await activeLoginWindow.webContents.loadURL("https://consumidor.gov.br/pages/exportacao-dados/novo");
        log("Aguardando formulário...");
        await activeLoginWindow.webContents.executeJavaScript(`new Promise(r => { const i = setInterval(() => { if(document.querySelector('form#exportacaoDadosForm')) { clearInterval(i); r(); } }, 500); })`);
        log("Formulário encontrado! Iniciando downloads...");
        const downloadsPath = path.join(basePath, "Relatorios_Consumidor_Gov");
        fs.mkdirSync(downloadsPath, { recursive: true });

        activeLoginWindow.webContents.session.on('will-download', (event, item) => {
            const filePath = path.join(downloadsPath, `relatorio_Gov_${new Date().getTime()}.xls`);
            item.setSavePath(filePath);
            item.once('done', (e, state) => {
                if (state === 'completed') log(`Download salvo: ${path.basename(filePath)}`);
                else log(`Download de ${path.basename(filePath)} falhou: ${state}`);
            });
        });

        const finalEndDate = endDateStr ? parseDate(endDateStr) : new Date(new Date() - 86400000);
        let currentDate = startDateStr ? parseDate(startDateStr) : new Date(new Date().setFullYear(finalEndDate.getFullYear() - 5));

        while (currentDate <= finalEndDate) {
            let periodEndDate = new Date(currentDate);
            periodEndDate.setDate(periodEndDate.getDate() + 59);
            if (periodEndDate > finalEndDate) periodEndDate = finalEndDate;
            const sDate = formatDate(currentDate);
            const eDate = formatDate(periodEndDate);
            log(`Processando lote: ${sDate} a ${eDate}`);
            await activeLoginWindow.webContents.executeJavaScript(`
                document.getElementById('dataIniPeriodo').value = '${sDate}';
                document.getElementById('dataFimPeriodo').value = '${eDate}';
                document.querySelector('label[for="colunasExportadas1"]').click();
                document.getElementById('btnExportar').click();
            `);
            await new Promise(r => setTimeout(r, 5000));
            currentDate = new Date(periodEndDate.setDate(periodEndDate.getDate() + 1));
        }
        finishTask("Automação Consumidor.gov concluída!");
    } catch (error) {
        errorTask(`ERRO na automação Consumidor.gov: ${error}`);
    } finally {
        if (activeLoginWindow && !activeLoginWindow.isDestroyed()) {
            activeLoginWindow.close();
            activeLoginWindow = null;
        }
    }
});

// --- 4. [Proconsumidor]: Download ---
ipcMain.handle('automation:run-proconsumidor-download', (event, args) => runAutomation("Proconsumidor", async (page) => {
    const { basePath, startDate: startArg, endDate: endArg } = args;
    const CPF = process.env.CPF;
    const SENHA = process.env.SENHA;
    if (!CPF || !SENHA) throw new Error("Credenciais do Proconsumidor não encontradas no .env");
    
    await page.goto("https://proconsumidor.mj.gov.br/");
    log("Preenchendo credenciais...");
    await page.locator('#login').fill(CPF);
    await page.locator('#senha').fill(SENHA);
    await page.locator('.btn-login button').click();
    log("Login realizado.");

    try {
        log("Verificando se o modal de seleção apareceu...");
        const modalButton = page.locator("//button[normalize-space()='Selecionar']");
        await modalButton.waitFor({ state: 'visible', timeout: 15000 });
        await modalButton.click();
        await modalButton.waitFor({ state: 'hidden', timeout: 10000 });
        log("Modal de seleção fechado.");
    } catch (e) {
        log("Modal de seleção não apareceu, continuando...");
    }

    const EMPRESAS = ["CIASPREV", "Capital Consig", "Hoje Previdência Privada", "CB DIGITAL"];
    for (const empresa of EMPRESAS) {
        log(`\n--- Processando empresa: ${empresa} ---`);
        const empresaFolderPath = path.join(basePath, "Relatorios_PROCONSUMIDOR", empresa);
        fs.mkdirSync(empresaFolderPath, { recursive: true });
        
        await page.locator('#fornecedores').selectOption({ label: empresa });
        log("Aguardando página recarregar com novo contexto...");
        await page.waitForLoadState('networkidle');

        await page.locator('a[href="#relatorios"]').click();
        await page.locator('a[href="#/relatorio/relatorio-gerencial"]').click();
        await page.waitForSelector('#dataInicio');

        const yesterday = endArg ? parseDate(endArg) : new Date(new Date() - 86400000);
        let currentDate = startArg ? parseDate(startArg) : new Date(2020, 0, 1);
        while (currentDate <= yesterday) {
            let endDate = new Date(currentDate);
            endDate.setDate(endDate.getDate() + 59);
            if (endDate > yesterday) endDate = yesterday;
            const startStr = formatDate(currentDate);
            const endStr = formatDate(endDate);
            log(`Gerando relatório para: ${startStr} a ${endStr}`);
            
            await page.locator('#tipoPeriodoPesquisa1').check();
            await page.locator('#dataInicio').fill(startStr);
            await page.locator('input[formcontrolname="dataFim"]').fill(endStr);
            await page.locator('#uf_select').selectOption({ label: "Todas" });
            await page.locator('//label[contains(., "TODAS")]/input').check();

            const [download] = await Promise.all([
                page.waitForEvent('download', { timeout: 60000 }),
                page.locator('//button[contains(., "Exportar XLS")]').click()
            ]);
            
            const fileName = `relatorio_${empresa.replace(/ /g, '_')}_${currentDate.toISOString().slice(0, 10)}.xls`;
            await download.saveAs(path.join(empresaFolderPath, fileName));
            log(`Relatório salvo: ${fileName}`);
            
            if (endDate.getTime() === yesterday.getTime()) break;
            currentDate = new Date(endDate.setDate(endDate.getDate() + 1));
        }
    }
}));


// --- 5 & 6. [Procon SJC] e [Procon Campinas] ---
const createProconSimpleDownloader = (taskName, url, folderName, loginFn, outputName) => {
    return (event, args) => runAutomation(taskName, async (page) => {
        const { basePath, startDate: startArg, endDate: endArg } = args;
        const downloadsPath = path.join(basePath, folderName);
        fs.mkdirSync(downloadsPath, { recursive: true });
        
        await page.goto(url);
        log("Página de login acessada.");
        await loginFn(page);
        log("Login realizado. Definindo período...");
        
        await page.waitForSelector("#dataInicial");
        const startStr = startArg || "01/01/2020";
        const endStr = endArg || formatDate(new Date(new Date() - 86400000));
        
        await page.locator("#dataInicial").fill(startStr);
        await page.locator("#dataFinal").fill(endStr);
        await page.locator("#buscar").click();
        log(`Busca de ${startStr} a ${endStr} realizada. Aguardando download...`);

        try {
            const downloadButton = page.locator("a.buttons-csv");
            await downloadButton.waitFor({ timeout: 20000 });
            const [download] = await Promise.all([page.waitForEvent('download'), downloadButton.click()]);
            const finalPath = path.join(downloadsPath, outputName);
            if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
            await download.saveAs(finalPath);
            log(`Relatório salvo com sucesso em: ${finalPath}`);
        } catch(e) {
            log("Botão de download não apareceu (provavelmente sem dados).");
        }
    });
};

ipcMain.handle('automation:run-procon-sjc-download', createProconSimpleDownloader(
    "Procon-SJC", "http://procon.sjc.sp.gov.br", "Relatorios_PROCON_SJC",
    async (page) => {
        await page.locator("#opcaoLoginEmpresa").click();
        await page.locator("#codigoEmpresa").waitFor();
        await page.locator("#codigoEmpresa").fill(process.env.PROCON_SJC_CODIGO);
        await page.locator("#senhaEmpresa").fill(process.env.PROCON_SJC_SENHA);
        await page.locator("#btnLogin").click();
    },
    "relatorio_completo_SJC.csv"
));

ipcMain.handle('automation:run-procon-campinas-download', createProconSimpleDownloader(
    "Procon-Campinas", "https://proconweb.campinas.sp.gov.br/proconweb/login.procon?metodo=iniciarAtendimentoEmpresa", "Relatorios_PROCON_CAMPINAS",
    async (page) => {
        await page.locator("#codigoEmpresa").fill(process.env.PROCON_CAMPINAS_CODIGO);
        await page.locator("#senhaEmpresa").fill(process.env.PROCON_CAMPINAS_SENHA);
        await page.locator("//form[@name='documentoForm']//button[contains(text(), 'Acessar')]").click();
    },
    "relatorio_completo_Campinas.csv"
));


// --- 7. [BCB-RDR]: Download ---
ipcMain.handle('automation:run-bcb-rdr-download', (event, args) => runAutomation("BCB-RDR", async (page) => {
    const { basePath, startDate: startArg, endDate: endArg } = args;
    const USER = process.env.BCB_RDR_USER;
    const SENHA = process.env.BCB_RDR_SENHA;
    if (!USER || !SENHA) throw new Error("Credenciais do BCB-RDR não encontradas.");
    
    const downloadsPath = path.join(basePath, "Relatorios_BCB_RDR");
    fs.mkdirSync(downloadsPath, { recursive: true });

    await page.goto("https://www3.bcb.gov.br/rdr/consultaDemandaIFDatas.do?method=consultarDemandasPendentes");
    log("Preenchendo credenciais...");
    await page.locator('#userNameInput').fill(USER);
    await page.locator('#passwordInput').fill(SENHA);
    await page.locator('#submitButton').click();
    
    log("Login realizado. Navegando para consulta...");
    await page.locator("#oCMenu_MenuIF").click();
    await page.locator("#oCMenu_ConsultarDemandas").click();
    
    await page.waitForSelector('input[name="dataDe"]');
    let fileSuffix = "historico_completo";
    if (startArg && endArg) {
        log(`Usando período: ${startArg} a ${endArg}`);
        await page.locator('input[name="dataDe"]').fill(startArg);
        await page.locator('input[name="dataAte"]').fill(endArg);
        const startForFile = startArg.split('/').reverse().join('-');
        const endForFile = endArg.split('/').reverse().join('-');
        fileSuffix = `${startForFile}_a_${endForFile}`;
    }
    
    await page.locator('input[value="Submeter"]').click();
    log("Busca submetida. Aguardando download...");
    
    const downloadButton = page.locator("a:has-text('1 demanda por linha')");
    await downloadButton.waitFor({ timeout: 180000 });
    const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 120000 }),
        downloadButton.click()
    ]);
    const finalPath = path.join(downloadsPath, `relatorio_BCB-RDR_${fileSuffix}.xls`);
    await download.saveAs(finalPath);
    log(`Relatório salvo em: ${finalPath}`);
}));


// --- 8 a 16: Consolidações e Pipelines ---
const runDataTask = async (taskName, logic, event) => {
    log(`>>> Iniciando tarefa de dados: ${taskName}...`);
    try {
        await logic(event);
        finishTask(`Tarefa ${taskName} concluída!`);
    } catch (error) {
        errorTask(`ERRO na tarefa ${taskName}: ${error}`);
    }
};

const consolidateSimple = (folder, outputName, sheetName) => (event, args) => runDataTask(`Consolidar ${folder}`, async () => {
    const reportsPath = path.join(args.basePath, `Relatorios_${folder}`);
    if (!fs.existsSync(reportsPath)) { log(`Pasta ${reportsPath} não encontrada, pulando.`); return; }
    
    const files = fs.readdirSync(reportsPath).filter(f => f.toLowerCase().endsWith('.xls') || f.toLowerCase().endsWith('.csv'));
    if (files.length === 0) { log(`Nenhum arquivo encontrado em ${reportsPath}.`); return; }

    log(`Encontrados ${files.length} arquivos para consolidar.`);
    const allData = [];
    for (const file of files) {
        const filePath = path.join(reportsPath, file);
        const workbook = XLSX.readFile(filePath);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(sheet);
        allData.push(...jsonData);
    }
    
    const newWorkbook = XLSX.utils.book_new();
    const newSheet = XLSX.utils.json_to_sheet(allData);
    XLSX.utils.book_append_sheet(newWorkbook, newSheet, sheetName);
    const outputPath = path.join(reportsPath, outputName);
    XLSX.writeFile(newWorkbook, outputPath);
    log(`Consolidação concluída! Arquivo salvo em: ${outputPath}`);
});

ipcMain.handle('data:consolidate-proconsumidor', (event, args) => runDataTask("Proconsumidor", async () => {
    const reportsPath = path.join(args.basePath, "Relatorios_PROCONSUMIDOR");
    const outputPath = path.join(reportsPath, "Relatorio_Consolidado.xlsx");
    if (!fs.existsSync(reportsPath)) { log(`Pasta ${reportsPath} não encontrada, pulando.`); return; }
    const companyFolders = fs.readdirSync(reportsPath).filter(f => fs.statSync(path.join(reportsPath, f)).isDirectory());

    if (companyFolders.length === 0) { log("Nenhuma pasta de empresa encontrada."); return; }

    const newWorkbook = XLSX.utils.book_new();
    const allCompanyData = [];

    for (const company of companyFolders) {
        const companyPath = path.join(reportsPath, company);
        const files = fs.readdirSync(companyPath).filter(f => f.toLowerCase().endsWith('.xls'));
        if (files.length === 0) continue;

        log(`Processando ${files.length} arquivos para ${company}...`);
        const companyData = [];
        for (const file of files) {
            const workbook = XLSX.readFile(path.join(companyPath, file));
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            companyData.push(...XLSX.utils.sheet_to_json(sheet));
        }
        
        const companySheet = XLSX.utils.json_to_sheet(companyData);
        XLSX.utils.book_append_sheet(newWorkbook, companySheet, company.substring(0, 31));
        
        companyData.forEach(row => row['Fonte_Empresa'] = company);
        allCompanyData.push(...companyData);
    }

    if (allCompanyData.length > 0) {
        const unifiedSheet = XLSX.utils.json_to_sheet(allCompanyData);
        XLSX.utils.book_append_sheet(newWorkbook, unifiedSheet, 'Unificado');
        XLSX.writeFile(newWorkbook, outputPath);
        log(`Consolidação concluída! Arquivo salvo em: ${outputPath}`);
    } else {
        log("Nenhum dado encontrado para consolidar.");
    }
}));

ipcMain.handle('data:consolidate-hugme', consolidateSimple('HUGME', 'Relatorio_Consolidado_HugMe.xlsx', 'Consolidado_HugMe'));
ipcMain.handle('data:consolidate-procon-sp', consolidateSimple('PROCON_SP', 'Relatorio_Consolidado_SP.xlsx', 'Consolidado'));
ipcMain.handle('data:consolidate-consumidor-gov', consolidateSimple('Consumidor_Gov', 'Relatorio_Consolidado_Gov.xlsx', 'Consolidado_Gov'));
ipcMain.handle('data:consolidate-procon-sjc', consolidateSimple('PROCON_SJC', 'Relatorio_Consolidado_SJC.xlsx', 'Consolidado_SJC'));
ipcMain.handle('data:consolidate-procon-campinas', consolidateSimple('PROCON_CAMPINAS', 'Relatorio_Consolidado_Campinas.xlsx', 'Consolidado_Campinas'));
ipcMain.handle('data:consolidate-bcb-rdr', consolidateSimple('BCB_RDR', 'Relatorio_Consolidado_BCB_RDR.xlsx', 'Consolidado_BCB'));


// --- 15. [Criar Base Bruta] ---
ipcMain.handle('pipeline:create-raw-base', (event, args) => runDataTask("Criar Base Bruta", async () => {
    const { basePath } = args;
    const FONTES_DE_DADOS = {
        "Gov": "Relatorios_Consumidor_Gov/Relatorio_Consolidado_Gov.xlsx",
        "Proconsumidor": "Relatorios_PROCONSUMIDOR/Relatorio_Consolidado.xlsx",
        "SP": "Relatorios_PROCON_SP/Relatorio_Consolidado_SP.xlsx",
        "SJC": "Relatorios_PROCON_SJC/Relatorio_Consolidado_SJC.xlsx",
        "Campinas": "Relatorios_PROCON_CAMPINAS/Relatorio_Consolidado_Campinas.xlsx",
        "Uberlandia": "Relatorios_PROCON_UBERLANDIA/Relatorio_API_Uberlandia.xlsx",
        "BCB_RDR": "Relatorios_BCB_RDR/Relatorio_Consolidado_BCB_RDR.xlsx",
        "HugMe": "Relatorios_HUGME/Relatorio_Consolidado_HugMe.xlsx"
    };

    const POTENTIAL_DATE_COLUMNS = [
        'Data Abertura', 'Data Resposta', 'Data Finalização', 'Data de Abertura', 'Data da Finalização',
        'DataDaSolicitacao', 'DataDaBaixa', 'DataDeRepostaDoFornecedor', 'Data Reclamação', 
        'Data de Resposta', 'Disponibilização', 'Data do Encerramento'
    ];

    const standardizeDates = (dateValue) => {
        if (!dateValue) return dateValue;
        let date = new Date(dateValue);
        if (isNaN(date.getTime())) {
            if (typeof dateValue === 'string' && dateValue.includes('/')) {
                date = parseDate(dateValue);
            } else {
                return dateValue;
            }
        }
        if (isNaN(date.getTime())) return dateValue;
        return formatDate(date);
    };

    const outputWorkbook = XLSX.utils.book_new();
    let fontesCopiadas = 0;

    for (const [sheetName, filePath] of Object.entries(FONTES_DE_DADOS)) {
        const fullPath = path.join(basePath, filePath);
        if (fs.existsSync(fullPath)) {
            try {
                log(`Processando fonte: ${sheetName}`);
                const workbook = XLSX.readFile(fullPath);
                const sourceSheetName = workbook.SheetNames[0];
                const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sourceSheetName]);

                if (jsonData.length > 0) {
                    jsonData.forEach(row => {
                        POTENTIAL_DATE_COLUMNS.forEach(colName => {
                            if (row[colName]) {
                                row[colName] = standardizeDates(row[colName]);
                            }
                        });
                    });
                    const newSheet = XLSX.utils.json_to_sheet(jsonData);
                    XLSX.utils.book_append_sheet(outputWorkbook, newSheet, sheetName);
                    fontesCopiadas++;
                } else {
                    log(` -> Aviso: Fonte ${sheetName} está vazia.`);
                }
            } catch (e) {
                errorTask(`Falha ao processar ${filePath}: ${e}`);
            }
        } else {
            log(` -> Aviso: Arquivo não encontrado, pulando: ${filePath}`);
        }
    }

    if (fontesCopiadas > 0) {
        const outputPath = path.join(basePath, "Base_Mae_Bruta.xlsx");
        XLSX.writeFile(outputWorkbook, outputPath);
        log(`Base Mãe Bruta criada com ${fontesCopiadas} fontes de dados em: ${outputPath}`);
    } else {
        log("Nenhuma fonte de dados processada. Base Mãe Bruta não foi gerada.");
    }
}));


// --- 16. [Gerar Base Mãe] ---
ipcMain.handle('pipeline:generate-master-base', (event, args) => runDataTask("Gerar Base Mãe Final", async () => {
    const { basePath } = args;
    const inputPath = path.join(basePath, "Base_Mae_Bruta.xlsx");
    if (!fs.existsSync(inputPath)) throw new Error("Arquivo Base_Mae_Bruta.xlsx não encontrado. Execute a Etapa 1 primeiro.");

    const workbook = XLSX.readFile(inputPath);
    const allData = [];

    const cleanDoc = (doc) => doc ? String(doc).replace(/\D/g, '').padStart(11, '0') : '';

    const renameMaps = {
        Gov: {'Protocolo': 'Protocolo_Origem', 'Canal de Origem': 'Canal_Origem', 'Consumidor': 'Consumidor_Nome', 'CPF': 'Consumidor_CPF', 'UF': 'Consumidor_UF', 'Cidade': 'Consumidor_Cidade', 'Sexo': 'Consumidor_Genero', 'Faixa Etária': 'Consumidor_Faixa_Etaria', 'Data Abertura': 'Data_Abertura', 'Data Resposta': 'Data_Resposta_Fornecedor', 'Data Finalização': 'Data_Finalizacao', 'Nome Fantasia': 'Fornecedor_Empresa', 'Problema': 'Descricao_Reclamacao', 'Situação': 'Status_Atual', 'Avaliação Reclamação': 'Resultado_Final', 'Nota do Consumidor': 'Nota_Consumidor'},
        Proconsumidor: {'Número de Atendimento': 'Protocolo_Origem', 'Documento Consumidor - CPF/CNPJ': 'Consumidor_CPF', 'Nome Consumidor': 'Consumidor_Nome', 'Gênero do Consumidor': 'Consumidor_Genero', 'Faixa Etária do Consumidor': 'Consumidor_Faixa_Etaria', 'CNPJ ou CPF Fornecedor': 'Fornecedor_CNPJ', 'Razão Social': 'Fornecedor_RazaoSocial', 'Nome Fantasia': 'Fornecedor_Empresa', 'Posto de Atendimento': 'Canal_Origem', 'Data de Abertura': 'Data_Abertura', 'Data da Finalização': 'Data_Finalizacao', 'Situação': 'Status_Atual', 'Classificação da Decisão': 'Resultado_Final'},
        SP: {'Protocolo': 'Protocolo_Origem', 'DataDaSolicitacao': 'Data_Abertura', 'DataDaBaixa': 'Data_Finalizacao', 'PostoDeAtendimento': 'Canal_Origem', 'Consumidor_Nome': 'Consumidor_Nome', 'Consumidor_Cpf': 'Consumidor_CPF', 'Consumidor_Endereco_Cidade': 'Consumidor_Cidade', 'Consumidor_Endereco_Estado': 'Consumidor_UF', 'Consumidor_Email': 'Consumidor_Email', 'Consumidor_Celular': 'Consumidor_Celular', 'Fornecedor_NomeFantasia': 'Fornecedor_Empresa', 'Reclamacao_Detalhes': 'Descricao_Reclamacao', 'Situacao': 'Status_Atual', 'ClassificacaoDaBaixa': 'Resultado_Final', 'DataDeRepostaDoFornecedor': 'Data_Resposta_Fornecedor'},
        HugMe: {'Empresa': 'Fornecedor_Empresa', 'Id HugMe': 'Protocolo_Origem', 'Data Reclamação': 'Data_Abertura', 'Status RA': 'Status_Atual', 'Texto da Reclamação': 'Descricao_Reclamacao', 'CPF/CNPJ': 'Consumidor_CPF', 'Email': 'Consumidor_Email', 'Telefones': 'Consumidor_Celular', 'Cidade': 'Consumidor_Cidade', 'Estado': 'Consumidor_UF', 'Data de Resposta': 'Data_Resposta_Fornecedor', 'Seu problema foi resolvido?': 'Resultado_Final'},
        SJC: {'Nº Reclamacão': 'Protocolo_Origem', 'Data de Reclamação': 'Data_Abertura', 'Última movimentação': 'Status_Atual'},
        Campinas: {'Nº Reclamacão': 'Protocolo_Origem', 'Data de Reclamação': 'Data_Abertura', 'Última movimentação': 'Status_Atual'},
        Uberlandia: {'Número de Atendimento': 'Protocolo_Origem', 'Data de Abertura': 'Data_Abertura', 'Situação': 'Status_Atual', 'Nome Consumidor': 'Consumidor_Nome', 'Documento Consumidor - CPF/CNPJ': 'Consumidor_CPF', 'Nome Fantasia': 'Fornecedor_Empresa', 'Cidade Credenciada': 'Consumidor_Cidade', 'UF Credenciada': 'Consumidor_UF'},
        BCB_RDR: {'Número': 'Protocolo_Origem', 'Disponibilização': 'Data_Abertura', 'Data do Encerramento': 'Data_Finalizacao', 'Situação': 'Status_Atual', 'Canal de Atendimento': 'Canal_Origem', 'Instituição': 'Fornecedor_Empresa', 'CPF/CNPJ': 'Consumidor_CPF'}
    };

    for (const sheetName of workbook.SheetNames) {
        log(`Processando e padronizando aba: ${sheetName}`);
        const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
        const renameMap = renameMaps[sheetName] || {};
        
        const processedData = jsonData.map(row => {
            const newRow = { Fonte_Dados: sheetName };
            for (const [oldKey, value] of Object.entries(row)) {
                const newKey = renameMap[oldKey] || oldKey;
                newRow[newKey] = value;
            }
            if (newRow.Consumidor_CPF) newRow.Consumidor_CPF = cleanDoc(newRow.Consumidor_CPF);
            return newRow;
        });
        allData.push(...processedData);
    }

    log("Unificando e finalizando a Base Mãe...");
    const FINAL_COLUMNS_ORDER = [ 'ID_Reclamacao_Unico', 'Protocolo_Origem', 'Fonte_Dados', 'Data_Abertura', 'Data_Finalizacao', 'Canal_Origem', 'Consumidor_Nome', 'Consumidor_CPF', 'Consumidor_Cidade', 'Consumidor_UF', 'Consumidor_Email', 'Consumidor_Celular', 'Consumidor_Faixa_Etaria', 'Consumidor_Genero', 'Fornecedor_Empresa', 'Descricao_Reclamacao', 'Status_Atual', 'Data_Resposta_Fornecedor' ];
    
    const finalData = allData.map(row => {
        const finalRow = {};
        FINAL_COLUMNS_ORDER.forEach(col => finalRow[col] = row[col] || '');
        finalRow.ID_Reclamacao_Unico = `${row.Fonte_Dados}_${row.Protocolo_Origem || ''}`.trim();
        return finalRow;
    });

    const finalSheet = XLSX.utils.json_to_sheet(finalData, { header: FINAL_COLUMNS_ORDER });
    const finalWorkbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(finalWorkbook, finalSheet, 'Base_Mae_Final');
    const outputPath = path.join(basePath, "Base_Mae_Final.xlsx");
    XLSX.writeFile(finalWorkbook, outputPath);
    log(`Base Mãe Final gerada com ${finalData.length} registros em: ${outputPath}`);
}));


// --- 17. [API Procon Uberlândia] ---
ipcMain.handle('api:fetch-uberlandia', (event, args) => runDataTask("API Procon Uberlândia", async () => {
    const TOKEN = process.env.PROCON_UBERLANDIA_TOKEN;
    if (!TOKEN) throw new Error("Token do Procon Uberlândia não encontrado no .env");

    log("Buscando dados da API...");
    const response = await fetch("https://api-procon.uberlandia.mg.gov.br/process", {
        headers: { "Authorization": `Bearer ${TOKEN}` }
    });
    if (!response.ok) throw new Error(`Falha na API: ${response.statusText}`);
    const apiData = await response.json();
    log(`Recebidos ${apiData.length} registros.`);

    const processedData = apiData.map(proc => {
        const reclamante = proc.process_involved.find(p => p.type_involved === "Reclamante Pessoa Física")?.involved || {};
        const fornecedor = proc.process_involved.find(p => p.type_involved === "Fornecedor Pessoa Jurídica")?.involved || {};
        return {
            'Número de Atendimento': proc.process_number,
            'Tipo de Atendimento': proc.type_process,
            'Situação': proc.status,
            'Data de Abertura': proc.createdAt,
            'Resultado da Última Tratativa': proc.last_interaction,
            'Nome Consumidor': reclamante.name,
            'Documento Consumidor - CPF/CNPJ': reclamante.document,
            'Razão Social': fornecedor.name,
            'CNPJ ou CPF Fornecedor': fornecedor.document,
            'Nome Fantasia': fornecedor.name,
            'Nome Credenciada': "PROCON Uberlândia",
            'Cidade Credenciada': "Uberlândia",
            'UF Credenciada': "MG",
        };
    });

    const outputPath = path.join(args.basePath, "Relatorios_PROCON_UBERLANDIA", "Relatorio_API_Uberlandia.xlsx");
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(processedData);
    XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
    XLSX.writeFile(workbook, outputPath);
    log(`Dados da API salvos em: ${outputPath}`);
}));


// --- 18. [Buscar CPF] ---
ipcMain.handle('search:find-cpf', async (event, args) => {
    log("Iniciando busca por CPF...");
    const { basePath, cpf } = args;
    const finalFilePath = path.join(basePath, "Base_Mae_Final.xlsx");

    if (!fs.existsSync(finalFilePath)) {
        throw new Error("Arquivo Base_Mae_Final.xlsx não encontrado. Execute o pipeline primeiro.");
    }
    
    const cleanCPF = String(cpf).replace(/\D/g, '');
    const workbook = XLSX.readFile(finalFilePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(sheet);

    const results = jsonData.filter(row => {
        const rowCPF = String(row['Consumidor_CPF'] || '').replace(/\D/g, '');
        return rowCPF === cleanCPF;
    }).map(row => ({
        nome: row['Consumidor_Nome'],
        protocolo: row['Protocolo_Origem'],
        fonte: row['Fonte_Dados'],
        dataAbertura: row['Data_Abertura'],
        dataFinalizacao: row['Data_Finalizacao'],
        status: row['Status_Atual']
    }));

    log(`Busca por CPF ${cleanCPF} concluída. Encontrados: ${results.length} registros.`);
    return {
        count: results.length,
        cpf: cleanCPF,
        results: results
    };
});


// --- Lógica de Inicialização e Login ---
ipcMain.handle('auth:start-gov-login', () => createLoginFlow('https://consumidor.gov.br/pages/administrativo/login', 'persist:gov_login_session', 'Login Gov.br'));
ipcMain.handle('auth:start-proconsp-login', () => createLoginFlow('https://fornecedor2.procon.sp.gov.br/#/login', 'persist:proconsp_login_session', 'Login Procon-SP'));
ipcMain.handle('auth:start-hugme-login', () => createLoginFlow('https://app.hugme.com.br/', 'persist:hugme_login_session', 'Login HugMe'));

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

// --- Lógica de Login Assistido ---
const createLoginFlow = (loginURL, partition, title) => {
    return new Promise((resolve, reject) => {
        if (activeLoginWindow && !activeLoginWindow.isDestroyed()) {
            activeLoginWindow.focus();
            return reject(new Error("Uma janela de login já está ativa."));
        }

        const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;
        const windowWidth = 800;
        const mainWidth = mainWindow.getBounds().width;

        let mainX = 0;
        let loginX = mainWidth;

        if (loginX + windowWidth > screenWidth) {
            loginX = screenWidth - windowWidth;
            mainX = loginX - mainWidth;
        }

        mainWindow.setPosition(mainX, mainWindow.getPosition()[1]);

        activeLoginWindow = new BrowserWindow({
            parent: mainWindow,
            modal: false,
            width: windowWidth,
            height: 700,
            title: title,
            x: loginX,
            y: mainWindow.getPosition()[1],
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
                log(`Login para '${title}' confirmado pelo usuário.`);
                resolve(true);
            } else {
                reject(new Error("Janela de login não está mais disponível."));
            }
        });

        ipcMain.once('login-canceled', () => {
            if (activeLoginWindow && !activeLoginWindow.isDestroyed()) {
                activeLoginWindow.close();
            }
            activeLoginWindow = null;
            // Aqui está a correção: chamamos reject, que será capturado pelo try/catch no frontend.
            reject(new Error(`Login para '${title}' cancelado pelo usuário.`));
        });
    });
};