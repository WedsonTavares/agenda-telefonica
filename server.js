/*
 * ============================================
 * AGENDA TELEFÔNICA - Servidor Backend
 * ============================================
 * 
 * PROPÓSITO:
 * Este é o coração da aplicação. Gerencia toda a lógica de negócio,
 * persistência de dados, validações e comunicação com o frontend via API REST.
 * 
 * POR QUE EXISTE:
 * - Separar lógica de negócio do frontend (segurança e manutenibilidade)
 * - Fornecer API RESTful para operações CRUD
 * - Validar dados antes de persistir no banco
 * - Implementar regras de negócio (log de exclusões, validação de telefones)
 * - Servir arquivos estáticos (HTML, CSS, JS)
 * 
 * ARQUITETURA:
 * 1. Middleware: Parsers JSON/URL, servir arquivos estáticos
 * 2. Utilitários: Sanitização, normalização, validação
 * 3. Endpoints REST: CRUD completo de contatos
 * 4. Log System: Registro de exclusões em arquivo texto
 * 5. Export: Download do banco SQLite
 * 6. Auto-start: Abre navegador automaticamente no Windows
 * 
 * STACK TÉCNICO:
 * - Express.js: Framework web minimalista
 * - SQLite3: Banco de dados embutido
 * - Node.js native modules: fs, path, child_process
 * 
 * ENDPOINTS:
 * GET    /api/contatos              - Lista todos contatos com telefones
 * GET    /api/contatos/:id          - Busca contato específico por ID
 * GET    /api/contatos/pesquisar    - Busca por nome ou telefone
 * POST   /api/contatos              - Cria novo contato
 * PUT    /api/contatos/:id          - Atualiza contato existente
 * DELETE /api/contatos/:id          - Exclui contato (registra em log)
 * POST   /api/telefones/verificar   - Verifica duplicatas de telefone
 * GET    /export-db                 - Baixa arquivo do banco SQLite
 * GET    /export                    - Exporta contatos em CSV | TXT | JSON
 */

const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// MIDDLEWARE - Processamento de Requisições
// ============================================

/**
 * Parser de JSON para requisições com Content-Type: application/json
 * Limite de 10MB para evitar ataques de payload grande
 */
app.use(express.json({ limit: '10mb' }));

/**
 * Parser de URL-encoded para formulários tradicionais
 * extended: true permite objetos aninhados
 */
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/**
 * Serve arquivos estáticos da pasta public/
 * HTML, CSS, JS, imagens, etc.
 */
app.use(express.static('public'));

// ============================================
// SISTEMA DE LOGS
// ============================================

/**
 * Garante que diretório de logs existe
 * Criado recursivamente se não existir
 */
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

/**
 * Registra exclusão de contato em arquivo texto
 * Formato: [TIMESTAMP] ID: X | NOME: Y | TELEFONES: A, B, C
 * 
 * @param {number} id - ID do contato excluído
 * @param {string} nome - Nome do contato
 * @param {Array<string>} telefones - Lista de telefones
 */
function gravarLog(id, nome, telefones) {
    const timestamp = new Date().toISOString();
    const logPath = path.join(logsDir, 'exclusoes.txt');
    const logLine = `[${timestamp}] ID: ${id} | NOME: ${nome} | TELEFONES: ${telefones.join(', ')}\n`;
    
    fs.appendFile(logPath, logLine, (err) => {
        if (err) {
            console.error('Erro ao gravar log:', err);
        }
    });
}

// ============================================
// UTILITÁRIOS DE VALIDAÇÃO E SANITIZAÇÃO
// ============================================

/**
 * Remove espaços em branco e limita tamanho de strings
 * Previne XSS e overflow de banco de dados
 * 
 * @param {string} str - String a ser sanitizada
 * @returns {string} String limpa e limitada
 */
function sanitizar(str) {
    if (typeof str !== 'string') return str;
    return str.trim().substring(0, 200);
}

