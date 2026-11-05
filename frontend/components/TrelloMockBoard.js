// Quadro Trello SIMULADO, usado apenas no modo demonstração (substitui a <webview> do Trello real).
function TrelloMockBoard({ boardId, labelFilter }) {
    const [data, setData] = React.useState(() => window.ExtraHubDemo.getBoard(boardId));
    const [openCard, setOpenCard] = React.useState(null);
    const [dragOverList, setDragOverList] = React.useState(null);

    const refresh = () => setData(window.ExtraHubDemo.getBoard(boardId));
    React.useEffect(() => { refresh(); setOpenCard(null); }, [boardId]);

    const labelColors = {
        blue: 'bg-sky-600 text-white',
        orange: 'bg-orange-400 text-white',
        green: 'bg-green-500 text-white',
        red: 'bg-red-500 text-white',
    };
    const labelById = Object.fromEntries(data.labels.map(l => [l.id, l]));
    const memberById = Object.fromEntries(data.members.map(m => [m.id, m]));
    const initials = (name) => name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();

    const visibleCards = labelFilter
        ? data.cards.filter(c => c.labelIds.some(id => labelById[id] && labelById[id].name === labelFilter))
        : data.cards;

    const parseBrDate = (str) => {
        if (!str) return null;
        const [d, m, y] = str.split('/').map(Number);
        return new Date(y, m - 1, d);
    };
    const dueBadge = (card) => {
        const due = parseBrDate(card.due);
        if (!due) return null;
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const done = card.listName === 'Concluído';
        const cls = done ? 'bg-green-100 text-green-800' : due < today ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600';
        return <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${cls}`}><span className="icon-clock text-xs"></span>{card.due.slice(0, 5)}</span>;
    };

    const moveCard = (cardId, listName) => {
        window.ExtraHubDemo.moveCard(cardId, listName);
        refresh();
        if (openCard && openCard.id === cardId) setOpenCard({ ...openCard, listName });
    };

    const renderDesc = (desc) => desc.split('\n').map((line, i) => {
        const parts = line.split(/(\*\*[^*]+\*\*)/g).map((p, j) => p.startsWith('**') ? <strong key={j}>{p.slice(2, -2)}</strong> : <span key={j}>{p}</span>);
        return <div key={i} className="min-h-[1em]">{parts}</div>;
    });

    if (!data.board) {
        return <div className="h-full flex items-center justify-center text-gray-500">Quadro não encontrado.</div>;
    }

    return (
        <div className="h-full flex flex-col bg-gradient-to-br from-sky-700 to-indigo-700">
            <div className="flex items-center justify-between px-4 py-3 bg-black bg-opacity-20 text-white flex-shrink-0">
                <div className="flex items-center gap-3">
                    <span className="icon-trello text-xl"></span>
                    <span className="font-bold text-lg">{data.board.name}</span>
                    {labelFilter && (
                        <span className="text-xs bg-white bg-opacity-20 rounded px-2 py-1">Filtro: etiqueta "{labelFilter}"</span>
                    )}
                </div>
                <span className="text-xs bg-yellow-300 text-yellow-900 font-semibold rounded px-2 py-1">Trello simulado</span>
            </div>

            <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
                <div className="flex gap-3 h-full items-start">
                    {data.lists.map(listName => {
                        const cards = visibleCards.filter(c => c.listName === listName);
                        return (
                            <div
                                key={listName}
                                onDragOver={(e) => { e.preventDefault(); setDragOverList(listName); }}
                                onDragLeave={() => setDragOverList(null)}
                                onDrop={(e) => { e.preventDefault(); setDragOverList(null); moveCard(e.dataTransfer.getData('text/plain'), listName); }}
                                className={`w-72 flex-shrink-0 rounded-xl max-h-full flex flex-col ${dragOverList === listName ? 'bg-sky-100' : 'bg-gray-100'}`}
                            >
                                <div className="px-3 pt-3 pb-2 font-semibold text-sm text-gray-700 flex justify-between">
                                    <span>{listName}</span>
                                    <span className="text-gray-400 font-normal">{cards.length}</span>
                                </div>
                                <div className="px-2 pb-2 space-y-2 overflow-y-auto">
                                    {cards.length === 0 && <div className="text-xs text-gray-400 px-1 pb-1">Nenhum cartão</div>}
                                    {cards.map(card => (
                                        <div
                                            key={card.id}
                                            draggable
                                            onDragStart={(e) => e.dataTransfer.setData('text/plain', card.id)}
                                            onClick={() => setOpenCard(card)}
                                            className="bg-white rounded-lg shadow-sm p-2.5 cursor-pointer hover:ring-2 hover:ring-sky-400"
                                        >
                                            <div className="flex flex-wrap gap-1 mb-1.5">
                                                {card.labelIds.map(id => labelById[id] && (
                                                    <span key={id} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${labelColors[labelById[id].color] || 'bg-gray-400 text-white'}`}>{labelById[id].name}</span>
                                                ))}
                                            </div>
                                            <div className="text-sm text-gray-800 leading-snug">{card.name}</div>
                                            <div className="flex items-center justify-between mt-2">
                                                {dueBadge(card)}
                                                <div className="flex -space-x-1">
                                                    {card.memberIds.map(id => memberById[id] && (
                                                        <span key={id} title={memberById[id].name} className="w-6 h-6 rounded-full bg-indigo-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">{initials(memberById[id].name)}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {openCard && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50" onClick={() => setOpenCard(null)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl m-4" onClick={(e) => e.stopPropagation()}>
                        <div className="p-5 border-b flex justify-between items-start gap-4">
                            <div>
                                <h3 className="font-semibold text-gray-800">{openCard.name}</h3>
                                <p className="text-xs text-gray-500 mt-1">na lista <strong>{openCard.listName}</strong> · quadro {data.board.name}</p>
                            </div>
                            <button onClick={() => setOpenCard(null)} className="p-1 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100"><div className="icon-x text-lg"></div></button>
                        </div>
                        <div className="p-5 space-y-4 text-sm">
                            <div className="flex flex-wrap gap-1">
                                {openCard.labelIds.map(id => labelById[id] && (
                                    <span key={id} className={`text-xs font-semibold px-2 py-0.5 rounded ${labelColors[labelById[id].color] || 'bg-gray-400 text-white'}`}>{labelById[id].name}</span>
                                ))}
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <div><div className="text-xs text-gray-500">Início</div><div className="font-medium">{openCard.start || '—'}</div></div>
                                <div><div className="text-xs text-gray-500">Prazo</div><div className="font-medium">{openCard.due || '—'}</div></div>
                                <div><div className="text-xs text-gray-500">Membros</div><div className="font-medium">{openCard.memberIds.map(id => memberById[id] ? memberById[id].name : id).join(', ') || '—'}</div></div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500 mb-1">Descrição</div>
                                <div className="bg-gray-50 border rounded-lg p-3 text-gray-700">{renderDesc(openCard.desc)}</div>
                            </div>
                            <div className="flex items-center gap-2">
                                <label className="text-xs text-gray-500">Mover para:</label>
                                <select value={openCard.listName} onChange={(e) => moveCard(openCard.id, e.target.value)} className="p-1.5 border rounded-md text-sm">
                                    {data.lists.map(l => <option key={l} value={l}>{l}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
