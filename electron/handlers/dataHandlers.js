const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const { runTask, parseDate, formatDate } = require('./utils');

const preProcessExcelFile = (filePath, { numberColumns = [] }, logging, sheetOptions = {}) => {
    if (!filePath.toLowerCase().endsWith('.xlsx') && !filePath.toLowerCase().endsWith('.xls')) {
        return;
    }

    if (!fs.existsSync(filePath)) {
        logging.log(`Arquivo para pré-processamento não encontrado: ${path.basename(filePath)}`);
        return;
    }

    logging.log(`Pré-processando arquivo: ${path.basename(filePath)}`);
    try {
        const workbook = XLSX.readFile(filePath, { cellNF: true });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        if (!sheet || !sheet['!ref']) return;

        const range = XLSX.utils.decode_range(sheet['!ref']);
        const headerRow = sheetOptions.range ? sheetOptions.range : 0;
        
        const headerMap = {};
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const cell = sheet[XLSX.utils.encode_cell({ r: headerRow, c: C })];
            if (cell && cell.v) {
                headerMap[cell.v] = C;
            }
        }

        for (const colName of numberColumns) {
            const colIndex = headerMap[colName];
            if (colIndex !== undefined) {
                for (let R = range.s.r + headerRow + 1; R <= range.e.r; ++R) {
                    const cellAddress = XLSX.utils.encode_cell({ r: R, c: colIndex });
                    const cell = sheet[cellAddress];
                    if (cell && cell.t === 'n') {
                        cell.z = '0';
                    }
                }
            }
        }

        XLSX.writeFile(workbook, filePath, { bookType: 'xlsx' });
    } catch(error) {
        logging.errorTask(`Falha no pré-processamento de ${path.basename(filePath)}: ${error.message}`);
    }
};

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

function getColumnLetter(colIndex) {
    let letter = '';
    let tempColIndex = colIndex;
    while (tempColIndex >= 0) {
        letter = String.fromCharCode(65 + (tempColIndex % 26)) + letter;
        tempColIndex = Math.floor(tempColIndex / 26) - 1;
    }
    return letter;
}

const fetchTrelloAPI = async (endpoint, method = 'GET', body = null, logging) => {
    const key = process.env.TRELLO_API_KEY;
    const token = process.env.TRELLO_API_TOKEN;
    if (!key || !token) throw new Error("Credenciais do Trello (KEY ou TOKEN) não definidas no .env");

    const baseUrl = `https://api.trello.com/1/${endpoint}`;
    const urlWithAuth = new URL(baseUrl);
    urlWithAuth.searchParams.append('key', key);
    urlWithAuth.searchParams.append('token', token);

    if (body) {
        for (const [k, v] of Object.entries(body)) {
            if (Array.isArray(v)) {
                urlWithAuth.searchParams.append(k, v.join(','));
            } else {
                urlWithAuth.searchParams.append(k, v);
            }
        }
    }

    const fullUrl = urlWithAuth.toString();
    
    const options = { method, headers: { 'Accept': 'application/json' } };
    const response = await fetch(fullUrl, options);

    if (!response.ok) {
        const errorText = await response.text();
        logging.errorTask(`Trello API Error: ${response.status} - ${errorText}`);
        throw new Error(`Trello API respondeu com status ${response.status}`);
    }
    const responseText = await response.text();
    return responseText ? JSON.parse(responseText) : { success: true };
};

