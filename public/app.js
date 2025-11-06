/*
 * ============================================
 * AGENDA TELEFÔNICA - Controller Principal
 * ============================================
 * 
 * PROPÓSITO:
 * Este é o cérebro da aplicação frontend. Gerencia toda a interação do usuário
 * com a interface, comunicação com a API backend, e estado da aplicação.
 * 
 * POR QUE EXISTE:
 * - Separar lógica de negócio da apresentação (HTML)
 * - Centralizar toda comunicação com o backend via fetch API
 * - Gerenciar estado da aplicação (contatos, edição, validação)
 * - Implementar interações dinâmicas sem recarregar a página (SPA behavior)
 * 
 * ARQUITETURA:
 * 1. Estado Global: variáveis que armazenam dados da sessão
 * 2. Funções de UI: manipulação do DOM e feedbacks visuais
 * 3. Funções de API: comunicação com servidor via REST
 * 4. Validação: regras de negócio no cliente (10-11 dígitos, duplicatas)
 * 5. CRUD: Criar, Ler, Atualizar, Deletar contatos
 * 6. Event Listeners: reações a ações do usuário
 * 
 * FLUXO DE DADOS:
 * Usuário → Event Handler → Validação → API Call → Atualizar UI → Feedback
 */

// ============================================
// ESTADO GLOBAL DA APLICAÇÃO
// ============================================
let contatoEditandoId = null; // ID do contato sendo editado (null = modo criação)
let detalhesAberto = null;    // ID do card expandido com detalhes
// Controle de buscas e loading para evitar flickering/loops
let currentSearchController = null; // AbortController da busca atual
let searchLoadingTimer = null;      // Timer para exibir overlay com atraso
let searchLoadingVisible = false;   // Estado do overlay para busca

// ============================================
// Helpers específicos do loading da busca (evita piscar/loop)
function showSearchLoadingDelayed(delay = 200) {
    clearTimeout(searchLoadingTimer);
    searchLoadingTimer = setTimeout(() => {
        searchLoadingVisible = true;
        mostrarCarregando(true);
    }, delay);
}

function hideSearchLoading() {
    clearTimeout(searchLoadingTimer);
    if (searchLoadingVisible) {
        mostrarCarregando(false);
        searchLoadingVisible = false;
    }
}
// UTILIDADES E HELPERS
// ============================================

/**
 * Normaliza número de telefone removendo caracteres não-numéricos
 */
function normalizarTelefone(str) {
    return str.replace(/\D/g, '');
}

// ============================================
// FUNÇÕES DE FEEDBACK VISUAL
// ============================================

/**
 * Exibe mensagem toast temporária no canto superior direito
 * Usado para confirmações, avisos e erros
 */
