// Estado da aplicação com configuração mais enxuta
let visitors = [];
let filteredVisitors = [];
let filters = {
  date: null,
  name: '',
  firstTimeOnly: false
};
let pagination = {
  current: 1,
  itemsPerPage: 10
};

// Inicialização do Supabase com o método do arquivo "script.js"
const supabaseUrl = 'https://qdttsbnsijllhkgrpdmc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkdHRzYm5zaWpsbGhrZ3JwZG1jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDExOTQzNDgsImV4cCI6MjA1Njc3MDM0OH0.CuZdeCC2wK73CrTt2cMIKxj20hAtgz_8qAhFt1EKkCw';
// Garantir inicialização correta do cliente Supabase
const supabase = supabaseUrl && supabaseKey ? 
  (window.supabase ? window.supabase.createClient(supabaseUrl, supabaseKey) : null) : null;
const isSupabaseAvailable = !!supabase;

// Cache de elementos DOM para melhor performance
const DOM = {
  dateFilterBtn: document.getElementById('dateFilterBtn'),
  dateFilterDropdown: document.getElementById('dateFilterDropdown'),
  dateFilterInput: document.getElementById('dateFilterInput'),
  clearDateFilterBtn: document.getElementById('clearDateFilterBtn'),
  selectedFilterDate: document.getElementById('selectedFilterDate'),
  nameFilter: document.getElementById('nameFilter'),
  searchBtn: document.getElementById('searchBtn'),
  firstTimeFilter: document.getElementById('firstTimeFilter'),
  visitorsTableBody: document.getElementById('visitorsTableBody'),
  totalVisitorsCount: document.getElementById('totalVisitorsCount'),
  firstTimeVisitorsCount: document.getElementById('firstTimeVisitorsCount'),
  downloadBtn: document.getElementById('downloadBtn'),
  downloadPresentationBtn: document.getElementById('downloadPresentationBtn'), // Novo botão para versão de apresentação
  prevPageBtn: document.getElementById('prevPageBtn'),
  nextPageBtn: document.getElementById('nextPageBtn'),
  pageInfo: document.getElementById('pageInfo')
};

// Utilitários de data consolidados
const DateUtils = {
  // Converte para formato brasileiro (dd/mm/yyyy)
  formatToBR(dateString) {
    if (!dateString) return '';
    
    // Se já estiver no formato brasileiro, retorna o próprio
    if (dateString.includes('/')) return dateString;
    
    // Converte formato ISO para formato brasileiro
    const [year, month, day] = dateString.split('-');
    return `${day}/${month}/${year}`;
  },
  
  // Converte formato brasileiro para ISO
  formatToISO(dateString) {
    if (!dateString) return '';
    
    const [day, month, year] = dateString.split('/');
    return `${year}-${month}-${day}`;
  },
  
  // Verifica se duas datas são iguais (no formato dd/mm/yyyy)
  areDatesEqual(date1, date2) {
    return date1 === date2;
  },
  
  // Cria objeto Date a partir de string brasileira
  createDateFromBR(brDate) {
    if (!brDate) return null;
    
    const [day, month, year] = brDate.split('/');
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }
};

// Cache para datas convertidas
const dateCache = new Map();

