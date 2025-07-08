const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { getChromiumPath, parseDate, formatDate } = require('./utils');

const runAutomation = async (taskName, logic, { logging }) => {
    logging.log(`>>> Iniciando automação ${taskName}...`);
    let browser;
    try {
        const chromiumPath = getChromiumPath();
        logging.log(`Usando Chromium em: ${chromiumPath}`);
        browser = await chromium.launch({ headless: false, executablePath: chromiumPath });
        const page = await browser.newPage();
        await logic(page);
        logging.finishTask(`Automação ${taskName} concluída!`);
    } catch (error) {
        logging.errorTask(`ERRO na automação ${taskName}: ${error}`);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
};

const createProconSimpleDownloader = (taskName, url, folderName, loginFn, outputName, { logging }) => {
    return (event, args) => runAutomation(taskName, async (page) => {
        const { basePath, startDate: startArg, endDate: endArg } = args;
        const downloadsPath = path.join(basePath, folderName);
        fs.mkdirSync(downloadsPath, { recursive: true });
        
        await page.goto(url);
        logging.log("Página de login acessada.");
        await loginFn(page);
        logging.log("Login realizado. Definindo período...");
        
        await page.waitForSelector("#dataInicial");
        const startStr = startArg || "01/01/2020";
        const endStr = endArg || formatDate(new Date(new Date() - 86400000));
        
        await page.locator("#dataInicial").fill(startStr);
        await page.locator("#dataFinal").fill(endStr);
        await page.locator("#buscar").click();
        logging.log(`Busca de ${startStr} a ${endStr} realizada. Aguardando download...`);

        try {
            const downloadButton = page.locator("a.buttons-csv");
            await downloadButton.waitFor({ timeout: 20000 });
            const [download] = await Promise.all([page.waitForEvent('download'), downloadButton.click()]);
            const finalPath = path.join(downloadsPath, outputName);
            if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
            await download.saveAs(finalPath);
            logging.log(`Relatório salvo com sucesso em: ${finalPath}`);
        } catch(e) {
            logging.log("Botão de download não apareceu (provavelmente sem dados).");
        }
    }, { logging });
};


function registerAutomationHandlers(ipcMain, logging) {
    ipcMain.handle('automation:run-proconsumidor-download', (event, args) => runAutomation("Proconsumidor", async (page) => {
        const { basePath, startDate: startArg, endDate: endArg } = args;
        const CPF = process.env.CPF;
        const SENHA = process.env.SENHA;
        if (!CPF || !SENHA) throw new Error("Credenciais do Proconsumidor não encontradas no .env");
        
        await page.goto("https://proconsumidor.mj.gov.br/");
        logging.log("Preenchendo credenciais...");
        await page.locator('#login').fill(CPF);
        await page.locator('#senha').fill(SENHA);
        await page.locator('.btn-login button').click();
        logging.log("Login realizado.");

        try {
            logging.log("Verificando se o modal de seleção apareceu...");
            const modalButton = page.locator("//button[normalize-space()='Selecionar']");
            await modalButton.waitFor({ state: 'visible', timeout: 15000 });
            await modalButton.click();
            await modalButton.waitFor({ state: 'hidden', timeout: 10000 });
            logging.log("Modal de seleção fechado.");
        } catch (e) {
            logging.log("Modal de seleção não apareceu, continuando...");
        }

        const EMPRESAS = ["CIASPREV", "Capital Consig", "Hoje Previdência Privada", "CB DIGITAL"];
        for (const empresa of EMPRESAS) {
            logging.log(`\n--- Processando empresa: ${empresa} ---`);
            const empresaFolderPath = path.join(basePath, "Relatorios_PROCONSUMIDOR", empresa);
            fs.mkdirSync(empresaFolderPath, { recursive: true });
            
            await page.locator('#fornecedores').selectOption({ label: empresa });
            logging.log("Aguardando página recarregar com novo contexto...");
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
                logging.log(`Gerando relatório para: ${startStr} a ${endStr}`);
                
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
                logging.log(`Relatório salvo: ${fileName}`);
                
                if (endDate.getTime() === yesterday.getTime()) break;
                currentDate = new Date(endDate.setDate(endDate.getDate() + 1));
            }
        }
    }, { logging }));

    ipcMain.handle('automation:run-procon-sjc-download', createProconSimpleDownloader(
        "Procon-SJC", "http://procon.sjc.sp.gov.br", "Relatorios_PROCON_SJC",
        async (page) => {
            await page.locator("#opcaoLoginEmpresa").click();
            await page.locator("#codigoEmpresa").waitFor();
            await page.locator("#codigoEmpresa").fill(process.env.PROCON_SJC_CODIGO);
            await page.locator("#senhaEmpresa").fill(process.env.PROCON_SJC_SENHA);
            await page.locator("#btnLogin").click();
        },
        "relatorio_completo_SJC.csv",
        { logging }
    ));

    ipcMain.handle('automation:run-procon-campinas-download', createProconSimpleDownloader(
        "Procon-Campinas", "https://proconweb.campinas.sp.gov.br/proconweb/login.procon?metodo=iniciarAtendimentoEmpresa", "Relatorios_PROCON_CAMPINAS",
        async (page) => {
            await page.locator("#codigoEmpresa").fill(process.env.PROCON_CAMPINAS_CODIGO);
            await page.locator("#senhaEmpresa").fill(process.env.PROCON_CAMPINAS_SENHA);
            await page.locator("//form[@name='documentoForm']//button[contains(text(), 'Acessar')]").click();
        },
        "relatorio_completo_Campinas.csv",
        { logging }
    ));

    ipcMain.handle('automation:run-bcb-rdr-download', (event, args) => runAutomation("BCB-RDR", async (page) => {
        const { basePath, startDate: startArg, endDate: endArg } = args;
        const USER = process.env.BCB_RDR_USER;
        const SENHA = process.env.BCB_RDR_SENHA;
        if (!USER || !SENHA) throw new Error("Credenciais do BCB-RDR não encontradas.");
        
        const downloadsPath = path.join(basePath, "Relatorios_BCB_RDR");
        fs.mkdirSync(downloadsPath, { recursive: true });

        await page.goto("https://www3.bcb.gov.br/rdr/consultaDemandaIFDatas.do?method=consultarDemandasPendentes");
        logging.log("Preenchendo credenciais...");
        await page.locator('#userNameInput').fill(USER);
        await page.locator('#passwordInput').fill(SENHA);
        await page.locator('#submitButton').click();
        
        logging.log("Login realizado. Navegando para consulta...");
        await page.locator("#oCMenu_MenuIF").click();
        await page.locator("#oCMenu_ConsultarDemandas").click();
        
        await page.waitForSelector('input[name="dataDe"]');
        let fileSuffix = "historico_completo";
        if (startArg && endArg) {
            logging.log(`Usando período: ${startArg} a ${endArg}`);
            await page.locator('input[name="dataDe"]').fill(startArg);
            await page.locator('input[name="dataAte"]').fill(endArg);
            const startForFile = startArg.split('/').reverse().join('-');
            const endForFile = endArg.split('/').reverse().join('-');
            fileSuffix = `${startForFile}_a_${endForFile}`;
        }
        
        await page.locator('input[value="Submeter"]').click();
        logging.log("Busca submetida. Aguardando download...");
        
        const downloadButton = page.locator("a:has-text('1 demanda por linha')");
        await downloadButton.waitFor({ timeout: 180000 });
        const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 120000 }),
            downloadButton.click()
        ]);
        const finalPath = path.join(downloadsPath, `relatorio_BCB-RDR_${fileSuffix}.xls`);
        await download.saveAs(finalPath);
        logging.log(`Relatório salvo em: ${finalPath}`);
    }, { logging }));
}

module.exports = { registerAutomationHandlers };