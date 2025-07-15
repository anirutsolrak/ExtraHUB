README.md:
```markdown
# ExtraHub - Documentação Técnica

Bem-vindo à documentação do ExtraHub, o Hub de Gestão de Automações e Relatórios. Este documento serve como um guia completo para a instalação, uso, desenvolvimento e solução de problemas da aplicação.

## Índice

- [1. Introdução](#1-introdução)
- [2. Instalação e Configuração](#2-instalação-e-configuração)
  - [2.1. Pré-requisitos](#21-pré-requisitos)
  - [2.2. Passos de Instalação](#22-passos-de-instalação)
  - [2.3. Configuração do Ambiente](#23-configuração-do-ambiente)
    - [Arquivo `.env`](#arquivo-env)
    - [Arquivo `service_account.json`](#arquivo-service_accountjson)
    - [Configuração da Planilha Google Sheets](#configuração-da-planilha-google-sheets)
- [3. Guia do Usuário](#3-guia-do-usuário)
  - [3.1. Login](#31-login)
  - [3.2. Interface Principal e Acessos](#32-interface-principal-e-acessos)
    - [Controle de Acesso por Perfil](#controle-de-acesso-por-perfil)
  - [3.3. Funcionalidades por Tela](#33-funcionalidades-por-tela)
    - [Home](#home)
    - [Atribuição de Casos](#atribuição-de-casos)
    - [Gerenciar Acessos](#gerenciar-acessos)
    - [Automações](#automações)
    - [Pipeline de Dados](#pipeline-de-dados)
    - [Consulta CPF](#consulta-cpf)
    - [Audiências](#audiências)
    - [Configurações](#configurações)
- [4. Guia do Desenvolvedor](#4-guia-do-desenvolvedor)
  - [4.1. Estrutura do Projeto](#41-estrutura-do-projeto)
  - [4.2. Fluxo de Comunicação (Frontend <-> Backend)](#42-fluxo-de-comunicação-frontend---backend)
  - [4.3. Adicionando uma Nova Automação](#43-adicionando-uma-nova-automação)
  - [4.4. Configurações Avançadas de Desenvolvimento](#44-configurações-avançadas-de-desenvolvimento)
- [5. Guia de Testes para Desenvolvedores](#5-guia-de-testes-para-desenvolvedores)
  - [5.1. Aviso Importante sobre Testes](#51-aviso-importante-sobre-testes)
  - [5.2. Fluxo de Teste Seguro (Simulando o Pipeline)](#52-fluxo-de-teste-seguro-simulando-o-pipeline)
  - [5.3. Credenciais de Teste](#53-credenciais-de-teste)
- [6. Manutenção, Limitações e Escalabilidade](#6-manutenção-limitações-e-escalabilidade)
  - [6.1. Gerenciamento de Credenciais Estáticas](#61-gerenciamento-de-credenciais-estáticas)
  - [6.2. Atualização de URLs e Seletores](#62-atualização-de-urls-e-seletores)
  - [6.3. Limitações de API e Escalabilidade](#63-limitações-de-api-e-escalabilidade)
- [7. Solução de Problemas (Troubleshooting)](#7-solução-de-problemas-troubleshooting)
  - [7.1. Erros de Login](#71-erros-de-login)
  - [7.2. Falhas nas Automações](#72-falhas-nas-automações)
  - [7.3. Problemas de Conexão (Google/Trello)](#73-problemas-de-conexão-googletrello)
  - [7.4. Depuração Geral](#74-depuração-geral)

---

## 1. Introdução

O ExtraHub é uma aplicação desktop construída com Electron, React e Node.js, projetada para centralizar e otimizar processos de backoffice. Suas principais funções incluem:
- **Automação de Downloads**: Executa rotinas de login e download de relatórios em diversas plataformas externas (Procon, Consumidor.gov, etc.).
- **Pipeline de Dados**: Consolida, processa e padroniza os dados baixados, enviando-os para uma base centralizada no Google Sheets.
- **Gestão de Casos**: Permite a atribuição de casos a analistas e gestores, criando cartões correspondentes no Trello.
- **Gerenciamento de Acessos**: Controla as permissões de gestores e analistas diretamente pela interface.
- **Consultas Rápidas**: Oferece ferramentas para buscar informações diretamente na base de dados online.

## 2. Instalação e Configuração

### 2.1. Pré-requisitos

- **Node.js**: Versão 18.x ou superior.
- **NPM**: Geralmente instalado junto com o Node.js.

### 2.2. Passos de Instalação

1.  **Clone o repositório**:
    ```bash
    git clone <url-do-repositorio>
    cd extrahub
    ```

2.  **Instale as dependências**:
    Este comando instalará todas as bibliotecas listadas no `package.json` e executará o script `postinstall`, que baixa a versão correta do navegador Chromium para o Playwright.
    ```bash
    npm install
    ```

3.  **Execute a aplicação em modo de desenvolvimento**:
    ```bash
    npm start
    ```

4.  **(Opcional) Empacote a aplicação para distribuição**:
    Este comando criará um instalador executável na pasta `dist`.
    ```bash
    npm run pack
    ```

### 2.3. Configuração do Ambiente

A configuração correta dos arquivos de ambiente é **crítica** para o funcionamento da aplicação.

#### Arquivo `.env`

Na pasta `backend`, crie um arquivo chamado `.env` e preencha as seguintes variáveis com as credenciais apropriadas.

##### Credenciais de Automação
```dotenv
# Credenciais do Proconsumidor (usado para login automatizado)
CPF=SEU_CPF_DE_LOGIN
SENHA=SUA_SENHA_DE_LOGIN

