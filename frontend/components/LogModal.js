function LogModal({ isOpen, onClose, log, taskName }) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 transition-opacity">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col m-4">
                <div className="flex items-center justify-between p-4 border-b">
                    <h2 className="text-lg font-semibold text-gray-800">
                        Executando: <span className="text-blue-600">{taskName}</span>
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
                    >
                        <div className="icon-x text-xl"></div>
                    </button>
                </div>
                <div className="p-4 flex-grow bg-gray-900 text-gray-300 font-mono text-sm overflow-y-auto log-output">
                    <pre className="whitespace-pre-wrap">{log}</pre>
                </div>
                <div className="p-3 bg-gray-50 border-t text-right">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm"
                    >
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    );
}