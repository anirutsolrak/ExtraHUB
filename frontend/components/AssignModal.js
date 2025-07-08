function AssignModal({ isOpen, onClose, analysts, onConfirm }) {
    if (!isOpen) return null;

    const [selectedAnalystId, setSelectedAnalystId] = React.useState(analysts.length > 0 ? analysts[0].ID_Trello : '');

    const handleConfirm = () => {
        const selectedAnalyst = analysts.find(a => a.ID_Trello === selectedAnalystId);
        if (selectedAnalyst) {
            onConfirm(selectedAnalyst);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 transition-opacity">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md m-4">
                <div className="p-5 border-b">
                    <h2 className="text-lg font-semibold text-gray-800">Atribuir Caso a Analista</h2>
                    <p className="text-sm text-gray-500 mt-1">Selecione o analista que será responsável por este caso.</p>
                </div>
                <div className="p-6">
                    <label htmlFor="analyst-select" className="block text-sm font-medium text-gray-700 mb-2">
                        Analistas Disponíveis
                    </label>
                    <select
                        id="analyst-select"
                        value={selectedAnalystId}
                        onChange={(e) => setSelectedAnalystId(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                        {analysts.map(analyst => (
                            <option key={analyst.ID_Trello} value={analyst.ID_Trello}>
                                {analyst.Nome_Analista}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="p-4 bg-gray-50 border-t flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 text-sm"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleConfirm}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                    >
                        Confirmar Atribuição
                    </button>
                </div>
            </div>
        </div>
    );
}