/**
 * Extrai apenas dígitos de um número de telefone
 * Usado para comparação e validação de duplicatas
 * 
 * @param {string} str - Telefone com formatação
 * @returns {string} Apenas dígitos (ex: "11987654321")
 */
function normalizarNumero(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/\D+/g, '');
}

/**
 * Expressão SQL para normalizar coluna NUMERO no banco
 * Remove parênteses, hífens e espaços para comparação
 * Usado em queries WHERE para buscar telefones independente de formatação
 */
const SQL_NUMERO_NORMALIZADO = `REPLACE(REPLACE(REPLACE(REPLACE(t.NUMERO, '(', ''), ')', ''), '-', ''), ' ', '')`;

/**
 * Valida dados de um contato antes de salvar
 * 
 * Regras:
 * - Nome: obrigatório, máximo 100 caracteres
 * - Idade: opcional, entre 1-150 se fornecida
 * 
 * @param {string} nome - Nome do contato
 * @param {number|null} idade - Idade do contato
 * @returns {Array<string>} Lista de erros (vazia se válido)
 */
function validarContato(nome, idade) {
    const erros = [];

    if (!nome || nome.trim().length === 0) {
        erros.push('Nome é obrigatório');
    } else if (nome.length > 100) {
        erros.push('Nome deve ter no máximo 100 caracteres');
    }

    if (idade !== null && idade !== undefined && idade !== '') {
        const idadeNum = parseInt(idade);
        if (isNaN(idadeNum) || idadeNum < 1 || idadeNum > 150) {
            erros.push('Idade deve estar entre 1 e 150 anos');
        }
    }

    return erros;
}

/**
 * Valida formato de número de telefone
 * 
 * Regras:
 * - Deve ter 10 (fixo) ou 11 dígitos (celular com 9)
 * - Exemplos válidos: (11) 98765-4321, 1134567890
 * 
 * @param {string} numero - Número a validar
 * @returns {boolean} true se válido, false caso contrário
 */
function validarTelefone(numero) {
    const normalizado = normalizarNumero(numero);
    return normalizado.length >= 10 && normalizado.length <= 11;
}

// ============================================
// ENDPOINTS DA API REST
// ============================================

/**
 * GET /api/contatos
 * 
 * Lista todos os contatos com seus telefones
 * 
 * Retorno: Array de objetos
 * [
 *   {
 *     ID: 1,
 *     NOME: "João Silva",
 *     IDADE: 25,
 *     TELEFONES: ["(11) 98765-4321", "(11) 3456-7890"]
 *   },
 *   ...
 * ]
 */
app.get('/api/contatos', (req, res) => {
    const sql = `
        SELECT c.ID, c.NOME, c.IDADE,
               GROUP_CONCAT(t.NUMERO, '||') AS TELEFONES
        FROM Contato c
        LEFT JOIN Telefone t ON c.ID = t.IDCONTATO
        GROUP BY c.ID
        ORDER BY c.NOME
    `;

    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error('Erro ao buscar contatos:', err);
            return res.status(500).json({ erro: 'Erro ao buscar contatos' });
        }

        const contatos = rows.map(row => ({
            ID: row.ID,
            NOME: row.NOME,
            IDADE: row.IDADE,
            TELEFONES: row.TELEFONES ? row.TELEFONES.split('||') : []
        }));

        res.json(contatos);
    });
});

/**
 * GET /api/contatos/:id
 * 
 * Busca um contato específico por ID
 * 
 * Parâmetros:
 * - id (URL): ID do contato
 * 
 * Retorno: Objeto do contato
 * {
 *   ID: 1,
 *   NOME: "João Silva",
 *   IDADE: 25,
 *   TELEFONES: ["(11) 98765-4321"]
 * }
 */