function registerDataHandlers(ipcMain, logging, { getGoogleAuthClient, google }) {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const organizationId = "68484f358ac9bdde06499a29";

    const getSheetsService = () => {
        const auth = getGoogleAuthClient();
        if (!auth) throw new Error("Cliente Google não autenticado.");
        if (!spreadsheetId) throw new Error("GOOGLE_SHEET_ID não definido no arquivo .env.");
        return google.sheets({ version: 'v4', auth });
    };

    ipcMain.handle('trello:get-boards', (event) => runTask('Buscar Quadros Trello', async (args, currentLogging) => {
        return await fetchTrelloAPI(`organizations/${organizationId}/boards`, 'GET', { fields: 'id,name' }, currentLogging);
    }, logging, event.sender));

    ipcMain.handle('data:get-managers', (event) => runTask('Buscar Gestores', async (args, currentLogging) => {
        const sheets = getSheetsService();
        const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Gestores!A:D' });
        return arraysToObjects(response.data.values);
    }, logging, event.sender));
    
    ipcMain.handle('data:get-all-workspace-data', (event) => runTask('Buscar Dados do Workspace', async (args, currentLogging) => {
        const sheets = getSheetsService();
        const [
            analystsResponse, 
            managersResponse,
            accessRulesResponse
        ] = await Promise.all([
            sheets.spreadsheets.values.get({ spreadsheetId, range: 'Analistas!A:D' }),
            sheets.spreadsheets.values.get({ spreadsheetId, range: 'Gestores!A:D' }),
            sheets.spreadsheets.values.get({ spreadsheetId, range: 'Acessos_Quadros!A:B' })
        ]);
        
        const boards = await fetchTrelloAPI(`organizations/${organizationId}/boards`, 'GET', { fields: 'id,name' }, currentLogging);

        return {
            analysts: arraysToObjects(analystsResponse.data.values),
            managers: arraysToObjects(managersResponse.data.values),
            accessRules: arraysToObjects(accessRulesResponse.data.values),
            boards: boards
        };
    }, logging, event.sender));

    ipcMain.handle('data:update-access', (event, { managerId, boardId, hasAccess }) => runTask('Atualizar Acesso', async (taskArgs, currentLogging) => {
        const sheets = getSheetsService();
        const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Acessos_Quadros!A:B' });
        const accessRules = arraysToObjects(response.data.values);
        const sheetInfo = await sheets.spreadsheets.get({spreadsheetId});
        const sheetId = sheetInfo.data.sheets.find(s => s.properties.title === 'Acessos_Quadros').properties.sheetId;
        const rowIndex = accessRules.findIndex(rule => rule.ID_Gestor_Trello === managerId && rule.ID_Quadro_Trello === boardId);
        
        if (hasAccess) {
            await fetchTrelloAPI(`boards/${boardId}/members/${managerId}`, 'PUT', { type: 'normal' }, currentLogging);
            if (rowIndex === -1) {
                await sheets.spreadsheets.values.append({
                    spreadsheetId, range: 'Acessos_Quadros!A1', valueInputOption: 'USER_ENTERED',
                    requestBody: { values: [[managerId, boardId]] },
                });
            }
        } else {
            await fetchTrelloAPI(`boards/${boardId}/members/${managerId}`, 'DELETE', null, currentLogging);
            if (rowIndex !== -1) {
                await sheets.spreadsheets.batchUpdate({
                    spreadsheetId, requestBody: { requests: [{ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: rowIndex + 1, endIndex: rowIndex + 2 } } }] },
                });
            }
        }
        return { success: true };
    }, logging, { managerId, boardId, hasAccess }));
    
    ipcMain.handle('data:add-analyst', (event, { name, cpf, boardId }) => runTask('Adicionar Analista', async (taskArgs, currentLogging) => {
        if (!taskArgs.boardId) throw new Error("O quadro Trello de destino não foi selecionado.");
        const sheets = getSheetsService();
        const existingAnalysts = arraysToObjects((await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Analistas!A:D' })).data.values);
        if (existingAnalysts.some(a => a.Nome_Analista === taskArgs.name && a.CPF_Analista === taskArgs.cpf && a.ID_Quadro_Trello === taskArgs.boardId)) {
            throw new Error("Este analista já está cadastrado para este quadro.");
        }
        const allLabels = await fetchTrelloAPI(`boards/${taskArgs.boardId}/labels`, 'GET', null, currentLogging);
        let label = allLabels.find(l => l.name.toLowerCase() === taskArgs.name.toLowerCase());
        if (!label) {
            label = await fetchTrelloAPI('labels', 'POST', { name: taskArgs.name, color: 'blue', idBoard: taskArgs.boardId }, currentLogging);
        }
        await sheets.spreadsheets.values.append({
            spreadsheetId, range: 'Analistas!A1', valueInputOption: 'USER_ENTERED',
            requestBody: { values: [[taskArgs.name, taskArgs.cpf, label.id, taskArgs.boardId]] },
        });
        return { success: true };
    }, logging, { name, cpf, boardId }));

    ipcMain.handle('data:delete-analyst', (event, { name, cpf, boardId }) => runTask('Remover Analista', async (taskArgs, currentLogging) => {
        const sheets = getSheetsService();
        const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Analistas!A:D' });
        const rowIndex = (response.data.values || []).findIndex(row => row[0] === taskArgs.name && row[1] === taskArgs.cpf && row[3] === taskArgs.boardId);
        if (rowIndex === -1) throw new Error(`Analista não encontrado para este quadro.`);
        const sheetInfo = await sheets.spreadsheets.get({ spreadsheetId });
        const sheetId = sheetInfo.data.sheets.find(s => s.properties.title === 'Analistas').properties.sheetId;
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId, requestBody: { requests: [{ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: rowIndex + 1, endIndex: rowIndex + 2 } } }] },
        });
        return { success: true };
    }, logging, { name, cpf, boardId }));
    
    ipcMain.handle('data:getAssignableData', (event) => runTask('Buscar Dados para Atribuição', async (taskArgs, currentLogging) => {
        const sheets = getSheetsService();
        const [casesResponse, analystsResponse, managersResponse] = await Promise.all([
            sheets.spreadsheets.values.get({ spreadsheetId, range: 'Base_Mae_Final!A:W' }),
            sheets.spreadsheets.values.get({ spreadsheetId, range: 'Analistas!A:D' }),
            sheets.spreadsheets.values.get({ spreadsheetId, range: 'Gestores!A:D' })
        ]);
        const allCases = arraysToObjects(casesResponse.data.values);
        const analysts = arraysToObjects(analystsResponse.data.values);
        const managers = arraysToObjects(managersResponse.data.values);
        const assignableCases = allCases.filter(c => c.STATUS && c.STATUS.toLowerCase() === 'novo');
        return { cases: assignableCases, analysts, managers };
    }, logging, event.sender));

    ipcMain.handle('data:submitAssignments', (event, { assignments, boardId }) => runTask('Submeter Atribuições', async (taskArgs, currentLogging) => {
        const allListsOnBoard = await fetchTrelloAPI(`boards/${taskArgs.boardId}/lists`, 'GET', null, currentLogging);
        const targetList = allListsOnBoard.find(l => l.name.toLowerCase() === 'entrantes');
        if (!targetList) throw new Error(`Não foi encontrada uma lista chamada "Entrantes" no quadro selecionado.`);
        
        const allLabelsOnBoard = await fetchTrelloAPI(`boards/${taskArgs.boardId}/labels`, 'GET', null, currentLogging);
        
        const trelloListId = targetList.id;
        const sheets = getSheetsService();
        const [casesResponse, analystsResponse] = await Promise.all([
            sheets.spreadsheets.values.get({ spreadsheetId, range: 'Base_Mae_Final!A:W' }),
            sheets.spreadsheets.values.get({ spreadsheetId, range: 'Analistas!A:D' })
        ]);
        
        const allCases = arraysToObjects(casesResponse.data.values);
        const allAnalysts = arraysToObjects(analystsResponse.data.values);
        const caseMap = new Map(allCases.map((row, index) => [row.ID_Reclamacao_Unico, { ...row, rowIndex: index + 2 }]));
        const analystLabelMap = new Map(allAnalysts.map(a => [`${a.Nome_Analista}-${a.ID_Quadro_Trello}`, a.ID_Etiqueta_Trello]));
        
        let createdCardsCount = 0;
        const updatesForSheet = [];

        for (const assignment of taskArgs.assignments) {
            const { caseId, analystName, managerId } = assignment;
            if (!managerId) { currentLogging.errorTask(`Erro de lógica: Gestor não selecionado para o caso ${caseId}. Pulando.`); continue; }
            const caseData = caseMap.get(caseId);
            if (!caseData) { currentLogging.log(`AVISO: Não foi possível encontrar dados para o ID: ${caseId}`); continue; }

            const cardTitle = `${analystName || 'N/A'} | ${caseData.Consumidor_Nome || 'N/A'} - ${caseData.Consumidor_CPF || 'N/A'} | [${caseData.Protocolo_Origem || 'N/A'}]`;
            
            let cardDesc = `**Solicitação:**\nCÓPIA DE CONTRATO\n\n`;
            cardDesc += `**Contrato(s):** N/A\n`;
            cardDesc += `**Telefone:** ${caseData.Consumidor_Celular || 'N/A'}\n`;
            cardDesc += `**Empresa:** ${caseData.Fornecedor_Empresa || 'N/A'}\n`;
            cardDesc += `**Link Original:** N/A`;

            const cardPayload = {
                name: cardTitle,
                desc: cardDesc,
                idList: trelloListId,
                idMembers: [managerId]
            };
            
            const dueDate = caseData.Prazo_Resposta ? parseDate(caseData.Prazo_Resposta) : null;
            if (dueDate && !isNaN(dueDate.getTime())) {
                dueDate.setUTCHours(12);
                cardPayload.due = dueDate.toISOString();
            }

            const startDate = caseData.Data_Abertura ? parseDate(caseData.Data_Abertura) : null;
            if (startDate && !isNaN(startDate.getTime())) {
                startDate.setUTCHours(12);
                cardPayload.start = startDate.toISOString();
            }

            try {
                const newCard = await fetchTrelloAPI(`cards`, 'POST', cardPayload, currentLogging);
                
                const labelsToApply = [];
                const analystLabelId = analystLabelMap.get(`${analystName}-${taskArgs.boardId}`);
                if (analystLabelId) {
                    labelsToApply.push(analystLabelId);
                }

                if (caseData.Fornecedor_Empresa) {
                    let companyLabel = allLabelsOnBoard.find(l => l.name.toLowerCase() === caseData.Fornecedor_Empresa.toLowerCase());
                    if (!companyLabel) {
                        currentLogging.log(`Criando nova etiqueta para a empresa: ${caseData.Fornecedor_Empresa}`);
                        companyLabel = await fetchTrelloAPI('labels', 'POST', { name: caseData.Fornecedor_Empresa, color: 'orange', idBoard: taskArgs.boardId }, currentLogging);
                        allLabelsOnBoard.push(companyLabel);
                    }
                    labelsToApply.push(companyLabel.id);
                }

                for (const labelId of labelsToApply) {
                    await fetchTrelloAPI(`cards/${newCard.id}/idLabels`, 'POST', { value: labelId }, currentLogging);
                }
                
                updatesForSheet.push(
                    { range: `Base_Mae_Final!T${caseData.rowIndex}`, values: [[analystName]] },
                    { range: `Base_Mae_Final!U${caseData.rowIndex}`, values: [[analystName]] },
                    { range: `Base_Mae_Final!V${caseData.rowIndex}`, values: [['Processado']] },
                    { range: `Base_Mae_Final!W${caseData.rowIndex}`, values: [[newCard.id]] }
                );
                createdCardsCount++;
            } catch (trelloError) {
                updatesForSheet.push({ range: `Base_Mae_Final!V${caseData.rowIndex}`, values: [[`Erro Trello: ${trelloError.message.substring(0, 100)}`]] });
            }
        }
        if (updatesForSheet.length > 0) {
            await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: 'USER_ENTERED', data: updatesForSheet } });
        }
        return { success: true, message: `${taskArgs.assignments.length} atribuições processadas. ${createdCardsCount} cards criados no Trello.` };
    }, logging, { assignments, boardId }));


    const runDataTaskInternal = async (taskName, logic, args, currentLogging) => {
        currentLogging.log(`>>> Iniciando tarefa de dados: ${taskName}...`);
        try {
            await logic(args, currentLogging);
            currentLogging.finishTask(`Tarefa ${taskName} concluída!`);
        } catch (error) {
            currentLogging.errorTask(`ERRO na tarefa ${taskName}: ${error}`);
            throw error;
        }
    };

    const getSimpleConsolidateLogic = (folder, outputName, sheetName, options = {}) => async (args, currentLogging) => {
        const reportsPath = path.join(args.basePath, `Relatorios_${folder}`);
        if (!fs.existsSync(reportsPath)) {
            currentLogging.log(`Pasta ${reportsPath} não encontrada, pulando.`);
            return;
        }
    
        const allFilesInDir = fs.readdirSync(reportsPath);
        const files = allFilesInDir.filter(f =>
            (f.toLowerCase().endsWith('.xls') || f.toLowerCase().endsWith('.csv') || f.toLowerCase().endsWith('.xlsx')) &&
            !f.toLowerCase().startsWith('relatorio_consolidado') &&
            !f.toLowerCase().endsWith('.tmp')
        );
    
        if (files.length === 0) {
            currentLogging.log(`Nenhum arquivo para consolidar encontrado em ${reportsPath}.`);
            return;
        }
    
        currentLogging.log(`Encontrados ${files.length} arquivos para consolidar em ${folder}.`);
        let allData = [];
        for (const file of files) {
            const filePath = path.join(reportsPath, file);
            let workbook = XLSX.readFile(filePath, { cellDates: false });
            let sheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(sheet, { ...options, raw: false });
            
            jsonData.forEach(row => {
                for (const key in row) {
                    if (key.startsWith('__EMPTY')) {
                        delete row[key];
                    }
                }
            });

            allData.push(...jsonData);
        }

        if (allData.length === 0) {
            currentLogging.log(`Nenhum dado encontrado nos arquivos de ${folder}.`);
            return;
        }
        
        const newWorkbook = XLSX.utils.book_new();
        const newSheet = XLSX.utils.json_to_sheet(allData);
        XLSX.utils.book_append_sheet(newWorkbook, newSheet, sheetName);
        const outputPath = path.join(reportsPath, outputName);
        XLSX.writeFile(newWorkbook, outputPath, { bookType: 'xlsx', type: 'buffer' });
        currentLogging.log(`Consolidação de ${folder} concluída! Arquivo salvo em: ${outputPath}`);
    };

    const consolidateProconsumidorLogic = async (args, currentLogging) => {
        const reportsPath = path.join(args.basePath, "Relatorios_PROCONSUMIDOR");
        const outputPath = path.join(reportsPath, "Relatorio_Consolidado.xlsx");
        if (!fs.existsSync(reportsPath)) { currentLogging.log(`Pasta ${reportsPath} não encontrada, pulando.`); return; }
        const companyFolders = fs.readdirSync(reportsPath).filter(f => fs.statSync(path.join(reportsPath, f)).isDirectory());

        if (companyFolders.length === 0) { currentLogging.log("Nenhuma pasta de empresa encontrada."); return; }

        const newWorkbook = XLSX.utils.book_new();
        const allCompanyData = [];
        
        for (const company of companyFolders) {
            const companyPath = path.join(reportsPath, company);
            const files = fs.readdirSync(companyPath).filter(f => f.toLowerCase().endsWith('.xls'));
            if (files.length === 0) continue;

            currentLogging.log(`Processando ${files.length} arquivos para ${company}...`);
            const companyData = [];
            for (const file of files) {
                const workbook = XLSX.readFile(path.join(companyPath, file), { cellDates: false });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(sheet, { raw: false });
                
                jsonData.forEach(row => {
                    for (const key in row) {
                        if (key.startsWith('__EMPTY')) {
                            delete row[key];
                        }
                    }
                });

                companyData.push(...jsonData);
            }
            
            const companySheet = XLSX.utils.json_to_sheet(companyData);
            XLSX.utils.book_append_sheet(newWorkbook, companySheet, company.substring(0, 31));
            companyData.forEach(row => row['Fonte_Empresa'] = company);
            allCompanyData.push(...companyData);
        }

        if (allCompanyData.length > 0) {
            const unifiedSheet = XLSX.utils.json_to_sheet(allCompanyData);
            XLSX.utils.book_append_sheet(newWorkbook, unifiedSheet, 'Unificado');
            XLSX.writeFile(newWorkbook, outputPath, { bookType: 'xlsx', type: 'buffer' });
            currentLogging.log(`Consolidação do Proconsumidor concluída! Arquivo salvo em: ${outputPath}`);
        } else {
            currentLogging.log("Nenhum dado do Proconsumidor encontrado para consolidar.");
        }
    };

    ipcMain.handle('pipeline:consolidate-all', (event, args) => runTask("Consolidar Relatórios Locais", async (taskArgs, currentLogging) => {
        const { basePath } = taskArgs;
        
        const govReportPath = path.join(basePath, 'Relatorios_Consumidor_Gov');
        if (fs.existsSync(govReportPath)) {
            const govFiles = fs.readdirSync(govReportPath).filter(f => f.toLowerCase().endsWith('.xls'));
            for (const file of govFiles) {
                const fullPath = path.join(govReportPath, file);
                preProcessExcelFile(fullPath, {
                    numberColumns: ['Protocolo', 'CPF']
                }, currentLogging);
            }
        }

        await runDataTaskInternal("Proconsumidor", consolidateProconsumidorLogic, taskArgs, currentLogging);
        await runDataTaskInternal('Consolidar HUGME', getSimpleConsolidateLogic('HUGME', 'Relatorio_Consolidado_HugMe.xlsx', 'Consolidado_HugMe', { range: 3 }), taskArgs, currentLogging);
        await runDataTaskInternal('Consolidar PROCON_SP', getSimpleConsolidateLogic('PROCON_SP', 'Relatorio_Consolidado_SP.xlsx', 'Consolidado'), taskArgs, currentLogging);
        await runDataTaskInternal('Consolidar Consumidor_Gov', getSimpleConsolidateLogic('Consumidor_Gov', 'Relatorio_Consolidado_Gov.xlsx', 'Consolidado_Gov'), taskArgs, currentLogging);
        await runDataTaskInternal('Consolidar PROCON_SJC', getSimpleConsolidateLogic('PROCON_SJC', 'Relatorio_Consolidado_SJC.xlsx', 'Consolidado_SJC'), taskArgs, currentLogging);
        await runDataTaskInternal('Consolidar PROCON_CAMPINAS', getSimpleConsolidateLogic('PROCON_CAMPINAS', 'Relatorio_Consolidado_Campinas.xlsx', 'Consolidado_Campinas'), taskArgs, currentLogging);
        await runDataTaskInternal('Consolidar BCB_RDR', getSimpleConsolidateLogic('BCB_RDR', 'Relatorio_Consolidado_BCB_RDR.xlsx', 'Consolidado_BCB', { header: 1, range: 2, defval: null }), taskArgs, currentLogging);
    }, logging, args));


    ipcMain.handle('pipeline:create-raw-base', (event, args) => runTask("Criar Base Bruta Local", async (taskArgs, currentLogging) => {
        const FONTES_DE_DADOS = {
            "Gov": { path: "Relatorios_Consumidor_Gov/Relatorio_Consolidado_Gov.xlsx"},
            "Proconsumidor": { path: "Relatorios_PROCONSUMIDOR/Relatorio_Consolidado.xlsx"},
            "SP": { path: "Relatorios_PROCON_SP/Relatorio_Consolidado_SP.xlsx"},
            "SJC": { path: "Relatorios_PROCON_SJC/Relatorio_Consolidado_SJC.xlsx"},
            "Campinas": { path: "Relatorios_PROCON_CAMPINAS/Relatorio_Consolidado_Campinas.xlsx"},
            "Uberlandia": { path: "Relatorios_PROCON_UBERLANDIA/Relatorio_API_Uberlandia.xlsx"},
            "BCB_RDR": { path: "Relatorios_BCB_RDR/Relatorio_Consolidado_BCB_RDR.xlsx"},
            "HugMe": { path: "Relatorios_HUGME/Relatorio_Consolidado_HugMe.xlsx"}
        };

        const outputWorkbook = XLSX.utils.book_new();
        let fontesCopiadas = 0;

        for (const [sheetName, sourceInfo] of Object.entries(FONTES_DE_DADOS)) {
            const fullPath = path.join(taskArgs.basePath, sourceInfo.path);
            if (fs.existsSync(fullPath)) {
                try {
                    currentLogging.log(`Processando fonte: ${sheetName}`);
                    const workbook = XLSX.readFile(fullPath, { cellDates: false });
                    const sourceSheetName = workbook.SheetNames[0];
                    const sourceSheet = workbook.Sheets[sourceSheetName];

                    if (!sourceSheet || !sourceSheet['!ref']) {
                        currentLogging.log(` -> Aviso: Nenhuma planilha ou dados encontrados no arquivo da fonte ${sheetName}. Pulando.`);
                        continue;
                    }
                    XLSX.utils.book_append_sheet(outputWorkbook, sourceSheet, sheetName);
                    fontesCopiadas++;
                } catch (e) {
                    currentLogging.errorTask(`Falha ao processar ${fullPath}: ${e.stack}`);
                }
            } else {
                currentLogging.log(` -> Aviso: Arquivo não encontrado, pulando: ${fullPath}`);
            }
        }

        if (fontesCopiadas > 0) {
            const outputPath = path.join(taskArgs.basePath, "Base_Mae_Bruta.xlsx");
            XLSX.writeFile(outputWorkbook, outputPath, { bookType: 'xlsx', type: 'buffer' });
            currentLogging.log(`Base Mãe Bruta criada com ${fontesCopiadas} fontes de dados em: ${outputPath}`);
        } else {
            currentLogging.log("Nenhuma fonte de dados processada. Base Mãe Bruta não foi gerada.");
        }
    }, logging, args));


    ipcMain.handle('pipeline:generate-master-base', (event, args) => runTask("Gerar Base Mãe Final Local", async (taskArgs, currentLogging) => {
        const { basePath } = taskArgs;
        const inputPath = path.join(basePath, "Base_Mae_Bruta.xlsx");
        if (!fs.existsSync(inputPath)) throw new Error("Arquivo Base_Mae_Bruta.xlsx não encontrado. Execute a etapa 'Criar Base Bruta Local' primeiro.");

        const workbook = XLSX.readFile(inputPath, { cellDates: false });
        const allData = [];

        const cleanDoc = (doc) => doc ? String(doc).replace(/\D/g, '').padStart(11, '0') : '';
        
        const standardizeDateString = (dateValue) => {
            if (!dateValue) return '';
            let date = null;
            
            if (!isNaN(dateValue) && Number(dateValue) > 1 && String(dateValue).indexOf('.') === -1) {
                const excelDate = new Date(Math.round((Number(dateValue) - 25569) * 86400 * 1000));
                excelDate.setMinutes(excelDate.getMinutes() + excelDate.getTimezoneOffset());
                date = excelDate;
            } else if (typeof dateValue === 'string') {
                const datePart = dateValue.split(' ')[0];
                if (datePart.includes('-')) {
                    const parts = datePart.split('-');
                    if (parts.length === 3) date = new Date(Date.UTC(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])));
                } else if (datePart.includes('/')) {
                    const parts = datePart.split('/');
                    if (parts.length === 3) {
                        let day, month, year;
                         if (parts[2].length === 4) {
                            day = parseInt(parts[0], 10);
                            month = parseInt(parts[1], 10);
                            year = parseInt(parts[2], 10);
                        } else {
                            day = parseInt(parts[0], 10);
                            month = parseInt(parts[1], 10);
                            year = parseInt(parts[2], 10) + 2000;
                        }
                        date = new Date(Date.UTC(year, month - 1, day));
                    }
                }
            }
            
            return (date && !isNaN(date.getTime())) ? formatDate(date) : String(dateValue);
        };

        const renameMaps = {
            Gov: {'Protocolo': 'Protocolo_Origem', 'Canal de Origem': 'Canal_Origem', 'Consumidor': 'Consumidor_Nome', 'CPF': 'Consumidor_CPF', 'UF': 'Consumidor_UF', 'Cidade': 'Consumidor_Cidade', 'Sexo': 'Consumidor_Genero', 'Faixa Etária': 'Consumidor_Faixa_Etaria', 'Data Abertura': 'Data_Abertura', 'Data Resposta': 'Data_Resposta_Fornecedor', 'Data Finalização': 'Data_Finalizacao', 'Nome Fantasia': 'Fornecedor_Empresa', 'Problema': 'Descricao_Reclamacao', 'Situação': 'Status_Atual', 'Avaliação Reclamação': 'Resultado_Final', 'Nota do Consumidor': 'Nota_Consumidor', 'Prazo Resposta': 'Prazo_Resposta'},
            Proconsumidor: {'Número de Atendimento': 'Protocolo_Origem', 'Documento Consumidor - CPF/CNPJ': 'Consumidor_CPF', 'Nome Consumidor': 'Consumidor_Nome', 'Gênero do Consumidor': 'Consumidor_Genero', 'Faixa Etária do Consumidor': 'Consumidor_Faixa_Etaria', 'CNPJ ou CPF Fornecedor': 'Fornecedor_CNPJ', 'Razão Social': 'Fornecedor_RazaoSocial', 'Nome Fantasia': 'Fornecedor_Empresa', 'Posto de Atendimento': 'Canal_Origem', 'Data de Abertura': 'Data_Abertura', 'Data da Finalização': 'Data_Finalizacao', 'Situação': 'Status_Atual', 'Classificação da Decisão': 'Resultado_Final'},
            SP: {'Protocolo': 'Protocolo_Origem', 'DataDaSolicitacao': 'Data_Abertura', 'DataDaBaixa': 'Data_Finalizacao', 'PostoDeAtendimento': 'Canal_Origem', 'Consumidor_Nome': 'Consumidor_Nome', 'Consumidor_Cpf': 'Consumidor_CPF', 'Consumidor_Endereco_Cidade': 'Consumidor_Cidade', 'Consumidor_Endereco_Estado': 'Consumidor_UF', 'Consumidor_Email': 'Consumidor_Email', 'Consumidor_Celular': 'Consumidor_Celular', 'Fornecedor_NomeFantasia': 'Fornecedor_Empresa', 'Reclamacao_Detalhes': 'Descricao_Reclamacao', 'Situacao': 'Status_Atual', 'ClassificacaoDaBaixa': 'Resultado_Final', 'DataDeRepostaDoFornecedor': 'Data_Resposta_Fornecedor', 'PrazoDeRespostaDoFornecedor': 'Prazo_Resposta'},
            HugMe: {'Empresa': 'Fornecedor_Empresa', 'Id HugMe': 'Protocolo_Origem', 'Data Reclamação': 'Data_Abertura', 'Status RA': 'Status_Atual', 'Texto da Reclamação': 'Descricao_Reclamacao', 'CPF/CNPJ': 'Consumidor_CPF', 'Email': 'Consumidor_Email', 'Telefones': 'Consumidor_Celular', 'Cidade': 'Consumidor_Cidade', 'Estado': 'Consumidor_UF', 'Data de Resposta': 'Data_Resposta_Fornecedor', 'Seu problema foi resolvido?': 'Resultado_Final'},
            SJC: {'Nº Reclamacão': 'Protocolo_Origem', 'Data de Reclamação': 'Data_Abertura', 'Última movimentação': 'Status_Atual'},
            Campinas: {'Nº Reclamacão': 'Protocolo_Origem', 'Data de Reclamação': 'Data_Abertura', 'Última movimentação': 'Status_Atual'},
            Uberlandia: {'Número de Atendimento': 'Protocolo_Origem', 'Data de Abertura': 'Data_Abertura', 'Situação': 'Status_Atual', 'Nome Consumidor': 'Consumidor_Nome', 'Documento Consumidor - CPF/CNPJ': 'Consumidor_CPF', 'Nome Fantasia': 'Fornecedor_Empresa', 'Cidade Credenciada': 'Consumidor_Cidade', 'UF Credenciada': 'Consumidor_UF'},
            BCB_RDR: {'Número': 'Protocolo_Origem', 'Disponibilização': 'Data_Abertura', 'Data do Encerramento': 'Data_Finalizacao', 'Situação': 'Status_Atual', 'Canal de Atendimento': 'Canal_Origem', 'Instituição': 'Fornecedor_Empresa', 'CPF/CNPJ': 'Consumidor_CPF', 'Prazo': 'Prazo_Resposta'}
        };

        for (const sheetName of workbook.SheetNames) {
            currentLogging.log(`Processando e padronizando aba: ${sheetName}`);
            let jsonData;
            if (sheetName === 'BCB_RDR' || sheetName === 'SJC' || sheetName === 'Campinas') {
                 jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { raw: false, range: 1 });
            } else {
                 jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { raw: false });
            }

            const renameMap = renameMaps[sheetName] || {};
            
            const processedData = jsonData.map(row => {
                const newRow = { Fonte_Dados: sheetName };
                for (const [oldKey, value] of Object.entries(row)) {
                    const newKey = renameMap[oldKey] || oldKey;
                    newRow[newKey] = value;
                }
                return newRow;
            });
            allData.push(...processedData);
        }

        currentLogging.log("Unificando e finalizando a Base Mãe...");
        const FINAL_COLUMNS_ORDER_LOCAL = [ 'ID_Reclamacao_Unico', 'Protocolo_Origem', 'Fonte_Dados', 'Data_Abertura', 'Data_Finalizacao', 'Prazo_Resposta', 'Canal_Origem', 'Consumidor_Nome', 'Consumidor_CPF', 'Consumidor_Cidade', 'Consumidor_UF', 'Consumidor_Email', 'Consumidor_Celular', 'Consumidor_Faixa_Etaria', 'Consumidor_Genero', 'Fornecedor_Empresa', 'Descricao_Reclamacao', 'Status_Atual', 'Resultado_Final', 'OPERADOR' ]; 

        const finalData = allData.map(row => {
            const finalRow = {};
            FINAL_COLUMNS_ORDER_LOCAL.forEach(col => finalRow[col] = row[col] || '');
            
            let protocol = String(row.Protocolo_Origem || '').trim();
            if (protocol === '' || protocol === 'null' || protocol.toLowerCase() === 'undefined') { 
                protocol = Math.random().toString(36).substring(2, 10); 
                currentLogging.log(`AVISO: Protocolo_Origem para ${row.Fonte_Dados} estava vazio ou nulo. ID_Reclamacao_Unico gerado com sufixo único: ${row.Fonte_Dados}_${protocol}`);
            }
            finalRow.ID_Reclamacao_Unico = `${row.Fonte_Dados}_${protocol}`;
            finalRow.Consumidor_CPF = cleanDoc(row.Consumidor_CPF);
            
            const dateColsToFormat = ['Data_Abertura', 'Data_Finalizacao', 'Prazo_Resposta'];
            for (const col of dateColsToFormat) {
                if (finalRow[col]) {
                     finalRow[col] = standardizeDateString(finalRow[col]);
                }
            }

            return finalRow;
        });

        const finalSheet = XLSX.utils.json_to_sheet(finalData, { header: FINAL_COLUMNS_ORDER_LOCAL });
        
        const stringCols = ['Protocolo_Origem', 'ID_Reclamacao_Unico'];
        const headerIndex = FINAL_COLUMNS_ORDER_LOCAL.reduce((acc, col, i) => { acc[col] = i; return acc; }, {});
        const range = XLSX.utils.decode_range(finalSheet['!ref']);
        for (let R = range.s.r + 1; R <= range.e.r; ++R) {
            for (const colName of stringCols) {
                const C = headerIndex[colName];
                if (C !== undefined) {
                    const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
                    const cell = finalSheet[cellAddress];
                    if (cell && cell.v) {
                        cell.t = 's';
                        cell.v = String(cell.v);
                    }
                }
            }
        }
        
        const finalWorkbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(finalWorkbook, finalSheet, 'Base_Mae_Final');
        const outputPath = path.join(taskArgs.basePath, "Base_Mae_Final.xlsx");
        XLSX.writeFile(finalWorkbook, outputPath, { bookType: 'xlsx', type: 'buffer' }); 
        currentLogging.log(`Base Mãe Final gerada com ${finalData.length} registros em: ${outputPath}`);
    }, logging, args));

