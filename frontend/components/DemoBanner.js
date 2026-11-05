// Selo flutuante do modo demonstração, com dicas de teste e botão para restaurar os dados.
function DemoBanner() {
    const [open, setOpen] = React.useState(false);
    if (!window.EXTRAHUB_DEMO) return null;

    const handleReset = () => {
        if (confirm('Restaurar todos os dados de exemplo? Alterações feitas durante o teste serão perdidas.')) {
            window.ExtraHubDemo.reset();
        }
    };

    return (
        <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2">
            {open && (
                <div className="bg-white border border-amber-200 shadow-2xl rounded-xl w-80 p-4 text-sm text-gray-700">
                    <div className="flex justify-between items-center mb-2">
                        <h4 className="font-semibold text-gray-800">Modo demonstração</h4>
                        <button onClick={() => setOpen(false)} className="p-1 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100"><div className="icon-x"></div></button>
                    </div>
                    <p className="text-xs text-gray-600 mb-3">
                        Google Sheets, Trello, Playwright e as APIs dos órgãos estão <strong>simulados</strong>. Todos os dados são fictícios e ficam salvos só neste navegador.
                    </p>
                    <ul className="text-xs space-y-1.5 mb-4 list-disc pl-4">
                        <li><strong>Fluxo completo:</strong> Automações → Processamento de Dados (etapas 1 a 4) → Atribuição de Casos → Home (Trello).</li>
                        <li><strong>Consulta CPF:</strong> experimente <code className="bg-gray-100 px-1 rounded">{window.ExtraHubDemo.getSampleCpf()}</code>.</li>
                        <li><strong>Login assistido:</strong> Consumidor.gov, HugMe e Procon-SP pedem confirmação manual.</li>
                        <li>No Trello simulado, arraste os cartões entre as listas.</li>
                    </ul>
                    <button onClick={handleReset} className="w-full px-3 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 text-sm font-medium flex items-center justify-center gap-2">
                        <div className="icon-rotate-ccw"></div>
                        Restaurar dados de exemplo
                    </button>
                </div>
            )}
            <button
                onClick={() => setOpen(!open)}
                className="px-3 py-2 bg-amber-400 text-amber-950 rounded-full shadow-lg hover:bg-amber-500 text-xs font-semibold flex items-center gap-2"
            >
                <div className="icon-flask-conical"></div>
                Modo demonstração
            </button>
        </div>
    );
}
