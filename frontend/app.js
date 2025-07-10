function App() {
    const [currentUser, setCurrentUser] = React.useState(null);
    const [loginError, setLoginError] = React.useState('');
    const [isLoggingIn, setIsLoggingIn] = React.useState(false);
    const [activeTab, setActiveTab] = React.useState('home');
    
    const [log, setLog] = React.useState("");
    const [isModalOpen, setIsModalOpen] = React.useState(false);
    const [isAssistedLogin, setIsAssistedLogin] = React.useState(false);
    const [currentTask, setCurrentTask] = React.useState(null);
    const [basePath, setBasePath] = React.useState(localStorage.getItem('extrahub-basepath') || null);
    const [searchResults, setSearchResults] = React.useState(null);
    const [isSearching, setIsSearching] = React.useState(false);
    const [audienciasResults, setAudienciasResults] = React.useState(null);
    const [isSearchingAudiencias, setIsSearchingAudiencias] = React.useState(false);
    const [startDate, setStartDate] = React.useState('');
    const [endDate, setEndDate] = React.useState('');
    
    const handleLogin = async (username, password) => {
        setLoginError('');
        setIsLoggingIn(true);
        try {
            const result = await window.electronAPI.runTask('auth:app-login', { username, password });
            if (result.success) {
                const user = {
                    name: result.user.Nome_Gestor,
                    trelloId: result.user.ID_Trello,
                    trelloUsername: result.user.Username_Trello,
                    allowedBoardIds: result.user.allowedBoardIds || []
                };
                setCurrentUser(user);
            }
        } catch (error) {
            setLoginError(`Falha no login: ${error.message}`);
        } finally {
            setIsLoggingIn(false);
        }
    };

    const handleLogout = () => {
        setCurrentUser(null);
        setActiveTab('home');
    };
    
    const handleSelectFolder = async () => {
        const path = await window.electronAPI.selectDirectory();
        if (path) { setBasePath(path); localStorage.setItem('extrahub-basepath', path); }
    };
    
    const handleRunTask = async (task) => {
        if (!basePath && !task.ipcName.startsWith('pipeline')) {
            alert("ERRO: Pasta de trabalho não definida. Por favor, selecione uma pasta na aba 'Configurações'.");
            return;
        }
        setCurrentTask(task.name);
        setLog(`Iniciando tarefa '${task.name}'...\nPor favor, aguarde.\n\n`);
        setIsModalOpen(true);
        window.electronAPI.runTask(task.ipcName, { basePath, startDate, endDate });
    };

    const handleRunPipelineStep = (name, ipcName) => {
        setCurrentTask(name);
        setLog(`Iniciando tarefa '${name}'...\nPor favor, aguarde.\n\n`);
        setIsModalOpen(true);
        window.electronAPI.runTask(ipcName, { basePath });
    };

    const handleSearchCpf = async (event) => {
        event.preventDefault();
        const cpf = event.target.elements.cpf.value;
        if (cpf) {
            setIsModalOpen(false);
            setLog("");
            setSearchResults(null);
            setIsSearching(true);
            try {
                const results = await window.electronAPI.runTask('search:find-cpf', { cpf });
                setSearchResults(results);
            } catch (error) {
                setSearchResults({ error: error.message });
            } finally {
                setIsSearching(false);
            }
        }
    };

    const handleSearchAudiencias = async () => {
        setIsSearchingAudiencias(true);
        setAudienciasResults(null);
        try {
            const results = await window.electronAPI.runTask('search:find-audiencias');
            setAudienciasResults(results);
        } catch (error) {
            setAudienciasResults({ error: error.message });
        } finally {
            setIsSearchingAudiencias(false);
        }
    };
    
    React.useEffect(() => {
        window.electronAPI.onLog(message => setLog(prev => prev + message + "\n"));
        window.electronAPI.onTaskFinished(message => setLog(prev => prev + `\n--- ${message || 'Tarefa concluída!'} ---\n`));
        window.electronAPI.onTaskError(error => setLog(prev => prev + `\n!!! ERRO: ${error} !!!\n`));

        // Listeners for assisted login prompt
        window.electronAPI.onAssistedLoginStarted(() => setIsAssistedLogin(true));
        window.electronAPI.onAssistedLoginFinished(() => setIsAssistedLogin(false));
    }, []);

    const automationsConfig = [
        { id: 1, name: "Consumidor.gov: Baixar Relatórios", ipcName: 'automation:run-gov-download', category: "Download", usesDates: true, description: "Login integrado via Gov.br." },
        { id: 2, name: "HugMe: Baixar Relatórios", ipcName: 'automation:run-hugme-download', category: "Download", usesDates: true, description: "Gera e baixa relatórios da plataforma." },
        { id: 3, name: "Procon-SP: Baixar Relatórios", ipcName: 'automation:run-proconsp-download', category: "Download", usesDates: true, description: "Login integrado via Gov.br." },
        { id: 4, name: "Proconsumidor: Baixar Relatórios", ipcName: 'automation:run-proconsumidor-download', category: "Download", usesDates: true, description: "Baixa relatórios de todas as empresas." },
        { id: 5, name: "Procon SJC: Baixar Relatório", ipcName: 'automation:run-procon-sjc-download', category: "Download", usesDates: true, description: "Baixa o relatório completo de SJC." },
        { id: 6, name: "Procon Campinas: Baixar Relatório", ipcName: 'automation:run-procon-campinas-download', category: "Download", usesDates: true, description: "Baixa o relatório completo de Campinas." },
        { id: 7, name: "BCB-RDR: Baixar Relatórios", ipcName: 'automation:run-bcb-rdr-download', category: "Download", usesDates: true, description: "Baixa os relatórios do Banco Central." },
        { id: 15, name: "Procon Uberlândia: Gerar Dados", ipcName: 'api:fetch-uberlandia', category: "API", usesDates: true, description: "Busca dados via API e salva em XLSX." },
    ];

    const pipelineConfig = [
        { id: 1, name: "Consolidar Relatórios Locais", ipcName: 'pipeline:consolidate-all', description: "Consolida todos os relatórios baixados em arquivos únicos por fonte. PRÉ-REQUISITO para as próximas etapas." },
        { id: 2, name: "Criar Base Bruta Local", ipcName: 'pipeline:create-raw-base', description: "Combina os arquivos consolidados em um único arquivo Excel (Base_Mae_Bruta.xlsx), com uma aba por fonte de dados." },
        { id: 3, name: "Gerar Base Mãe Final Local", ipcName: 'pipeline:generate-master-base', description: "Processa a Base Bruta local, padroniza os dados e gera a 'Base_Mae_Final.xlsx' localmente." },
        { id: 4, name: "Upload Base Mãe para Google Sheets", ipcName: 'pipeline:upload-master-base-to-sheets', description: "Envia os novos registros da Base Mãe Final local para a planilha no Google Sheets." }
    ];
    
    const groupedAutomations = automationsConfig.reduce((acc, auto) => {
        acc[auto.category] = acc[auto.category] || [];
        acc[auto.category].push(auto);
        return acc;
    }, {});

    const categoryOrder = ['Download', 'API'];

    const renderContent = () => {
        switch (activeTab) {
            case 'home':
                return <HomeScreen currentUser={currentUser} />;
            case 'atribuicao':
                return <AtribuicaoScreen currentUser={currentUser} />;
            case 'access-management':
                return <AccessManager />;
            case 'automations':
                return ( <div className="space-y-8"> <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm"> <h3 className="text-lg font-semibold text-gray-800 mb-2">Opções de Período</h3> <p className="text-sm text-gray-600 mb-4">Defina um período para as automações de download.</p> <div className="grid grid-cols-1 md:grid-cols-2 gap-4"> <div> <label className="block text-sm font-medium text-gray-700 mb-1">Data Inicial</label> <input type="text" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="dd/mm/aaaa"/> </div> <div> <label className="block text-sm font-medium text-gray-700 mb-1">Data Final</label> <input type="text" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="dd/mm/aaaa"/> </div> </div> </div> {categoryOrder.map(category => ( groupedAutomations[category] && ( <div key={category}> <h2 className="text-xl font-bold text-gray-800 pb-2 mb-4 border-b-2">{category}</h2> <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6"> {groupedAutomations[category].map(auto => ( <AutomationCard key={auto.id} automation={auto} onRun={handleRunTask} /> ))} </div> </div> ) ))} </div> );
            case 'pipeline':
                return (
                    <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                        <h3 className="text-lg font-semibold text-gray-800 mb-4">Pipeline de Dados</h3>
                        <p className="text-sm text-gray-600 mb-6">Execute as etapas para gerar a base de dados final.</p>
                        <div className="space-y-4">
                            {pipelineConfig.map(step => (
                                <button
                                    key={step.id}
                                    onClick={() => handleRunPipelineStep(step.name, step.ipcName)}
                                    className="w-full text-left p-4 rounded-lg bg-gray-50 hover:bg-gray-100 border flex justify-between items-center"
                                >
                                    <div>
                                        <p className="font-semibold">{step.name}</p>
                                        <p className="text-xs text-gray-500">{step.description}</p>
                                    </div>
                                    <div className="icon-play text-blue-600"></div>
                                </button>
                            ))}
                        </div>
                    </div>
                );
            case 'consult':
                 return ( <> <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm"> <h3 className="text-lg font-semibold text-gray-800 mb-4">Consulta por CPF</h3> <p className="text-sm text-gray-600 mb-6">Busque reclamações de um CPF na Base Mãe Final.</p> <form onSubmit={handleSearchCpf} className="flex gap-2"> <input name="cpf" type="text" className="flex-grow px-3 py-2 border rounded-lg" placeholder="Digite o CPF" disabled={isSearching} /> <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg" disabled={isSearching}>{isSearching ? 'Buscando...' : 'Buscar'}</button> </form> </div> <SearchResultDisplay searchData={searchResults} isLoading={isSearching} onClose={() => setSearchResults(null)} /> </> );
            case 'audiencias':
                return ( <AudienciasDisplay results={audienciasResults} isLoading={isSearchingAudiencias} onSearch={handleSearchAudiencias} /> );
            case 'settings':
                return ( <SettingsScreen basePath={basePath} onSelectFolder={handleSelectFolder} /> );
            default:
                return <div className="text-center p-8"><p>Selecione uma opção no menu.</p></div>;
        }
    };
    
    const menuItems = [
        { id: 'home', label: 'Home', icon: 'home' },
        { id: 'atribuicao', label: 'Atribuição de Casos', icon: 'user-plus' },
        { id: 'access-management', label: 'Gerenciar Acessos', icon: 'shield-check' },
        { id: 'automations', label: 'Automações', icon: 'zap' },
        { id: 'pipeline', label: 'Pipeline de Dados', icon: 'server' },
        { id: 'consult', label: 'Consulta CPF', icon: 'search' },
        { id: 'audiencias', label: 'Audiências', icon: 'briefcase' },
        { id: 'settings', label: 'Configurações', icon: 'settings' }
    ];

    if (!currentUser) {
        return <LoginScreen onLogin={handleLogin} error={loginError} isLoading={isLoggingIn} />;
    }

    return (
        <div className="min-h-screen bg-gray-100 flex">
            <Sidebar 
                activeTab={activeTab} 
                setActiveTab={setActiveTab} 
                menuItems={menuItems}
                currentUser={currentUser}
                onLogout={handleLogout}
            />
            <main className="flex-1 p-8 overflow-y-auto h-screen">
                {renderContent()}
            </main>
            <LogModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} log={log} taskName={currentTask} />
            <AssistedLoginPrompt 
                isOpen={isAssistedLogin}
                onConfirm={() => window.electronAPI.confirmLogin()}
                onCancel={() => window.electronAPI.cancelLogin()}
            />
        </div>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);