// Gerenciamento de dados otimizado
const DataManager = {
  // Carrega dados com fallback e sincronização inteligente
  async load() {
    try {
      // Carrega visitantes do localStorage primeiro para UI responsiva imediata
      const storedVisitors = localStorage.getItem('churchVisitors');
      visitors = storedVisitors ? JSON.parse(storedVisitors) : [];
      
      // Processa os dados iniciais para UI imediata
      this.processVisitors();
      
      // Tenta carregar do Supabase em segundo plano se disponível
      if (isSupabaseAvailable && navigator.onLine) {
        await this.syncWithSupabase();
        // Inicializa escuta em tempo real com throttling
        this.initializeRealtime();
      }
    } catch (error) {
      console.error("Erro ao carregar visitantes:", error);
      // Continua com os dados do localStorage em caso de falha
    }
  },
  
  // Sincronizar dados com Supabase de forma eficiente
  async syncWithSupabase(retryCount = 0) {
    if (!isSupabaseAvailable || !navigator.onLine) return;
    
    try {
      // Otimização: verificar último ID local antes de buscar todos os dados
      const lastSyncTime = localStorage.getItem('lastSyncTime') || 0;
      const currentTime = Date.now();
      
      // Apenas sincroniza se passaram pelo menos 30 segundos desde a última sincronização
      if (currentTime - lastSyncTime < 30000 && visitors.length > 0) {
        return; // Evita sincronizações frequentes demais
      }
      
      // Conexão OK, buscar dados com filtro de colunas para reduzir tamanho da resposta
      const { data, error } = await supabase
        .from('visitors')
        .select('id, name, phone, isFirstTime, date')
        .order('id', { ascending: false });
      
      if (error) throw error;
      
      if (data && data.length > 0) {
        // Usar Map para mesclagem eficiente de dados
        const visitorMap = new Map(visitors.map(v => [v.id.toString(), v]));
        
        // Adicionar ou atualizar com dados do Supabase
        data.forEach(v => {
          visitorMap.set(v.id.toString(), {
            id: v.id,
            name: v.name,
            phone: v.phone,
            isFirstTime: v.isFirstTime,
            date: v.date
          });
        });
        
        visitors = Array.from(visitorMap.values());
        localStorage.setItem('churchVisitors', JSON.stringify(visitors));
        localStorage.setItem('lastSyncTime', currentTime.toString());
        
        // Atualiza a UI com novos dados
        this.processVisitors();
        
        // Tenta sincronizar operações pendentes
        await this.processPendingOperations();
      }
    } catch (error) {
      console.error("Erro ao sincronizar com Supabase:", error);
      
      // Implementa retry com backoff exponencial (máximo 3 tentativas)
      if (retryCount < 3 && navigator.onLine) {
        const timeout = Math.pow(2, retryCount) * 1000;
        console.log(`Tentando novamente em ${timeout/1000} segundos...`);
        
        setTimeout(() => {
          this.syncWithSupabase(retryCount + 1);
        }, timeout);
      }
    }
  },
  
  // Adicione este novo método para processar operações pendentes
  async processPendingOperations() {
    if (!isSupabaseAvailable || !navigator.onLine) return;
    
    try {
      // Recuperar operações pendentes
      const pendingOperations = JSON.parse(localStorage.getItem('pendingSync') || '[]');
      if (pendingOperations.length === 0) return;
      
      console.log(`Processando ${pendingOperations.length} operações pendentes...`);
      
      // Otimização: agrupar operações por tipo para processamento em lote
      const insertOps = pendingOperations.filter(op => op.operation === 'insert');
      const deleteOps = pendingOperations.filter(op => op.operation === 'delete');
      const successfulOps = [];
      
      // Processamento em lote de inserções
      if (insertOps.length > 0) {
        const insertData = insertOps.map(op => ({
          id: op.data.id,
          name: op.data.name,
          phone: op.data.phone,
          isFirstTime: op.data.isFirstTime,
          date: op.data.date
        }));
        
        // Inserir em lotes de 50 registros para evitar limites de payload
        for (let i = 0; i < insertData.length; i += 50) {
          const batch = insertData.slice(i, i + 50);
          const { error } = await supabase
            .from('visitors')
            .upsert(batch, { onConflict: 'id' });
          
          if (!error) {
            successfulOps.push(...insertOps.slice(i, i + 50));
          }
        }
      }
      
      // Processamento em lote de exclusões (se a API suportar)
      if (deleteOps.length > 0) {
        const idsToDelete = deleteOps.map(op => op.id);
        // Processar em lotes de 50 para evitar limites de query
        for (let i = 0; i < idsToDelete.length; i += 50) {
          const batchIds = idsToDelete.slice(i, i + 50);
          const { error } = await supabase
            .from('visitors')
            .delete()
            .in('id', batchIds);
          
          if (!error) {
            successfulOps.push(...deleteOps.slice(i, i + 50));
          }
        }
      }
      
      // Remover operações bem-sucedidas da lista de pendentes
      if (successfulOps.length > 0) {
        const remainingOps = pendingOperations.filter(op => 
          !successfulOps.some(sop => 
            sop.operation === op.operation && 
            ((op.operation === 'insert' && sop.data.id === op.data.id) || 
             (op.operation === 'delete' && sop.id === op.id))
          )
        );
        
        localStorage.setItem('pendingSync', JSON.stringify(remainingOps));
        console.log(`${successfulOps.length} operações sincronizadas com sucesso.`);
      }
    } catch (error) {
      console.error("Erro ao processar operações pendentes:", error);
    }
  },
  
  // Configuração de escuta em tempo real otimizada
  initializeRealtime() {
    if (!isSupabaseAvailable || !navigator.onLine) return;
    
    // Variável para controlar throttling
    let lastRealtimeSync = 0;
    const syncThrottleTime = 5000; // 5 segundos entre sincronizações
    
    const channel = supabase
      .channel('visitors-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'visitors' }, 
        payload => {
          // Throttling de sincronização em tempo real
          const now = Date.now();
          if (now - lastRealtimeSync > syncThrottleTime) {
            lastRealtimeSync = now;
            this.syncWithSupabase();
          }
        }
      )
      .subscribe(status => {
        if (status !== 'SUBSCRIBED') {
          console.warn('Falha na escuta em tempo real:', status);
        }
      });
      
    // Adiciona listener para desconexão/reconexão
    window.addEventListener('online', () => {
      this.syncWithSupabase();
      channel.subscribe();
    });
  },
  
  // Processamento de dados para UI
  processVisitors() {
    this.applyFilters();
    this.renderTable();
    this.updateStats();
    this.updatePagination();
  },
  
  // Remoção otimizada com transação local-remota
  async removeVisitor(id) {
    // Otimização: Remove imediatamente da UI para feedback rápido
    visitors = visitors.filter(visitor => visitor.id !== id);
    localStorage.setItem('churchVisitors', JSON.stringify(visitors));
    this.processVisitors();
    
    // Remove do Supabase em segundo plano
    if (isSupabaseAvailable && navigator.onLine) {
      try {
        const { error } = await supabase
          .from('visitors')
          .delete()
          .eq('id', id);
        
        if (error) {
          // Adicionar à fila de operações pendentes
          const pendingOps = JSON.parse(localStorage.getItem('pendingSync') || '[]');
          // Verificar se já existe uma operação idêntica pendente
          if (!pendingOps.some(op => op.operation === 'delete' && op.id === id)) {
            pendingOps.push({ operation: 'delete', id });
            localStorage.setItem('pendingSync', JSON.stringify(pendingOps));
          }
        }
      } catch (error) {
        // Adicionar à fila de operações pendentes
        const pendingOps = JSON.parse(localStorage.getItem('pendingSync') || '[]');
        // Verificar se já existe uma operação idêntica pendente
        if (!pendingOps.some(op => op.operation === 'delete' && op.id === id)) {
          pendingOps.push({ operation: 'delete', id });
          localStorage.setItem('pendingSync', JSON.stringify(pendingOps));
        }
      }
    }
  },
  
  // Aplicação de filtros otimizada
  applyFilters() {
    // Implementação mais eficiente com referência de filtros centralizada
    // Cache de resultados de filtro frequentes
    const filterKey = `${filters.date || 'all'}_${filters.name || 'all'}_${filters.firstTimeOnly}`;
    const cachedResult = sessionStorage.getItem(filterKey);
    
    if (cachedResult && visitors.length === JSON.parse(sessionStorage.getItem('lastVisitorCount') || '0')) {
      filteredVisitors = JSON.parse(cachedResult);
      return;
    }
    
    // Se não houver cache, aplicar filtros normalmente
    filteredVisitors = visitors.filter(visitor => {
      // Filtro de data
      if (filters.date && visitor.date !== filters.date) {
        return false;
      }
      
      // Filtro de nome (case insensitive)
      if (filters.name && !visitor.name.toLowerCase().includes(filters.name.toLowerCase())) {
        return false;
      }
      
      // Filtro de primeira vez
      if (filters.firstTimeOnly && !visitor.isFirstTime) {
        return false;
      }
      
      return true;
    });
    
    // Ordenação otimizada - conversão feita apenas uma vez
    filteredVisitors.sort((a, b) => {
      // Cache de conversão de datas para comparação mais rápida
      let dateA = dateCache.get(a.date);
      if (!dateA) {
        dateA = DateUtils.createDateFromBR(a.date) || new Date(0);
        dateCache.set(a.date, dateA);
      }
      
      let dateB = dateCache.get(b.date);
      if (!dateB) {
        dateB = DateUtils.createDateFromBR(b.date) || new Date(0);
        dateCache.set(b.date, dateB);
      }
      
      // Ordenação primária por data (mais recente primeiro)
      const dateComparison = dateB - dateA;
      if (dateComparison !== 0) return dateComparison;
      
      // Ordenação secundária por nome
      return a.name.localeCompare(b.name);
    });
    
    // Armazenar resultado filtrado em cache
    try {
      sessionStorage.setItem(filterKey, JSON.stringify(filteredVisitors));
      sessionStorage.setItem('lastVisitorCount', visitors.length.toString());
    } catch (e) {
      // Ignora erros de armazenamento (quota excedida)
      console.warn('Não foi possível armazenar em cache:', e);
    }
    
    // Reset para primeira página quando filtros mudam
    pagination.current = 1;
  },
  
  // Renderização de tabela otimizada com manipulação DOM mais eficiente
  renderTable() {
    // Reutilização de elementos TR para melhor performance
    const fragment = document.createDocumentFragment();
    const oldRows = Array.from(DOM.visitorsTableBody.querySelectorAll('tr'));
    DOM.visitorsTableBody.innerHTML = '';
    
    // Paginação
    const startIndex = (pagination.current - 1) * pagination.itemsPerPage;
    const endIndex = startIndex + pagination.itemsPerPage;
    const visibleVisitors = filteredVisitors.slice(startIndex, endIndex);
    
    if (visibleVisitors.length === 0) {
      const row = oldRows[0] || document.createElement('tr');
      row.innerHTML = `
        <td colspan="5" class="text-center py-4">
          Nenhum visitante encontrado com os filtros atuais.
        </td>
      `;
      fragment.appendChild(row);
    } else {
      // Criação de rows otimizada com reaproveitamento
      visibleVisitors.forEach((visitor, index) => {
        const row = oldRows[index] || document.createElement('tr');
        row.innerHTML = `
          <td>${visitor.name}</td>
          <td>${visitor.phone}</td>
          <td>${visitor.date}</td>
          <td>${visitor.isFirstTime ? 
            '<span class="first-time-badge">Sim</span>' : 
            'Não'}</td>
          <td class="visitor-actions">
            <button class="remove-button" data-id="${visitor.id}">Remover</button>
          </td>
        `;
        fragment.appendChild(row);
      });
    }
    
    // Atualiza DOM uma única vez para melhor performance
    DOM.visitorsTableBody.appendChild(fragment);
    
    // Delegação de eventos usando um único handler persistente
    if (!this._boundRemoveHandler) {
      this._boundRemoveHandler = (e) => {
        if (e.target.classList.contains('remove-button')) {
          const id = parseInt(e.target.getAttribute('data-id'));
          if (confirm('Tem certeza que deseja remover este visitante?')) {
            this.removeVisitor(id);
          }
        }
      };
      
      DOM.visitorsTableBody.addEventListener('click', this._boundRemoveHandler);
    }
  },
  
  // Atualização de estatísticas com memoização
  updateStats() {
    const totalCount = filteredVisitors.length;
    DOM.totalVisitorsCount.textContent = totalCount;
    
    // Calcular contagem de primeira vez apenas se necessário
    if (this._lastTotalCount !== totalCount || this._lastFirstTimeOnly !== filters.firstTimeOnly) {
      const firstTimeCount = filters.firstTimeOnly ? 
        totalCount : filteredVisitors.filter(v => v.isFirstTime).length;
      
      DOM.firstTimeVisitorsCount.textContent = firstTimeCount;
      this._lastTotalCount = totalCount;
      this._lastFirstTimeOnly = filters.firstTimeOnly;
      this._lastFirstTimeCount = firstTimeCount;
    } else {
      DOM.firstTimeVisitorsCount.textContent = this._lastFirstTimeCount;
    }
  },
  
  // Atualização de paginação
  updatePagination() {
    const totalPages = Math.max(1, Math.ceil(filteredVisitors.length / pagination.itemsPerPage));
    
    // Evitar re-render desnecessário se a paginação não mudou
    if (this._lastTotalPages === totalPages && this._lastCurrentPage === pagination.current) {
      return;
    }
    
    DOM.pageInfo.textContent = `Página ${pagination.current} de ${totalPages}`;
    DOM.prevPageBtn.disabled = pagination.current <= 1;
    DOM.nextPageBtn.disabled = pagination.current >= totalPages;
    
    this._lastTotalPages = totalPages;
    this._lastCurrentPage = pagination.current;
  },
  
  // Navegação de páginas simplificada
  changePage(increment) {
    pagination.current += increment;
    this.renderTable();
    this.updatePagination();
  },
  
  // Exportação para PDF com carregamento dinâmico de dependência
  exportToPDF(presentationMode = false) {
    if (filteredVisitors.length === 0) {
      alert('Não há visitantes para exportar.');
      return;
    }
    
    // Carrega jsPDF se necessário e cria o PDF
    this.loadPdfLibrary().then(() => {
      const { jsPDF } = jspdf;
      const doc = new jsPDF();
      
      if (presentationMode) {
        // Versão de apresentação - apenas nome e data
        // Título
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.text('Lista de Visitantes - Igreja Evangélica Internacional Semente Santa', 15, 15, {
          maxWidth: 180
        });
        
        // Informações de filtro simplificadas
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(12);
        let yPos = 30;
        
        if (filters.date) {
          doc.text(`Data: ${filters.date}`, 15, yPos);
        } else {
          doc.text('Todos os períodos', 15, yPos);
        }
        yPos += 15;
        
        // Cabeçalho da tabela simplificado
        doc.setFont('helvetica', 'bold');
        doc.text('Nome', 15, yPos);
        doc.text('Data da Visita', 100, yPos);
        yPos += 7;
        
        // Linha divisória
        doc.setDrawColor(200, 200, 200);
        doc.line(15, yPos - 3, 195, yPos - 3);
        
        // Conteúdo da tabela simplificado
        doc.setFont('helvetica', 'normal');
        
        filteredVisitors.forEach(visitor => {
          // Nova página se necessário
          if (yPos > 270) {
            doc.addPage();
            yPos = 20;
          }
          
          doc.text(visitor.name, 15, yPos);
          doc.text(visitor.date, 100, yPos);
          
          yPos += 7;
        });
        
        // Mensagem de agradecimento
        yPos += 10;
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(14);
        doc.text('Obrigado por visitar nossa Igreja! Volte sempre!', 105, yPos, {
          align: 'center'
        });
        
        // Nome do arquivo
        let fileName = 'visitantes_apresentacao';
        if (filters.date) fileName += `_${filters.date.replace(/\//g, '-')}`;
        fileName += '.pdf';
        
        // Salva o PDF
        doc.save(fileName);
      } else {
        // Versão original completa
        // Título
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text('Lista de Visitantes - Igreja Evangélica Internacional Semente Santa', 15, 15, {
          maxWidth: 180
        });
        
        // Informações de filtro e estatísticas
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        let yPos = 30;
        
        if (filters.date) {
          doc.text(`Data do Relatório: ${filters.date}`, 15, yPos);
        } else {
          doc.text('Data do Relatório: Todos os períodos', 15, yPos);
        }
        yPos += 7;
        
        if (filters.name) {
          doc.text(`Filtro de Nome: ${filters.name}`, 15, yPos);
          yPos += 7;
        }
        
        if (filters.firstTimeOnly) {
          doc.text('Filtro: Apenas visitantes de primeira vez', 15, yPos);
          yPos += 7;
        }
        
        // Estatísticas
        doc.text(`Total de Visitantes: ${filteredVisitors.length}`, 15, yPos);
        yPos += 7;
        doc.text(`Visitantes pela primeira vez: ${filteredVisitors.filter(v => v.isFirstTime).length}`, 15, yPos);
        yPos += 15;
        
        // Cabeçalho da tabela
        doc.setFont('helvetica', 'bold');
        doc.text('Nome', 15, yPos);
        doc.text('Telefone', 85, yPos);
        doc.text('Data', 135, yPos);
        doc.text('Primeira Vez', 165, yPos);
        yPos += 7;
        
        // Linha divisória
        doc.setDrawColor(200, 200, 200);
        doc.line(15, yPos - 3, 195, yPos - 3);
        
        // Conteúdo da tabela
        doc.setFont('helvetica', 'normal');
        
        filteredVisitors.forEach(visitor => {
          // Nova página se necessário
          if (yPos > 270) {
            doc.addPage();
            yPos = 20;
          }
          
          doc.text(visitor.name.substring(0, 30), 15, yPos);
          doc.text(visitor.phone, 85, yPos);
          doc.text(visitor.date, 135, yPos);
          doc.text(visitor.isFirstTime ? 'Sim' : 'Não', 165, yPos);
          
          yPos += 7;
        });
        
        // Nome do arquivo baseado nos filtros
        let fileName = 'visitantes';
        if (filters.date) fileName += `_${filters.date.replace(/\//g, '-')}`;
        fileName += '.pdf';
        
        // Salva o PDF
        doc.save(fileName);
      }
    }).catch(error => {
      console.error('Erro ao gerar PDF:', error);
      alert('Não foi possível gerar o PDF. Verifique sua conexão.');
    });
  },
  
  // Carregamento dinâmico de biblioteca PDF
  loadPdfLibrary() {
    return new Promise((resolve, reject) => {
      if (typeof jspdf !== 'undefined') {
        resolve();
        return;
      }
      
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Falha ao carregar biblioteca PDF'));
      document.body.appendChild(script);
    });
  }
};

