function LoginScreen({ onLogin, error, isLoading }) {
    const [username, setUsername] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [userType, setUserType] = React.useState('');
    const [localError, setLocalError] = React.useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (isLoading) return;
        if (!userType) {
            setLocalError('Por favor, selecione o tipo de perfil (Gestor ou Analista).');
            return;
        }
        setLocalError('');
        onLogin(username, password, userType);
    };

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col justify-center items-center p-4">
            <div className="w-full max-w-sm">
                <div className="flex justify-center items-center mb-6">
                    <img src="assets/icon.ico" alt="ExtraHub Logo" className="w-10 h-10 mr-4"/>
                    <h1 className="text-3xl font-bold text-gray-800">ExtraHub</h1>
                </div>

                <div className="bg-white p-8 rounded-xl border border-gray-200 shadow-lg">
                    <h2 className="text-xl font-semibold text-center text-gray-700 mb-1">Acesso à Plataforma</h2>
                    <p className="text-sm text-gray-500 text-center mb-6">Use seu nome e CPF para entrar.</p>
                    
                    <form onSubmit={handleSubmit}>
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-600 mb-2">Tipo de Perfil</label>
                            <div className="flex justify-around">
                                <label className="flex items-center space-x-2 cursor-pointer">
                                    <input type="radio" name="userType" value="gestor" checked={userType === 'gestor'} onChange={(e) => setUserType(e.target.value)} className="form-radio h-4 w-4 text-blue-600"/>
                                    <span className="text-gray-700">Gestor</span>
                                </label>
                                <label className="flex items-center space-x-2 cursor-pointer">
                                    <input type="radio" name="userType" value="analista" checked={userType === 'analista'} onChange={(e) => setUserType(e.target.value)} className="form-radio h-4 w-4 text-blue-600"/>
                                    <span className="text-gray-700">Analista</span>
                                </label>
                            </div>
                        </div>

                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-600 mb-1" htmlFor="username">
                                Nome Completo
                            </label>
                            <input
                                id="username"
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="Ex: Carlos Eduardo Turina"
                                required
                            />
                        </div>
                        <div className="mb-6">
                             <label className="block text-sm font-medium text-gray-600 mb-1" htmlFor="password">
                                CPF (apenas números)
                            </label>
                            <input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="•••••••••••"
                                required
                            />
                        </div>
                        
                        {(error || localError) && <p className="text-red-500 text-xs text-center mb-4">Opa, parece que tivemos um erro. Verifique se você marcou seu tipo de perfil corretamente e se os dados de login estão corretos. A ferramenta diferencia maiúsculas de minúsculas.</p>}

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex justify-center items-center disabled:bg-gray-400"
                        >
                            {isLoading ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : 'Entrar'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}