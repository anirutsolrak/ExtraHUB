function AccessManager() {
    const [data, setData] = React.useState({ analysts: [], managers: [], accessRules: [], boards: [] });
    const [isLoading, setIsLoading] = React.useState(true);
    const [error, setError] = React.useState('');
    
    const [newAnalystName, setNewAnalystName] = React.useState('');
    const [newAnalystCpf, setNewAnalystCpf] = React.useState('');
    const [selectedBoardIdForAnalyst, setSelectedBoardIdForAnalyst] = React.useState('');

    function AccessManagerSkeleton() {
        return (
            <div className="space-y-6 animate-pulse">
                <div className="h-8 bg-gray-200 rounded w-1/2 mb-6"></div>
                
                <div className="bg-white p-6 rounded-lg border shadow-sm">
                    <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
                    <div className="overflow-x-auto">
                        <div className="w-full">
                            <div className="flex bg-gray-50 p-2 space-x-4">
                                <div className="w-1/4 h-5 bg-gray-200 rounded"></div>
                                <div className="w-1/4 h-5 bg-gray-200 rounded"></div>
                                <div className="w-1/4 h-5 bg-gray-200 rounded"></div>
                                <div className="w-1/4 h-5 bg-gray-200 rounded"></div>
                            </div>
                            {Array.from({ length: 2 }).map((_, i) => (
                                <div key={i} className="flex items-center p-4 border-t space-x-4">
                                    <div className="w-1/4 h-5 bg-gray-300 rounded"></div>
                                    <div className="w-1/4 flex justify-center"><div className="h-5 w-5 bg-gray-200 rounded-sm"></div></div>
                                    <div className="w-1/4 flex justify-center"><div className="h-5 w-5 bg-gray-200 rounded-sm"></div></div>
                                    <div className="w-1/4 flex justify-center"><div className="h-5 w-5 bg-gray-200 rounded-sm"></div></div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
    
                <div className="bg-white p-6 rounded-lg border shadow-sm">
                    <div className="h-6 bg-gray-200 rounded w-1/4 mb-4"></div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end mb-6">
                        <div className="h-14 bg-gray-200 rounded-lg"></div>
                        <div className="h-14 bg-gray-200 rounded-lg"></div>
                        <div className="h-14 bg-gray-200 rounded-lg"></div>
                        <div className="h-10 bg-gray-300 rounded-lg"></div>
                    </div>
                    
                    <div className="h-5 bg-gray-200 rounded w-1/5 mb-4"></div>
                    <div className="w-full">
                        {Array.from({ length: 2 }).map((_, i) => (
                            <div key={i} className="flex items-center p-4 border-t space-x-4">
                                <div className="w-1/4 h-4 bg-gray-200 rounded"></div>
                                <div className="w-1/4 h-4 bg-gray-200 rounded"></div>
                                <div className="w-1/4 h-4 bg-gray-200 rounded"></div>
                                <div className="w-1/4 h-4 bg-gray-200 rounded"></div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const result = await window.electronAPI.runTask('data:get-all-workspace-data');
            setData(result);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    React.useEffect(() => {
        fetchData();
    }, []);

    const handleAccessChange = async (managerId, boardId, hasAccess) => {
        setIsLoading(true);
        try {
            await window.electronAPI.runTask('data:update-access', { managerId, boardId, hasAccess });
            await fetchData();
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddAnalyst = async (e) => {
        e.preventDefault();
        if (!newAnalystName || !newAnalystCpf || !selectedBoardIdForAnalyst) {
            alert("Nome, CPF e Quadro são obrigatórios para adicionar um analista.");
            return;
        }
        setIsLoading(true);
        try {
            await window.electronAPI.runTask('data:add-analyst', { name: newAnalystName, cpf: newAnalystCpf, boardId: selectedBoardIdForAnalyst });
            setNewAnalystName('');
            setNewAnalystCpf('');
            await fetchData();
        } catch (err) {
            setError(`Erro ao adicionar analista: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteAnalyst = async (analyst) => {
        if (!confirm(`Tem certeza que deseja remover o analista "${analyst.Nome_Analista}"?`)) return;
        setIsLoading(true);
        try {
            await window.electronAPI.runTask('data:delete-analyst', { name: analyst.Nome_Analista, cpf: analyst.CPF_Analista, boardId: analyst.ID_Quadro_Trello });
            await fetchData();
        } catch (err) {
            setError(`Erro ao remover analista: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const getBoardName = (boardId) => data.boards.find(b => b.id === boardId)?.name || 'Desconhecido';

    if (isLoading) return <AccessManagerSkeleton />;
    if (error) return <p className="text-red-500">Erro: {error}</p>;

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-800">Gerenciamento de Acessos e Permissões</h2>
            
            <div className="bg-white p-6 rounded-lg border shadow-sm">
                <h3 className="text-lg font-semibold mb-4">Acessos dos Gestores aos Quadros</h3>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-2 text-left font-medium text-gray-500">Gestor</th>
                                {data.boards.map(board => <th key={board.id} className="px-4 py-2 font-medium text-gray-500">{board.name}</th>)}
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {data.managers.map(manager => (
                                <tr key={manager.ID_Trello}>
                                    <td className="px-4 py-2 font-semibold">{manager.Nome_Gestor}</td>
                                    {data.boards.map(board => {
                                        const hasAccess = data.accessRules.some(rule => rule.ID_Gestor_Trello === manager.ID_Trello && rule.ID_Quadro_Trello === board.id);
                                        return (
                                            <td key={board.id} className="px-4 py-2 text-center">
                                                <input
                                                    type="checkbox"
                                                    className="h-5 w-5"
                                                    checked={hasAccess}
                                                    onChange={(e) => handleAccessChange(manager.ID_Trello, board.id, e.target.checked)}
                                                    disabled={isLoading}
                                                />
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="bg-white p-6 rounded-lg border shadow-sm">
                <h3 className="text-lg font-semibold mb-4">Gerenciar Analistas</h3>
                <form onSubmit={handleAddAnalyst} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end mb-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Analista</label>
                        <input type="text" value={newAnalystName} onChange={(e) => setNewAnalystName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg"/>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">CPF do Analista</label>
                        <input type="text" value={newAnalystCpf} onChange={(e) => setNewAnalystCpf(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg"/>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Associar ao Quadro</label>
                        <select value={selectedBoardIdForAnalyst} onChange={(e) => setSelectedBoardIdForAnalyst(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                            <option value="">Selecione um quadro...</option>
                            {data.boards.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                    </div>
                    <button type="submit" disabled={isLoading} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 h-10 disabled:bg-gray-400">Adicionar Analista</button>
                </form>

                <h4 className="text-md font-semibold text-gray-700 mb-2">Analistas Cadastrados</h4>
                <div className="overflow-x-auto">
                     <table className="min-w-full divide-y">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-2 text-left font-medium text-gray-500">Nome</th>
                                <th className="px-4 py-2 text-left font-medium text-gray-500">CPF</th>
                                <th className="px-4 py-2 text-left font-medium text-gray-500">Quadro Associado</th>
                                <th className="px-4 py-2 text-center font-medium text-gray-500">Ação</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {data.analysts.map((analyst, index) => (
                                <tr key={index}>
                                    <td className="px-4 py-2">{analyst.Nome_Analista}</td>
                                    <td className="px-4 py-2">{analyst.CPF_Analista}</td>
                                    <td className="px-4 py-2">{getBoardName(analyst.ID_Quadro_Trello)}</td>
                                    <td className="px-4 py-2 text-center">
                                        <button onClick={() => handleDeleteAnalyst(analyst)} disabled={isLoading} className="text-red-600 hover:text-red-800 p-1 rounded-full hover:bg-red-50">
                                            <div className="icon-trash-2"></div>
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}