app.get('/api/contatos/:id', (req, res) => {
    const { id } = req.params;

    const sql = `
        SELECT c.ID, c.NOME, c.IDADE,
               GROUP_CONCAT(t.NUMERO, '||') AS TELEFONES
        FROM Contato c
        LEFT JOIN Telefone t ON c.ID = t.IDCONTATO
        WHERE c.ID = ?
        GROUP BY c.ID
    `;

    db.get(sql, [id], (err, row) => {
        if (err) {
            console.error('Erro ao buscar contato:', err);
            return res.status(500).json({ erro: 'Erro ao buscar contato' });
        }

        if (!row) {
            return res.status(404).json({ erro: 'Contato não encontrado' });
        }

        const contato = {
            ID: row.ID,
            NOME: row.NOME,
            IDADE: row.IDADE,
            TELEFONES: row.TELEFONES ? row.TELEFONES.split('||') : []
        };

        res.json(contato);
    });
});

/**
 * GET /api/contatos/pesquisar?termo=XXX
 * 
 * Busca contatos por nome ou telefone (case-insensitive)
 * 
 * Parâmetros:
 * - termo (query string): Texto para buscar
 * 
 * Comportamento:
 * - Busca em NOME (LIKE) e em TELEFONES normalizadas
 * - Ignora formatação de telefone (busca "11987654321" encontra "(11) 98765-4321")
 * 
 * Retorno: Array de contatos (mesmo formato de GET /api/contatos)
 */
app.get('/api/contatos/pesquisar', (req, res) => {
    const termo = req.query.termo || '';

    if (!termo.trim()) {
        return res.json([]);
    }

    const termoNormalizado = normalizarNumero(termo);

    const sql = `
        SELECT DISTINCT c.ID, c.NOME, c.IDADE,
               GROUP_CONCAT(t.NUMERO, '||') AS TELEFONES
        FROM Contato c
        LEFT JOIN Telefone t ON c.ID = t.IDCONTATO
        WHERE c.NOME LIKE ? 
           OR ${SQL_NUMERO_NORMALIZADO} LIKE ?
        GROUP BY c.ID
        ORDER BY c.NOME
    `;

    const parametros = [`%${termo}%`, `%${termoNormalizado}%`];

    db.all(sql, parametros, (err, rows) => {
        if (err) {
            console.error('Erro ao pesquisar contatos:', err);
            return res.status(500).json({ erro: 'Erro ao pesquisar contatos' });
        }

        const contatos = rows.map(row => ({
            ID: row.ID,
            NOME: row.NOME,
            IDADE: row.IDADE,
            TELEFONES: row.TELEFONES ? row.TELEFONES.split('||') : []
        }));

        res.json(contatos);
    });
});

/**
 * POST /api/contatos
 * 
 * Cria novo contato com telefones
 * 
 * Body (JSON):
 * {
 *   nome: "João Silva",
 *   idade: 25,
 *   telefones: ["(11) 98765-4321", "(11) 3456-7890"]
 * }
 * 
 * Validações:
 * - Nome obrigatório, máx 100 chars
 * - Idade entre 1-150 (opcional)
 * - Telefones: 10-11 dígitos cada
 * - Pelo menos 1 telefone obrigatório
 * 
 * Retorno: { id: number }
 */