// Gerenciamento da interface com padrão de delegação de eventos
const UIManager = {
  setupEventListeners() {
    // Eventos para filtro de data com delegação
    DOM.dateFilterBtn.addEventListener('click', () => {
      DOM.dateFilterDropdown.style.display = 
        DOM.dateFilterDropdown.style.display === 'none' ? 'block' : 'none';
    });
    
    DOM.dateFilterInput.addEventListener('change', (e) => {
      if (e.target.value) {
        filters.date = DateUtils.formatToBR(e.target.value);
        DOM.selectedFilterDate.textContent = filters.date;
      } else {
        filters.date = null;
        DOM.selectedFilterDate.textContent = 'Todas as datas';
      }
      
      DOM.dateFilterDropdown.style.display = 'none';
      DataManager.processVisitors();
    });
    
    DOM.clearDateFilterBtn.addEventListener('click', () => {
      filters.date = null;
      DOM.selectedFilterDate.textContent = 'Todas as datas';
      DOM.dateFilterInput.value = '';
      DOM.dateFilterDropdown.style.display = 'none';
      DataManager.processVisitors();
    });
    
    // Botão de pesquisa com debounce
    let searchTimeout;
    const performSearch = () => {
      filters.name = DOM.nameFilter.value.trim();
      DataManager.processVisitors();
    };
    
    DOM.searchBtn.addEventListener('click', () => {
      clearTimeout(searchTimeout);
      performSearch();
    });
    
    // Pesquisa ao pressionar Enter com debounce
    DOM.nameFilter.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        clearTimeout(searchTimeout);
        performSearch();
      }
    });
    
    // Filtro de primeira vez
    DOM.firstTimeFilter.addEventListener('change', (e) => {
      filters.firstTimeOnly = e.target.checked;
      DataManager.processVisitors();
    });
    
    // Paginação
    DOM.prevPageBtn.addEventListener('click', () => DataManager.changePage(-1));
    DOM.nextPageBtn.addEventListener('click', () => DataManager.changePage(1));
    
    // Download - versão completa
    DOM.downloadBtn.addEventListener('click', () => DataManager.exportToPDF(false));
    
    // Download - versão de apresentação (botão adicional)
    if (DOM.downloadPresentationBtn) {
      DOM.downloadPresentationBtn.addEventListener('click', () => DataManager.exportToPDF(true));
    }
    
    // Fechar dropdowns ao clicar fora - delegação global
    document.addEventListener('click', (e) => {
      if (!DOM.dateFilterBtn.contains(e.target) && !DOM.dateFilterDropdown.contains(e.target)) {
        DOM.dateFilterDropdown.style.display = 'none';
      }
    });
  }
};

