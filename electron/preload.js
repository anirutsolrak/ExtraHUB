const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Comunicação Geral
    selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
    onLog: (callback) => ipcRenderer.on('log', (event, ...args) => callback(...args)),
    onTaskFinished: (callback) => ipcRenderer.on('task-finished', (event, ...args) => callback(...args)),
    onTaskError: (callback) => ipcRenderer.on('task-error', (event, ...args) => callback(...args)),

    // Automações de Login Assistido
    startGovLogin: () => ipcRenderer.invoke('auth:start-gov-login'),
    startProconSpLogin: () => ipcRenderer.invoke('auth:start-proconsp-login'),
    startHugmeLogin: () => ipcRenderer.invoke('auth:start-hugme-login'),
    confirmLogin: () => ipcRenderer.send('login-confirmed'),
    cancelLogin: () => ipcRenderer.send('login-canceled'),
    onAssistedLoginStarted: (callback) => ipcRenderer.on('assisted-login-started', callback),
    onAssistedLoginFinished: (callback) => ipcRenderer.on('assisted-login-finished', callback),

    // Handlers de Tarefas - O frontend só precisa de uma função genérica
    runTask: (taskName, args) => ipcRenderer.invoke(taskName, args)
});