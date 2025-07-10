function AssistedLoginPrompt({ isOpen, onConfirm, onCancel }) {
    if (!isOpen) {
        return null;
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 transition-opacity">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg m-4 text-center p-8">
                <div className="icon-unlock text-5xl text-blue-500 mx-auto mb-4"></div>
                <h2 className="text-2xl font-bold text-gray-800">Ação Necessária</h2>
                <p className="text-gray-600 mt-2 mb-6">
                    Uma janela de login foi aberta. Por favor, realize o login na plataforma externa. Após concluir, clique em "Confirmar" para continuar a automação.
                </p>
                <div className="flex justify-center gap-4">
                    <button
                        onClick={onCancel}
                        className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-semibold"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
                    >
                        Confirmar Login
                    </button>
                </div>
            </div>
        </div>
    );
}