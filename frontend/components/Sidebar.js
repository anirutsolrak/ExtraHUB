function Sidebar({ activeTab, setActiveTab, menuItems }) { 
  return (
    <div className="w-64 bg-white shadow-lg h-screen flex flex-col flex-shrink-0 sticky top-0">
      <div className="p-6 border-b flex items-center">
        <img src="assets/icon.ico" alt="ExtraHub Logo" className="w-7 h-7 mr-3"/>
        <h1 className="text-xl font-bold text-gray-800">
          ExtraHub
        </h1>
      </div>
      
      <nav className="flex-1 p-4">
        {menuItems.map(item => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-2 transition-colors text-sm font-medium ${
              activeTab === item.id 
                ? 'bg-blue-50 text-blue-700' 
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <div className={`icon-${item.icon} text-lg`}></div>
            {item.label}
          </button>
        ))}
      </nav>
      
      <div className="p-4 border-t">
        <div className="flex items-center gap-3">
          <img
            src="https://img.freepik.com/icones-gratis/robo_318-698229.jpg"
            alt="Avatar"
            className="w-10 h-10 rounded-full bg-gray-200"
          />
          <div>
            <div className="font-semibold text-sm text-gray-800">Usuário Automação</div>
            <div className="text-xs text-gray-500">Online</div>
          </div>
        </div>
      </div>

      <div className="p-4 border-t text-center text-xs text-gray-400">
        <a href="https://www.flaticon.com/br/icones-gratis/ui" title="ui ícones" target="_blank" rel="noopener noreferrer" className="hover:text-gray-600">
          Ui ícones criados por lakonicon - Flaticon
        </a>
      </div>
    </div>
  );
}