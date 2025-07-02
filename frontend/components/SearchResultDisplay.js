function SearchResultDisplay({ searchData, onClose, isLoading }) {
    if (!searchData && !isLoading) return null;

    const renderContent = () => {
        if (isLoading) {
            return (
                <div className="flex flex-col justify-center items-center h-48 text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                    <p className="text-gray-600 font-medium">Buscando reclamações...</p>
                    <p className="text-sm text-gray-400">Isso pode levar alguns segundos.</p>
                </div>
            );
        }

        if (searchData.error) {
            return <p className="text-red-500 text-center p-4 whitespace-pre-wrap">{searchData.error}</p>;
        }

        if (searchData.count === 0) {
            return <p className="text-gray-600 text-center p-4">Nenhuma reclamação encontrada para o CPF: {searchData.cpf}</p>;
        }

        return (
            <div className="space-y-4">
                {searchData.results.map((item, index) => (
                    <div key={index} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                        <h4 className="font-semibold text-md text-gray-800 mb-3">
                            Reclamação {index + 1} - <span className="text-blue-600 font-bold">{item.fonte}</span>
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                            <div className="flex flex-col">
                                <span className="text-xs text-gray-500">Cliente</span>
                                <span className="font-medium text-gray-800 truncate">{item.nome}</span>
                            </div>
                             <div className="flex flex-col">
                                <span className="text-xs text-gray-500">Protocolo</span>
                                <span className="font-medium text-gray-800">{item.protocolo}</span>
                            </div>
                             <div className="flex flex-col">
                                <span className="text-xs text-gray-500">Data de Abertura</span>
                                <span className="font-medium text-gray-800">{item.dataAbertura}</span>
                            </div>
                             <div className="flex flex-col">
                                <span className="text-xs text-gray-500">Data de Finalização</span>
                                <span className="font-medium text-gray-800">{item.dataFinalizacao}</span>
                            </div>
                            <div className="flex flex-col sm:col-span-2">
                                <span className="text-xs text-gray-500">Status</span>
                                <span className="font-medium text-gray-800">{item.status}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div className="mt-6 bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-800">
                    Resultado da Busca 
                    {searchData && !searchData.error && <span className="text-base text-gray-500 font-normal ml-2">({searchData.count} encontrado(s) para o CPF {searchData.cpf})</span>}
                </h3>
                {onClose && (
                    <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full">
                        <div className="icon-x text-lg"></div>
                    </button>
                )}
            </div>
            {renderContent()}
            {searchData && searchData.conclusionMessage && (
                <div className="mt-4 pt-4 border-t border-gray-200 text-center text-green-600 font-semibold">
                    {searchData.conclusionMessage.trim()}
                </div>
            )}
        </div>
    );
}