function mostrarToast(mensagem, tipo = 'sucesso') {
    const toast = document.createElement('div');
    toast.className = `fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg text-white z-50 animate-fade-in ${
        tipo === 'sucesso' ? 'bg-green-600' : tipo === 'erro' ? 'bg-red-600' : 'bg-yellow-600'
    }`;
    toast.textContent = mensagem;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

/**
 * Mostra/esconde overlay de carregamento durante operações assíncronas
 * Previne interações enquanto aguarda resposta do servidor
 */
function mostrarCarregando(mostrar) {
    const loading = document.getElementById('loading');
    if (loading) {
        loading.classList.toggle('hidden', !mostrar);
    }
}

// ============================================
// VALIDAÇÃO E ERROS INLINE (criadas via JS)
// ============================================

/**
 * Garante que os elementos de erro existam logo após os inputs.
 * Evita depender de mudanças no HTML.
 */
function ensureErrorPlaceholders() {
    const map = [
        { inputId: 'nome', errorId: 'nomeError' },
        { inputId: 'idade', errorId: 'idadeError' },
        { inputId: 'telefones', errorId: 'telefonesError' }
    ];
    map.forEach(({ inputId, errorId }) => {
        const input = document.getElementById(inputId);
        if (!input) return;
        let err = document.getElementById(errorId);
        if (!err) {
            err = document.createElement('p');
            err.id = errorId;
            err.className = 'mt-1 text-sm text-red-400 hidden';
            input.insertAdjacentElement('afterend', err);
        }
    });
}

function setFieldError(elementId, mensagem) {
    const el = document.getElementById(elementId);
    if (el) {
        el.textContent = mensagem;
        el.classList.remove('hidden');
    }
}

function clearFieldError(elementId) {
    const el = document.getElementById(elementId);
    if (el) {
        el.textContent = '';
        el.classList.add('hidden');
    }
}

function clearAllErrors() {
    ['nomeError', 'idadeError', 'telefonesError'].forEach(id => clearFieldError(id));
}

// ============================================
// FUNÇÕES DE API - COMUNICAÇÃO COM BACKEND
// ============================================

/**
 * Busca todos os contatos da API
 * Endpoint: GET /api/contatos
 */
async function carregarContatos() {
    try {
        const resposta = await fetch('/api/contatos');
        const contatos = await resposta.json();
        renderizarContatos(contatos);
    } catch (erro) {
        console.error('Erro ao carregar contatos:', erro);
        mostrarToast('Erro ao carregar contatos', 'erro');
    }
}

/**
 * Busca contatos que correspondem ao termo de pesquisa
 * Endpoint: GET /api/contatos/pesquisar?termo=XXX
 */
async function pesquisarContatos() {
    const termo = document.getElementById('termoPesquisa').value.trim();
    
    if (!termo) {
        carregarContatos();
        return;
    }

    try {
        // Cancela qualquer busca anterior para evitar respostas fora de ordem
        if (currentSearchController) {
            currentSearchController.abort();
        }
        currentSearchController = new AbortController();
        const { signal } = currentSearchController;

        // Mostra overlay apenas se a requisição demorar (evita piscar)
        showSearchLoadingDelayed(200);

        const resposta = await fetch(`/api/contatos/pesquisar?termo=${encodeURIComponent(termo)}` , { signal });
        if (!resposta.ok) {
            let erroMsg = 'Erro ao pesquisar contatos';
            try {
                const payload = await resposta.json();
                if (payload && payload.erro) erroMsg = payload.erro;
            } catch (_) { /* ignore parse error */ }
            mostrarToast(erroMsg, 'erro');
            return;
        }
        const contatos = await resposta.json();
        const lista = Array.isArray(contatos) ? contatos : [];
        renderizarContatos(lista);
    } catch (erro) {
        if (erro && erro.name === 'AbortError') {
            // Busca anterior cancelada – ignore
        } else {
            console.error('Erro ao pesquisar:', erro);
            mostrarToast('Erro ao pesquisar contatos', 'erro');
        }
    } finally {
        // Garante esconder overlay
        hideSearchLoading();
        mostrarCarregando(false);
    }
}

/**
 * Salva ou atualiza um contato (depende se contatoEditandoId está setado)
 * Endpoint: POST /api/contatos (criar) ou PUT /api/contatos/:id (atualizar)
 * 
 * VALIDAÇÕES:
 * - Nome obrigatório
 * - Idade obrigatória e numérica
 * - Pelo menos 1 telefone
 * - Telefones devem ter 10-11 dígitos
 * - Verifica duplicatas antes de salvar
 */
async function salvarContato() {
    const nome = document.getElementById('nome').value.trim();
    const idade = document.getElementById('idade').value;
    const telefones = document.getElementById('telefones').value.trim();

    // Limpa erros anteriores e validações básicas com mensagens inline
    clearAllErrors();
    let hasError = false;
    if (!nome) { setFieldError('nomeError', 'Informe o nome completo'); hasError = true; }
    if (!telefones) { setFieldError('telefonesError', 'Informe ao menos um telefone'); hasError = true; }
    if (hasError) { mostrarToast('Verifique os campos destacados', 'erro'); return; }

    // Processar telefones (separados por vírgula ou quebra de linha) e remover duplicatas
    const listaTelefones = telefones
        .split(/[,\n]/)
        .map(t => t.trim())
        .filter(t => t);

    // Deduplicate telefones com base no número normalizado (remove formatação)
    const uniqueMap = new Map();
    for (const t of listaTelefones) {
        const norm = normalizarTelefone(t);
        if (!norm) continue;
        if (!uniqueMap.has(norm)) uniqueMap.set(norm, t);
    }
    const listaTelefonesUnicos = Array.from(uniqueMap.values());

    // Validar formato dos telefones únicos (10 ou 11 dígitos)
    for (const tel of listaTelefonesUnicos) {
        const normalizado = normalizarTelefone(tel);
        if (normalizado.length < 10 || normalizado.length > 11) {
            setFieldError('telefonesError', `Telefone ${tel} inválido. Use 10 ou 11 dígitos.`);
            return;
        }
    }

    // Verificar duplicatas (apenas ao criar novo contato)
    if (!contatoEditandoId) {
        try {
            const verificacao = await fetch('/api/telefones/verificar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ telefones: listaTelefonesUnicos })
            });
            const resultado = await verificacao.json();

            if (resultado.duplicatas && resultado.duplicatas.length > 0) {
                const primeiroContato = resultado.duplicatas[0];
                mostrarModalDuplicata(primeiroContato, listaTelefones);
                return;
            }
        } catch (erro) {
            console.error('Erro ao verificar duplicatas:', erro);
        }
    }

    // Validar idade se fornecida (1-150)
    let idadeNum = null;
    if (idade !== null && idade !== undefined && idade.toString().trim() !== '') {
        const n = parseInt(idade);
        if (isNaN(n) || n < 1 || n > 150) {
            setFieldError('idadeError', 'Idade deve estar entre 1 e 150');
            mostrarToast('Verifique os campos destacados', 'erro');
            return;
        }
        idadeNum = n;
    }

    // Preparar dados para envio
    const dados = {
        nome,
        idade: idadeNum, // opcional
        telefones: listaTelefonesUnicos
    };

    try {
        mostrarCarregando(true);
        
        // Fallback defensivo ao hidden caso o estado global se perca
        const idHiddenEl = document.getElementById('contatoIdHidden');
        const idHiddenVal = idHiddenEl && idHiddenEl.value ? parseInt(idHiddenEl.value) : null;
        const idParaAtualizar = (contatoEditandoId != null) ? contatoEditandoId : idHiddenVal;

        const url = (idParaAtualizar != null)
            ? `/api/contatos/${idParaAtualizar}` 
            : '/api/contatos';

        const metodo = (idParaAtualizar != null) ? 'PUT' : 'POST';

        const resposta = await fetch(url, {
            method: metodo,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });

        if (resposta.ok) {
            mostrarToast(
                contatoEditandoId ? 'Contato atualizado com sucesso!' : 'Contato cadastrado com sucesso!',
                'sucesso'
            );
            limparFormulario();
            carregarContatos();
            fecharModalForm();
        } else {
            const erro = await resposta.json();
            mostrarToast(erro.erro || 'Erro ao salvar contato', 'erro');
        }
    } catch (erro) {
        console.error('Erro ao salvar contato:', erro);
        mostrarToast('Erro ao salvar contato', 'erro');
    } finally {
        mostrarCarregando(false);
    }
}

