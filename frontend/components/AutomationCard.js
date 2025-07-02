function AutomationCard({ automation, onRun }) {
    const getCategoryStyle = (category) => {
        switch (category) {
            case 'Download': return { bg: 'bg-blue-50', text: 'text-blue-600', icon: 'download-cloud' };
            case 'Consolidação': return { bg: 'bg-purple-50', text: 'text-purple-600', icon: 'file-spreadsheet' };
            case 'API': return { bg: 'bg-teal-50', text: 'text-teal-600', icon: 'webhook' };
            default: return { bg: 'bg-gray-50', text: 'text-gray-600', icon: 'zap' };
        }
    };

    const style = getCategoryStyle(automation.category);

    return (
        <div className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-lg transition-shadow duration-300 flex flex-col">
            <div className="flex items-start gap-4">
                <div className={`w-11 h-11 rounded-lg flex-shrink-0 flex items-center justify-center ${style.bg}`}>
                    {automation.category === 'Download' ? (
                        <img src="assets/download.png" alt="Download Icon" className="w-6 h-6" />
                    ) : (
                        <div className={`icon-${style.icon} text-xl ${style.text}`}></div>
                    )}
                </div>
                <div>
                    <h3 className="font-semibold text-gray-900 leading-tight">{automation.name}</h3>
                    <p className="text-sm text-gray-500 mt-1">{automation.description}</p>
                </div>
            </div>

            <div className="flex-grow"></div>

            <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                <div className={`px-2 py-1 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
                    {automation.category}
                </div>
                <button
                    onClick={() => onRun(automation)}
                    className="px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2"
                >
                    <div className="icon-play text-base"></div>
                    Executar
                </button>
            </div>
        </div>
    );
}