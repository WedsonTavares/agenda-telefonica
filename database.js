/*
 * ============================================
 * AGENDA TELEFÔNICA - Gerenciador de Banco de Dados
 * ============================================
 * 
 * PROPÓSITO:
 * Este módulo é responsável por toda a interação com o banco de dados SQLite.
 * Gerencia conexão, criação de tabelas e integridade referencial.
 * Eu usar um banco de dados externo como mongodb, supabase, firebase e etc, mas como é um teste pequeno
 * optei por sqlite que é leve e fácil de usar.
 * 
 * POR QUE EXISTE:
 * - Centralizar configuração e acesso ao banco de dados
 * - Garantir que schema está criado antes da aplicação iniciar
 * - Implementar constraints de integridade (Foreign Keys, CASCADE)
 * - Separar responsabilidade de persistência do código de negócio
 * - Facilitar manutenção e testes (único ponto de configuração do DB)
 * 
 * ARQUITETURA DO BANCO:
 * 
 * Tabela: Contato
 * - ID (INTEGER, PRIMARY KEY, AUTOINCREMENT): Identificador único
 * - NOME (VARCHAR(100), NOT NULL): Nome completo do contato
 * - IDADE (INTEGER, NULLABLE): Idade do contato
 * 
 * Tabela: Telefone
 * - ID (INTEGER, PRIMARY KEY, AUTOINCREMENT): Identificador único
 * - IDCONTATO (INTEGER, NOT NULL, FOREIGN KEY): Referência ao contato
 * - NUMERO (VARCHAR(16), NOT NULL): Número de telefone
 * - CONSTRAINT: ON DELETE CASCADE (deletar contato deleta telefones)
 * 
 * DECISÕES DE DESIGN:
 * 
 * 1. Por que duas tabelas separadas?
 *    - Um contato pode ter múltiplos telefones (relação 1:N)
 *    - Normalização de dados (evita redundância)
 *    - Facilita queries de busca por telefone específico
 * 
 * 2. Por que ON DELETE CASCADE?
 *    - Integridade referencial automática
 *    - Ao deletar contato, seus telefones são removidos automaticamente
 *    - Evita registros órfãos no banco
 * 
 * 3. Por que VARCHAR(16) para telefone?
 *    - Suporta formatações: (XX) XXXXX-XXXX = 15 chars + margem
 *    - Permite armazenar com ou sem formatação
 *    - Normalização feita em runtime para comparações
 * 
 * 4. Por que PRAGMA foreign_keys = ON?
 *    - SQLite desabilita FKs por padrão (compatibilidade legada)
 *    - Precisa ser ativado explicitamente em cada conexão
 *    - Garante que DELETE CASCADE funcione corretamente
 * 
 * FLUXO DE INICIALIZAÇÃO:
 * 1. Conecta ao arquivo agenda.db (cria se não existir)
 * 2. Ativa PRAGMA foreign_keys (integridade referencial)
 * 3. Cria tabela Contato (se não existir)
 * 4. Cria tabela Telefone com FK para Contato (se não existir)
 * 5. Exporta objeto db para uso em server.js
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// ============================================
// CONEXÃO COM BANCO DE DADOS
// ============================================

/**
 * Caminho absoluto para o arquivo do banco SQLite
 * Criado automaticamente na raiz do projeto
 */
const dbPath = path.join(__dirname, 'agenda.db');

/**
 * Cria/abre conexão com banco SQLite
 * verbose() ativa logs detalhados para debug
 */
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Erro ao conectar ao banco de dados:', err.message);
        process.exit(1); // Encerra aplicação se DB falhar
    }
    console.log('✅ Conectado ao banco de dados SQLite');
});

// ============================================
// CONFIGURAÇÃO DE INTEGRIDADE REFERENCIAL
// ============================================

/**
 * CRÍTICO: SQLite desabilita Foreign Keys por padrão
 * Deve ser ativado em CADA conexão
 * Sem isso, ON DELETE CASCADE não funciona
 */
db.run('PRAGMA foreign_keys = ON', (err) => {
    if (err) {
        console.error('❌ Erro ao ativar foreign keys:', err.message);
    } else {
        console.log('🔒 Foreign keys habilitadas');
    }
});

// ============================================
// CRIAÇÃO DE SCHEMA (TABELAS)
// ============================================

/**
 * serialize() garante que comandos SQL executem em sequência
 * Importante quando uma tabela depende de outra (FK)
 */
db.serialize(() => {
    // Reforça ativação de FKs dentro do serialize (boa prática)
    db.run('PRAGMA foreign_keys = ON');

    /**
     * Tabela: Contato
     * 
     * Armazena informações básicas de cada contato
     * 
     * Campos:
     * - ID: Chave primária, auto-incremento
     * - NOME: Obrigatório, até 100 caracteres
     * - IDADE: Opcional, número inteiro
     */
    db.run(`
        CREATE TABLE IF NOT EXISTS Contato (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            NOME VARCHAR(100) NOT NULL,
            IDADE INTEGER
        )
    `, (err) => {
        if (err) {
            console.error('❌ Erro ao criar tabela Contato:', err.message);
        } else {
            console.log('📋 Tabela Contato verificada/criada');
        }
    });

    /**
     * Tabela: Telefone
     * 
     * Armazena telefones associados a contatos (relação 1:N)
     * 
     * Campos:
     * - ID: Chave primária, auto-incremento
     * - IDCONTATO: FK para Contato.ID (obrigatório)
     * - NUMERO: Telefone formatado ou não, até 16 chars
     * 
     * Constraints:
     * - FOREIGN KEY: Garante que IDCONTATO existe em Contato
     * - ON DELETE CASCADE: Deleta telefones ao deletar contato pai
     * 
     * Por que CASCADE é importante?
     * - Evita registros órfãos (telefones sem dono)
     * - Simplifica lógica de exclusão no código
     * - Mantém consistência do banco automaticamente
     */
    db.run(`
        CREATE TABLE IF NOT EXISTS Telefone (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            IDCONTATO INTEGER NOT NULL,
            NUMERO VARCHAR(16) NOT NULL,
            FOREIGN KEY (IDCONTATO) REFERENCES Contato(ID) ON DELETE CASCADE
        )
    `, (err) => {
        if (err) {
            console.error('❌ Erro ao criar tabela Telefone:', err.message);
        } else {
            console.log('📞 Tabela Telefone verificada/criada');
        }
    });
});

// ============================================
// EXPORTAÇÃO DO MÓDULO
// ============================================

/**
 * Exporta instância do banco de dados
 * Permite que server.js importe e execute queries:
 * 
 * const db = require('./database');
 * db.all('SELECT * FROM Contato', [], callback);
 */
module.exports = db;
