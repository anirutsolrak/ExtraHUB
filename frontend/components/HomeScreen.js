function HomeScreen({ currentUser }) {
    const [isLoading, setIsLoading] = React.useState(true);
    const [error, setError] = React.useState('');
    const [trelloUrl, setTrelloUrl] = React.useState('');
    const [allowedBoards, setAllowedBoards] = React.useState([]);
    const [selectedBoardId, setSelectedBoardId] = React.useState('');
    const [isTrelloAuthenticated, setIsTrelloAuthenticated] = React.useState(false);
    const webviewRef = React.useRef(null);

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

    const updateTrelloUrlForGestor = (boardId) => {
        if (!boardId) return;
        setTrelloUrl(`https://trello.com/b/${boardId}`);
    };

    const checkTrelloSession = async () => {
        try {
            const status = await window.electronAPI.runTask('auth:check-trello-session');
            setIsTrelloAuthenticated(status.isAuthenticated);
            return status.isAuthenticated;
        } catch (err) {
            setError('Falha ao verificar a sessão do Trello.');
            return false;
        }
    };
    
    React.useEffect(() => {
        const initialize = async () => {
            setIsLoading(true);
            setError('');
            
            const isAuthenticated = await checkTrelloSession();
            if (!isAuthenticated) {
                setIsLoading(false);
                return;
            }

            if (currentUser.role === 'gestor') {
                try {
                    const allBoards = await window.electronAPI.runTask('trello:get-boards');
                    const userBoards = allBoards.filter(board => currentUser.allowedBoardIds.includes(board.id));
                    setAllowedBoards(userBoards);
                    if (userBoards.length > 0) {
                        const firstBoardId = userBoards[0].id;
                        setSelectedBoardId(firstBoardId);
                        updateTrelloUrlForGestor(firstBoardId);
                    }
                } catch (e) {
                    setError(`Erro ao carregar dados do gestor: ${e.message}`);
                }
            } else if (currentUser.role === 'analista') {
                if (currentUser.boardId && currentUser.trelloLabelName) {
                    const url = `https://trello.com/b/${currentUser.boardId}?filter=label:${encodeURIComponent(currentUser.trelloLabelName)}`;
                    setTrelloUrl(url);
                } else {
                    setError('Dados do analista (quadro ou nome para filtro) não encontrados. Contate o administrador.');
                }
            }
            
            setIsLoading(false);
        };
        
        if (currentUser) {
            initialize();
        }
    }, [currentUser]);

    React.useEffect(() => {
        const webview = webviewRef.current;
        if (webview && currentUser && currentUser.role === 'gestor') {
            const handleLoad = () => {
                webview.executeJavaScript(`
                    setTimeout(() => {
                        const clearButton = document.querySelector('a.js-clear-all-filters');
                        if (clearButton) {
                            clearButton.click();
                        } else {
                            const textButton = Array.from(document.querySelectorAll('a, button')).find(el => el.textContent.trim() === 'Limpar filtros');
                            if(textButton) {
                                textButton.click();
                            }
                        }
                    }, 1500);
                `);
            };
            
            webview.addEventListener('did-finish-load', handleLoad);

            return () => {
                if (webview) {
                    webview.removeEventListener('did-finish-load', handleLoad);
                }
            };
        }
    }, [trelloUrl, currentUser]);

    const handleTrelloLoginClick = async () => {
        setIsLoading(true);
        await window.electronAPI.runTask('auth:interactive-trello-login');
        window.location.reload(); 
    };

    const handleBoardChange = (e) => {
        const boardId = e.target.value;
        setSelectedBoardId(boardId);
        updateTrelloUrlForGestor(boardId);
    };
    
    if (isLoading) return <TrelloSkeleton />;
    if (error) return <p className="text-red-500 text-center p-4">{error}</p>;
    if (!isTrelloAuthenticated) return <TrelloLoginPrompt onLoginClick={handleTrelloLoginClick} />;

    return (
        <div className="flex flex-col h-full">
            {currentUser.role === 'gestor' && (
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
                    </div>
                </div>
            )}
            
            <div className="flex-grow bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                {trelloUrl ? (
                    <webview
                        ref={webviewRef}
                        key={trelloUrl}
                        src={trelloUrl}
                        partition="persist:trello_session"
                        style={{ width: '100%', height: '100%' }}
                    ></webview>
                ) : (
                     <div className="h-full flex items-center justify-center">
                        <p className="text-gray-500">{currentUser.role === 'gestor' ? 'Selecione um quadro para visualizar.' : 'Carregando quadro do analista...'}</p>
                    </div>
                )}
            </div>
        </div>
    );
}