/**
 * Exclui um contato após confirmação
 * Endpoint: DELETE /api/contatos/:id
 * Backend registra exclusão em arquivo de log
 */
// Modal de confirmação de exclusão (criado via JS se não existir)
let pendingDeleteId = null;

function ensureConfirmModal() {
    if (document.getElementById('modalConfirmDelete')) return;
    const wrapper = document.createElement('div');
    wrapper.id = 'modalConfirmDelete';
    wrapper.className = 'hidden fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4';
    wrapper.innerHTML = `
        <div class="bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-700 animate-fade-in">
            <div class="flex items-center gap-3 mb-4">
                <div class="bg-red-500/20 p-3 rounded-lg">
                    <i data-lucide="trash-2" class="w-6 h-6 text-red-500"></i>
                </div>
                <h3 class="text-xl font-bold text-white">Confirmação de Exclusão</h3>
            </div>
            <p class="text-slate-300 mb-4">Tem certeza que deseja excluir este contato? Esta ação não pode ser desfeita.</p>
            <div class="flex gap-3">
                <button id="btnConfirmDelete" class="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                    <span>Excluir</span>
                </button>
                <button id="btnCancelDelete" class="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2">
                    <i data-lucide="x" class="w-4 h-4"></i>
                    <span>Cancelar</span>
                </button>
            </div>
        </div>`;
    document.body.appendChild(wrapper);
    if (window.lucide) lucide.createIcons();
    const btnCancel = document.getElementById('btnCancelDelete');
    if (btnCancel) btnCancel.onclick = () => wrapper.classList.add('hidden');
}