# Credenciais do Procon SJC
PROCON_SJC_CODIGO=CODIGO_DA_EMPRESA
PROCON_SJC_SENHA=SENHA_DA_EMPRESA

# Credenciais do Procon Campinas
PROCON_CAMPINAS_CODIGO=CODIGO_DA_EMPRESA
PROCON_CAMPINAS_SENHA=SENHA_DA_EMPRESA

# Credenciais do BCB-RDR
BCB_RDR_USER=USUARIO_BCB
BCB_RDR_SENHA=SENHA_BCB

# Token da API do Procon Uberlândia
PROCON_UBERLANDIA_TOKEN=SEU_TOKEN_DE_AUTORIZACAO
```

##### Credenciais de APIs (Google & Trello)
```dotenv
# ID da sua planilha principal do Google Sheets
GOOGLE_SHEET_ID=ID_DA_PLANILHA_VAI_AQUI

# Credenciais da API do Trello
TRELLO_API_KEY=SUA_CHAVE_DE_API_TRELLO
TRELLO_API_TOKEN=SEU_TOKEN_DE_API_TRELLO
```

##### Variáveis Obsoletas (Não utilizadas)
As seguintes variáveis são de versões antigas e não são mais utilizadas pela aplicação. Podem ser removidas do seu arquivo `.env`.
```dotenv
# PROXY_SERVER=
# CONSUMIDOR_GOV_CPF=
# CONSUMIDOR_GOV_SENHA=
# PROCON_MT_USER=
# PROCON_MT_SENHA=
# TRELLO_API_SECRET=
# TRELLO_BOARD_ID=
# LIST_ID_ENTRANTES=
# TRELLO_LOGIN_EMAIL=
# TRELLO_LOGIN_PASSWORD=
```

#### Arquivo `service_account.json`

A autenticação com o Google Sheets é feita via uma Conta de Serviço para não depender de login de usuário.

1.  Acesse o [Google Cloud Console](https://console.cloud.google.com/).
2.  Crie ou selecione um projeto.
3.  Vá para "APIs e Serviços" > "Credenciais".
4.  Clique em "Criar Credenciais" > "Conta de Serviço".
5.  Dê um nome à conta, atribua o papel de "Editor" e conclua.
6.  Na lista de contas de serviço, clique na que você criou.
7.  Vá para a aba "Chaves", clique em "Adicionar Chave" > "Criar nova chave".
8.  Selecione o formato **JSON** e clique em "Criar". Um arquivo `.json` será baixado.
9.  Renomeie este arquivo para `service_account.json` e coloque-o na pasta `backend`.

#### Configuração da Planilha Google Sheets

1.  Abra o arquivo `service_account.json` e copie o valor do campo `client_email`.
2.  Abra sua planilha no Google Sheets.
3.  Clique em "Compartilhar".
4.  Cole o `client_email` no campo de compartilhamento e dê permissão de **Editor**.
5.  Certifique-se de que sua planilha possui as seguintes abas (com os nomes exatos):
    - `Base_Mae_Final`
    - `Gestores`
    - `Analistas`
    - `Acessos_Quadros`

## 3. Guia do Usuário

### 3.1. Login

A tela de login permite o acesso de dois tipos de perfis:

-   **Gestor**: Tem acesso a todas as funcionalidades, incluindo automações, pipeline de dados e gerenciamento de acessos.
-   **Analista**: Tem acesso a um conjunto limitado de funcionalidades, como a tela Home (informativa), Consulta de CPF e Audiências.

Para fazer login, o usuário deve:
1.  Selecionar seu tipo de perfil: "Gestor" ou "Analista".
2.  Digitar seu Nome Completo e CPF (apenas números).
3.  Clicar em "Entrar".

As credenciais são validadas contra as abas `Gestores` e `Analistas` da planilha Google Sheets.

### 3.2. Interface Principal e Acessos

A interface é dividida em duas áreas: uma **barra lateral (Sidebar)** à esquerda para navegação e uma **área de conteúdo principal** à direita. O avatar e o nome do usuário logado são exibidos na parte inferior da barra lateral, junto com o botão de logout.

#### Controle de Acesso por Perfil

O menu lateral é adaptado de acordo com o perfil do usuário:

-   **Gestor**: Possui **acesso total**. Todos os itens do menu são visíveis: `Home`, `Atribuição de Casos`, `Gerenciar Acessos`, `Automações`, `Pipeline de Dados`, `Consulta CPF`, `Audiências` e `Configurações`.
-   **Analista**: Possui **acesso restrito** às ferramentas de sua rotina. Os itens visíveis são: `Home`, `Consulta CPF` e `Configurações`.

### 3.3. Funcionalidades por Tela

#### Home

-   **Para Gestores**: Exibe uma `webview` interativa do Trello, oferecendo uma visão macro da operação. O gestor pode alternar livremente entre os quadros aos quais tem acesso e filtrar os cartões por qualquer gestor membro daquele quadro. É necessário autenticar no Trello na primeira vez que acessar.
-   **Para Analistas**: Também exibe a `webview` do Trello, mas com uma **visão restrita e filtrada**. A visualização é automaticamente configurada para mostrar apenas os cartões que possuem a etiqueta (label) com o nome do analista, garantindo foco total nos casos que são de sua responsabilidade.

#### Atribuição de Casos

*Acesso: Somente Gestores.*
Tela para distribuir novos casos (com status "Novo" na `Base_Mae_Final`) para a equipe.
1.  Selecione um Quadro Trello no menu dropdown.
2.  A tabela será preenchida com os casos a serem atribuídos.
3.  Para cada caso, selecione um Analista e um Gestor nos menus dropdown.
4.  Após selecionar as atribuições, clique em "Lançar". A aplicação criará os cartões no Trello e atualizará o status na planilha.

#### Gerenciar Acessos

*Acesso: Somente Gestores.*
Permite gerenciar as permissões do workspace.
-   **Acessos dos Gestores**: Uma matriz de checkboxes permite conceder ou revogar o acesso de cada gestor a cada quadro Trello.
-   **Gerenciar Analistas**: Um formulário permite adicionar novos analistas, associando-os a um quadro específico. Uma tabela lista os analistas existentes com a opção de removê-los.

#### Automações

*Acesso: Somente Gestores.*
O coração da ferramenta.
-   **Seleção de Período**: No topo, o gestor pode definir uma data inicial e final para filtrar os relatórios a serem baixados.
-   **Cards de Automação**: Cada card representa uma rotina de download. Clicar em "Executar" inicia o processo. Um modal exibirá o log da automação em tempo real.
-   **Login Assistido**: Algumas automações (Gov.br, HugMe, Procon-SP) requerem login manual em uma janela pop-up. O usuário deve realizar o login e clicar em "Confirmar Login" no pop-up da aplicação para continuar.

#### Pipeline de Dados

*Acesso: Somente Gestores.*
Conjunto de tarefas para processar os dados baixados. **Devem ser executadas na ordem apresentada**.
1.  **Consolidar Relatórios Locais**: Junta todos os arquivos baixados de uma mesma fonte em um único arquivo consolidado.
2.  **Criar Base Bruta Local**: Pega os arquivos consolidados e os une em um único arquivo Excel (`Base_Mae_Bruta.xlsx`) com uma aba por fonte.
3.  **Gerar Base Mãe Final Local**: Padroniza as colunas e os dados da base bruta, gerando o arquivo `Base_Mae_Final.xlsx`.
4.  **Upload Base Mãe para Google Sheets**: Envia apenas os registros novos (que não existem na planilha online) do arquivo local para a `Base_Mae_Final` no Google Sheets.

#### Consulta CPF

*Acesso: Gestores e Analistas.*
Busca por um CPF específico na `Base_Mae_Final` do Google Sheets e exibe todos os registros encontrados.

#### Audiências

*Acesso: Gestores e Analistas.*
Busca e exibe todos os casos na `Base_Mae_Final` do Google Sheets cujo status contenha a palavra "audiência".

#### Configurações

*Acesso: Gestores e Analistas.*
-   **Pasta Principal**: Permite selecionar a pasta de trabalho onde todos os relatórios e bases de dados serão salvos. **Esta configuração é obrigatória.**
-   **Conexão com Google**: Exibe o status da conexão com a API do Google, que é estabelecida na inicialização.

## 4. Guia do Desenvolvedor

### 4.1. Estrutura do Projeto

```
extrahub/
├── backend/
│   ├── .env                  # (A ser criado) Credenciais e variáveis de ambiente
│   └── service_account.json  # (A ser criado) Chave da conta de serviço do Google
├── electron/
│   ├── main_electron.js      # Ponto de entrada principal do processo Electron
│   ├── handlers/
│   │   ├── authHandlers.js   # Lógica de autenticação e automações com login assistido
│   │   ├── automationHandlers.js # Lógica para automações com Playwright
│   │   └── dataHandlers.js     # Lógica para manipulação de dados (Excel, Google Sheets, Trello API)
│   └── utils.js              # Funções utilitárias compartilhadas
├── frontend/
│   ├── assets/               # Ícones e imagens
│   ├── components/           # Componentes React (arquivos .js com JSX)
│   ├── index.html            # Arquivo HTML principal que carrega o React e os componentes
│   └── app.js                # Componente React principal que gerencia o estado da UI
├── node_modules/             # Dependências
└── package.json              # Configurações do projeto, scripts e dependências
└── preload.js                # Script que expõe APIs do Node/Electron para o frontend de forma segura
```

### 4.2. Fluxo de Comunicação (Frontend <-> Backend)

A comunicação entre a interface (React) e o backend (Node.js) é feita através do sistema de IPC (Inter-Process Communication) do Electron.

1.  **Frontend (`app.js`)**: Uma ação do usuário (ex: clicar em um botão) chama uma função, como `window.electronAPI.runTask('nome-da-tarefa', { ...args })`.
2.  **Preload (`preload.js`)**: O script `preload.js` atua como uma ponte segura. Ele expõe a função `runTask` para o `window` do frontend usando `contextBridge`. Essa função, por sua vez, usa `ipcRenderer.invoke` para enviar uma mensagem ao processo principal.
3.  **Backend (`main_electron.js` e `handlers/*.js`)**: No processo principal, um handler (ouvinte) como `ipcMain.handle('nome-da-tarefa', ...)` intercepta a mensagem. Ele então executa a lógica de backend correspondente (ex: uma automação com Playwright ou uma consulta à API do Google).
4.  **Retorno**: O resultado da lógica de backend é retornado pela `Promise` do `ipcMain.handle` e viaja de volta para o frontend, onde o `await` do `ipcRenderer.invoke` é resolvido. Logs e atualizações de progresso são enviados de forma assíncrona usando `mainWindow.webContents.send()`.

### 4.3. Adicionando uma Nova Automação

Exemplo: Adicionar uma automação simples que baixa um arquivo.

1.  **Criar a Lógica (Backend)**: No arquivo `electron/handlers/automationHandlers.js`, crie uma nova função de lógica usando o Playwright.
    ```javascript
    // Em automationHandlers.js
    ipcMain.handle('automation:run-nova-automacao', (event, args) => runAutomation("Nova Automação", async (page) => {
        const { basePath } = args;
        // ... sua lógica com Playwright aqui ...
        await page.goto("https://exemplo.com");
        // ...
        logging.log("Nova automação executada!");
    }, { logging }));
    ```

2.  **Registrar o Handler**: A função `registerAutomationHandlers` já é chamada em `main_electron.js`, então o passo anterior é suficiente para registrar o novo handler.

3.  **Adicionar o Card (Frontend)**: No arquivo `frontend/app.js`, adicione um novo objeto ao array `automationsConfig`.
    ```javascript
    // Em app.js, dentro do array automationsConfig
    const automationsConfig = [
        // ... outras automações ...
        {
            id: 99,
            name: "Nova Automação de Exemplo",
            ipcName: 'automation:run-nova-automacao', // O mesmo nome do handler
            category: "Download",
            usesDates: false, // Define se usa os campos de data
            description: "Descrição da nova automação."
        },
    ];
    ```

A interface será renderizada automaticamente com o novo card, e o fluxo de comunicação já está pronto para executá-lo.

### 4.4. Configurações Avançadas de Desenvolvimento

Para criar um ambiente de desenvolvimento ou teste totalmente isolado, você pode alterar os seguintes pontos de conexão:

-   **Mudar a Planilha Google Sheets**:
    1.  Crie uma nova planilha no Google Sheets com uma cópia das abas (`Base_Mae_Final`, `Gestores`, `Analistas`, `Acessos_Quadros`).
    2.  Compartilhe esta nova planilha com o `client_email` da sua `service_account.json`, dando permissão de **Editor**.
    3.  Copie o ID da nova planilha (da URL, por exemplo: `.../spreadsheets/d/ID_DA_PLANILHA/edit`).
    4.  Cole este novo ID na variável `GOOGLE_SHEET_ID` do seu arquivo `.env`.

-   **Mudar a Organização Trello**:
    A aplicação está configurada para buscar os quadros de uma organização específica do Trello.
    1.  O ID desta organização está fixo no código-fonte.
    2.  Para alterá-lo, abra o arquivo `electron/handlers/dataHandlers.js`.
    3.  Localize a linha: `const organizationId = "68484f358ac9bdde06499a29";`
    4.  Substitua o ID pelo da sua organização Trello. Você pode obter o ID da sua organização via API do Trello.

## 5. Guia de Testes para Desenvolvedores

Esta seção descreve como testar as funcionalidades do ExtraHub de forma segura, sem interferir com os dados de produção.

### 5.1. Aviso Importante sobre Testes

**ATENÇÃO:** As seções **Automações** e as etapas iniciais do **Pipeline de Dados** (`Consolidar Relatórios` e `Criar Base Bruta`) interagem com plataformas externas e manipulam dados reais. **NÃO** execute estas automações para testes de interface ou de outras funcionalidades. O uso indevido pode resultar em downloads de dados desnecessários, processamento incorreto de informações de produção e potenciais bloqueios de credenciais.

Utilize as rotinas de automação e pipeline apenas se o objetivo do seu teste for especificamente validar ou depurar essas próprias rotinas.

### 5.2. Fluxo de Teste Seguro (Simulando o Pipeline)

Para testar o fluxo de dados da aplicação (processamento, upload, atribuição) sem executar as automações de download, siga estes passos:

1.  **Crie uma Base Bruta Fictícia**:
    *   Na sua pasta de trabalho (selecionada em `Configurações`), crie manualmente um arquivo Excel chamado `Base_Mae_Bruta.xlsx`.
    *   Dentro deste arquivo, crie abas com nomes que correspondam às fontes de dados. O nome da aba é crucial para a aplicação identificar a fonte.

    **Exemplo para Proconsumidor:**
    *   **Nome da Aba**: A aba deve ser nomeada exatamente como `Proconsumidor`.
    *   **Posição dos Cabeçalhos**: Os títulos das colunas (cabeçalhos) devem estar na **primeira linha** da planilha (linha 1).
    *   **Posição dos Dados**: Os dados fictícios devem começar a partir da **segunda linha** (linha 2).
    *   **Cabeçalhos Obrigatórios**: Para que a padronização funcione, utilize os seguintes nomes de coluna:
        - `Número de Atendimento`
        - `Documento Consumidor - CPF/CNPJ`
        - `Nome Consumidor`
        - `Gênero do Consumidor`
        - `Faixa Etária do Consumidor`
        - `CNPJ ou CPF Fornecedor`
        - `Razão Social`
        - `Nome Fantasia`
        - `Posto de Atendimento`
        - `Data de Abertura`
        - `Data da Finalização`
        - `Situação`
        - `Classificação da Decisão`

2.  **Execute a Geração da Base Final Local**:
    *   Vá para a tela `Pipeline de Dados`.
    *   Clique para executar a etapa **3. Gerar Base Mãe Final Local**.
    *   Isso irá ler o seu arquivo `Base_Mae_Bruta.xlsx` fictício e criar um novo arquivo, `Base_Mae_Final.xlsx`, na mesma pasta.

3.  **Faça o Upload para o Google Sheets**:
    *   Ainda na tela `Pipeline de Dados`, execute a etapa **4. Upload Base Mãe para Google Sheets**.
    *   A aplicação irá comparar seu `Base_Mae_Final.xlsx` local com a planilha online e fará o upload apenas dos seus registros fictícios (que são novos).

4.  **Verifique os Dados na Aplicação**:
    *   Vá para a tela `Atribuição de Casos`. Seus casos fictícios (com status "Novo") devem aparecer na lista, prontos para serem atribuídos.
    *   Use a `Consulta CPF` com um dos CPFs fictícios que você criou para confirmar que os dados foram salvos corretamente.

### 5.3. Credenciais de Teste

Para testes gerais da interface e funcionalidades (excluindo as automações), utilize o seguinte perfil de **Gestor**:

-   **Perfil**: `Gestor`
-   **Nome Completo**: `Carlos Eduardo Turina`
-   **CPF**: `43836007860`

## 6. Manutenção, Limitações e Escalabilidade

### 6.1. Gerenciamento de Credenciais Estáticas

A ferramenta utiliza uma combinação de credenciais dinâmicas (inseridas pelo usuário durante o uso, como no login assistido) e credenciais estáticas (configuradas no ambiente de desenvolvimento).

**É crucial entender que as credenciais estáticas podem expirar, ser alteradas ou bloqueadas por segurança.** Quando isso ocorre, as automações que dependem delas falharão.

-   **Onde atualizar**: Todas as credenciais estáticas estão no arquivo `backend/.env`.
-   **Quais serviços são afetados**: Proconsumidor, Procon SJC, Procon Campinas, BCB-RDR, API do Procon Uberlândia, API do Trello e API do Google.
-   **Ação corretiva**: Se uma automação falhar, o primeiro passo é verificar se as credenciais correspondentes no arquivo `.env` ainda são válidas. Tente fazer login manualmente no site do serviço com essas credenciais. Se falharem, atualize o arquivo `.env` com as novas credenciais e reinicie o ExtraHub.

### 6.2. Atualização de URLs e Seletores

As automações dependem da estrutura HTML (URLs, IDs de elementos, classes CSS) dos sites externos. Esses sites podem ser atualizados a qualquer momento, o que pode quebrar as automações.

-   **Sintoma**: Uma automação falha com um erro de "timeout" ou "element not found" no log.
-   **Ação corretiva**: Isso requer uma atualização no código-fonte. Um desenvolvedor precisará:
    1.  Inspecionar o site que falhou para encontrar o novo URL ou seletor do elemento (ex: campo de login, botão de download).
    2.  Atualizar o código correspondente no arquivo de handler apropriado (em `electron/handlers/`).

### 6.3. Limitações de API e Escalabilidade

A ferramenta utiliza as APIs do Google Sheets e do Trello, ambas configuradas para usar planos gratuitos. Esses planos têm limites de uso (cotas de requisições por minuto/dia).

-   **Sintoma**: Erros como `429 Too Many Requests`, `API rate limit exceeded` ou `Resource has been exhausted` aparecem nos logs, e a funcionalidade (ex: upload para o Sheets, criação de cards no Trello) falha.
-   **Causa**: Uso excessivo da aplicação em um curto período, excedendo as cotas do plano gratuito.
-   **Escalabilidade**: Para um uso mais intensivo ou empresarial, é **altamente recomendado** migrar para planos pagos tanto no projeto do Google Cloud quanto no workspace do Trello. Isso garantirá cotas de API mais altas, maior confiabilidade e melhor desempenho geral da ferramenta.

## 7. Solução de Problemas (Troubleshooting)

### 7.1. Erros de Login

-   **Sintoma**: Mensagem de erro "Opa, parece que tivemos um erro..."
-   **Causa 1**: Tipo de perfil (Gestor/Analista) não selecionado ou incorreto.
-   **Causa 2**: Nome ou CPF digitados incorretamente. O nome deve ser **exatamente** como está na planilha, incluindo maiúsculas e minúsculas.
-   **Causa 3**: O usuário não existe na aba `Gestores` ou `Analistas` da planilha Google Sheets.

### 7.2. Falhas nas Automações

-   **Sintoma**: A automação para no meio do caminho com um erro no modal de log.
-   **Causa 1: Credenciais inválidas**: Veja a seção [6.1. Gerenciamento de Credenciais Estáticas](#61-gerenciamento-de-credenciais-estáticas).
-   **Causa 2: Mudança na interface do site**: Veja a seção [6.2. Atualização de URLs e Seletores](#62-atualização-de-urls-e-seletores).
-   **Causa 3: Problemas com o Playwright/Chromium**:
    -   **Solução**: Tente remover a pasta `node_modules` e o arquivo `package-lock.json` e rodar `npm install` novamente para forçar uma reinstalação limpa.

### 7.3. Problemas de Conexão (Google/Trello)

-   **Sintoma**: A aplicação falha ao iniciar ou ao tentar acessar dados online (ex: tela de login não funciona, consulta de CPF dá erro).
-   **Causa 1: `GOOGLE_SHEET_ID` incorreto**: Verifique o ID no arquivo `.env`.
-   **Causa 2: `service_account.json` ausente ou inválido**: Certifique-se de que o arquivo está na pasta `backend` e não está corrompido.
-   **Causa 3: Conta de serviço sem permissão**: Verifique se o `client_email` da conta de serviço foi compartilhado como **Editor** na planilha.
-   **Causa 4: Credenciais do Trello inválidas**: Verifique `TRELLO_API_KEY` e `TRELLO_API_TOKEN` no arquivo `.env`.
-   **Causa 5: Limites de API excedidos**: Veja a seção [6.3. Limitações de API e Escalabilidade](#63-limitações-de-api-e-escalabilidade).

### 7.4. Depuração Geral

-   **Abra o DevTools**: Em `electron/main_electron.js`, descomente a linha `mainWindow.webContents.openDevTools();`. Isso abrirá o console do Chromium junto com a aplicação, permitindo inspecionar elementos da UI, ver logs do console do frontend e depurar o JavaScript do React.
-   **Logs de Backend**: Os logs do processo principal (backend) são exibidos diretamente no terminal onde você executou `npm start`. Fique de olho neles para erros de Node.js, Playwright e APIs.
```