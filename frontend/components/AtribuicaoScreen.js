function AtribuicaoScreen() {
    const [data, setData] = React.useState({ cases: [], analysts: [], managers: [], boards: [] });
    const [selectedBoardId, setSelectedBoardId] = React.useState('');
    const [isLoading, setIsLoading] = React.useState(true);
    const [error, setError] = React.useState(null);
    const [pendingAssignments, setPendingAssignments] = React.useState({});
    const [isSubmitting, setIsSubmitting] = React.useState(false);

    React.useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            setError('');
            try {
                const [assignData, boardsData] = await Promise.all([
                    window.electronAPI.runTask('data:getAssignableData'),
                    window.electronAPI.runTask('trello:get-boards')
                ]);
                setData({ ...assignData, boards: boardsData || [] });
            } catch (err) {
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, []);

    const handleBoardChange = (e) => {
        setSelectedBoardId(e.target.value);
        setPendingAssignments({});
    };

    const handleSelectionChange = (caseId, type, value) => {
        setPendingAssignments(prev => ({ ...prev, [caseId]: { ...prev[caseId], [type]: value } }));
    };
    
    const handleLaunchAssignments = async () => {
        const assignmentsToSubmit = Object.entries(pendingAssignments)
            .filter(([_, assignment]) => assignment.analystName && assignment.managerId)
            .map(([caseId, assignment]) => ({ caseId, ...assignment }));

        if (assignmentsToSubmit.length === 0) return alert("Nenhuma atribuição completa para lançar.");
        if (!confirm(`Lançar ${assignmentsToSubmit.length} atribuição(ões)?`)) return;
        
        setIsSubmitting(true);
        try {
            const response = await window.electronAPI.runTask('data:submitAssignments', { assignments: assignmentsToSubmit, boardId: selectedBoardId });
            alert(response.message);
            setPendingAssignments({});
            setSelectedBoardId('');
        } catch (err) {
            alert(`Erro ao submeter: ${err.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const filteredAnalysts = data.analysts.filter(a => a.ID_Quadro_Trello === selectedBoardId);

    if (isLoading) return <p className="text-center p-4">Carregando dados...</p>;
    if (error) return <p className="text-red-500 text-center p-4">Erro: {error}</p>;

    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                <div className="flex justify-between items-center">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-800">Atribuição de Casos</h3>
                        <div className="flex items-center gap-4 mt-2">
                            <label className="text-sm font-medium text-gray-700">Selecione o Quadro:</label>
                            <select value={selectedBoardId} onChange={handleBoardChange} className="p-2 border border-gray-300 rounded-md">
                                <option value="">Selecione...</option>
                                {data.boards.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                        </div>
                    </div>
                    {selectedBoardId && <button onClick={handleLaunchAssignments} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400" disabled={isSubmitting}>Lançar</button>}
                </div>
            </div>
            {selectedBoardId && (
                <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Protocolo</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Consumidor</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Atribuir Analista</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Atribuir Gestor</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {data.cases.map((caseItem) => (
                                <tr key={caseItem.ID_Reclamacao_Unico} className={pendingAssignments[caseItem.ID_Reclamacao_Unico] ? 'bg-blue-50' : ''}>
                                    <td className="px-4 py-4 text-sm">{caseItem.ID_Reclamacao_Unico}</td>
                                    <td className="px-4 py-4 text-sm">{caseItem.Consumidor_Nome}</td>
                                    <td className="px-4 py-4 text-sm">
                                        <select value={pendingAssignments[caseItem.ID_Reclamacao_Unico]?.analystName || ''} onChange={(e) => handleSelectionChange(caseItem.ID_Reclamacao_Unico, 'analystName', e.target.value)} className="w-full p-1 border rounded-md">
                                            <option value="" disabled>Selecione...</option>
                                            {filteredAnalysts.map(a => <option key={a.Nome_Analista} value={a.Nome_Analista}>{a.Nome_Analista}</option>)}
                                        </select>
                                    </td>
                                    <td className="px-4 py-4 text-sm">
                                         <select value={pendingAssignments[caseItem.ID_Reclamacao_Unico]?.managerId || ''} onChange={(e) => handleSelectionChange(caseItem.ID_Reclamacao_Unico, 'managerId', e.target.value)} className="w-full p-1 border rounded-md">
                                            <option value="" disabled>Selecione...</option>
                                            {data.managers.map(m => <option key={m.ID_Trello} value={m.ID_Trello}>{m.Nome_Gestor}</option>)}
                                        </select>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}