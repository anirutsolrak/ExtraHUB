function AudienciasDisplay({ results, isLoading, onSearch }) {
    const renderContent = () => {
        if (isLoading) {
            return (
                <div className="flex flex-col justify-center items-center h-48 text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                    <p className="text-gray-600 font-medium">Buscando audiências...</p>
                    <p className="text-sm text-gray-400">Isso pode levar alguns segundos.</p>
                </div>
            );
        }

        if (!results) {
             return <p className="text-gray-500 text-center p-4">Clique em "Pesquisar Audiências" para carregar os dados.</p>;
        }

        if (results.error) {
            return <p className="text-red-500 text-center p-4 whitespace-pre-wrap">{results.error}</p>;
        }
        
        if (results.count === 0) {
            return <p className="text-gray-600 text-center p-4">Nenhuma audiência encontrada na Base Mãe Final.</p>;
        }

        return (
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Protocolo</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nome do Cliente</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data de Abertura</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Prazo de Resposta</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {results.audiencias.map((item, index) => (
                            <tr key={index}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">{item.Protocolo_Origem}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">{item.Consumidor_Nome}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.Data_Abertura}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.Prazo_Resposta && item.Prazo_Resposta !== 'nan' ? item.Prazo_Resposta : 'N/A'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                <div className="flex justify-between items-center">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-800">Casos com Audiência</h3>
                        <p className="text-sm text-gray-600 mt-1">Exibe todos os casos da Base Mãe Final cujo status contenha a palavra "Audiência".</p>
                    </div>
                    <button onClick={onSearch} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:bg-gray-400" disabled={isLoading}>
                        {isLoading ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : <div className="icon-search"></div>}
                        <span className="ml-2">{isLoading ? 'Buscando...' : 'Pesquisar Audiências'}</span>
                    </button>
                </div>
            </div>
            
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">
                    Resultados da Busca
                    {results && !results.error && <span className="text-base text-gray-500 font-normal ml-2">({results.count} encontrado(s))</span>}
                </h3>
                {renderContent()}
            </div>
        </div>
    );
}