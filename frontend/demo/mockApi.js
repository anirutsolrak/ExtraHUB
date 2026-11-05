/*
 * ExtraHUB — Modo Demonstração
 *
 * Substitui o `window.electronAPI` (exposto pelo preload do Electron) por uma
 * implementação 100% local que simula Google Sheets, Trello, Playwright e as APIs
 * externas. Assim o mesmo frontend roda no navegador (ou no Electron com --demo)
 * sem credenciais e sem tocar em dados reais.
 *
 * Só é ativado quando não existe uma API real (ou seja, fora do Electron normal).
 * Os dados ficam no localStorage do navegador e podem ser restaurados a qualquer momento.
 */
(function () {
    if (window.electronAPI) return; // Electron com backend real: não interfere.

    const { SOURCES, createInitialDb, createCaseFactory, buildCardFromCase, formatDate, daysFromToday } = window.ExtraHubMockData;
    const STORAGE_KEY = 'extrahub-demo-db-v1';
    const DEFAULT_BASE_PATH = 'C:\\Users\\demo\\Documents\\ExtraHUB';

    window.EXTRAHUB_DEMO = true;

    // ---------------------------------------------------------------- estado
    const storage = {
        get(key) { try { return window.localStorage.getItem(key); } catch (e) { return null; } },
        set(key, value) { try { window.localStorage.setItem(key, value); } catch (e) { /* modo privado */ } },
        remove(key) { try { window.localStorage.removeItem(key); } catch (e) { /* ignore */ } },
    };

    function loadDb() {
        const raw = storage.get(STORAGE_KEY);
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                if (parsed && parsed.version === 1) return parsed;
            } catch (e) { /* base corrompida: recria */ }
        }
        return createInitialDb();
    }

    let db = loadDb();
    const save = () => storage.set(STORAGE_KEY, JSON.stringify(db));
    const nextId = (prefix) => `${prefix}_${(db.idCounter++).toString(36)}`;
    save();

    // Pasta de trabalho já definida para que as automações possam ser testadas direto.
    if (!storage.get('extrahub-basepath')) storage.set('extrahub-basepath', DEFAULT_BASE_PATH);

    const caseFactory = createCaseFactory(Math.random);

    // -------------------------------------------------------------- eventos
    const listeners = {};
    const on = (channel, cb) => { (listeners[channel] = listeners[channel] || []).push(cb); };
    const emit = (channel, ...args) => (listeners[channel] || []).forEach(cb => { try { cb(...args); } catch (e) { console.error(e); } });
    const log = (msg) => emit('log', msg);
    const finishTask = (msg) => emit('task-finished', msg);
    const errorTask = (msg) => emit('task-error', msg);

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const latency = (min = 250, max = 700) => sleep(min + Math.random() * (max - min));
    const clone = (o) => JSON.parse(JSON.stringify(o));
    const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
    const joinPath = (...parts) => parts.filter(Boolean).join('\\');

    class DemoError extends Error {}

    // Simula o `runTask` de electron/handlers/utils.js (log de início/fim/erro).
    async function runLoggedTask(taskName, logic) {
        log(`>>> Iniciando tarefa: ${taskName}...`);
        try {
            const result = await logic();
            finishTask(`Tarefa '${taskName}' concluída com sucesso!`);
            return result;
        } catch (error) {
            errorTask(`ERRO na tarefa '${taskName}': ${error.message}`);
            if (!(error instanceof DemoError)) console.error(error);
            return undefined; // tarefas "fire and forget" não devem gerar rejeição não tratada
        }
    }

    // ------------------------------------------------------ login assistido
    let pendingAssistedLogin = null;
    function waitForAssistedLogin(siteName, url) {
        log(`Abrindo janela de login assistido: ${url}`);
        log(`[DEMO] Nenhuma janela real é aberta. Clique em "Confirmar Login" para simular que você entrou em ${siteName}.`);
        emit('assisted-login-started');
        return new Promise((resolve) => { pendingAssistedLogin = resolve; }).then((confirmed) => {
            emit('assisted-login-finished');
            if (!confirmed) throw new DemoError('Login cancelado pelo usuário.');
            log(`Login em ${siteName} confirmado pelo usuário.`);
        });
    }
    const resolveAssistedLogin = (value) => {
        if (pendingAssistedLogin) { const r = pendingAssistedLogin; pendingAssistedLogin = null; r(value); }
    };

    // ------------------------------------------------------------ automações
    const AUTOMATIONS = {
        'automation:run-gov-download': { name: 'Consumidor.gov', source: 'Gov', login: 'assisted', url: 'https://consumidor.gov.br/pages/administrativo/login', file: 'relatorio_consumidor_gov.csv' },
        'automation:run-hugme-download': { name: 'HugMe', source: 'HugMe', login: 'assisted', url: 'https://app.hugme.com.br/', file: 'relatorio_hugme.xlsx' },
        'automation:run-proconsp-download': { name: 'Procon-SP', source: 'SP', login: 'assisted', url: 'https://fornecedor2.procon.sp.gov.br/#/login', file: 'relatorio_procon_sp.xlsx' },
        'automation:run-proconsumidor-download': { name: 'Proconsumidor', source: 'Proconsumidor', login: 'credentials', url: 'https://proconsumidor.mj.gov.br/', file: 'relatorio_proconsumidor.xlsx', multiCompany: true },
        'automation:run-procon-sjc-download': { name: 'Procon SJC', source: 'SJC', login: 'credentials', url: 'https://procon.sjc.sp.gov.br/fornecedor', file: 'relatorio_sjc.csv' },
        'automation:run-procon-campinas-download': { name: 'Procon Campinas', source: 'Campinas', login: 'credentials', url: 'https://procon.campinas.sp.gov.br/fornecedor', file: 'relatorio_campinas.csv' },
        'automation:run-bcb-rdr-download': { name: 'BCB-RDR', source: 'BCB_RDR', login: 'credentials', url: 'https://www3.bcb.gov.br/rdrweb', file: 'relatorio_bcb_rdr.xlsx' },
        'api:fetch-uberlandia': { name: 'API Procon Uberlândia', source: 'Uberlandia', login: 'api', url: 'https://api.procon.uberlandia.mg.gov.br', file: 'dados_uberlandia.xlsx' },
    };

    function resolvePeriod(startDate, endDate) {
        const yesterday = formatDate(daysFromToday(-1));
        return { start: startDate || '01/01/2020', end: endDate || yesterday };
    }

    async function runDownloadAutomation(ipcName, { basePath, startDate, endDate } = {}) {
        const cfg = AUTOMATIONS[ipcName];
        const isApi = cfg.login === 'api';
        const label = isApi ? cfg.name : `Automação ${cfg.name}`;
        log(`>>> Iniciando ${isApi ? 'tarefa' : 'automação'} ${cfg.name}...`);
        try {
            await latency(400, 800);
            if (cfg.login === 'api') {
                log('Token de autorização carregado do .env (simulado).');
                await latency();
                log(`Consultando ${cfg.url}/reclamacoes ...`);
            } else {
                log('Usando Chromium em: (simulado — modo demonstração)');
                await latency();
                if (cfg.login === 'assisted') {
                    await waitForAssistedLogin(cfg.name, cfg.url);
                } else {
                    log(`Página de login acessada: ${cfg.url}`);
                    await latency();
                    log('Login realizado com as credenciais do .env (simulado). Definindo período...');
                }
            }

            const { start, end } = resolvePeriod(startDate, endDate);
            await latency();
            log(`Busca de ${start} a ${end} realizada. Aguardando ${isApi ? 'resposta' : 'download'}...`);

            const folder = joinPath(basePath || DEFAULT_BASE_PATH, SOURCES[cfg.source].folder);
            const records = [];
            const companies = cfg.multiCompany ? ['Banco Exemplo S.A.', 'Financeira Modelo', 'Crédito Fácil Demo'] : [null];
            const files = [];
            for (const company of companies) {
                await latency(500, 1100);
                const n = randInt(2, 4);
                for (let i = 0; i < n; i++) records.push(caseFactory(cfg.source, company ? { Fornecedor_Empresa: company } : {}));
                const fileName = company ? cfg.file.replace('.xlsx', `_${company.split(' ')[0].toLowerCase()}.xlsx`) : cfg.file;
                files.push(fileName);
                if (company) log(`Empresa "${company}": ${n} registro(s) encontrados.`);
                log(`${isApi ? 'Dados da API salvos' : 'Relatório salvo com sucesso'} em: ${joinPath(folder, fileName)}`);
            }

            db.pipeline.downloads[cfg.source] = { files, records, at: new Date().toISOString() };
            save();
            log(`[DEMO] ${records.length} reclamação(ões) fictícia(s) gerada(s). Vá em "Processamento de Dados" para levá-las até a Base Mãe.`);
            finishTask(isApi ? `Tarefa '${cfg.name}' concluída com sucesso!` : `${label} concluída!`);
        } catch (error) {
            errorTask(isApi ? `ERRO na tarefa '${cfg.name}': ${error.message}` : `ERRO na automação ${cfg.name}: ${error.message}`);
        }
    }

    // -------------------------------------------------------------- pipeline
    const pipelineHandlers = {
        'pipeline:consolidate-all': ({ basePath }) => runLoggedTask('Consolidar Relatórios Locais', async () => {
            const root = basePath || DEFAULT_BASE_PATH;
            const sources = Object.keys(db.pipeline.downloads);
            await latency();
            if (sources.length === 0) {
                log(`Nenhum relatório encontrado em ${root}.`);
                log('[DEMO] Execute ao menos uma automação na tela "Automações" para gerar relatórios fictícios.');
                db.pipeline.consolidated = [];
                save();
                return;
            }
            for (const source of sources) {
                const dl = db.pipeline.downloads[source];
                await latency(300, 700);
                log(`Consolidando ${dl.files.length} arquivo(s) de ${SOURCES[source].label} → ${joinPath(root, 'Consolidados', `Consolidado_${source}.xlsx`)} (${dl.records.length} linhas)`);
            }
            db.pipeline.consolidated = sources;
            save();
        }),

        'pipeline:create-raw-base': ({ basePath }) => runLoggedTask('Criar Base Bruta Local', async () => {
            const root = basePath || DEFAULT_BASE_PATH;
            await latency();
            if (!db.pipeline.consolidated.length) throw new DemoError('Nenhum arquivo consolidado encontrado. Execute a etapa 1 primeiro.');
            for (const source of db.pipeline.consolidated) {
                await latency(200, 500);
                log(`Adicionando aba "${source}" à base bruta (${(db.pipeline.downloads[source] || { records: [] }).records.length} linhas).`);
            }
            log(`Base bruta salva em: ${joinPath(root, 'Base_Mae_Bruta.xlsx')}`);
            db.pipeline.rawBase = [...db.pipeline.consolidated];
            save();
        }),

        'pipeline:generate-master-base': ({ basePath }) => runLoggedTask('Gerar Base Mãe Final Local', async () => {
            const root = basePath || DEFAULT_BASE_PATH;
            await latency();
            if (!db.pipeline.rawBase.length) throw new DemoError(`Arquivo não encontrado: ${joinPath(root, 'Base_Mae_Bruta.xlsx')}. Execute a etapa 2 primeiro.`);
            const finalRows = [];
            for (const source of db.pipeline.rawBase) {
                const rows = (db.pipeline.downloads[source] || { records: [] }).records;
                await latency(200, 500);
                log(`Padronizando ${rows.length} linha(s) da aba "${source}" para as 23 colunas da Base Mãe...`);
                finalRows.push(...rows);
            }
            await latency();
            log('Normalizando datas (dd/mm/aaaa), CPFs e protocolos...');
            log(`Base_Mae_Final.xlsx gerada com ${finalRows.length} registro(s) em: ${joinPath(root, 'Base_Mae_Final.xlsx')}`);
            db.pipeline.finalBase = finalRows;
            save();
        }),

        'pipeline:upload-master-base-to-sheets': () => runLoggedTask('Upload Base Mãe para Google Sheets', async () => {
            await latency();
            if (!db.pipeline.finalBase.length) throw new DemoError('Base_Mae_Final.xlsx local não encontrada. Execute a etapa 3 primeiro.');
            log('Lendo IDs existentes na aba "Base_Mae_Final" do Google Sheets (simulado)...');
            await latency(500, 900);
            const existing = new Set(db.sheets.Base_Mae_Final.map(c => c.ID_Reclamacao_Unico));
            const newRows = db.pipeline.finalBase.filter(r => !existing.has(r.ID_Reclamacao_Unico));
            log(`${db.pipeline.finalBase.length} registro(s) locais, ${newRows.length} novo(s).`);
            if (newRows.length === 0) {
                log('Nenhum registro novo para enviar. A planilha online já está atualizada.');
                return;
            }
            await latency(500, 900);
            db.sheets.Base_Mae_Final.push(...newRows.map(r => ({ ...r, STATUS: 'Novo' })));
            save();
            log(`${newRows.length} registro(s) adicionados com STATUS "Novo".`);
            log('[DEMO] Os novos casos já aparecem em "Atribuição de Casos".');
        }),
    };

    // ------------------------------------------------------- dados (Sheets/Trello)
    const sheets = () => db.sheets;
    const boardName = (id) => (db.trello.boards.find(b => b.id === id) || {}).name || id;

    function findOrCreateLabel(boardId, name, color) {
        let label = db.trello.labels.find(l => l.boardId === boardId && l.name.toLowerCase() === name.toLowerCase());
        if (!label) {
            label = { id: nextId('lbl'), boardId, name, color };
            db.trello.labels.push(label);
        }
        return label;
    }

    const dataHandlers = {
        'auth:app-login': async ({ username, password, userType }) => {
            await latency(500, 900);
            if (!userType) throw new DemoError('O tipo de perfil (Gestor ou Analista) não foi especificado.');
            if (userType === 'gestor') {
                const m = sheets().Gestores.find(x => x.Nome_Gestor === username && x.CPF_Gestor === password);
                if (!m) throw new DemoError('Nome de gestor ou CPF inválidos.');
                const allowedBoardIds = sheets().Acessos_Quadros.filter(r => r.ID_Gestor_Trello === m.ID_Trello).map(r => r.ID_Quadro_Trello);
                return { success: true, user: { name: m.Nome_Gestor, trelloId: m.ID_Trello, trelloUsername: m.Username_Trello, allowedBoardIds, role: 'gestor' } };
            }
            if (userType === 'analista') {
                const a = sheets().Analistas.find(x => x.Nome_Analista === username && x.CPF_Analista === password);
                if (!a) throw new DemoError('Nome de analista ou CPF inválidos.');
                return { success: true, user: { name: a.Nome_Analista, role: 'analista', boardId: a.ID_Quadro_Trello, trelloLabelName: a.Nome_Analista } };
            }
            throw new DemoError(`Tipo de perfil desconhecido: ${userType}`);
        },

        'auth:clear-trello-session': async () => ({ success: true }),
        'auth:check-google-status': async () => { await latency(300, 600); return { isConnected: true }; },
        'auth:check-trello-session': async () => { await latency(150, 300); return { isAuthenticated: db.trello.sessionAuthenticated }; },
        'auth:interactive-trello-login': async () => { await latency(); db.trello.sessionAuthenticated = true; save(); return { success: true }; },

        'trello:get-boards': async () => { await latency(); return clone(db.trello.boards); },
        'data:get-managers': async () => { await latency(); return clone(sheets().Gestores); },
        'data:get-analysts': async () => { await latency(); return clone(sheets().Analistas); },

        'data:get-all-workspace-data': async () => {
            await latency(500, 900);
            return {
                analysts: clone(sheets().Analistas),
                managers: clone(sheets().Gestores),
                accessRules: clone(sheets().Acessos_Quadros),
                boards: clone(db.trello.boards),
            };
        },

        'data:update-access': async ({ managerId, boardId, hasAccess }) => {
            await latency();
            const rules = sheets().Acessos_Quadros;
            const idx = rules.findIndex(r => r.ID_Gestor_Trello === managerId && r.ID_Quadro_Trello === boardId);
            if (hasAccess && idx === -1) rules.push({ ID_Gestor_Trello: managerId, ID_Quadro_Trello: boardId });
            if (!hasAccess && idx !== -1) rules.splice(idx, 1);
            save();
            return { success: true };
        },

        'data:add-analyst': async ({ name, cpf, boardId }) => {
            await latency();
            if (!boardId) throw new DemoError('O quadro Trello de destino não foi selecionado.');
            const list = sheets().Analistas;
            if (list.some(a => a.Nome_Analista === name && a.CPF_Analista === cpf && a.ID_Quadro_Trello === boardId)) {
                throw new DemoError('Este analista já está cadastrado para este quadro.');
            }
            const label = findOrCreateLabel(boardId, name, 'blue');
            list.push({ Nome_Analista: name, CPF_Analista: cpf, ID_Etiqueta_Trello: label.id, ID_Quadro_Trello: boardId });
            save();
            return { success: true };
        },

        'data:delete-analyst': async ({ name, cpf, boardId }) => {
            await latency();
            const list = sheets().Analistas;
            const idx = list.findIndex(a => a.Nome_Analista === name && a.CPF_Analista === cpf && a.ID_Quadro_Trello === boardId);
            if (idx === -1) throw new DemoError('Analista não encontrado para este quadro.');
            list.splice(idx, 1);
            save();
            return { success: true };
        },

        'data:getAssignableData': async () => {
            await latency(500, 900);
            return {
                cases: clone(sheets().Base_Mae_Final.filter(c => c.STATUS && c.STATUS.toLowerCase() === 'novo')),
                analysts: clone(sheets().Analistas),
                managers: clone(sheets().Gestores),
            };
        },

        'data:submitAssignments': async ({ assignments, boardId }) => {
            await latency(700, 1200);
            const analystLabel = new Map(sheets().Analistas.map(a => [`${a.Nome_Analista}-${a.ID_Quadro_Trello}`, a.ID_Etiqueta_Trello]));
            let created = 0;
            for (const { caseId, analystName, managerId } of assignments) {
                const c = sheets().Base_Mae_Final.find(x => x.ID_Reclamacao_Unico === caseId);
                if (!c || !managerId) continue;
                const labels = [];
                const lbl = analystLabel.get(`${analystName}-${boardId}`);
                if (lbl) labels.push(lbl);
                if (c.Fornecedor_Empresa) labels.push(findOrCreateLabel(boardId, c.Fornecedor_Empresa, 'orange').id);
                const cardId = nextId('card');
                db.trello.cards.push(buildCardFromCase(c, { cardId, boardId, listName: 'Entrantes', analystName, managerId, labels }));
                Object.assign(c, { OPERADOR: analystName, RESPONSAVEL_TRELLO: analystName, STATUS: 'Processado', ID_Card_Trello: cardId });
                created++;
            }
            save();
            return { success: true, message: `${assignments.length} atribuições processadas. ${created} cards criados no Trello (quadro "${boardName(boardId)}", lista "Entrantes").` };
        },

        'search:find-cpf': async ({ cpf }) => {
            await latency(500, 1000);
            const clean = String(cpf).replace(/\D/g, '');
            const results = sheets().Base_Mae_Final
                .filter(r => String(r.Consumidor_CPF || '').replace(/\D/g, '') === clean)
                .map(r => ({ nome: r.Consumidor_Nome, protocolo: r.Protocolo_Origem, fonte: r.Fonte_Dados, dataAbertura: r.Data_Abertura, dataFinalizacao: r.Data_Finalizacao, status: r.Status_Atual }));
            return { count: results.length, cpf: clean, results };
        },

        'search:find-audiencias': async () => {
            await latency(500, 1000);
            const audiencias = sheets().Base_Mae_Final
                .filter(r => String(r.Status_Atual || '').toLowerCase().includes('audiência'))
                .map(r => ({ Protocolo_Origem: r.Protocolo_Origem, Consumidor_Nome: r.Consumidor_Nome, Data_Abertura: r.Data_Abertura, Prazo_Resposta: r.Prazo_Resposta }));
            return { count: audiencias.length, audiencias };
        },
    };

    // --------------------------------------------------------- API pública
    window.electronAPI = {
        isDemo: true,
        selectDirectory: async () => {
            await latency(200, 400);
            const current = storage.get('extrahub-basepath') || DEFAULT_BASE_PATH;
            let chosen;
            try {
                chosen = window.prompt('[Modo demonstração] Não há acesso ao sistema de arquivos.\nDigite um caminho fictício para a pasta de trabalho:', current);
            } catch (e) { /* prompt indisponível (ex.: Electron) */ }
            if (chosen === undefined) return current;
            return chosen && chosen.trim() ? chosen.trim() : null;
        },
        onLog: (cb) => on('log', cb),
        onTaskFinished: (cb) => on('task-finished', cb),
        onTaskError: (cb) => on('task-error', cb),
        startGovLogin: () => runDownloadAutomation('automation:run-gov-download', {}),
        startProconSpLogin: () => runDownloadAutomation('automation:run-proconsp-download', {}),
        startHugmeLogin: () => runDownloadAutomation('automation:run-hugme-download', {}),
        confirmLogin: () => resolveAssistedLogin(true),
        cancelLogin: () => resolveAssistedLogin(false),
        onAssistedLoginStarted: (cb) => on('assisted-login-started', cb),
        onAssistedLoginFinished: (cb) => on('assisted-login-finished', cb),
        runTask: (taskName, args) => {
            args = args || {};
            if (AUTOMATIONS[taskName]) return runDownloadAutomation(taskName, args);
            if (pipelineHandlers[taskName]) return pipelineHandlers[taskName](args);
            if (dataHandlers[taskName]) return dataHandlers[taskName](args);
            return Promise.reject(new Error(`[Demo] O canal "${taskName}" não possui simulação.`));
        },
    };

    // Helpers usados pelos componentes exclusivos do modo demo (Trello simulado, banner).
    window.ExtraHubDemo = {
        reset() {
            storage.remove(STORAGE_KEY);
            storage.remove('extrahub-basepath');
            window.location.reload();
        },
        getAccounts() {
            return {
                gestores: sheets().Gestores.map(m => ({ name: m.Nome_Gestor, cpf: m.CPF_Gestor, role: 'gestor' })),
                analistas: sheets().Analistas.map(a => ({ name: a.Nome_Analista, cpf: a.CPF_Analista, role: 'analista', board: boardName(a.ID_Quadro_Trello) })),
            };
        },
        getSampleCpf: () => db.sampleCpf,
        getBoard(boardId) {
            return {
                board: clone(db.trello.boards.find(b => b.id === boardId) || null),
                lists: clone(db.trello.lists),
                labels: clone(db.trello.labels.filter(l => l.boardId === boardId)),
                cards: clone(db.trello.cards.filter(c => c.boardId === boardId)),
                members: clone(sheets().Gestores.map(m => ({ id: m.ID_Trello, name: m.Nome_Gestor }))),
            };
        },
        moveCard(cardId, listName) {
            const card = db.trello.cards.find(c => c.id === cardId);
            if (card && db.trello.lists.includes(listName)) { card.listName = listName; save(); }
        },
    };

    console.info('%cExtraHUB em modo demonstração — todas as conexões externas são simuladas.', 'color:#2563eb;font-weight:bold');
})();