function confirmarExcluir(id) {
    pendingDeleteId = id;
    ensureConfirmModal();
    const modal = document.getElementById('modalConfirmDelete');
    const btn = document.getElementById('btnConfirmDelete');
    if (modal) modal.classList.remove('hidden');
    if (btn) {
        btn.onclick = async () => {
            modal.classList.add('hidden');
            await excluirContato(pendingDeleteId);
            pendingDeleteId = null;
        };
    }
}

async function excluirContato(id) {
    try {
        mostrarCarregando(true);
        const resposta = await fetch(`/api/contatos/${id}`, {
            method: 'DELETE'
        });

        if (resposta.ok) {
            mostrarToast('Contato excluído com sucesso!', 'sucesso');
            fecharTodosDetalhes();
            carregarContatos();
        } else {
            mostrarToast('Erro ao excluir contato', 'erro');
        }
    } catch (erro) {
        console.error('Erro ao excluir contato:', erro);
        mostrarToast('Erro ao excluir contato', 'erro');
    } finally {
        mostrarCarregando(false);
    }
}

// ============================================
// FUNÇÕES DE UI - RENDERIZAÇÃO E INTERAÇÃO
// ============================================

/**
 * Renderiza lista de contatos na tela
 * Cada card é expansível para mostrar telefones e ações
 */
function renderizarContatos(contatos) {
    const lista = document.getElementById('listaContatos');
    
    if (!lista) {
        console.error('Elemento listaContatos não encontrado');
        return;
    }
    
    if (contatos.length === 0) {
        lista.innerHTML = `
            <div class="col-span-full text-center py-12">
                <i data-lucide="phone-off" class="w-16 h-16 mx-auto mb-4 text-slate-600"></i>
                <p class="text-slate-400 text-lg">Nenhum contato encontrado</p>
            </div>
        `;
        if (window.lucide) lucide.createIcons();
        return;
    }

    lista.innerHTML = contatos.map(contato => `
        <div class="contato-card bg-slate-800 rounded-xl p-6 border border-slate-700 hover:border-blue-500 shadow-lg"
             onclick="alternarExpandir(${contato.ID})">
            <div class="flex items-start justify-between mb-3">
                <div class="flex items-center space-x-3">
                    <div class="bg-gradient-to-br from-blue-500 to-blue-700 p-3 rounded-lg">
                        <i data-lucide="user" class="w-6 h-6 text-white"></i>
                    </div>
                    <div>
                        <h3 class="font-bold text-xl text-white">${contato.NOME}</h3>
                        <p class="text-slate-400 text-sm">${(contato.IDADE !== undefined && contato.IDADE !== null) ? (contato.IDADE + ' anos') : ''}</p>
                    </div>
                </div>
                <i data-lucide="${detalhesAberto === contato.ID ? 'chevron-up' : 'chevron-down'}" 
                   class="w-5 h-5 text-slate-400"></i>
            </div>

            <div id="detalhes-${contato.ID}" class="${detalhesAberto === contato.ID ? '' : 'hidden'} mt-4 pt-4 border-t border-slate-700">
                <div class="space-y-2 mb-4">
                    <p class="text-sm text-slate-400 font-medium mb-2">Telefones:</p>
                    ${contato.TELEFONES.map(tel => `
                        <div class="flex items-center space-x-2 text-slate-300">
                            <i data-lucide="phone" class="w-4 h-4 text-blue-400"></i>
                            <span>${tel}</span>
                        </div>
                    `).join('')}
                </div>
                
                <div class="flex gap-2">
                    <button onclick="editarContato(${contato.ID}); event.stopPropagation();"
                            class="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2">
                        <i data-lucide="edit" class="w-4 h-4"></i>
                        <span>Editar</span>
                    </button>
                    <button onclick="confirmarExcluir(${contato.ID}); event.stopPropagation();"
                            class="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                        <span>Excluir</span>
                    </button>
                </div>
            </div>
        </div>
    `).join('');

    if (window.lucide) lucide.createIcons();
}