app.post('/api/contatos', (req, res) => {
    const { nome, idade, telefones } = req.body;

    // Validações
    const errosContato = validarContato(nome, idade);
    if (errosContato.length > 0) {
        return res.status(400).json({ erro: errosContato.join(', ') });
    }

    if (!telefones || !Array.isArray(telefones) || telefones.length === 0) {
        return res.status(400).json({ erro: 'Pelo menos um telefone é obrigatório' });
    }

    // Validar cada telefone
    const telefonesValidos = telefones.filter(tel => {
        const normalizado = normalizarNumero(tel);
        return normalizado.length >= 10 && normalizado.length <= 11;
    });

    if (telefonesValidos.length === 0) {
        return res.status(400).json({ erro: 'Nenhum telefone válido fornecido (devem ter 10 ou 11 dígitos)' });
    }

    // Sanitizar dados
    const nomeLimpo = sanitizar(nome);
    const idadeNum = idade ? parseInt(idade) : null;

    // Inserir contato
    const sqlContato = 'INSERT INTO Contato (NOME, IDADE) VALUES (?, ?)';

    db.run(sqlContato, [nomeLimpo, idadeNum], function(err) {
        if (err) {
            console.error('Erro ao inserir contato:', err);
            return res.status(500).json({ erro: 'Erro ao criar contato' });
        }

        const contatoId = this.lastID;

        // Inserir telefones
        const sqlTelefone = 'INSERT INTO Telefone (IDCONTATO, NUMERO) VALUES (?, ?)';
        const promises = telefonesValidos.map(tel => {
            const telLimpo = sanitizar(tel);
            return new Promise((resolve, reject) => {
                db.run(sqlTelefone, [contatoId, telLimpo], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        });

        Promise.all(promises)
            .then(() => {
                res.status(201).json({ id: contatoId });
            })
            .catch(err => {
                console.error('Erro ao inserir telefones:', err);
                res.status(500).json({ erro: 'Erro ao criar telefones' });
            });
    });
});

/**
 * PUT /api/contatos/:id
 * 
 * Atualiza contato existente (nome, idade, telefones)
 * 
 * Parâmetros:
 * - id (URL): ID do contato
 * 
 * Body (JSON): mesmo formato de POST /api/contatos
 * 
 * Comportamento:
 * - Atualiza dados do contato
 * - Remove todos telefones antigos
 * - Insere novos telefones
 * 
 * Retorno: { mensagem: "Contato atualizado" }
 */
app.put('/api/contatos/:id', (req, res) => {
    const { id } = req.params;
    const { nome, idade, telefones } = req.body;

    // Validações
    const errosContato = validarContato(nome, idade);
    if (errosContato.length > 0) {
        return res.status(400).json({ erro: errosContato.join(', ') });
    }

    if (!telefones || !Array.isArray(telefones) || telefones.length === 0) {
        return res.status(400).json({ erro: 'Pelo menos um telefone é obrigatório' });
    }

    const telefonesValidos = telefones.filter(validarTelefone);

    if (telefonesValidos.length === 0) {
        return res.status(400).json({ erro: 'Nenhum telefone válido fornecido (devem ter 10 ou 11 dígitos)' });
    }

    const nomeLimpo = sanitizar(nome);
    const idadeNum = idade ? parseInt(idade) : null;

    // Atualizar contato
    const sqlContato = 'UPDATE Contato SET NOME = ?, IDADE = ? WHERE ID = ?';

    db.run(sqlContato, [nomeLimpo, idadeNum, id], function(err) {
        if (err) {
            console.error('Erro ao atualizar contato:', err);
            return res.status(500).json({ erro: 'Erro ao atualizar contato' });
        }

        if (this.changes === 0) {
            return res.status(404).json({ erro: 'Contato não encontrado' });
        }

        // Deletar telefones antigos
        const sqlDeleteTel = 'DELETE FROM Telefone WHERE IDCONTATO = ?';

        db.run(sqlDeleteTel, [id], (err) => {
            if (err) {
                console.error('Erro ao deletar telefones antigos:', err);
                return res.status(500).json({ erro: 'Erro ao atualizar telefones' });
            }

            // Inserir novos telefones
            const sqlTelefone = 'INSERT INTO Telefone (IDCONTATO, NUMERO) VALUES (?, ?)';
            const promises = telefonesValidos.map(tel => {
                const telLimpo = sanitizar(tel);
                return new Promise((resolve, reject) => {
                    db.run(sqlTelefone, [id, telLimpo], (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
            });

            Promise.all(promises)
                .then(() => {
                    res.json({ mensagem: 'Contato atualizado com sucesso' });
                })
                .catch(err => {
                    console.error('Erro ao inserir novos telefones:', err);
                    res.status(500).json({ erro: 'Erro ao atualizar telefones' });
                });
        });
    });
});

/**
 * DELETE /api/contatos/:id
 * 
 * Exclui contato e registra em log
 * 
 * Parâmetros:
 * - id (URL): ID do contato
 * 
 * Comportamento:
 * 1. Busca dados do contato (nome, telefones)
 * 2. Registra exclusão em logs/exclusoes.txt
 * 3. Deleta contato (CASCADE deleta telefones automaticamente)
 * 
 * Retorno: { mensagem: "Contato excluído" }
 */
app.delete('/api/contatos/:id', (req, res) => {
    const { id } = req.params;

    // Buscar dados antes de excluir (para o log)
    const sqlBuscar = `
        SELECT c.NOME,
               GROUP_CONCAT(t.NUMERO, '||') AS TELEFONES
        FROM Contato c
        LEFT JOIN Telefone t ON c.ID = t.IDCONTATO
        WHERE c.ID = ?
        GROUP BY c.ID
    `;

    db.get(sqlBuscar, [id], (err, row) => {
        if (err) {
            console.error('Erro ao buscar contato para exclusão:', err);
            return res.status(500).json({ erro: 'Erro ao excluir contato' });
        }

        if (!row) {
            return res.status(404).json({ erro: 'Contato não encontrado' });
        }

        const telefones = row.TELEFONES ? row.TELEFONES.split('||') : [];

        // Registrar log de exclusão
        gravarLog(id, row.NOME, telefones);

        // Excluir contato (CASCADE deleta telefones)
        const sqlDelete = 'DELETE FROM Contato WHERE ID = ?';

        db.run(sqlDelete, [id], function(err) {
            if (err) {
                console.error('Erro ao excluir contato:', err);
                return res.status(500).json({ erro: 'Erro ao excluir contato' });
            }

            res.json({ mensagem: 'Contato excluído com sucesso' });
        });
    });
});

/**
 * POST /api/telefones/verificar
 * 
 * Verifica se números de telefone já estão cadastrados
 * 
 * Body (JSON):
 * {
 *   telefones: ["(11) 98765-4321", "11987654321"]
 * }
 * 
 * Comportamento:
 * - Normaliza números (remove formatação)
 * - Busca no banco usando SQL_NUMERO_NORMALIZADO
 * - Retorna lista de contatos que possuem esses números
 * 
 * Retorno:
 * {
 *   duplicatas: [
 *     { ID: 1, NOME: "João", IDADE: 25, TELEFONES: ["(11) 98765-4321"] }
 *   ]
 * }
 */
app.post('/api/telefones/verificar', (req, res) => {
    const { telefones } = req.body;

    if (!telefones || !Array.isArray(telefones) || telefones.length === 0) {
        return res.json({ duplicatas: [] });
    }

    const numerosNormalizados = telefones.map(normalizarNumero).filter(n => n.length > 0);

    if (numerosNormalizados.length === 0) {
        return res.json({ duplicatas: [] });
    }

    const placeholders = numerosNormalizados.map(() => '?').join(',');

    const sql = `
        SELECT DISTINCT c.ID, c.NOME, c.IDADE,
               GROUP_CONCAT(t.NUMERO, '||') AS TELEFONES
        FROM Contato c
        INNER JOIN Telefone t ON c.ID = t.IDCONTATO
        WHERE ${SQL_NUMERO_NORMALIZADO} IN (${placeholders})
        GROUP BY c.ID
    `;

    db.all(sql, numerosNormalizados, (err, rows) => {
        if (err) {
            console.error('Erro ao verificar telefones:', err);
            return res.status(500).json({ erro: 'Erro ao verificar telefones' });
        }

        const duplicatas = rows.map(row => ({
            ID: row.ID,
            NOME: row.NOME,
            IDADE: row.IDADE,
            TELEFONES: row.TELEFONES ? row.TELEFONES.split('||') : []
        }));

        res.json({ duplicatas });
    });
});

/**
 * GET /export-db
 * 
 * Exporta o banco de dados SQLite
 * 
 * Comportamento:
 * - Lê arquivo agenda.db
 * - Envia como download com Content-Disposition: attachment
 * 
 * Retorno: Arquivo binário (SQLite database)
 */
app.get('/export-db', (req, res) => {
    const dbPath = path.join(__dirname, 'agenda.db');

    if (!fs.existsSync(dbPath)) {
        return res.status(404).json({ erro: 'Banco de dados não encontrado' });
    }

    res.download(dbPath, 'agenda_backup.db', (err) => {
        if (err) {
            console.error('Erro ao exportar banco:', err);
            res.status(500).json({ erro: 'Erro ao exportar banco de dados' });
        }
    });
});

/**
 * GET /export?format=csv|txt|json
 * 
 * Exporta os contatos em formatos alternativos além do banco SQLite.
 * - csv: Arquivo separado por vírgulas, uma linha por telefone (ID,NOME,IDADE,TELEFONE)
 * - txt: Texto simples, uma linha por contato (telefones separados por "; ")
 * - json: JSON com o mesmo formato do endpoint /api/contatos
 */
app.get('/export', (req, res) => {
    const format = (req.query.format || 'csv').toLowerCase();

    const sql = `
        SELECT c.ID, c.NOME, c.IDADE,
               GROUP_CONCAT(t.NUMERO, '||') AS TELEFONES
        FROM Contato c
        LEFT JOIN Telefone t ON c.ID = t.IDCONTATO
        GROUP BY c.ID
        ORDER BY c.NOME
    `;

    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error('Erro ao exportar contatos:', err);
            return res.status(500).json({ erro: 'Erro ao exportar contatos' });
        }

        const contatos = rows.map(row => ({
            ID: row.ID,
            NOME: row.NOME,
            IDADE: row.IDADE,
            TELEFONES: row.TELEFONES ? row.TELEFONES.split('||') : []
        }));

        if (format === 'json') {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Content-Disposition', 'attachment; filename="agenda_contatos.json"');
            return res.send(JSON.stringify(contatos, null, 2));
        }

        if (format === 'txt') {
            const linhas = contatos.map(c => {
                const tels = c.TELEFONES.join('; ');
                return `ID: ${c.ID} | NOME: ${c.NOME} | IDADE: ${c.IDADE ?? ''} | TELEFONES: ${tels}`;
            }).join('\n');
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Content-Disposition', 'attachment; filename="agenda_contatos.txt"');
            return res.send(linhas);
        }

        // Default: CSV
        const escape = (val) => {
            const s = (val ?? '').toString();
            // Substitui aspas por aspas duplas e envolve com aspas
            return '"' + s.replace(/"/g, '""') + '"';
        };
        const header = ['ID', 'NOME', 'IDADE', 'TELEFONE'];
        const linhasCsv = [header.join(',')];
        contatos.forEach(c => {
            if (c.TELEFONES.length === 0) {
                linhasCsv.push([c.ID, escape(c.NOME), c.IDADE ?? '', ''].join(','));
            } else {
                c.TELEFONES.forEach(tel => {
                    linhasCsv.push([c.ID, escape(c.NOME), c.IDADE ?? '', escape(tel)].join(','));
                });
            }
        });

        const csv = linhasCsv.join('\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="agenda_contatos.csv"');
        return res.send(csv);
    });
});

// ============================================
// INICIALIZAÇÃO DO SERVIDOR
// ============================================

/**
 * Inicia servidor HTTP na porta configurada
 * 
 * Comportamento especial para Windows:
 * - Detecta sistema operacional
 * - Abre navegador automaticamente em http://localhost:3000
 * - Usa comando 'start' do cmd.exe
 */
app.listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    console.log(`🚀 Servidor rodando em ${url}`);
    console.log(`📊 Banco de dados: agenda.db`);
    console.log(`📝 Logs de exclusão: logs/exclusoes.txt`);

    // Auto-abrir navegador no Windows
    if (process.platform === 'win32') {
        console.log(`🌐 Abrindo navegador...`);
        spawn('cmd', ['/c', 'start', url]);
    }
});
