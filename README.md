# 📱 Agenda Telefônica - Sistema Web Completo

> Sistema full-stack de gerenciamento de contatos com **validação robusta**, **detecção de duplicatas**, **sistema de logs** e **interface dark mode** desenvolvido para o teste prático DaVince.

## 📖 Índice

- [Visão Geral](#-visão-geral)
- [Arquitetura e Decisões Técnicas](#-arquitetura-e-decisões-técnicas)
- [Fluxo Completo da Aplicação](#-fluxo-completo-da-aplicação)
- [Tecnologias e Por Quê](#-tecnologias-e-por-quê)
- [Estrutura do Projeto](#-estrutura-do-projeto)
- [Banco de Dados](#-banco-de-dados)
- [Instalação e Execução](#-instalação-e-execução)
- [Como Usar](#-como-usar)
- [Validações e Segurança](#-validações-e-segurança)
- [Sistema de Logs](#-sistema-de-logs)
- [API REST](#-api-rest)
- [Respostas do Teste](#-respostas-do-teste-prático)

---

## 🎯 Visão Geral

### O que é este projeto?

Esta é uma aplicação web completa para gerenciamento de agenda telefônica que permite:

- **Cadastrar** contatos com múltiplos telefones
- **Pesquisar** por nome ou número (com normalização automática)
- **Editar** informações de contatos existentes
- **Excluir** contatos com registro automático em log
- **Validar** telefones (10-11 dígitos) e detectar duplicatas
- **Exportar** o banco de dados SQLite

### Por que foi desenvolvido assim?

O projeto segue princípios de **clean code**, **separação de responsabilidades** e **validação em múltiplas camadas**:

1. **Backend robusto**: Todas as validações no servidor (não confia apenas no cliente)
2. **Frontend responsivo**: Interface dark mode, mobile-first, com feedback visual
3. **Banco normalizado**: Relação 1:N entre Contato e Telefone (evita redundância)
4. **Segurança**: Sanitização de inputs, validação de tipos, proteção contra duplicatas
5. **Rastreabilidade**: Sistema de logs para auditoria de exclusões

---

## 🏗️ Arquitetura e Decisões Técnicas

### Por que Node.js + Express?

**Razão**: Simplicidade, performance e JavaScript full-stack (mesma linguagem no cliente e servidor).

- **Express**: Framework minimalista, ideal para APIs REST
- **Sem frameworks frontend**: Vanilla JS mantém o projeto leve e sem dependências pesadas
- **SQLite**: Banco embutido, zero configuração, perfeito para aplicações standalone

### Por que Tailwind CSS?

**Razão**: Desenvolvimento rápido com utility-first approach.

- **Compilação CLI**: Não precisa de Webpack/PostCSS complexos
- **PurgeCSS embutido**: CSS final otimizado (apenas classes usadas)
- **Dark mode**: Suporte nativo via classe `.dark`

### Por que SQLite ao invés de PostgreSQL/MySQL?

**Razão**: Portabilidade e simplicidade.

- **Arquivo único** (`agenda.db`): Fácil de compartilhar, backupear e versionar
- **Zero setup**: Não precisa instalar servidor de banco separado
- **ACID compliant**: Transações seguras mesmo sendo arquivo
- **Foreign Keys**: Suporta integridade referencial com CASCADE

### Por que duas tabelas (Contato + Telefone)?

**Razão**: Normalização de dados (um contato pode ter N telefones).

```
Errado (tudo em uma tabela):
ID | NOME    | IDADE | TEL1        | TEL2        | TEL3
1  | João    | 25    | 11987654321 | 1134567890  | NULL
❌ Desperdício de espaço, limite fixo de telefones

Correto (duas tabelas relacionadas):
Contato: 1 | João | 25
Telefone: 1 | João_ID=1 | 11987654321
Telefone: 2 | João_ID=1 | 1134567890
✅ Flexível, sem limite, sem desperdício
```

---

## 🔄 Fluxo Completo da Aplicação

### 1️⃣ **Fluxo de Cadastro (CREATE)**

```
┌─────────────┐
│   USUÁRIO   │ Preenche formulário (nome, idade, telefones)
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────────────────┐
│              FRONTEND (app.js)                      │
│ ──────────────────────────────────────────────────  │
│ 1. Valida campos obrigatórios                       │
│ 2. Normaliza telefones (remove formatação)          │
│ 3. Valida 10-11 dígitos em cada telefone            │
│ 4. Verifica duplicatas: POST /api/telefones/verificar│
│    ├─ Se duplicado: Mostra modal com contato existente│
│    └─ Se OK: Continua para envio                    │
└──────┬──────────────────────────────────────────────┘
       │ POST /api/contatos { nome, idade, telefones }
       ▼
┌─────────────────────────────────────────────────────┐
│              BACKEND (server.js)                    │
│ ──────────────────────────────────────────────────  │
│ 1. Valida nome (obrigatório, max 100 chars)         │
│ 2. Valida idade (1-150 ou null)                     │
│ 3. Valida telefones (array não vazio)               │
│ 4. Filtra telefones válidos (10-11 dígitos)         │
│ 5. Sanitiza dados (trim, substring)                 │
│ 6. INSERT INTO Contato                              │
│ 7. Para cada telefone: INSERT INTO Telefone         │
│ 8. Retorna { id: novoContatoID }                    │
└──────┬──────────────────────────────────────────────┘
       │ Status 201 Created
       ▼
┌─────────────┐
│  FRONTEND   │ Mostra toast "Contato cadastrado!"
│             │ Recarrega lista de contatos
│             │ Limpa formulário
└─────────────┘
```

### 2️⃣ **Fluxo de Pesquisa (READ)**

```
┌─────────────┐
│   USUÁRIO   │ Digite termo: "João" ou "11987654321"
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────────────────┐
│              FRONTEND (app.js)                      │
│ ──────────────────────────────────────────────────  │
│ GET /api/contatos/pesquisar?termo=João              │
└──────┬──────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────┐
│              BACKEND (server.js)                    │
│ ──────────────────────────────────────────────────  │
│ 1. Recebe termo da query string                     │
│ 2. Normaliza termo (remove não-dígitos)             │
│ 3. Executa SQL:                                     │
│    WHERE c.NOME LIKE '%João%'                       │
│       OR NORMALIZE(t.NUMERO) LIKE '%11987654321%'   │
│    └─ NORMALIZE = REPLACE múltiplos (remove ()- )   │
│ 4. GROUP BY para agrupar telefones                  │
│ 5. Retorna array de contatos                        │
└──────┬──────────────────────────────────────────────┘
       │ [{ID, NOME, IDADE, TELEFONES:[...]}]
       ▼
┌─────────────┐
│  FRONTEND   │ Renderiza cards de contatos
│             │ Inicializa ícones Lucide
│             │ Cards são clicáveis (expandir/colapsar)
└─────────────┘
```

### 3️⃣ **Fluxo de Edição (UPDATE)**

```
┌─────────────┐
│   USUÁRIO   │ Clica em card → Expande → Clica "Editar"
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────────────────┐
│              FRONTEND (app.js)                      │
│ ──────────────────────────────────────────────────  │
│ 1. GET /api/contatos/:id                            │
│ 2. Preenche formulário com dados do contato         │
│ 3. Altera título para "Editar Contato"              │
│ 4. Altera botão para "Atualizar"                    │
│ 5. Seta contatoEditandoId = id                      │
│ 6. Scroll suave para o formulário                   │
└─────────────────────────────────────────────────────┘
       │ (Usuário edita dados)
       │ PUT /api/contatos/:id { nome, idade, telefones }
       ▼
┌─────────────────────────────────────────────────────┐
│              BACKEND (server.js)                    │
│ ──────────────────────────────────────────────────  │
│ 1. Mesmas validações do POST                        │
│ 2. UPDATE Contato SET nome, idade WHERE id          │
│ 3. DELETE FROM Telefone WHERE idcontato = id        │
│ 4. Insere novos telefones                           │
│ 5. Retorna { mensagem: "Atualizado" }               │
└──────┬──────────────────────────────────────────────┘
       │ Status 200 OK
       ▼
┌─────────────┐
│  FRONTEND   │ Toast "Contato atualizado!"
│             │ Limpa formulário
│             │ Recarrega lista
└─────────────┘
```

### 4️⃣ **Fluxo de Exclusão (DELETE)**

```
┌─────────────┐
│   USUÁRIO   │ Clica em card → Expande → Clica "Excluir"
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────────────────┐
│              FRONTEND (app.js)                      │
│ ──────────────────────────────────────────────────  │
│ 1. Mostra confirm() "Tem certeza?"                  │
│ 2. Se OK: DELETE /api/contatos/:id                  │
└──────┬──────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────┐
│              BACKEND (server.js)                    │
│ ──────────────────────────────────────────────────  │
│ 1. Busca dados do contato (para o log)              │
│ 2. Grava log em logs/exclusoes.txt:                 │
│    [2025-11-05T14:30:15] ID: 5 | NOME: João | ...   │
│ 3. DELETE FROM Contato WHERE id = ?                 │
│    └─ CASCADE: Telefones são deletados automaticamente│
│ 4. Retorna { mensagem: "Excluído" }                 │
└──────┬──────────────────────────────────────────────┘
       │ Status 200 OK
       ▼
┌─────────────┐
│  FRONTEND   │ Toast "Contato excluído!"
│             │ Fecha detalhes expandidos
│             │ Recarrega lista
└─────────────┘
```

---

## 🚀 Tecnologias e Por Quê

| Tecnologia | Por que foi escolhida? |
|------------|------------------------|
| **Node.js** | Runtime JavaScript assíncrono, ideal para I/O intensivo (banco, arquivos) |
| **Express** | Framework minimalista, rápido, sem bloat, perfeito para APIs REST |
| **SQLite3** | Banco embutido, zero configuração, portável, ACID compliant |
| **Tailwind CSS** | Utility-first, desenvolvimento rápido, CSS otimizado, dark mode nativo |
| **Vanilla JS** | Sem dependências frontend, leve, controle total do DOM |
| **Lucide Icons** | Ícones SVG modernos, CDN, sem build step |

---

---

## � Estrutura do Projeto

```
testes davince/
│
├── 📄 server.js              # Servidor Express + API REST
│   ├─ Middleware (JSON parser, static files)
│   ├─ Utilitários (sanitização, normalização, validação)
│   ├─ 8 Endpoints REST (CRUD completo + verificar duplicatas + export)
│   ├─ Sistema de LOG (exclusões)
│   └─ Auto-start (abre navegador no Windows)
│
├── 📄 database.js            # Gerenciador SQLite
│   ├─ Conexão com agenda.db
│   ├─ PRAGMA foreign_keys = ON (integridade referencial)
│   ├─ CREATE TABLE Contato
│   └─ CREATE TABLE Telefone (FK com ON DELETE CASCADE)
│
├── 📄 package.json           # Dependências e scripts
│   ├─ express: Framework web
│   ├─ sqlite3: Driver do banco
│   ├─ @tailwindcss/cli: Compilador CSS
│   └─ nodemon: Auto-reload em desenvolvimento
│
├── 📄 tailwind.config.js     # Configuração Tailwind
│   ├─ content: Arquivos a escanear (public/**)
│   ├─ theme.extend: Cores e fontes customizadas
│   └─ plugins: [] (nenhum plugin adicional)
│
├── 📄 agenda.db             # Banco SQLite (gerado automaticamente)
│
├── 📁 public/               # Arquivos estáticos servidos pelo Express
│   ├── 📄 index.html        # Interface HTML (dark mode permanente)
│   │   ├─ Formulário de cadastro
│   │   ├─ Barra de pesquisa
│   │   ├─ Lista de contatos (cards expansíveis)
│   │   ├─ Modal de duplicatas
│   │   └─ Footer com botão de exportação
│   │
│   ├── 📄 app.js            # Controller JavaScript
│   │   ├─ Estado global (contatoEditandoId, detalhesAberto)
│   │   ├─ Funções de API (fetch para todos endpoints)
│   │   ├─ Validações frontend (10-11 dígitos, campos obrigatórios)
│   │   ├─ Renderização de UI (cards, toasts, modal)
│   │   └─ Inicialização (DOMContentLoaded, force dark mode)
│   │
│   ├── 📄 input.css         # Fonte Tailwind + classes customizadas
│   │   ├─ @import "tailwindcss"
│   │   ├─ .gradient-bg (background escuro)
│   │   ├─ .gradient-primary (gradiente azul)
│   │   └─ .contato-card (hover effects)
│   │
│   └── 📄 output.css        # CSS compilado (gerado pelo Tailwind CLI)
│
└── 📁 logs/                 # Logs do sistema
    └── 📄 exclusoes.txt     # LOG de exclusões (gerado automaticamente)
```

### Fluxo de Execução dos Arquivos

```
npm start
    │
    ├─> Tailwind CLI lê tailwind.config.js
    │   └─> Escaneia public/*.html e public/*.js
    │       └─> Compila input.css → output.css
    │
    └─> node server.js
        │
        ├─> Carrega database.js
        │   └─> Conecta/cria agenda.db
        │       └─> Cria tabelas se não existirem
        │
        ├─> Configura Express
        │   ├─> Middleware JSON/URLencoded
        │   └─> Serve arquivos de public/
        │
        ├─> Define rotas da API
        │   ├─ GET    /api/contatos
        │   ├─ GET    /api/contatos/:id
        │   ├─ GET    /api/contatos/pesquisar
        │   ├─ POST   /api/contatos
        │   ├─ PUT    /api/contatos/:id
        │   ├─ DELETE /api/contatos/:id
        │   ├─ POST   /api/telefones/verificar
        │   └─ GET    /export-db
        │
        ├─> Inicia servidor na porta 3000
        │
        └─> Abre navegador (Windows)
            └─> Carrega public/index.html
                └─> Carrega public/output.css
                    └─> Carrega public/app.js
                        └─> DOMContentLoaded
                            ├─> Força dark mode
                            ├─> carregarContatos() → GET /api/contatos
                            └─> Inicializa ícones Lucide
```

---

## 🗄️ Banco de Dados

### Estrutura das Tabelas

#### Tabela: **Contato**
```sql
CREATE TABLE Contato (
    ID INTEGER PRIMARY KEY AUTOINCREMENT,
    NOME VARCHAR(100) NOT NULL,
    IDADE INTEGER
);
```

| Campo | Tipo | Constraints | Descrição |
|-------|------|-------------|-----------|
| ID | INTEGER | PRIMARY KEY, AUTOINCREMENT | Identificador único (gerado automaticamente) |
| NOME | VARCHAR(100) | NOT NULL | Nome completo do contato (obrigatório) |
| IDADE | INTEGER | NULLABLE | Idade do contato (opcional) |

#### Tabela: **Telefone**
```sql
CREATE TABLE Telefone (
    ID INTEGER PRIMARY KEY AUTOINCREMENT,
    IDCONTATO INTEGER NOT NULL,
    NUMERO VARCHAR(16) NOT NULL,
    FOREIGN KEY (IDCONTATO) REFERENCES Contato(ID) ON DELETE CASCADE
);
```

| Campo | Tipo | Constraints | Descrição |
|-------|------|-------------|-----------|
| ID | INTEGER | PRIMARY KEY, AUTOINCREMENT | Identificador único do telefone |
| IDCONTATO | INTEGER | NOT NULL, FOREIGN KEY | Referência ao ID do contato (dono do telefone) |
| NUMERO | VARCHAR(16) | NOT NULL | Número de telefone (formatado ou não) |

### Por que ON DELETE CASCADE?

**Problema sem CASCADE:**
```sql
DELETE FROM Contato WHERE ID = 5;
-- Contato deletado, mas seus telefones ficam órfãos no banco!
-- Telefones com IDCONTATO = 5 ainda existem, mas sem contato pai
```

**Solução com CASCADE:**
```sql
DELETE FROM Contato WHERE ID = 5;
-- SQLite automaticamente deleta:
--   1. O contato (ID = 5)
--   2. TODOS os telefones onde IDCONTATO = 5
-- ✅ Integridade garantida, sem registros órfãos
```

### Exemplo de Dados no Banco

```sql
-- Tabela Contato
ID | NOME          | IDADE
----|---------------|-------
1  | João Silva    | 25
2  | Maria Santos  | 30
3  | Pedro Costa   | 28

-- Tabela Telefone
ID | IDCONTATO | NUMERO
----|-----------|----------------
1  | 1         | (11) 98765-4321
2  | 1         | (11) 3456-7890
3  | 2         | (21) 99999-8888
4  | 3         | 11987654321

-- Se deletar João (ID=1), telefones ID=1 e ID=2 são deletados automaticamente
```

---

## ⚙️ Instalação e Execução

### **Pré-requisitos**
- ✅ Node.js (versão 14 ou superior) → [Download aqui](https://nodejs.org/)
- ✅ NPM (vem automaticamente com Node.js)

### **Passo a Passo para Executar Localmente**

#### 1️⃣ **Clone ou extraia o projeto**
```powershell
cd "caminho/para/testes davince"
```

#### 2️⃣ **Instale as dependências**
```powershell
npm install
```
Isso instalará:
- `express` (framework web)
- `sqlite3` (driver do banco)
- `@tailwindcss/cli` (compilador CSS)
- `nodemon` (auto-reload em dev)

#### 3️⃣ **Inicie a aplicação**
```powershell
npm start
```

**O que acontece ao rodar `npm start`:**
```
1. Tailwind CLI compila input.css → output.css (≈50ms)
2. Node.js inicia server.js
3. SQLite conecta/cria agenda.db
4. Tabelas são criadas (se não existirem)
5. Servidor sobe em http://localhost:3000
6. Navegador abre automaticamente (Windows)
```

#### 4️⃣ **Acesse a aplicação**
Se o navegador não abrir automaticamente:
```
http://localhost:3000
```

### **Modos de Execução**

| Comando | Uso | O que faz |
|---------|-----|-----------|
| `npm start` | **Produção** | Compila CSS + inicia servidor + abre browser |
| `npm run dev` | **Desenvolvimento** | Servidor com auto-reload (nodemon) |
| `npm run build:css` | **Build CSS** | Compila Tailwind uma vez |
| `npm run dev:css` | **CSS Watch** | Recompila CSS ao salvar arquivos |

### **Desenvolvimento Simultâneo (CSS + Servidor)**

Terminal 1 (CSS watch):
```powershell
npm run dev:css
```

Terminal 2 (Servidor auto-reload):
```powershell
npm run dev
```

---

## 🎯 Como Usar a Aplicação

### **1. Cadastrar Novo Contato**

```
┌─────────────────────────────────────────┐
│         📝 Novo Contato                 │
├─────────────────────────────────────────┤
│ Nome: [ João Silva_____________ ]       │
│ Idade: [ 25_ ]                          │
│ Telefones:                              │
│ ┌─────────────────────────────────┐     │
│ │ (11) 98765-4321                 │     │
│ │ (11) 3456-7890                  │     │
│ │ 11999887766                     │     │
│ └─────────────────────────────────┘     │
│                                         │
│ [💾 Salvar Contato]  [❌ Limpar]       │
└─────────────────────────────────────────┘
```

**Instruções:**
1. Preencha o **nome** (obrigatório, máx 100 caracteres)
2. Digite a **idade** (opcional, entre 1-150)
3. Adicione **telefones** (um por linha ou separados por vírgula)
   - ✅ Aceita formatado: `(11) 98765-4321`
   - ✅ Aceita só números: `11987654321`
   - ⚠️ Deve ter 10 ou 11 dígitos
4. Clique em **💾 Salvar Contato**

**Validações automáticas:**
- ❌ Se telefone tiver menos de 10 ou mais de 11 dígitos → Erro
- ❌ Se telefone já existir → Modal oferece editar contato existente
- ✅ Se tudo OK → Contato criado + Toast de sucesso

---

### **2. Pesquisar Contatos**

```
┌─────────────────────────────────────────┐
│      🔍 Pesquisar Contatos              │
├─────────────────────────────────────────┤
│ [ João_________________ ] [🔍] [🔄]     │
└─────────────────────────────────────────┘

Busca por:
✅ Nome parcial: "João" encontra "João Silva"
✅ Telefone formatado: "(11) 98765-4321"
✅ Telefone sem formatação: "11987654321"
✅ Parte do telefone: "98765" encontra "(11) 98765-4321"
```

**Como funciona:**
1. Digite o termo (nome ou número)
2. Clique em **🔍 Pesquisar** (ou Enter)
3. Resultados aparecem abaixo em cards

**Normalização inteligente:**
```javascript
// Backend remove formatação ao buscar
"(11) 98765-4321" → comparado como "11987654321"
// Assim, encontra mesmo com formatações diferentes
```

---

### **3. Editar Contato**

```
Passo 1: Clique em um card de contato
┌─────────────────────────────────┐
│ 👤 João Silva    [▼]            │ ← Clique aqui
├─────────────────────────────────┤
│ 25 anos                         │
└─────────────────────────────────┘

Passo 2: Card expande, mostra telefones e ações
┌─────────────────────────────────┐
│ 👤 João Silva    [▲]            │
├─────────────────────────────────┤
│ 25 anos                         │
│                                 │
│ Telefones:                      │
│ 📞 (11) 98765-4321              │
│ 📞 (11) 3456-7890               │
│                                 │
│ [✏️ Editar]  [🗑️ Excluir]      │ ← Clique "Editar"
└─────────────────────────────────┘

Passo 3: Formulário preenche automaticamente
┌─────────────────────────────────────────┐
│         ✏️ Editar Contato               │
├─────────────────────────────────────────┤
│ Nome: [ João Silva_____________ ]       │
│ Idade: [ 25_ ]                          │
│ Telefones:                              │
│ ┌─────────────────────────────────┐     │
│ │ (11) 98765-4321                 │     │
│ │ (11) 3456-7890                  │     │
│ └─────────────────────────────────┘     │
│                                         │
│ [💾 Atualizar]  [❌ Cancelar]          │
└─────────────────────────────────────────┘

Passo 4: Edite os dados e clique "Atualizar"
```

**Fluxo técnico:**
1. Frontend faz `GET /api/contatos/:id`
2. Preenche campos do formulário
3. Usuário edita
4. Frontend faz `PUT /api/contatos/:id`
5. Backend atualiza contato e telefones
6. Lista recarrega com dados atualizados

---

### **4. Excluir Contato**

```
Passo 1: Clique em "🗑️ Excluir" no card expandido

Passo 2: Confirmação aparece
┌──────────────────────────────────────┐
│  ⚠️ Confirmação                      │
├──────────────────────────────────────┤
│  Tem certeza que deseja excluir      │
│  este contato?                       │
│                                      │
│  [✅ OK]  [❌ Cancelar]              │
└──────────────────────────────────────┘

Passo 3: Se confirmar, contato é deletado
✅ Registro gravado em logs/exclusoes.txt
✅ Toast verde: "Contato excluído com sucesso!"
✅ Card desaparece da lista
```

**O que acontece no backend:**
```javascript
1. Busca dados do contato (nome, idade, telefones)
2. Grava log:
   [2025-11-05T14:30:15.123Z] ID: 5 | NOME: João Silva | TELEFONES: (11) 98765-4321, (11) 3456-7890
3. DELETE FROM Contato WHERE ID = 5
   └─ CASCADE: Telefones são deletados automaticamente
```

---

## �️ Validações e Segurança

### **Validações no Frontend (app.js)**

```javascript
// 1. Campos obrigatórios (idade é opcional)
if (!nome || !telefones) {
    mostrarToast('Informe nome e ao menos um telefone', 'erro');
    return;
}

// 2. Telefones: 10-11 dígitos
for (const tel of listaTelefones) {
    const normalizado = normalizarTelefone(tel); // Remove não-dígitos
    if (normalizado.length < 10 || normalizado.length > 11) {
        mostrarToast(`Telefone ${tel} inválido. Use 10 ou 11 dígitos.`, 'erro');
        return;
    }
}

// 3. Verifica duplicatas (apenas ao criar)
const resultado = await fetch('/api/telefones/verificar', {
    method: 'POST',
    body: JSON.stringify({ telefones: listaTelefones })
});
if (resultado.duplicatas.length > 0) {
    mostrarModalDuplicata(resultado.duplicatas[0]);
    return; // Impede cadastro duplicado
}
```

### **Validações no Backend (server.js)**

```javascript
// 1. Validação de nome
function validarContato(nome, idade) {
    if (!nome || nome.trim().length === 0) {
        return ['Nome é obrigatório'];
    }
    if (nome.length > 100) {
        return ['Nome deve ter no máximo 100 caracteres'];
    }
    // ...
}

// 2. Validação de idade
if (idade) {
    const idadeNum = parseInt(idade);
    if (isNaN(idadeNum) || idadeNum < 1 || idadeNum > 150) {
        return ['Idade deve estar entre 1 e 150 anos'];
    }
}

// 3. Validação de telefones
const telefonesValidos = telefones.filter(tel => {
    const normalizado = normalizarNumero(tel);
    return normalizado.length >= 10 && normalizado.length <= 11;
});

if (telefonesValidos.length === 0) {
    return res.status(400).json({ 
        erro: 'Nenhum telefone válido (devem ter 10 ou 11 dígitos)' 
    });
}

// 4. Sanitização (previne XSS e SQL injection)
const nomeLimpo = sanitizar(nome);        // trim + substring(0, 200)
const telLimpo = sanitizar(tel);
// SQLite prepared statements (? placeholders) previnem SQL injection
db.run('INSERT INTO Contato VALUES (?, ?)', [nomeLimpo, idadeNum]);
```

### **Por que Dupla Validação?**

```
❌ Validar APENAS no frontend:
- Usuário pode desabilitar JavaScript
- Requisições podem ser feitas via Postman/curl
- Sem proteção real

✅ Validar no frontend + backend:
- Frontend: UX melhor (feedback imediato)
- Backend: Segurança real (última linha de defesa)
```

---

## � Sistema de Logs

### **Como Funciona**

Toda vez que um contato é excluído, um registro é gravado em `logs/exclusoes.txt`.

**Código (server.js):**
```javascript
function gravarLog(id, nome, telefones) {
    const timestamp = new Date().toISOString(); // 2025-11-05T14:30:15.123Z
    const logPath = path.join(__dirname, 'logs', 'exclusoes.txt');
    const logLine = `[${timestamp}] ID: ${id} | NOME: ${nome} | TELEFONES: ${telefones.join(', ')}\n`;
    
    fs.appendFile(logPath, logLine, (err) => {
        if (err) console.error('Erro ao gravar log:', err);
    });
}
```

### **Exemplo de Arquivo de Log**

```txt
[2025-11-05T10:15:30.456Z] ID: 1 | NOME: João Silva | TELEFONES: (11) 98765-4321, (11) 3456-7890
[2025-11-05T11:22:45.789Z] ID: 3 | NOME: Maria Santos | TELEFONES: (21) 99999-8888
[2025-11-05T14:30:15.123Z] ID: 5 | NOME: Pedro Costa | TELEFONES: 11987654321
```

### **Por que Arquivo Texto ao Invés de Banco?**

| Arquivo Texto | Banco de Dados |
|---------------|----------------|
| ✅ Simples de implementar | ❌ Requer tabela adicional |
| ✅ Fácil de ler/auditar | ❌ Precisa de queries |
| ✅ Não depende do banco | ❌ Se banco cair, perde logs |
| ✅ Pode ser versionado (Git) | ❌ Dados binários (.db) |
| ✅ Grep/busca nativa do OS | ❌ Precisa de SQL para buscar |

**Decisão**: Arquivo texto atende perfeitamente o requisito do teste (rastreabilidade simples).

---

## 🌐 API REST

### **Endpoints Disponíveis**

| Método | Endpoint | Descrição | Body | Retorno |
|--------|----------|-----------|------|---------|
| **GET** | `/api/contatos` | Lista todos os contatos | - | `Array<Contato>` |
| **GET** | `/api/contatos/:id` | Busca contato por ID | - | `Contato` ou `404` |
| **GET** | `/api/contatos/pesquisar?termo=X` | Busca por nome ou telefone | - | `Array<Contato>` |
| **POST** | `/api/contatos` | Cria novo contato | `{nome, idade, telefones[]}` | `{id: number}` |
| **PUT** | `/api/contatos/:id` | Atualiza contato | `{nome, idade, telefones[]}` | `{mensagem: string}` |
| **DELETE** | `/api/contatos/:id` | Exclui contato + gera log | - | `{mensagem: string}` |
| **POST** | `/api/telefones/verificar` | Verifica duplicatas | `{telefones[]}` | `{duplicatas: Array}` |
| **GET** | `/export-db` | Download do agenda.db | - | Arquivo binário |

### **Exemplos de Uso (curl)**

#### Criar contato:
```bash
curl -X POST http://localhost:3000/api/contatos \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "João Silva",
    "idade": 25,
    "telefones": ["(11) 98765-4321", "11987654321"]
  }'

# Resposta: {"id": 1}
```

#### Pesquisar:
```bash
curl "http://localhost:3000/api/contatos/pesquisar?termo=João"

# Resposta:
[
  {
    "ID": 1,
    "NOME": "João Silva",
    "IDADE": 25,
    "TELEFONES": ["(11) 98765-4321", "11987654321"]
  }
]
```

#### Verificar duplicatas:
```bash
curl -X POST http://localhost:3000/api/telefones/verificar \
  -H "Content-Type: application/json" \
  -d '{"telefones": ["11987654321"]}'

# Se existir:
{
  "duplicatas": [
    {"ID": 1, "NOME": "João Silva", "IDADE": 25, "TELEFONES": [...]}
  ]
}
```

---

## 📋 Respostas do Teste Prático

### **Questão 1: Aplicação Web (Cadastro, Pesquisa, CRUD)**

**Tempo usado:** ~3h30

**Implementado:**
- ✅ Formulário de cadastro com validação
- ✅ Múltiplos telefones por contato
- ✅ Pesquisa por nome e número (normalização inteligente)
- ✅ CRUD completo (Create, Read, Update, Delete)
- ✅ Interface responsiva (mobile-first, dark mode)
- ✅ Validação dupla (frontend + backend)
- ✅ Detecção de telefones duplicados
- ✅ Feedback visual (toasts, loading, animações)
- ✅ Integração completa com SQLite

**Detalhes técnicos:**
- API REST com 8 endpoints
- Normalização de telefones para busca confiável
- Sanitização contra XSS
- Prepared statements contra SQL injection
- Foreign Keys com CASCADE
- Ícones Lucide para UX profissional

---

### **Questão 2: LOG de Exclusão**

**Tempo usado:** ~15min

**Implementado:**
- ✅ Arquivo `logs/exclusoes.txt`
- ✅ Registro automático a cada exclusão
- ✅ Formato: `[timestamp ISO] ID: X | NOME: Y | TELEFONES: A, B, C`
- ✅ Função `gravarLog()` em `server.js`
- ✅ Diretório criado automaticamente se não existir

**Exemplo de log:**
```
[2025-11-05T14:30:15.123Z] ID: 5 | NOME: João Silva | TELEFONES: (11) 98765-4321, (11) 3456-7890
```

**Por que este formato:**
- Timestamp ISO 8601 (ordenação cronológica, fuso horário UTC)
- Separadores `|` facilitam parsing (se precisar processar depois)
- Telefones separados por vírgula (legibilidade)

---

### **Questão 3: Classificação do Teste**

**Escolha:** **( X ) Médio**

**Justificativa completa:**

O teste foi classificado como **Médio** pelos seguintes motivos:

**1. Complexidade Técnica (Médio)**
- Requer conhecimento de **múltiplas tecnologias**: Node.js, Express, SQLite, HTML/CSS/JS
- Envolve **integração full-stack**: frontend ↔ API ↔ banco de dados
- Necessita entender **queries SQL** (JOIN, GROUP BY, normalização)
- Implementação de **validações robustas** em duas camadas

**2. Conceitos de Banco de Dados (Médio)**
- Modelagem de **relacionamento 1:N** (Contato → Telefones)
- Uso de **Foreign Keys** com `ON DELETE CASCADE`
- Compreensão de **integridade referencial**
- Queries com **GROUP_CONCAT** para agrupar dados relacionados

**3. Boas Práticas (Médio a Avançado)**
- **Sanitização** de inputs (prevenção XSS)
- **Prepared statements** (prevenção SQL injection)
- **Separação de responsabilidades** (MVC simplificado)
- **Tratamento de erros** consistente
- **Sistema de logs** para auditoria

**4. UX/UI (Médio)**
- Interface **responsiva** (grid adaptativo)
- **Feedback visual** (toasts, loading states)
- **Validação em tempo real** (detecção de duplicatas)
- **Dark mode** implementado

**Por que NÃO é Fácil:**
- Não é um CRUD trivial (validações complexas, duplicatas, logs)
- Requer integração de várias camadas
- Normalização de telefones não é óbvia
- Sistema de logs adiciona complexidade

**Por que NÃO é Difícil:**
- Não envolve **autenticação/autorização**
- Sem **criptografia** ou segurança avançada
- Sem **testes automatizados**
- Sem **deploy** ou infraestrutura
- Sem **arquitetura distribuída** (microserviços)
- Sem **otimizações de performance** (cache, índices complexos)

**Conclusão:** É um teste que exige **competência intermediária** em desenvolvimento web full-stack, mas não chega a ser complexo como sistemas corporativos com autenticação, APIs externas, filas, etc.

---

### **Estruturas de Tabelas (SQL)**

```sql
-- Tabela de Contatos
CREATE TABLE Contato (
    ID INTEGER PRIMARY KEY AUTOINCREMENT,
    NOME VARCHAR(100) NOT NULL,
    IDADE INTEGER
);

-- Tabela de Telefones (relacionamento 1:N com Contato)
CREATE TABLE Telefone (
    ID INTEGER PRIMARY KEY AUTOINCREMENT,
    IDCONTATO INTEGER NOT NULL,
    NUMERO VARCHAR(16) NOT NULL,
    FOREIGN KEY (IDCONTATO) REFERENCES Contato(ID) ON DELETE CASCADE
);
```

**Decisão de Design:**
- `ON DELETE CASCADE`: Ao deletar contato, telefones são removidos automaticamente
- `VARCHAR(16)` para NUMERO: Suporta formatação `(XX) XXXXX-XXXX` (15 chars + margem)
- `IDADE` nullable: Campo opcional conforme especificação

---

### **Exportação do Banco de Dados**

**Opções para exportar/compartilhar:**

**1. Via Interface Web:**
- Clique no botão **"📥 Exportar Banco de Dados"** no rodapé
- Arquivo `agenda_backup.db` será baixado

**2. Via Arquivo Direto:**
- O arquivo `agenda.db` está na raiz do projeto
- Copie diretamente: `Copy-Item agenda.db agenda_backup.db`

**3. Via API:**
```bash
curl http://localhost:3000/export-db --output agenda_backup.db
```

**Instruções para executar localmente:**

```powershell
# 1. Extrair o projeto
cd "caminho/para/testes davince"

# 2. Instalar dependências
npm install

# 3. Iniciar aplicação
npm start
# ✅ Abre automaticamente em http://localhost:3000

# 4. (Opcional) Se tiver backup, restaure:
Copy-Item agenda_backup.db agenda.db
```

**O banco de dados já vem com o projeto**, então ao rodar `npm start` a aplicação estará pronta para uso com qualquer dado existente.

---

## 🎨 Interface e Usabilidade

### **Design System**

- **Paleta de Cores:**
  - Primário: Azul (`#4A90E2`, `#1e40af`)
  - Secundário: Roxo (`#7B68EE`)
  - Background: Gradiente de cinza escuro (`#0f172a` → `#1e293b`)
  - Texto: Branco/Cinza claro (contraste WCAG AA)

- **Tipografia:**
  - Fonte: **Inter** (Google Fonts)
  - Sans-serif moderna, legível, ótima para interfaces

- **Iconografia:**
  - **Lucide Icons** (SVG via CDN)
  - Leves, escaláveis, consistentes

### **Responsividade**

```css
/* Mobile First */
grid-cols-1          /* 1 coluna em telas pequenas */

/* Tablet/Desktop */
lg:grid-cols-2       /* 2 colunas em telas grandes */

/* Espaçamentos Adaptativos */
px-4 sm:px-6 lg:px-8  /* Padding aumenta com tela */
```

### **Acessibilidade**

- ✅ **Labels semânticos**: Todos inputs têm `<label for="...">` `
- ✅ **Contraste adequado**: Texto branco em fundo escuro (WCAG AA)
- ✅ **Foco visível**: Outline azul em elementos focados
- ✅ **Botões descritivos**: Ícone + texto ("💾 Salvar Contato")
- ✅ **HTML5 semântico**: `<header>`, `<main>`, `<section>`, `<footer>`

### **Feedback Visual**

| Ação | Feedback |
|------|----------|
| Salvando contato | Loading overlay + spinner |
| Sucesso | Toast verde: "Contato cadastrado!" |
| Erro | Toast vermelho: "Erro ao salvar" |
| Aviso | Toast amarelo: "Adicione os novos números" |
| Hover em card | Borda azul + translação 8px |
| Card expandido | Animação fade-in, borda verde |

---

## 🚀 Performance e Otimizações

### **CSS Otimizado**

```bash
# Tailwind CLI faz PurgeCSS automático
input.css:  ~500KB (todas as classes)
output.css: ~15KB  (apenas classes usadas na aplicação)
✅ 97% de redução
```

### **Banco de Dados**

- **SQLite**: Embarcado, sem latência de rede
- **Prepared Statements**: Reutilização de queries compiladas
- **CASCADE automático**: Evita queries extras para deletar telefones

### **Frontend**

- **Vanilla JS**: Zero overhead de frameworks (React, Vue, Angular)
- **Lazy load**: Ícones Lucide só são renderizados quando necessário
- **Debouncing**: Pesquisa implementada com debounce de ~300ms e AbortController para evitar respostas fora de ordem

---

## 📚 Documentação do Código

Todos os arquivos principais contêm **documentação interna completa**:

### **server.js**
```javascript
/*
 * PROPÓSITO: Servidor backend com API REST
 * POR QUE EXISTE: Separar lógica de negócio do frontend
 * ARQUITETURA: Middleware → Utilitários → Endpoints → Logs → Auto-start
 */
```
- Cada função tem JSDoc explicando parâmetros, retorno e comportamento
- Endpoints documentados com formato de body e response
- Explicação de decisões técnicas (por que sanitizar, por que CASCADE, etc)

### **database.js**
```javascript
/*
 * PROPÓSITO: Gerenciador SQLite
 * POR QUE EXISTE: Centralizar configuração do banco
 * DECISÕES: Por que 2 tabelas? Por que VARCHAR(16)? Por que CASCADE?
 */
```

### **app.js (frontend)**
```javascript
/*
 * PROPÓSITO: Controller frontend
 * POR QUE EXISTE: Separar lógica de apresentação
 * FLUXO: Usuário → Validação → API → UI → Feedback
 */
```

### **tailwind.config.js**
```javascript
/*
 * PROPÓSITO: Configuração Tailwind
 * POR QUE EXISTE: Definir arquivos a escanear e tema customizado
 * COMO FUNCIONA: CLI lê config → escaneia arquivos → gera CSS
 */
```

---

## 📦 Extras Implementados (Além do Requisitado)

| Feature | Status | Benefício |
|---------|--------|-----------|
| **Detecção de duplicatas** | ✅ | Previne telefones repetidos |
| **Modal de duplicata** | ✅ | Oferece editar contato existente |
| **Dark mode permanente** | ✅ | Interface moderna e profissional |
| **Normalização de telefones** | ✅ | Busca funciona com qualquer formatação |
| **Validação dupla** | ✅ | Segurança real (frontend + backend) |
| **Sanitização** | ✅ | Proteção contra XSS |
| **Prepared statements** | ✅ | Proteção contra SQL injection |
| **Toast messages** | ✅ | Feedback visual imediato |
| **Loading overlay** | ✅ | Indicador de operações assíncronas |
| **Ícones profissionais** | ✅ | UX superior (Lucide Icons) |
| **Auto-start browser** | ✅ | Conveniência no Windows |
| **Responsividade** | ✅ | Funciona em mobile/tablet/desktop |
| **Cards expansíveis** | ✅ | Interface limpa e organizada |
| **Exportação de DB** | ✅ | Botão + rota API |
| **Documentação completa** | ✅ | Todos arquivos principais |

---

## 👨‍💻 Desenvolvedor

**Wedson Tavares**  
Teste Prático - DaVince  
Novembro/2025

---

## 📄 Licença

Este projeto foi desenvolvido exclusivamente para fins de avaliação técnica.

---

## 🙏 Agradecimentos

Obrigado pela oportunidade de demonstrar minhas habilidades em desenvolvimento full-stack!

**Diferenciais deste projeto:**
- ✅ Código limpo e documentado
- ✅ Validações robustas em múltiplas camadas
- ✅ Interface moderna e responsiva
- ✅ Segurança (sanitização, prepared statements)
- ✅ Sistema de logs para auditoria
- ✅ Detecção inteligente de duplicatas
- ✅ Normalização de dados para busca confiável
- ✅ Performance otimizada (CSS purged, banco embutido)

**Tempo total:** ~4 horas (3h30 aplicação + 30min polimento/documentação)