/**
 * Expande/colapsa detalhes de um card de contato
 */
function alternarExpandir(id) {
    if (detalhesAberto === id) {
        detalhesAberto = null;
    } else {
        detalhesAberto = id;
    }
    carregarContatos();
}

/**
 * Fecha todos os cards expandidos
 */
function fecharTodosDetalhes() {
    detalhesAberto = null;
    carregarContatos();
}

/**
 * Carrega dados de um contato no formulário para edição
 */
async function editarContato(id) {
    try {
        // Abre modal de formulário ao editar
        abrirModalForm();
        const resposta = await fetch(`/api/contatos/${id}`);
        const contato = await resposta.json();

    document.getElementById('nome').value = contato.NOME;
    document.getElementById('idade').value = (contato.IDADE ?? '');
        document.getElementById('telefones').value = contato.TELEFONES.join('\n');

    contatoEditandoId = id;
    const hidden = document.getElementById('contatoIdHidden');
    if (hidden) hidden.value = String(id);
        document.getElementById('tituloFormulario').textContent = 'Editar Contato';
        document.getElementById('btnSalvar').innerHTML = `
            <i data-lucide="save" class="w-5 h-5"></i>
            <span>Atualizar</span>
        `;
        if (window.lucide) lucide.createIcons();

        // Foco no campo nome dentro do modal
        const nome = document.getElementById('nome');
        if (nome) nome.focus();
    } catch (erro) {
        console.error('Erro ao carregar contato:', erro);
        mostrarToast('Erro ao carregar contato', 'erro');
    }
}

/**
 * Limpa o formulário e reseta para modo de criação
 */
function limparFormulario() {
    document.getElementById('formContato').reset();
    contatoEditandoId = null;
    const hidden = document.getElementById('contatoIdHidden');
    if (hidden) hidden.value = '';
    document.getElementById('tituloFormulario').textContent = 'Novo Contato';
    document.getElementById('btnSalvar').innerHTML = `
        <i data-lucide="save" class="w-5 h-5"></i>
        <span>Salvar Contato</span>
    `;
    if (window.lucide) lucide.createIcons();
}

/**
 * Cancela edição e limpa formulário
 */
function cancelarEdicao() {
    limparFormulario();
    fecharTodosDetalhes();
    fecharModalForm();
}

// ============================================
// MODAL DE DUPLICATAS
// ============================================

/**
 * Exibe modal quando telefone duplicado é detectado
 * Oferece opção de editar contato existente ou cancelar
 */
function mostrarModalDuplicata(contatoExistente, novosNumeros) {
    const modal = document.getElementById('modalDuplicata');
    const infoContato = document.getElementById('infoContatoDuplicata');
    
    if (!modal || !infoContato) {
        console.error('Elementos do modal não encontrados');
        return;
    }
    
    infoContato.innerHTML = `
        <div class="space-y-2">
            <p class="font-medium text-white">
                <i data-lucide="user" class="w-4 h-4 inline"></i>
                ${contatoExistente.NOME} (${contatoExistente.IDADE} anos)
            </p>
            <div class="text-sm text-slate-300">
                <p class="font-medium mb-1">Telefones cadastrados:</p>
                ${contatoExistente.TELEFONES.map(tel => `
                    <div class="flex items-center gap-2 ml-4">
                        <i data-lucide="phone" class="w-3 h-3 text-blue-400"></i>
                        <span>${tel}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    modal.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
    
    // Configurar botão de editar para carregar contato existente com novos números
    const btnEditar = document.getElementById('btnEditarExistente');
    if (btnEditar) {
        btnEditar.onclick = async () => {
            modal.classList.add('hidden');
            await editarContato(contatoExistente.ID);
            
            // Mesclar novos números com existentes
            const telefonesExistentes = document.getElementById('telefones').value.split('\n').filter(t => t.trim());
            const todosNumeros = [...new Set([...telefonesExistentes, ...novosNumeros])];
            document.getElementById('telefones').value = todosNumeros.join('\n');
            
            mostrarToast('Adicione os novos números e salve', 'aviso');
        };
    }
}

