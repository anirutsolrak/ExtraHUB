function SettingsScreen({ basePath, onSelectFolder }) {
    const [isConnected, setIsConnected] = React.useState(false);
    const [isLoading, setIsLoading] = React.useState(true);

    React.useEffect(() => {
        const checkStatus = async () => {
            try {
                const result = await window.electronAPI.runTask('auth:check-google-status');
                setIsConnected(result.isConnected);
            } catch (error) {
                console.error("Erro ao verificar status do Google:", error);
                setIsConnected(false);
            } finally {
                setIsLoading(false);
            }
        };
        checkStatus();
    }, []);
    
    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-800 mb-2">Configuração da Pasta</h3>
                <p className="text-sm text-gray-600 mb-6">Defina a pasta principal onde todos os relatórios e bases serão salvos.</p>
                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Pasta Principal de Relatórios</label>
                    <div className="flex gap-2">
                        <input type="text" readOnly value={basePath || "Nenhuma pasta selecionada"} className="flex-grow px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed"/>
                        <button onClick={onSelectFolder} className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center gap-2">
                            <div className="icon-folder"></div>
                            Selecionar Pasta...
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-800 mb-2">Conexão com Google</h3>
                <p className="text-sm text-gray-600 mb-6">A autenticação agora é feita automaticamente via Conta de Serviço na inicialização do aplicativo.</p>
                <div className="flex items-center gap-3">
                    {isLoading ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-500"></div>
                    ) : isConnected ? (
                         <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center text-white"><div className="icon-check text-xs"></div></div>
                    ) : (
                        <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center text-white"><div className="icon-x text-xs"></div></div>
                    )}
                    <span className="text-sm font-medium text-gray-700">
                        {isLoading ? 'Verificando status...' : isConnected ? 'Conectado ao Google Sheets' : 'Não conectado. Verifique o log de erros.'}
                    </span>
                </div>
                 <p className="text-xs text-gray-500 mt-4">
                    Se a conexão falhar, verifique se o arquivo `backend/service_account.json` está configurado corretamente e se a planilha foi compartilhada com o e-mail da conta de serviço.
                 </p>
            </div>
        </div>
    );
}