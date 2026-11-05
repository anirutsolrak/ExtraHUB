/*
 * ExtraHUB — Modo Demonstração
 * Base de dados FICTÍCIA usada para simular Google Sheets e Trello.
 * Nenhum dado aqui corresponde a pessoas ou empresas reais.
 */
(function () {
    // PRNG determinístico para que a base inicial seja sempre a mesma.
    function mulberry32(seed) {
        return function () {
            seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
            let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    const pad = (n) => String(n).padStart(2, '0');
    const formatDate = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
    const daysFromToday = (n) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return d; };

    const BOARDS = [
        { id: 'board_gov', name: 'Consumidor.gov' },
        { id: 'board_hugme', name: 'HugMe' },
        { id: 'board_sp', name: 'Procon-SP' },
        { id: 'board_proconsumidor', name: 'Proconsumidor' },
        { id: 'board_sjc', name: 'Procon SJC' },
        { id: 'board_campinas', name: 'Procon Campinas' },
        { id: 'board_bcb', name: 'Bacen - BCB RDR' },
        { id: 'board_uberlandia', name: 'Procon Uberlandia' },
    ];

    // Fonte_Dados (prefixo do ID_Reclamacao_Unico) -> quadro / canal
    const SOURCES = {
        Gov: { boardId: 'board_gov', canal: 'Consumidor.gov.br', folder: 'Consumidor_Gov', label: 'Consumidor.gov' },
        HugMe: { boardId: 'board_hugme', canal: 'Reclame Aqui (HugMe)', folder: 'HugMe', label: 'HugMe' },
        SP: { boardId: 'board_sp', canal: 'Procon-SP', folder: 'Procon_SP', label: 'Procon-SP' },
        Proconsumidor: { boardId: 'board_proconsumidor', canal: 'ProConsumidor', folder: 'Proconsumidor', label: 'Proconsumidor' },
        SJC: { boardId: 'board_sjc', canal: 'Procon SJC', folder: 'Procon_SJC', label: 'Procon SJC' },
        Campinas: { boardId: 'board_campinas', canal: 'Procon Campinas', folder: 'Procon_Campinas', label: 'Procon Campinas' },
        BCB_RDR: { boardId: 'board_bcb', canal: 'Banco Central (RDR)', folder: 'BCB_RDR', label: 'BCB-RDR' },
        Uberlandia: { boardId: 'board_uberlandia', canal: 'Procon Uberlândia (API)', folder: 'Procon_Uberlandia', label: 'Procon Uberlândia' },
    };

    const MANAGERS = [
        { Nome_Gestor: 'Gestor Demo', CPF_Gestor: '11111111111', ID_Trello: 'mgr_demo', Username_Trello: 'gestor.demo' },
        { Nome_Gestor: 'Mariana Lopes', CPF_Gestor: '22222222222', ID_Trello: 'mgr_mariana', Username_Trello: 'mariana.lopes' },
        { Nome_Gestor: 'Rafael Souza', CPF_Gestor: '33333333333', ID_Trello: 'mgr_rafael', Username_Trello: 'rafael.souza' },
    ];

    const ANALYSTS = [
        { Nome_Analista: 'Analista Demo', CPF_Analista: '44444444444', ID_Quadro_Trello: 'board_gov' },
        { Nome_Analista: 'Beatriz Lima', CPF_Analista: '55555555555', ID_Quadro_Trello: 'board_gov' },
        { Nome_Analista: 'Lucas Pereira', CPF_Analista: '66666666666', ID_Quadro_Trello: 'board_sp' },
        { Nome_Analista: 'Juliana Alves', CPF_Analista: '77777777777', ID_Quadro_Trello: 'board_hugme' },
        { Nome_Analista: 'Pedro Santos', CPF_Analista: '88888888888', ID_Quadro_Trello: 'board_bcb' },
        { Nome_Analista: 'Camila Rocha', CPF_Analista: '99999999999', ID_Quadro_Trello: 'board_proconsumidor' },
        { Nome_Analista: 'Thiago Martins', CPF_Analista: '12121212121', ID_Quadro_Trello: 'board_sjc' },
        { Nome_Analista: 'Larissa Gomes', CPF_Analista: '13131313131', ID_Quadro_Trello: 'board_campinas' },
        { Nome_Analista: 'Bruno Ferreira', CPF_Analista: '14141414141', ID_Quadro_Trello: 'board_uberlandia' },
    ];

    const ACCESS_RULES = [
        ...BOARDS.map(b => ({ ID_Gestor_Trello: 'mgr_demo', ID_Quadro_Trello: b.id })),
        { ID_Gestor_Trello: 'mgr_mariana', ID_Quadro_Trello: 'board_gov' },
        { ID_Gestor_Trello: 'mgr_mariana', ID_Quadro_Trello: 'board_hugme' },
        { ID_Gestor_Trello: 'mgr_mariana', ID_Quadro_Trello: 'board_sp' },
        { ID_Gestor_Trello: 'mgr_rafael', ID_Quadro_Trello: 'board_bcb' },
        { ID_Gestor_Trello: 'mgr_rafael', ID_Quadro_Trello: 'board_proconsumidor' },
    ];

    const FIRST_NAMES = ['Ana', 'João', 'Maria', 'José', 'Paula', 'Carlos', 'Fernanda', 'Ricardo', 'Patrícia', 'Marcos', 'Aline', 'Gustavo', 'Renata', 'Eduardo', 'Simone', 'Rodrigo', 'Vanessa', 'Fábio', 'Cláudia', 'André'];
    const LAST_NAMES = ['Silva', 'Souza', 'Oliveira', 'Costa', 'Pereira', 'Almeida', 'Nascimento', 'Carvalho', 'Ribeiro', 'Barbosa', 'Moreira', 'Teixeira', 'Mendes', 'Cardoso'];
    const CITIES = [['São Paulo', 'SP'], ['Campinas', 'SP'], ['São José dos Campos', 'SP'], ['Uberlândia', 'MG'], ['Belo Horizonte', 'MG'], ['Rio de Janeiro', 'RJ'], ['Curitiba', 'PR'], ['Salvador', 'BA'], ['Recife', 'PE'], ['Porto Alegre', 'RS']];
    const COMPANIES = ['Banco Exemplo S.A.', 'Financeira Modelo', 'Crédito Fácil Demo', 'Cartões Fictícios Ltda'];
    const AGE_RANGES = ['21 a 30 anos', '31 a 40 anos', '41 a 50 anos', '51 a 60 anos', '61 a 70 anos', 'mais de 70 anos'];
    const DESCRIPTIONS = [
        'Consumidor solicita cópia do contrato de empréstimo consignado.',
        'Contesta cobrança de tarifa que afirma não reconhecer.',
        'Pede cancelamento do cartão e estorno da anuidade cobrada.',
        'Alega desconto indevido em folha de pagamento.',
        'Solicita portabilidade de crédito que não foi atendida.',
        'Reclama de dificuldade para quitar o contrato antecipadamente.',
        'Informa que não recebeu o boleto de quitação solicitado.',
        'Questiona juros aplicados em parcela paga com atraso.',
    ];
    const OPEN_STATUSES = ['Aguardando resposta do fornecedor', 'Em análise pelo órgão', 'Respondida pelo fornecedor'];
    const HEARING_STATUSES = ['Audiência agendada', 'Audiência de conciliação designada'];
    const CLOSED_STATUSES = ['Finalizada - Resolvida', 'Finalizada - Não resolvida'];

    function createCaseFactory(rng) {
        const pick = (arr) => arr[Math.floor(rng() * arr.length)];
        const digits = (n) => Array.from({ length: n }, () => Math.floor(rng() * 10)).join('');

        return function makeCase(source, overrides = {}) {
            const first = pick(FIRST_NAMES);
            const last = `${pick(LAST_NAMES)} ${pick(LAST_NAMES)}`;
            const name = `${first} ${last}`;
            const [city, uf] = pick(CITIES);
            const openedDaysAgo = 2 + Math.floor(rng() * 40);
            const protocol = source === 'BCB_RDR' ? `RDR${digits(9)}` : `${new Date().getFullYear()}${digits(7)}`;
            const c = {
                ID_Reclamacao_Unico: `${source}_${protocol}`,
                Protocolo_Origem: protocol,
                Fonte_Dados: source,
                Data_Abertura: formatDate(daysFromToday(-openedDaysAgo)),
                Data_Finalizacao: '',
                Prazo_Resposta: formatDate(daysFromToday(-openedDaysAgo + 10)),
                Canal_Origem: SOURCES[source].canal,
                Consumidor_Nome: name,
                Consumidor_CPF: digits(11),
                Consumidor_Cidade: city,
                Consumidor_UF: uf,
                Consumidor_Email: `${first.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}.demo@exemplo.com`,
                Consumidor_Celular: `(${digits(2)}) 9${digits(4)}-${digits(4)}`,
                Consumidor_Faixa_Etaria: pick(AGE_RANGES),
                Consumidor_Genero: pick(['Feminino', 'Masculino']),
                Fornecedor_Empresa: pick(COMPANIES),
                Descricao_Reclamacao: pick(DESCRIPTIONS),
                Status_Atual: pick(OPEN_STATUSES),
                Resultado_Final: '',
                OPERADOR: '',
                RESPONSAVEL_TRELLO: '',
                STATUS: 'Novo',
                ID_Card_Trello: '',
                ...overrides,
            };
            return c;
        };
    }

    function buildCardFromCase(caseData, { cardId, boardId, listName, analystName, managerId, labels }) {
        let desc = `**Solicitação:**\nCÓPIA DE CONTRATO\n\n`;
        desc += `**Contrato(s):** N/A\n`;
        desc += `**Telefone:** ${caseData.Consumidor_Celular || 'N/A'}\n`;
        desc += `**Empresa:** ${caseData.Fornecedor_Empresa || 'N/A'}\n`;
        desc += `**Descrição:** ${caseData.Descricao_Reclamacao || 'N/A'}\n`;
        desc += `**Link Original:** N/A`;
        return {
            id: cardId,
            boardId,
            listName,
            name: `${analystName || 'N/A'} | ${caseData.Consumidor_Nome || 'N/A'} - ${caseData.Consumidor_CPF || 'N/A'} | [${caseData.Protocolo_Origem || 'N/A'}]`,
            desc,
            labelIds: labels,
            memberIds: managerId ? [managerId] : [],
            start: caseData.Data_Abertura,
            due: caseData.Prazo_Resposta,
            caseId: caseData.ID_Reclamacao_Unico,
        };
    }

    function createInitialDb() {
        const rng = mulberry32(20240607);
        const makeCase = createCaseFactory(rng);
        let idCounter = 1;
        const nextId = (prefix) => `${prefix}_${(idCounter++).toString(36)}`;

        const labels = [];
        const analysts = ANALYSTS.map(a => {
            const label = { id: nextId('lbl'), boardId: a.ID_Quadro_Trello, name: a.Nome_Analista, color: 'blue' };
            labels.push(label);
            return { Nome_Analista: a.Nome_Analista, CPF_Analista: a.CPF_Analista, ID_Etiqueta_Trello: label.id, ID_Quadro_Trello: a.ID_Quadro_Trello };
        });

        const getLabel = (boardId, name, color) => {
            let l = labels.find(x => x.boardId === boardId && x.name.toLowerCase() === name.toLowerCase());
            if (!l) { l = { id: nextId('lbl'), boardId, name, color }; labels.push(l); }
            return l;
        };

        const cases = [];
        const cards = [];
        const managersByBoard = (boardId) => ACCESS_RULES.filter(r => r.ID_Quadro_Trello === boardId).map(r => r.ID_Gestor_Trello);

        Object.keys(SOURCES).forEach((source, sIdx) => {
            const boardId = SOURCES[source].boardId;
            const boardAnalysts = analysts.filter(a => a.ID_Quadro_Trello === boardId);
            const total = source === 'Gov' ? 9 : 6;
            for (let i = 0; i < total; i++) {
                const isNew = i < 3;
                let status = OPEN_STATUSES[i % OPEN_STATUSES.length];
                if (i === 3 || (i === 4 && sIdx % 2 === 0)) status = HEARING_STATUSES[(i + sIdx) % 2];
                if (i >= 5) status = CLOSED_STATUSES[(i + sIdx) % 2];

                const c = makeCase(source, { Status_Atual: status });
                if (status.startsWith('Finalizada')) {
                    c.Data_Finalizacao = formatDate(daysFromToday(-1 - (i % 3)));
                    c.Resultado_Final = status.endsWith('Não resolvida') ? 'Não resolvida' : 'Resolvida';
                }
                if (!isNew && boardAnalysts.length) {
                    const analyst = boardAnalysts[i % boardAnalysts.length];
                    const managerIds = managersByBoard(boardId);
                    const managerId = managerIds[i % managerIds.length];
                    const cardId = nextId('card');
                    const listName = status.startsWith('Finalizada') ? 'Concluído'
                        : status === 'Respondida pelo fornecedor' ? 'Aguardando Retorno' : 'Em Análise';
                    c.OPERADOR = analyst.Nome_Analista;
                    c.RESPONSAVEL_TRELLO = analyst.Nome_Analista;
                    c.STATUS = 'Processado';
                    c.ID_Card_Trello = cardId;
                    cards.push(buildCardFromCase(c, {
                        cardId, boardId, listName, analystName: analyst.Nome_Analista, managerId,
                        labels: [analyst.ID_Etiqueta_Trello, getLabel(boardId, c.Fornecedor_Empresa, 'orange').id],
                    }));
                }
                cases.push(c);
            }
        });

        // Consumidor com várias reclamações em fontes diferentes (bom para testar a Consulta CPF).
        const sampleCpf = '12345678909';
        [['Gov', 'Audiência agendada'], ['SP', 'Aguardando resposta do fornecedor'], ['BCB_RDR', 'Finalizada - Resolvida']].forEach(([source, status]) => {
            const c = makeCase(source, {
                Consumidor_Nome: 'Fernanda Oliveira Demo', Consumidor_CPF: sampleCpf, Consumidor_Email: 'fernanda.demo@exemplo.com',
                Status_Atual: status,
            });
            if (status.startsWith('Finalizada')) { c.Data_Finalizacao = formatDate(daysFromToday(-2)); c.Resultado_Final = 'Resolvida'; }
            cases.push(c);
        });

        return {
            version: 1,
            idCounter,
            settings: { basePath: null },
            sheets: {
                Gestores: MANAGERS.map(m => ({ ...m })),
                Analistas: analysts,
                Acessos_Quadros: ACCESS_RULES.map(r => ({ ...r })),
                Base_Mae_Final: cases,
            },
            trello: {
                sessionAuthenticated: true,
                boards: BOARDS.map(b => ({ ...b })),
                lists: ['Entrantes', 'Em Análise', 'Aguardando Retorno', 'Concluído'],
                labels,
                cards,
            },
            pipeline: { downloads: {}, consolidated: [], rawBase: [], finalBase: [] },
            sampleCpf,
        };
    }

    window.ExtraHubMockData = {
        SOURCES,
        createInitialDb,
        createCaseFactory,
        buildCardFromCase,
        mulberry32,
        formatDate,
        daysFromToday,
    };
})();