/**
 * Fecha modal de duplicatas
 */
function fecharModalDuplicata() {
    const modal = document.getElementById('modalDuplicata');
    if (modal) {
        modal.classList.add('hidden');
    }
}

/**
 * Exibe o formulário para criação de novo contato
 */
function mostrarFormulario() {
    abrirModalForm();
    limparFormulario();
    const nome = document.getElementById('nome');
    if (nome) nome.focus();
}

// ============================================
// INICIALIZAÇÃO
// ============================================

/**
 * Executado quando o DOM está pronto
 * - Força dark mode permanentemente
 * - Carrega contatos iniciais
 * - Inicializa ícones Lucide
 */
document.addEventListener('DOMContentLoaded', () => {
    // Força dark mode permanentemente
    document.documentElement.classList.add('dark');
    
    // Carrega lista inicial de contatos
    carregarContatos();
    
    // Inicializa ícones
    if (window.lucide) {
        lucide.createIcons();
    }

    // Garante placeholders de erro abaixo dos inputs e listeners para limpar
    ensureErrorPlaceholders();
    const nomeEl = document.getElementById('nome');
    const idadeEl = document.getElementById('idade');
    const telefonesEl = document.getElementById('telefones');
    if (nomeEl) nomeEl.addEventListener('input', () => clearFieldError('nomeError'));
    if (idadeEl) idadeEl.addEventListener('input', () => clearFieldError('idadeError'));
    if (telefonesEl) telefonesEl.addEventListener('input', () => clearFieldError('telefonesError'));

    // Busca automática com debounce (sem flood no servidor)
    const termo = document.getElementById('termoPesquisa');
    if (termo) {
        termo.classList.add('min-w-0');
        // Debounce para busca automática enquanto digita (sem flood no servidor)
        let debounceTimer = null;
        let composing = false;
        termo.addEventListener('compositionstart', () => composing = true);
        termo.addEventListener('compositionend', () => { composing = false; triggerSearch(); });
        termo.addEventListener('input', () => {
            if (composing) return;
            triggerSearch();
        });

        function triggerSearch() {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                const value = termo.value.trim();
                if (value) {
                    pesquisarContatos();
                } else {
                    // Limpo: aborta busca anterior e volta lista completa
                    if (currentSearchController) currentSearchController.abort();
                    hideSearchLoading();
                    mostrarCarregando(false);
                    carregarContatos();
                }
            }, 300);
        }
    }
});

// ============================================
// EXPORTAÇÃO - MODAL E AÇÕES
// ============================================
function abrirModalExportar() {
    const modal = document.getElementById('modalExportar');
    if (modal) modal.classList.remove('hidden');
}

function fecharModalExportar() {
    const modal = document.getElementById('modalExportar');
    if (modal) modal.classList.add('hidden');
}

function exportarFormato(fmt) {
    const url = fmt === 'sqlite' ? '/export-db' : `/export?format=${encodeURIComponent(fmt)}`;
    // Força download navegando para o endpoint
    window.location.href = url;
    fecharModalExportar();
}

// ============================================
// MODAL DO FORMULÁRIO - ABRIR/FECHAR
// ============================================
function abrirModalForm() {
    const overlay = document.getElementById('modalForm');
    if (overlay) overlay.classList.remove('hidden');
}

function fecharModalForm() {
    const overlay = document.getElementById('modalForm');
    if (overlay) overlay.classList.add('hidden');
}
