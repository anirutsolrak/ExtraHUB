function App() {
    const [activeTab, setActiveTab] = React.useState('automations');
    const [log, setLog] = React.useState("");
    const [isModalOpen, setIsModalOpen] = React.useState(false);
    const [currentTask, setCurrentTask] = React.useState(null);
    const [basePath, setBasePath] = React.useState(localStorage.getItem('extrahub-basepath') || null);
    const [searchResults, setSearchResults] = React.useState(null);
    const [isSearching, setIsSearching] = React.useState(false);
    const [startDate, setStartDate] = React.useState('');
    const [endDate, setEndDate] = React.useState('');
    const [showLoginConfirmModal, setShowLoginConfirmModal] = React.useState(false);

    const automationsConfig = [
        { id: 1, name: "Consumidor.gov: Baixar Relatórios", ipcName: 'automation:run-gov-download', category: "Download", needsLogin: true, usesDates: true, description: "Login integrado via Gov.br." },
        { id: 2, name: "HugMe: Baixar Relatórios", ipcName: 'automation:run-hugme-download', category: "Download", needsLogin: true, usesDates: true, description: "Gera e baixa relatórios da plataforma." },
        { id: 3, name: "Procon-SP: Baixar Relatórios", ipcName: 'automation:run-proconsp-download', category: "Download", needsLogin: true, usesDates: true, description: "Login integrado via Gov.br." },
        { id: 4, name: "Proconsumidor: Baixar Relatórios", ipcName: 'automation:run-proconsumidor-download', category: "Download", usesDates: true, description: "Baixa relatórios de todas as empresas." },
        { id: 5, name: "Procon SJC: Baixar Relatório", ipcName: 'automation:run-procon-sjc-download', category: "Download", usesDates: true, description: "Baixa o relatório completo de SJC." },
        { id: 6, name: "Procon Campinas: Baixar Relatório", ipcName: 'automation:run-procon-campinas-download', category: "Download", usesDates: true, description: "Baixa o relatório completo de Campinas." },
        { id: 7, name: "BCB-RDR: Baixar Relatórios", ipcName: 'automation:run-bcb-rdr-download', category: "Download", usesDates: true, description: "Baixa os relatórios do Banco Central." },
        { id: 15, name: "Procon Uberlândia: Gerar Dados", ipcName: 'api:fetch-uberlandia', category: "API", usesDates: true, description: "Busca dados via API e salva em XLSX." },

        { id: 8, name: "Proconsumidor: Consolidar", ipcName: 'data:consolidate-proconsumidor', category: "Consolidação", description: "Cria abas por empresa em um único XLSX." },
        { id: 9, name: "HugMe: Consolidar", ipcName: 'data:consolidate-hugme', category: "Consolidação", description: "Junta os relatórios do HugMe." },
        { id: 10, name: "Procon-SP: Consolidar", ipcName: 'data:consolidate-procon-sp', category: "Consolidação", description: "Junta os relatórios CSV baixados." },
        { id: 11, name: "Consumidor.gov: Consolidar", ipcName: 'data:consolidate-consumidor-gov', category: "Consolidação", description: "Junta os relatórios XLS em um XLSX." },
        { id: 12, name: "Procon SJC: Consolidar", ipcName: 'data:consolidate-procon-sjc', category: "Consolidação", description: "Converte o CSV de SJC para XLSX." },
        { id: 13, name: "Procon Campinas: Consolidar", ipcName: 'data:consolidate-procon-campinas', category: "Consolidação", description: "Converte o CSV de Campinas para XLSX." },
        { id: 14, name: "BCB-RDR: Consolidar", ipcName: 'data:consolidate-bcb-rdr', category: "Consolidação", description: "Converte o XLS do BCB para XLSX." }
    ];
    
    const groupedAutomations = automationsConfig.reduce((acc, auto) => {
        acc[auto.category] = acc[auto.category] || [];
        acc[auto.category].push(auto);
        return acc;
    }, {});

    const categoryOrder = ['Download', 'API', 'Consolidação'];
    
    React.useEffect(() => {
        window.electronAPI.onLog(message => {
            setLog(prev => prev + message + "\n");
        });
        window.electronAPI.onTaskFinished((message) => {
            setLog(prev => prev + `\n--- ${message || 'Tarefa concluída com sucesso!'} ---\n`);
        });
        window.electronAPI.onTaskError(error => {
            setLog(prev => prev + `\n!!! ERRO: ${error} !!!\n`);
        });
    }, []);

    const handleRunTask = async (task) => {
        if (!basePath && task.ipcName !== 'dialog:selectDirectory') {
            alert("ERRO: Pasta de trabalho não definida. Por favor, selecione uma pasta na aba 'Configurações' antes de executar uma tarefa.");
            return;
        }

        setCurrentTask(task.name);
        setLog(`Iniciando tarefa '${task.name}'...\nPor favor, aguarde.\n\n`);
        setIsModalOpen(true);

        const taskArgs = { basePath, startDate, endDate };

        if (task.needsLogin) {
            setShowLoginConfirmModal(true);
            try {
                if (task.name.includes('Consumidor.gov')) await window.electronAPI.startGovLogin();
                else if (task.name.includes('HugMe')) await window.electronAPI.startHugmeLogin();
                else if (task.name.includes('Procon-SP')) await window.electronAPI.startProconSpLogin();

                setShowLoginConfirmModal(false);
                setLog(prev => prev + "Login confirmado! Executando automação...\n");
                window.electronAPI.runTask(task.ipcName, taskArgs);
            } catch (error) {
                setShowLoginConfirmModal(false);
                setLog(prev => prev + `\n!!! Login cancelado ou falhou: ${error.message} !!!\n`);
            }
        } else {
            window.electronAPI.runTask(task.ipcName, taskArgs);
        }
    };
    
    const handleLoginConfirm = () => { window.electronAPI.confirmLogin(); };
    const handleLoginCancel = () => { window.electronAPI.cancelLogin(); setShowLoginConfirmModal(false); };
    
    const handleSelectFolder = async () => {
        const path = await window.electronAPI.selectDirectory();
        if (path) { setBasePath(path); localStorage.setItem('extrahub-basepath', path); }
    };

    const handleRunPipelineStep = (name, ipcName) => {
        if (!basePath) {
            alert("ERRO: Pasta de trabalho não definida. Por favor, selecione uma pasta na aba 'Configurações' antes de executar uma tarefa.");
            return;
        }
        setCurrentTask(name);
        setLog(`Iniciando tarefa '${name}'...\nPor favor, aguarde.\n\n`);
        setIsModalOpen(true);
        window.electronAPI.runTask(ipcName, { basePath });
    };

    const handleSearchCpf = async (event) => {
        event.preventDefault();
        if (!basePath) {
            alert("ERRO: Pasta de trabalho não definida. Por favor, selecione uma pasta na aba 'Configurações' antes de executar a busca.");
            return;
        }
        const cpf = event.target.elements.cpf.value;
        if (cpf) {
            setIsModalOpen(false);
            setLog("");
            setSearchResults(null);
            setIsSearching(true);
            try {
                const results = await window.electronAPI.runTask('search:find-cpf', { basePath, cpf });
                setSearchResults(results);
            } catch (error) {
                setSearchResults({ error: error.message });
            } finally {
                setIsSearching(false);
            }
        }
    };

    const renderContent = () => {
        switch (activeTab) {
            case 'automations':
                return ( <div className="space-y-8"> <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm"> <h3 className="text-lg font-semibold text-gray-800 mb-2">Opções de Período</h3> <p className="text-sm text-gray-600 mb-4">Defina um período para as automações de download. Deixe em branco para buscar o histórico completo.</p> <div className="grid grid-cols-1 md:grid-cols-2 gap-4"> <div> <label className="block text-sm font-medium text-gray-700 mb-1">Data Inicial</label> <input type="text" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="dd/mm/aaaa"/> </div> <div> <label className="block text-sm font-medium text-gray-700 mb-1">Data Final</label> <input type="text" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="dd/mm/aaaa"/> </div> </div> </div> {categoryOrder.map(category => ( groupedAutomations[category] && ( <div key={category}> <h2 className="text-xl font-bold text-gray-800 pb-2 mb-4 border-b-2 border-gray-200">{category}</h2> <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6"> {groupedAutomations[category].map(auto => ( <AutomationCard key={auto.id} automation={auto} onRun={handleRunTask} /> ))} </div> </div> ) ))} </div> );
            case 'pipeline':
                return ( <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm"> <h3 className="text-lg font-semibold text-gray-800 mb-4">Pipeline Principal de Geração de Dados</h3> <p className="text-sm text-gray-600 mb-6">Execute as etapas na ordem para gerar a base de dados final a partir de todos os relatórios consolidados.</p> <div className="space-y-4"> <button onClick={() => handleRunPipelineStep('Etapa 1: Criar Base Bruta', 'pipeline:create-raw-base')} className="w-full text-left p-4 rounded-lg bg-gray-50 hover:bg-gray-100 border flex justify-between items-center transition-all"> <div> <p className="font-semibold text-gray-700">Etapa 1: Criar Base Bruta</p> <p className="text-xs text-gray-500">Junta todos os relatórios consolidados em um arquivo "Base_Mae_Bruta.xlsx".</p> </div> <div className="icon-play text-blue-600"></div> </button> <button onClick={() => handleRunPipelineStep('Etapa 2: Gerar Base Mãe Final', 'pipeline:generate-master-base')} className="w-full text-left p-4 rounded-lg bg-gray-50 hover:bg-gray-100 border flex justify-between items-center transition-all"> <div> <p className="font-semibold text-gray-700">Etapa 2: Gerar Base Mãe Final</p> <p className="text-xs text-gray-500">Processa, limpa e padroniza a base bruta para criar a "Base_Mae_Final.xlsx".</p> </div> <div className="icon-play text-blue-600"></div> </button> </div> </div> );
            case 'consult':
                 return ( <> <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm"> <h3 className="text-lg font-semibold text-gray-800 mb-4">Consulta de Reclamações por CPF</h3> <p className="text-sm text-gray-600 mb-6">Busque todas as reclamações associadas a um CPF na Base Mãe Final.</p> <form onSubmit={handleSearchCpf} className="flex gap-2"> <input name="cpf" type="text" className="flex-grow px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Digite o CPF (apenas números)" disabled={isSearching} /> <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:bg-gray-400" disabled={isSearching}> {isSearching ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : <div className="icon-search"></div>} <span className="ml-2">{isSearching ? 'Buscando...' : 'Buscar'}</span> </button> </form> </div> <SearchResultDisplay searchData={searchResults} isLoading={isSearching} onClose={() => setSearchResults(null)} /> </> );
            case 'settings':
                return ( <div className="space-y-6"> <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm"> <h3 className="text-lg font-semibold text-gray-800 mb-2">Configuração da Pasta</h3> <p className="text-sm text-gray-600 mb-6">Defina a pasta principal onde todos os relatórios e bases serão salvos.</p> <div className="mb-4"> <label className="block text-sm font-medium text-gray-700 mb-1">Pasta Principal de Relatórios</label> <div className="flex gap-2"> <input type="text" readOnly value={basePath || "Nenhuma pasta selecionada"} className="flex-grow px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed"/> <button onClick={handleSelectFolder} className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center gap-2"> <div className="icon-folder"></div> Selecionar Pasta... </button> </div> </div> </div> </div> );
            default:
                return null;
        }
    };
    
    const menuItems = [
        { id: 'automations', label: 'Automações', icon: 'zap' },
        { id: 'pipeline', label: 'Pipeline de Dados', icon: 'server' },
        { id: 'consult', label: 'Consulta CPF', icon: 'search' },
        { id: 'settings', label: 'Configurações', icon: 'settings' }
    ];

    return (
        <div className="min-h-screen bg-gray-100 flex">
            <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} menuItems={menuItems} />
            <main className="flex-1 p-8 overflow-y-auto">
                {renderContent()}
            </main>
            <LogModal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); if(showLoginConfirmModal) { handleLoginCancel(); } }} log={log} taskName={currentTask} />

            {showLoginConfirmModal && (
                 <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4 shadow-xl">
                        <h2 className="text-lg font-semibold mb-2">Ação Necessária: Login Manual</h2>
                        <p className="text-sm text-gray-600 mb-4">Uma janela de login foi aberta. Por favor, complete o processo de login e, quando chegar na página principal (dashboard), volte aqui e clique em "Continuar".</p>
                        <div className="flex gap-3 justify-end mt-6">
                            <button onClick={handleLoginCancel} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">Cancelar Login</button>
                            <button onClick={handleLoginConfirm} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Continuar Automação</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);