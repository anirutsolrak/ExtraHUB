function AnalystManager() {
    const [analysts, setAnalysts] = React.useState([]);
    const [boards, setBoards] = React.useState([]);
    const [selectedBoardId, setSelectedBoardId] = React.useState('');
    const [isLoading, setIsLoading] = React.useState(true);
    const [error, setError] = React.useState('');
    const [newAnalystName, setNewAnalystName] = React.useState('');
    const [newAnalystCpf, setNewAnalystCpf] = React.useState('');

    const fetchData = async () => {
        setIsLoading(true);
        setError('');
        try {
            const [analystsResult, boardsResult] = await Promise.all([
                window.electronAPI.runTask('data:get-analysts'),
                window.electronAPI.runTask('trello:get-boards')
            ]);
            setAnalysts(analystsResult || []);
            setBoards(boardsResult || []);
        } catch (err) {
            setError(`Erro ao carregar dados: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    React.useEffect(() => {
        fetchData();
    }, []);

    const handleAddAnalyst = async (e) => {
        e.preventDefault();
        if (!newAnalystName || !newAnalystCpf || !selectedBoardId) {
            alert("Nome, CPF e Quadro são obrigatórios.");
            return;
        }
        setIsLoading(true);
        try {
            await window.electronAPI.runTask('data:add-analyst', { name: newAnalystName, cpf: newAnalystCpf, boardId: selectedBoardId });
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
    
    const getBoardName = (boardId) => boards.find(b => b.id === boardId)?.name || 'Desconhecido';

    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-800 mb-2">Gerenciar Analistas</h3>
                <form onSubmit={handleAddAnalyst} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Analista</label>
                        <input type="text" value={newAnalystName} onChange={(e) => setNewAnalystName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg"/>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">CPF do Analista</label>
                        <input type="text" value={newAnalystCpf} onChange={(e) => setNewAnalystCpf(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg"/>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Quadro Trello</label>
                        <select value={selectedBoardId} onChange={(e) => setSelectedBoardId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                            <option value="">Selecione um quadro...</option>
                            {boards.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                    </div>
                    <button type="submit" disabled={isLoading} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 h-10 disabled:bg-gray-400">Adicionar</button>
                </form>
                {error && <p className="text-red-500 text-sm mt-4">{error}</p>}
            </div>
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Lista de Analistas</h3>
                {isLoading && <p>Carregando...</p>}
                {!isLoading && (
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead>
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nome</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quadro Trello</th>
                                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Ação</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {analysts.map((analyst, index) => (
                                <tr key={index}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">{analyst.Nome_Analista}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">{getBoardName(analyst.ID_Quadro_Trello)}</td>
                                    <td className="px-6 py-4 text-center">
                                        <button onClick={() => handleDeleteAnalyst(analyst)} disabled={isLoading} className="text-red-600 hover:text-red-800 p-1 rounded-full hover:bg-red-50">
                                            <div className="icon-trash-2"></div>
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}