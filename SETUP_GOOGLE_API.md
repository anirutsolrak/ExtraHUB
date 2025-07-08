# Guia de Configuração da API do Google com Conta de Serviço

Siga estes passos para permitir que a aplicação acesse o Google Sheets de forma programática.

### 1. Criar uma Conta de Serviço

1.  Acesse o [Google Cloud Console](https://console.cloud.google.com/) e selecione o projeto que você criou anteriormente.
2.  No menu de navegação (ícone de hambúrguer), vá para **IAM e admin** > **Contas de serviço**.
3.  Clique em **+ CRIAR CONTA DE SERVIÇO**.
4.  Dê um nome para a conta de serviço, como `extrahub-backend-agent`. O "ID da conta de serviço" será gerado automaticamente.
5.  Clique em **CRIAR E CONTINUAR**.
6.  Na etapa **"Conceder a esta conta de serviço acesso ao projeto"**, selecione o papel (Role) de **"Editor"**. Isso dará permissões suficientes para ler e escrever nas planilhas.
7.  Clique em **CONTINUAR** e depois em **CONCLUÍDO**.

### 2. Gerar uma Chave Privada (Arquivo JSON)

1.  Você voltará para a tela de "Contas de serviço". Encontre a que você acabou de criar na lista.
2.  Clique no menu de três pontos em "Ações" e selecione **"Gerenciar chaves"**.
3.  Clique em **ADICIONAR CHAVE** > **"Criar nova chave"**.
4.  Selecione o tipo de chave **JSON** e clique em **CRIAR**.
5.  Um arquivo JSON será baixado automaticamente. **Renomeie este arquivo para `service_account.json`**.
6.  **Mova este arquivo `service_account.json` para a pasta `backend/` na raiz do seu projeto.**

### 3. Compartilhar sua Planilha Google com a Conta de Serviço

Esta é a etapa mais importante.

1.  Abra o arquivo `service_account.json` em um editor de texto. Encontre o valor da chave `client_email`. Será algo como `extrahub-backend-agent@<seu-projeto>.iam.gserviceaccount.com`.
2.  Crie uma nova Planilha Google (Google Sheet) que será usada pela aplicação.
3.  Clique no botão **"Compartilhar"** (Share) no canto superior direito da sua planilha.
4.  **Cole o `client_email` da sua conta de serviço** no campo de compartilhamento e conceda a ela permissões de **"Editor"**.
5.  Clique em **"Enviar"**.

Agora, sua aplicação Electron terá permissão para editar esta planilha específica, sem precisar de login de usuário.