// Inicialização com tratamento de erros
async function init() {
  try {
    // Verificar e carregar Supabase se necessário
    if (!window.supabase && supabaseUrl && supabaseKey) {
      await loadSupabase();
    }
    
    // Se o botão de download de apresentação não existir, crie-o
    if (!DOM.downloadPresentationBtn) {
      const downloadBtn = document.getElementById('downloadBtn');
      if (downloadBtn && downloadBtn.parentElement) {
        const presentationBtn = document.createElement('button');
        presentationBtn.id = 'downloadPresentationBtn';
        presentationBtn.className = downloadBtn.className; // Mesmas classes CSS do botão original
        presentationBtn.innerHTML = '<i class="fas fa-file-pdf"></i><span class="icon">📥</span> Baixar lista de apresentação';
        
        // Inserir após o botão de download
        downloadBtn.parentElement.insertBefore(presentationBtn, downloadBtn.nextSibling);
        
        // Atualizar a referência no DOM
        DOM.downloadPresentationBtn = presentationBtn;
      }
    }
    
    // Reposicionar o botão de pesquisa para ficar ao lado da caixa de pesquisa
    const searchBtn = DOM.searchBtn;
    const nameFilter = DOM.nameFilter;
    
    if (searchBtn && nameFilter && nameFilter.parentElement) {
      // Criar um div container para envolver os elementos
      const searchContainer = document.createElement('div');
      searchContainer.className = 'search-container';
      searchContainer.style.display = 'flex';
      searchContainer.style.alignItems = 'center';
      
      // Ajustar estilos do campo de pesquisa
      nameFilter.style.marginRight = '5px';
      nameFilter.style.flexGrow = '1';
      
      // Mover o botão de pesquisa para depois do campo de texto
      nameFilter.parentElement.insertBefore(searchContainer, nameFilter);
      searchContainer.appendChild(nameFilter);
      searchContainer.appendChild(searchBtn);
    }
    
    UIManager.setupEventListeners();
    await DataManager.load();
  } catch (error) {
    console.error('Erro ao inicializar aplicação:', error);
    alert('Ocorreu um erro ao inicializar. Por favor, recarregue a página.');
  }
}

// Função para carregar Supabase dinamicamente
function loadSupabase() {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    script.onload = () => {
      if (window.supabase) {
        // Reinicializar client
        const supabaseInstance = window.supabase.createClient(supabaseUrl, supabaseKey);
        isSupabaseAvailable = true;
        resolve(supabaseInstance);
      } else {
        reject(new Error('Não foi possível carregar a biblioteca Supabase'));
      }
    };
    script.onerror = () => reject(new Error('Falha ao carregar Supabase'));
    document.body.appendChild(script);
  });
}

// Iniciar aplicação
init();
