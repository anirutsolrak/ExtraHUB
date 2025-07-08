function HomeScreen({ currentUser }) {
    const [isTrelloAuthenticated, setIsTrelloAuthenticated] = React.useState(false);
    const [managers, setManagers] = React.useState([]);
    const [allowedBoards, setAllowedBoards] = React.useState([]);
    const [selectedBoardId, setSelectedBoardId] = React.useState('');
    const [selectedManagerUsername, setSelectedManagerUsername] = React.useState('');
    const [isLoading, setIsLoading] = React.useState(true);
    const [trelloUrl, setTrelloUrl] = React.useState('');
    const [error, setError] = React.useState('');

    function TrelloSkeleton() {
        return (
            <div className="p-6 animate-pulse h-full">
                 <div className="h-10 bg-gray-200 rounded-md w-full mb-6"></div>
                <div className="h-full bg-gray-200 rounded-lg"></div>
            </div>
        );
    }
    
    function TrelloLoginPrompt({ onLoginClick }) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-gray-50">
                <div className="icon-trello text-6xl text-blue-300 mb-4"></div>
                <h3 className="text-2xl font-semibold text-gray-700">Conecte-se ao Trello</h3>
                <p className="text-gray-500 mt-2 max-w-md">Para visualizar o quadro de tarefas, você precisa autenticar sua sessão no Trello. Isso abrirá uma nova janela de login.</p>
                <button
                    onClick={onLoginClick}
                    className="mt-6 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold flex items-center gap-2 shadow-lg hover:shadow-xl transition-all"
                >
                    <div className="icon-log-in"></div>
                    Autorizar com Trello
                </button>
            </div>
        );
    }

    const updateTrelloUrl = (boardId, managerUsername) => {
        if (!boardId) return;
        let url = `https://trello.com/b/${boardId}`;
        if (managerUsername && managerUsername !== 'all') {
            url += `?filter=member:${managerUsername}`;
        }
        setTrelloUrl(url);
    };

    const checkTrelloSession = async () => {
        try {
            const status = await window.electronAPI.runTask('auth:check-trello-session');
            const isAuthenticated = status.isAuthenticated;
            setIsTrelloAuthenticated(isAuthenticated);
            return isAuthenticated;
        } catch (err) {
            setError('Falha ao verificar a sessão do Trello.');
            return false;
        }
    };

    React.useEffect(() => {
        const initialize = async () => {
            setIsLoading(true);
            const isAuthenticated = await checkTrelloSession();
            if (isAuthenticated && currentUser) {
                const [allBoards, allManagers] = await Promise.all([
                    window.electronAPI.runTask('trello:get-boards'),
                    window.electronAPI.runTask('data:get-managers')
                ]);
                
                const userBoards = allBoards.filter(board => currentUser.allowedBoardIds.includes(board.id));
                setAllowedBoards(userBoards);
                setManagers(allManagers || []);

                if (userBoards.length > 0) {
                    const firstBoardId = userBoards[0].id;
                    const initialManagerUsername = currentUser.trelloUsername || 'all';
                    setSelectedBoardId(firstBoardId);
                    setSelectedManagerUsername(initialManagerUsername);
                    updateTrelloUrl(firstBoardId, initialManagerUsername);
                }
            }
            setIsLoading(false);
        };
        initialize();
    }, [currentUser]);

    const handleTrelloLoginClick = async () => {
        setIsLoading(true);
        await window.electronAPI.runTask('auth:interactive-trello-login');
        window.location.reload();
    };

    const handleBoardChange = (e) => {
        const boardId = e.target.value;
        setSelectedBoardId(boardId);
        updateTrelloUrl(boardId, selectedManagerUsername);
    };

    const handleManagerChange = (e) => {
        const managerUsername = e.target.value;
        setSelectedManagerUsername(managerUsername);
        updateTrelloUrl(selectedBoardId, managerUsername);
    };

    if (isLoading) {
        return <TrelloSkeleton />;
    }
    
    if (error) {
        return <p className="text-red-500 text-center p-4">{error}</p>;
    }

    if (!isTrelloAuthenticated) {
        return <TrelloLoginPrompt onLoginClick={handleTrelloLoginClick} />;
    }

    return (
        <div className="flex flex-col h-full">
            <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm mb-4 flex-shrink-0">
                <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                        <label htmlFor="board-filter" className="font-semibold text-gray-700">Visualizar Quadro:</label>
                        <select
                            id="board-filter"
                            value={selectedBoardId}
                            onChange={handleBoardChange}
                            className="p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                        >
                            {allowedBoards.length === 0 ? (
                                 <option value="">Nenhum quadro atribuído</option>
                            ) : (
                                 allowedBoards.map(board => (
                                    <option key={board.id} value={board.id}>
                                        {board.name}
                                    </option>
                                ))
                            )}
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
                        <label htmlFor="manager-filter" className="font-semibold text-gray-700">Filtrar por Gestor:</label>
                        <select
                            id="manager-filter"
                            value={selectedManagerUsername}
                            onChange={handleManagerChange}
                            className="p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                        >
                            <option value="all">Todos os Gestores</option>
                            {managers.map(manager => (
                                <option key={manager.ID_Trello} value={manager.Username_Trello}>
                                    {manager.Nome_Gestor}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>
            
            <div className="flex-grow bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                {trelloUrl ? (
                    <webview
                        key={trelloUrl}
                        src={trelloUrl}
                        partition="persist:trello_session"
                        style={{ width: '100%', height: '100%' }}
                    ></webview>
                ) : (
                     <div className="h-full flex items-center justify-center">
                        <p className="text-gray-500">Selecione um quadro para visualizar.</p>
                    </div>
                )}
            </div>
        </div>
    );
}