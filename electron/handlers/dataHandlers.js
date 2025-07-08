const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const { runTask, parseDate, formatDate } = require('./utils');

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

    const getOrCreateSheet = async (sheets, sheetName) => {
        const sheetInfo = await sheets.spreadsheets.get({ spreadsheetId });
        const existingSheet = sheetInfo.data.sheets.find(s => s.properties.title === sheetName);
        if (existingSheet) {
            return existingSheet.properties.sheetId;
        } else {
            const createResponse = await sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                requestBody: {
                    requests: [{
                        addSheet: {
                            properties: { title: sheetName }
                        }
                    }]
                }
            });
            return createResponse.data.replies[0].addSheet.properties.sheetId;
        }
    };

    ipcMain.handle('trello:get-boards', (event) => runTask('Buscar Quadros Trello', async () => {
        return await fetchTrelloAPI(`organizations/${organizationId}/boards`, 'GET', { fields: 'id,name' }, logging);
    }, logging));

    ipcMain.handle('data:get-managers', (event) => runTask('Buscar Gestores', async () => {
        const sheets = getSheetsService();
        const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Gestores!A:D' });
        return arraysToObjects(response.data.values);
    }, logging));
    
    ipcMain.handle('data:get-all-workspace-data', (event) => runTask('Buscar Dados do Workspace', async () => {
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
        
        const boards = await fetchTrelloAPI(`organizations/${organizationId}/boards`, 'GET', { fields: 'id,name' }, logging);

        return {
            analysts: arraysToObjects(analystsResponse.data.values),
            managers: arraysToObjects(managersResponse.data.values),
            accessRules: arraysToObjects(accessRulesResponse.data.values),
            boards: boards
        };
    }, logging));

    ipcMain.handle('data:update-access', (event, { managerId, boardId, hasAccess }) => runTask('Atualizar Acesso', async () => {
        const sheets = getSheetsService();
        const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Acessos_Quadros!A:B' });
        const accessRules = arraysToObjects(response.data.values);
        const sheetInfo = await sheets.spreadsheets.get({spreadsheetId});
        const sheetId = sheetInfo.data.sheets.find(s => s.properties.title === 'Acessos_Quadros').properties.sheetId;
        const rowIndex = accessRules.findIndex(rule => rule.ID_Gestor_Trello === managerId && rule.ID_Quadro_Trello === boardId);
        
        if (hasAccess) {
            await fetchTrelloAPI(`boards/${boardId}/members/${managerId}`, 'PUT', { type: 'normal' }, logging);
            if (rowIndex === -1) {
                await sheets.spreadsheets.values.append({
                    spreadsheetId, range: 'Acessos_Quadros!A1', valueInputOption: 'USER_ENTERED',
                    requestBody: { values: [[managerId, boardId]] },
                });
            }
        } else {
            await fetchTrelloAPI(`boards/${boardId}/members/${managerId}`, 'DELETE', null, logging);
            if (rowIndex !== -1) {
                await sheets.spreadsheets.batchUpdate({
                    spreadsheetId, requestBody: { requests: [{ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: rowIndex + 1, endIndex: rowIndex + 2 } } }] },
                });
            }
        }
        return { success: true };
    }, logging));
    
    ipcMain.handle('data:add-analyst', (event, { name, cpf, boardId }) => runTask('Adicionar Analista', async () => {
        if (!boardId) throw new Error("O quadro Trello de destino não foi selecionado.");
        const sheets = getSheetsService();
        const existingAnalysts = arraysToObjects((await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Analistas!A:D' })).data.values);
        if (existingAnalysts.some(a => a.Nome_Analista === name && a.CPF_Analista === cpf && a.ID_Quadro_Trello === boardId)) {
            throw new Error("Este analista já está cadastrado para este quadro.");
        }
        const allLabels = await fetchTrelloAPI(`boards/${boardId}/labels`, 'GET', null, logging);
        let label = allLabels.find(l => l.name.toLowerCase() === name.toLowerCase());
        if (!label) {
            label = await fetchTrelloAPI('labels', 'POST', { name: name, color: 'blue', idBoard: boardId }, logging);
        }
        await sheets.spreadsheets.values.append({
            spreadsheetId, range: 'Analistas!A1', valueInputOption: 'USER_ENTERED',
            requestBody: { values: [[name, cpf, label.id, boardId]] },
        });
        return { success: true };
    }, logging));

    ipcMain.handle('data:delete-analyst', (event, { name, cpf, boardId }) => runTask('Remover Analista', async () => {
        const sheets = getSheetsService();
        const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Analistas!A:D' });
        const rowIndex = (response.data.values || []).findIndex(row => row[0] === name && row[1] === cpf && row[3] === boardId);
        if (rowIndex === -1) throw new Error(`Analista não encontrado para este quadro.`);
        const sheetInfo = await sheets.spreadsheets.get({ spreadsheetId });
        const sheetId = sheetInfo.data.sheets.find(s => s.properties.title === 'Analistas').properties.sheetId;
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId, requestBody: { requests: [{ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: rowIndex + 1, endIndex: rowIndex + 2 } } }] },
        });
        return { success: true };
    }, logging));
    
    ipcMain.handle('data:getAssignableData', (event) => runTask('Buscar Dados para Atribuição', async () => {
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
    }, logging));

    ipcMain.handle('data:submitAssignments', (event, { assignments, boardId }) => runTask('Submeter Atribuições', async () => {
        const allListsOnBoard = await fetchTrelloAPI(`boards/${boardId}/lists`, 'GET', null, logging);
        const targetList = allListsOnBoard.find(l => l.name.toLowerCase() === 'entrantes');
        if (!targetList) throw new Error(`Não foi encontrada uma lista chamada "Entrantes" no quadro selecionado.`);
        const trelloListId = targetList.id;
        const sheets = getSheetsService();
        const [casesResponse, analystsResponse] = await Promise.all([
            sheets.spreadsheets.values.get({ spreadsheetId, range: 'Base_Mae_Final!A:W' }),
            sheets.sheets.spreadsheets.values.get({ spreadsheetId, range: 'Analistas!A:D' })
        ]);
        const allCases = arraysToObjects(casesResponse.data.values);
        const allAnalysts = arraysToObjects(analystsResponse.data.values);
        const caseMap = new Map(allCases.map((row, index) => [row.ID_Reclamacao_Unico, { ...row, rowIndex: index + 2 }]));
        const analystLabelMap = new Map(allAnalysts.map(a => [`${a.Nome_Analista}-${a.ID_Quadro_Trello}`, a.ID_Etiqueta_Trello]));
        let createdCardsCount = 0;
        const updatesForSheet = [];

        for (const assignment of assignments) {
            const { caseId, analystName, managerId } = assignment;
            if (!managerId) { logging.errorTask(`Erro de lógica: Gestor não selecionado para o caso ${caseId}. Pulando.`); continue; }
            const caseData = caseMap.get(caseId);
            if (!caseData) { logging.log(`AVISO: Não foi possível encontrar dados para o ID: ${caseId}`); continue; }

            const cardTitle = `${caseData.OPERADOR || 'N/A'} | ${caseData.Consumidor_Nome || 'N/A'} - ${caseData.Consumidor_CPF || 'N/A'} | [${caseData.ID_Reclamacao_Unico || 'N/A'}]`;
            let cardDesc = `**Descrição:**\n${caseData.Descricao_Reclamacao || 'N/A'}\n\n...`;
            try {
                const newCard = await fetchTrelloAPI(`cards`, 'POST', { name: cardTitle, desc: cardDesc, idList: trelloListId, idMembers: [managerId] }, logging);
                const analystLabelId = analystLabelMap.get(`${analystName}-${boardId}`);
                if (analystLabelId) {
                    await fetchTrelloAPI(`cards/${newCard.id}/idLabels`, 'POST', { value: analystLabelId }, logging);
                }
                updatesForSheet.push(
                    { range: `Base_Mae_Final!V${caseData.rowIndex}`, values: [['Processado']] },
                    { range: `Base_Mae_Final!U${caseData.rowIndex}`, values: [[analystName]] },
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
        return { success: true, message: `${assignments.length} atribuições processadas. ${createdCardsCount} cards criados no Trello.` };
    }, logging));
    
    ipcMain.handle('pipeline:create-raw-base', (event, args) => runTask("Criar Base Bruta Local", async () => {
        const { basePath } = args;
        const FONTES_DE_DADOS = { "Gov": "Relatorios_Consumidor_Gov", "Proconsumidor": "Relatorios_PROCONSUMIDOR", "SP": "Relatorios_PROCON_SP", "SJC": "Relatorios_PROCON_SJC", "Campinas": "Relatorios_PROCON_CAMPINAS", "Uberlandia": "Relatorios_PROCON_UBERLANDIA", "BCB_RDR": "Relatorios_BCB_RDR", "HugMe": "Relatorios_HUGME" };
        const outputWorkbook = XLSX.utils.book_new();
        let fontesCopiadas = 0;
        for (const [sheetName, folder] of Object.entries(FONTES_DE_DADOS)) {
            const reportsPath = path.join(basePath, folder);
            if (!fs.existsSync(reportsPath)) { logging.log(`Pasta não encontrada para ${sheetName}, pulando: ${reportsPath}`); continue; }
            const files = fs.readdirSync(reportsPath).filter(f => f.toLowerCase().endsWith('.xls') || f.toLowerCase().endsWith('.csv'));
            if (files.length === 0) continue;
            const allData = [];
            for (const file of files) {
                const workbook = XLSX.readFile(path.join(reportsPath, file));
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                allData.push(...XLSX.utils.sheet_to_json(sheet));
            }
            if (allData.length > 0) {
                const newSheet = XLSX.utils.json_to_sheet(allData);
                XLSX.utils.book_append_sheet(outputWorkbook, newSheet, sheetName);
                fontesCopiadas++;
            }
        }
        if (fontesCopiadas > 0) {
            const outputPath = path.join(basePath, "Base_Mae_Bruta.xlsx");
            XLSX.writeFile(outputWorkbook, outputPath);
            logging.log(`Base Mãe Bruta criada com ${fontesCopiadas} fontes de dados em: ${outputPath}`);
        } else {
            logging.log("Nenhuma fonte de dados processada. Base Mãe Bruta não foi gerada.");
        }
    }, logging));

    ipcMain.handle('pipeline:generate-master-base', (event, args) => runTask("Gerar Base Mãe", async () => {
        const { basePath } = args;
        const sheets = getSheetsService();
        const FONTES_DE_DADOS_INFO = {
            "Gov": "Relatorios_Consumidor_Gov", "Proconsumidor": "Relatorios_PROCONSUMIDOR", "SP": "Relatorios_PROCON_SP",
            "SJC": "Relatorios_PROCON_SJC", "Campinas": "Relatorios_PROCON_CAMPINAS", "Uberlandia": "Relatorios_PROCON_UBERLANDIA",
            "BCB_RDR": "Relatorios_BCB_RDR", "HugMe": "Relatorios_HUGME"
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
        const POTENTIAL_DATE_COLUMNS = [ 'Data Abertura', 'Data Resposta', 'Data Finalização', 'Data de Abertura', 'Data da Finalização', 'DataDaSolicitacao', 'DataDaBaixa', 'DataDeRepostaDoFornecedor', 'Data Reclamação', 'Data de Resposta', 'Disponibilização', 'Data do Encerramento' ];
        
        logging.log('Iniciando consolidação local e upload para abas brutas no Google Sheets...');
        for (const [sourceName, folder] of Object.entries(FONTES_DE_DADOS_INFO)) {
            const reportsPath = path.join(basePath, folder);
            if (!fs.existsSync(reportsPath)) { logging.log(`Pasta não encontrada para ${sourceName}, pulando: ${reportsPath}`); continue; }
            const files = fs.readdirSync(reportsPath).filter(f => f.toLowerCase().endsWith('.xls') || f.toLowerCase().endsWith('.csv'));
            if (files.length === 0) { logging.log(`Nenhum arquivo encontrado em ${reportsPath} para ${sourceName}.`); continue; }

            const allDataForSource = [];
            for (const file of files) {
                const workbook = XLSX.readFile(path.join(reportsPath, file));
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                allDataForSource.push(...XLSX.utils.sheet_to_json(sheet));
            }
            if (allDataForSource.length > 0) {
                const brutaSheetName = `Bruta_${sourceName}`;
                await getOrCreateSheet(sheets, brutaSheetName);
                logging.log(`Enviando ${allDataForSource.length} registros para a aba "${brutaSheetName}"...`);
                const headers = Object.keys(allDataForSource[0]);
                const values = [headers, ...allDataForSource.map(row => headers.map(header => row[header]))];
                await sheets.spreadsheets.values.clear({ spreadsheetId, range: brutaSheetName });
                await sheets.spreadsheets.values.update({ spreadsheetId, range: `${brutaSheetName}!A1`, valueInputOption: 'RAW', requestBody: { values } });
            } else {
                logging.log(`Aviso: Nenhum dado encontrado para ${sourceName}, aba bruta não atualizada.`);
            }
        }
        logging.log('Consolidação de relatórios locais e upload para abas brutas no Google Sheets concluído.');

        logging.log('Iniciando geração da Base Mãe Final a partir das abas brutas no Google Sheets...');
        const sheetInfo = await sheets.spreadsheets.get({ spreadsheetId });
        const allSheets = sheetInfo.data.sheets.map(s => s.properties.title);
        const brutaSheets = allSheets.filter(name => name.startsWith('Bruta_'));
        if (brutaSheets.length === 0) throw new Error("Nenhuma aba 'Bruta_*' encontrada para processar.");
        
        const responses = await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges: brutaSheets });
        const allRawData = [];
        responses.data.valueRanges.forEach(vr => {
            const sheetName = vr.range.split('!')[0];
            const sourceName = sheetName.replace('Bruta_', '');
            const data = arraysToObjects(vr.values);
            data.forEach(row => { row.Fonte_Dados = sourceName; allRawData.push(row); });
        });

        const FINAL_COLUMNS_ORDER = [ 'ID_Reclamacao_Unico', 'Protocolo_Origem', 'Fonte_Dados', 'Data_Abertura', 'Data_Finalizacao', 'Prazo_Resposta', 'Canal_Origem', 'Consumidor_Nome', 'Consumidor_CPF', 'Consumidor_Cidade', 'Consumidor_UF', 'Consumidor_Email', 'Consumidor_Celular', 'Consumidor_Faixa_Etaria', 'Consumidor_Genero', 'Fornecedor_Empresa', 'Descricao_Reclamacao', 'Status_Atual', 'Data_Resposta_Fornecedor', 'OPERADOR', 'RESPONSAVEL_TRELLO', 'STATUS', 'ID_Card_Trello' ];
        
        const processedData = allRawData.map(row => {
            const renameMap = renameMaps[row.Fonte_Dados] || {};
            const newRow = {}; 
            FINAL_COLUMNS_ORDER.forEach(col => { newRow[col] = null; }); 
            
            for (const [oldKey, value] of Object.entries(row)) {
                const newKey = renameMap[oldKey] || oldKey;
                if (FINAL_COLUMNS_ORDER.includes(newKey)) { 
                    newRow[newKey] = value;
                }
            }
            if (newRow.Consumidor_CPF) newRow.Consumidor_CPF = String(newRow.Consumidor_CPF).replace(/\D/g, '').padStart(11, '0');
            if (newRow.Data_Abertura) newRow.Data_Abertura = formatDate(parseDate(String(newRow.Data_Abertura)));
            if (newRow.Data_Finalizacao) newRow.Data_Finalizacao = formatDate(parseDate(String(newRow.Data_Finalizacao)));
            if (newRow.Data_Resposta_Fornecedor) newRow.Data_Resposta_Fornecedor = formatDate(parseDate(String(newRow.Data_Resposta_Fornecedor)));

            newRow.ID_Reclamacao_Unico = `${newRow.Fonte_Dados}_${newRow.Protocolo_Origem || ''}`.trim();
            return newRow;
        });

        const finalSheetData = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Base_Mae_Final!A:A' });
        const existingIds = new Set((finalSheetData.data.values || []).map(row => row[0]));

        const dataToAppend = processedData
            .filter(row => !existingIds.has(row.ID_Reclamacao_Unico))
            .map(row => {
                row.STATUS = 'Novo';
                return FINAL_COLUMNS_ORDER.map(col => row[col] || null);
            });
        
        if (dataToAppend.length > 0) {
            logging.log(`Adicionando ${dataToAppend.length} novos registros à Base_Mae_Final.`);
            await sheets.spreadsheets.values.append({
                spreadsheetId, range: 'Base_Mae_Final!A1', valueInputOption: 'USER_ENTERED', requestBody: { values: dataToAppend }
            });
        } else {
            logging.log("Nenhum registro novo para adicionar.");
        }
        logging.log("Geração da Base Mãe Final no Google Sheets concluída.");
    }, logging));

    ipcMain.handle('search:find-cpf', async (event, args) => {
        const sheets = getSheetsService();
        const { cpf } = args;
        const cleanCPF = String(cpf).replace(/\D/g, '');
        logging.log(`Buscando por CPF: ${cleanCPF}`);
        const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Base_Mae_Final!A:W' });
        const allData = arraysToObjects(response.data.values);
        const results = allData.filter(row => String(row['Consumidor_CPF'] || '').replace(/\D/g, '') === cleanCPF)
            .map(row => ({
                nome: row['Consumidor_Nome'], protocolo: row['Protocolo_Origem'], fonte: row['Fonte_Dados'],
                dataAbertura: row['Data_Abertura'], dataFinalizacao: row['Data_Finalizacao'], status: row['Status_Atual']
            }));
        return { count: results.length, cpf: cleanCPF, results: results };
    });

    ipcMain.handle('search:find-audiencias', async (event, args) => {
        const sheets = getSheetsService();
        logging.log(`Buscando por audiências...`);
        const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Base_Mae_Final!A:W' });
        const allData = arraysToObjects(response.data.values);
        const results = allData.filter(row => String(row['Status_Atual'] || '').toLowerCase().includes('audiência'))
            .map(row => ({
                Protocolo_Origem: row['Protocolo_Origem'], Consumidor_Nome: row['Consumidor_Nome'],
                Data_Abertura: row['Data_Abertura'], Prazo_Resposta: row['Prazo_Resposta']
            }));
        return { count: results.length, audiencias: results };
    });
}

module.exports = { registerDataHandlers };