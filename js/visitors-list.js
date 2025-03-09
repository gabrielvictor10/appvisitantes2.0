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
const supabase = window.supabase ? window.supabase.createClient(supabaseUrl, supabaseKey) : null;
const isSupabaseAvailable = !!window.supabase;

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
      if (!date1 || !date2) return false;
      return date1 === date2;
    },
    
    // Cria objeto Date a partir de string brasileira
    createDateFromBR(brDate) {
      if (!brDate) return null;
      
      const [day, month, year] = brDate.split('/');
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }
  };
  
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
          // Inicializa escuta em tempo real
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
      const { data, error } = await supabase.from('visitors').select('*');
      
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
        
        // Atualiza a UI com novos dados
        this.processVisitors();
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
  
  // Configuração de escuta em tempo real otimizada
  initializeRealtime() {
    if (!isSupabaseAvailable || !navigator.onLine) return;
    
    const channel = supabase
      .channel('visitors-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'visitors' }, 
        payload => {
          // Sincroniza apenas quando há mudanças reais
          this.syncWithSupabase();
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
        
        if (error) throw error;
      } catch (error) {
        console.error("Erro ao remover visitante do Supabase:", error);
        // Poderíamos implementar uma fila de operações pendentes para sincronizar depois
      }
    }
  },
  
  // Aplicação de filtros otimizada
  applyFilters() {
    // Implementação mais eficiente com referência de filtros centralizada
    filteredVisitors = visitors.filter(visitor => {
      // Filtro de data
      if (filters.date && !DateUtils.areDatesEqual(visitor.date, filters.date)) {
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
      const dateA = DateUtils.createDateFromBR(a.date) || new Date(0);
      const dateB = DateUtils.createDateFromBR(b.date) || new Date(0);
      
      // Ordenação primária por data (mais recente primeiro)
      const dateComparison = dateB - dateA;
      if (dateComparison !== 0) return dateComparison;
      
      // Ordenação secundária por nome
      return a.name.localeCompare(b.name);
    });
    
    // Reset para primeira página quando filtros mudam
    pagination.current = 1;
  },
  
  // Renderização de tabela otimizada com manipulação DOM mais eficiente
  renderTable() {
    const fragment = document.createDocumentFragment();
    DOM.visitorsTableBody.innerHTML = '';
    
    // Paginação
    const startIndex = (pagination.current - 1) * pagination.itemsPerPage;
    const endIndex = startIndex + pagination.itemsPerPage;
    const visibleVisitors = filteredVisitors.slice(startIndex, endIndex);
    
    if (visibleVisitors.length === 0) {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td colspan="5" class="text-center py-4">
          Nenhum visitante encontrado com os filtros atuais.
        </td>
      `;
      fragment.appendChild(row);
    } else {
      // Criação de rows otimizada
      visibleVisitors.forEach(visitor => {
        const row = document.createElement('tr');
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
    
    // Delegação de eventos para melhor performance
    DOM.visitorsTableBody.addEventListener('click', (e) => {
      if (e.target.classList.contains('remove-button')) {
        const id = parseInt(e.target.getAttribute('data-id'));
        if (confirm('Tem certeza que deseja remover este visitante?')) {
          this.removeVisitor(id);
        }
      }
    }, { once: true }); // Reinstala o handler após cada renderização
  },
  
  // Atualização de estatísticas simplificada
  updateStats() {
    DOM.totalVisitorsCount.textContent = filteredVisitors.length;
    DOM.firstTimeVisitorsCount.textContent = filteredVisitors.filter(v => v.isFirstTime).length;
  },
  
  // Atualização de paginação simplificada
  updatePagination() {
    const totalPages = Math.max(1, Math.ceil(filteredVisitors.length / pagination.itemsPerPage));
    
    DOM.pageInfo.textContent = `Página ${pagination.current} de ${totalPages}`;
    DOM.prevPageBtn.disabled = pagination.current <= 1;
    DOM.nextPageBtn.disabled = pagination.current >= totalPages;
  },
  
  // Navegação de páginas simplificada
  changePage(increment) {
    pagination.current += increment;
    this.renderTable();
    this.updatePagination();
  },
  
  // Exportação para PDF com carregamento dinâmico de dependência
  exportToPDF() {
    if (filteredVisitors.length === 0) {
      alert('Não há visitantes para exportar.');
      return;
    }
    
    // Carrega jsPDF se necessário e cria o PDF
    this.loadPdfLibrary().then(() => {
      const { jsPDF } = jspdf;
      const doc = new jsPDF();
      
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
        DOM.selectedFilterDate.textContent = 'Todos';
      }
      
      DOM.dateFilterDropdown.style.display = 'none';
      DataManager.processVisitors();
    });
    
    DOM.clearDateFilterBtn.addEventListener('click', () => {
      filters.date = null;
      DOM.selectedFilterDate.textContent = 'Todos';
      DOM.dateFilterInput.value = '';
      DOM.dateFilterDropdown.style.display = 'none';
      DataManager.processVisitors();
    });
    
    // Filtro de nome com debounce para melhor performance
    let searchTimeout;
    DOM.nameFilter.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        filters.name = e.target.value.trim();
        DataManager.processVisitors();
      }, 300);
    });
    
    // Botão de pesquisa (ainda útil para mobile)
    DOM.searchBtn.addEventListener('click', () => {
      filters.name = DOM.nameFilter.value.trim();
      DataManager.processVisitors();
    });
    
    // Pesquisa ao pressionar Enter
    DOM.nameFilter.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        filters.name = e.target.value.trim();
        DataManager.processVisitors();
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
    
    // Download
    DOM.downloadBtn.addEventListener('click', () => DataManager.exportToPDF());
    
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
    UIManager.setupEventListeners();
    await DataManager.load();
  } catch (error) {
    console.error('Erro ao inicializar aplicação:', error);
    alert('Ocorreu um erro ao inicializar. Por favor, recarregue a página.');
  }
}

// Iniciar aplicação
init();