ipcMain.handle('pipeline:upload-master-base-to-sheets', (event, args) => runTask("Upload Base Mãe para Google Sheets", async (taskArgs, currentLogging) => {
    const { basePath } = taskArgs;
    const sheets = getSheetsService();

    const inputPath = path.join(basePath, "Base_Mae_Final.xlsx");
    if (!fs.existsSync(inputPath)) {
        throw new Error("Arquivo Base_Mae_Final.xlsx não encontrado. Por favor, execute a etapa 'Gerar Base Mãe Final Local' primeiro.");
    }

    const workbook = XLSX.readFile(inputPath, { cellDates: false });
    const sheet = workbook.Sheets[workbook.SheetNames.find(name => name === 'Base_Mae_Final') || workbook.SheetNames[0]]; 
    const allLocalData = XLSX.utils.sheet_to_json(sheet, { raw: false });

    const FINAL_COLUMNS_ORDER_SHEETS = [
        'ID_Reclamacao_Unico', 'Protocolo_Origem', 'Fonte_Dados', 'Data_Abertura',
        'Data_Finalizacao', 'Prazo_Resposta', 'Canal_Origem', 'Consumidor_Nome',
        'Consumidor_CPF', 'Consumidor_Cidade', 'Consumidor_UF', 'Consumidor_Email',
        'Consumidor_Celular', 'Consumidor_Faixa_Etaria', 'Consumidor_Genero',
        'Fornecedor_Empresa', 'Descricao_Reclamacao', 'Status_Atual', 'Resultado_Final',
        'OPERADOR', 'RESPONSAVEL_TRELLO', 'STATUS', 'ID_Card_Trello'
    ];
    
    const cleanDoc = (doc) => {
        if (!doc) return null;
        return String(doc).replace(/\D/g, '').padStart(11, '0');
    };

    const processedDataForUpload = allLocalData.map(row => {
        const newRow = {};
        FINAL_COLUMNS_ORDER_SHEETS.forEach(col => newRow[col] = row[col] || null);
        newRow.Consumidor_CPF = cleanDoc(newRow.Consumidor_CPF);
        newRow.STATUS = newRow.STATUS || 'Novo';
        return newRow;
    });

    currentLogging.log("Processamento para upload concluído. Verificando dados no Google Sheets para append...");

    const googleSheetRange = `Base_Mae_Final!A:${getColumnLetter(FINAL_COLUMNS_ORDER_SHEETS.length -1)}`;
    const existingDataResponse = await sheets.spreadsheets.values.get({ spreadsheetId, range: googleSheetRange });
    const existingGoogleSheetData = existingDataResponse.data.values;
    let existingGoogleSheetIdMap = new Map();
    
    const firstNewRowIndex = existingGoogleSheetData ? existingGoogleSheetData.length : 0;

    if (existingGoogleSheetData && existingGoogleSheetData.length > 0) {
         const existingHeaders = existingGoogleSheetData[0];
         const idReclamacaoUnicoIndex = existingHeaders.indexOf('ID_Reclamacao_Unico');
         if (idReclamacaoUnicoIndex !== -1) {
             for(let i = 1; i < existingGoogleSheetData.length; i++) {
                 if (existingGoogleSheetData[i][idReclamacaoUnicoIndex]) {
                     existingGoogleSheetIdMap.set(existingGoogleSheetData[i][idReclamacaoUnicoIndex], existingGoogleSheetData[i]);
                 }
             }
         } else {
             currentLogging.log("Aviso: 'ID_Reclamacao_Unico' não encontrado nos cabeçalhos da Base_Mae_Final. Todos os registros locais serão considerados novos.");
         }
    }
   
    const dataToAppend = [];
    for (const record of processedDataForUpload) {
        if (!record.ID_Reclamacao_Unico) {
            currentLogging.log(`AVISO: Registro sem ID_Reclamacao_Unico válido, pulando-o. Registro: ${JSON.stringify(record)}`);
            continue;
        }

        if (!existingGoogleSheetIdMap.has(record.ID_Reclamacao_Unico)) {
            const rowValues = FINAL_COLUMNS_ORDER_SHEETS.map(col => record[col] || null);
            dataToAppend.push(rowValues);
        }
    }

   if (dataToAppend.length > 0) {
        if (!existingGoogleSheetData || existingGoogleSheetData.length === 0) {
            currentLogging.log("Adicionando cabeçalhos à Base_Mae_Final no Google Sheets.");
            await sheets.spreadsheets.values.append({
                spreadsheetId,
                range: `Base_Mae_Final!A1`,
                valueInputOption: 'USER_ENTERED',
                insertDataOption: 'INSERT_ROWS',
                requestBody: { values: [FINAL_COLUMNS_ORDER_SHEETS] }
            });
        }
        currentLogging.log(`Adicionando ${dataToAppend.length} novos registros à Base_Mae_Final no Google Sheets.`);
        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: `Base_Mae_Final!A1`,
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
            requestBody: { values: dataToAppend }
        });

        currentLogging.log("Aplicando formatação de data nas colunas D, E e F para os novos registros...");
        const sheetInfo = await sheets.spreadsheets.get({ spreadsheetId });
        const sheetId = sheetInfo.data.sheets.find(s => s.properties.title === 'Base_Mae_Final').properties.sheetId;

        const dateColumnIndices = [3, 4, 5]; 
        const formatRequests = [];

        for (const columnIndex of dateColumnIndices) {
            const request = {
                repeatCell: {
                    range: {
                        sheetId: sheetId,
                        startRowIndex: firstNewRowIndex,
                        endRowIndex: firstNewRowIndex + dataToAppend.length,
                        startColumnIndex: columnIndex,
                        endColumnIndex: columnIndex + 1 
                    },
                    cell: {
                        userEnteredFormat: {
                            numberFormat: {
                                type: "DATE",
                                pattern: "dd/mm/yyyy"
                            }
                        }
                    },
                    fields: "userEnteredFormat.numberFormat"
                }
            };
            formatRequests.push(request);
        }

        if (formatRequests.length > 0) {
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                requestBody: {
                    requests: formatRequests 
                }
            });
            currentLogging.log("Formatação de data aplicada com sucesso.");
        }

    } else {
        currentLogging.log("Nenhum registro novo para adicionar à Base_Mae_Final no Google Sheets.");
    }
    currentLogging.log("Upload da Base Mãe Final para o Google Sheets concluído.");
}, logging, args));

    ipcMain.handle('api:fetch-uberlandia', (event, args) => runTask("API Procon Uberlândia", async (taskArgs, currentLogging) => {
        const { basePath, startDate, endDate } = taskArgs;
        const TOKEN = process.env.PROCON_UBERLANDIA_TOKEN;
        if (!TOKEN) throw new Error("Token do Procon Uberlândia não foi encontrado no arquivo .env");
    
        currentLogging.log("Buscando dados da API...");
        const response = await fetch("https://api-procon.uberlandia.mg.gov.br/process", {
            headers: { "Authorization": `Bearer ${TOKEN}` }
        });
        if (!response.ok) throw new Error(`Falha na API: ${response.statusText}`);
        const apiData = await response.json();
        currentLogging.log(`Recebidos ${apiData.length} registros da API.`);
    
        const start = startDate ? parseDate(startDate) : null;
        const end = endDate ? parseDate(endDate) : null;
        if (end) end.setHours(23, 59, 59, 999);
    
        let filteredData = apiData;
        if (start || end) {
            currentLogging.log(`Filtrando registros entre ${startDate || 'início'} e ${endDate || 'fim'}.`);
            filteredData = apiData.filter(proc => {
                const procDate = new Date(proc.createdAt);
                if (isNaN(procDate.getTime())) return false;
    
                const isAfterStart = !start || procDate >= start;
                const isBeforeEnd = !end || procDate <= end;
                return isAfterStart && isBeforeEnd;
            });
            currentLogging.log(`${filteredData.length} registros após a filtragem por data.`);
        }
    
        const processedData = filteredData.map(proc => {
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

        if (processedData.length === 0) {
            currentLogging.log("Nenhum dado da API do Procon Uberlândia encontrado para o período. O arquivo não será gerado.");
            return;
        }
    
        const outputPath = path.join(basePath, "Relatorios_PROCON_UBERLANDIA", "Relatorio_API_Uberlandia.xlsx");
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        const workbook = XLSX.utils.book_new();
        const sheet = XLSX.utils.json_to_sheet(processedData);
        XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
        XLSX.writeFile(workbook, outputPath);
        currentLogging.log(`Dados da API salvos em: ${outputPath}`);
    }, logging, args));

    ipcMain.handle('search:find-cpf', (event, args) => runTask('Buscar CPF na Base Online', async (taskArgs, currentLogging) => {
        const sheets = getSheetsService();
        const { cpf } = taskArgs;
        const cleanCPF = String(cpf).replace(/\D/g, '');
        currentLogging.log(`Buscando por CPF na base online: ${cleanCPF}`);
        const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Base_Mae_Final!A:W' });
        const allData = arraysToObjects(response.data.values);
        const results = allData.filter(row => String(row['Consumidor_CPF'] || '').replace(/\D/g, '') === cleanCPF)
            .map(row => ({
                nome: row['Consumidor_Nome'],
                protocolo: row['Protocolo_Origem'],
                fonte: row['Fonte_Dados'],
                dataAbertura: row['Data_Abertura'],
                dataFinalizacao: row['Data_Finalizacao'],
                status: row['Status_Atual']
            }));
        return { count: results.length, cpf: cleanCPF, results: results };
    }, logging, args));

    ipcMain.handle('search:find-audiencias', (event, args) => runTask('Buscar Audiências na Base Online', async (taskArgs, currentLogging) => {
        const sheets = getSheetsService();
        currentLogging.log(`Buscando por audiências na base online...`);
        const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Base_Mae_Final!A:W' });
        const allData = arraysToObjects(response.data.values);
        const results = allData.filter(row => String(row['Status_Atual'] || '').toLowerCase().includes('audiência'))
            .map(row => ({
                Protocolo_Origem: row['Protocolo_Origem'],
                Consumidor_Nome: row['Consumidor_Nome'],
                Data_Abertura: row['Data_Abertura'],
                Prazo_Resposta: row['Prazo_Resposta']
            }));
        return { count: results.length, audiencias: results };
    }, logging, args));
}

module.exports = { registerDataHandlers };