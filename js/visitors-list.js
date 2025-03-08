// Estado da aplicação consolidado
const state = {
    visitors: [],
    filtered: [],
    filters: { date: null, name: '', firstTimeOnly: false },
    pagination: { current: 1, itemsPerPage: 10 }
  };
  
  // Configuração Supabase simplificada
  const SUPABASE = {
    URL: 'https://qdttsbnsijllhkgrpdmc.supabase.co',
    KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkdHRzYm5zaWpsbGhrZ3JwZG1jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDExOTQzNDgsImV4cCI6MjA1Njc3MDM0OH0.CuZdeCC2wK73CrTt2cMIKxj20hAtgz_8qAhFt1EKkCw',
    client: null,
    
    // Inicializa com verificação de conexão
    init() {
      if (!window.supabase) return null;
      try {
        this.client = window.supabase.createClient(this.URL, this.KEY);
        // Testa a conexão imediatamente
        this.client.from('visitors').select('count', { count: 'exact', head: true })
          .then(({ error }) => {
            if (error) throw error;
            console.log('Conexão com Supabase estabelecida');
          })
          .catch(e => console.error('Falha na conexão com Supabase:', e));
        return this.client;
      } catch (e) {
        console.error('Erro ao inicializar Supabase:', e);
        return null;
      }
    },
    
    // Verifica disponibilidade com ping de conexão
    isAvailable() {
      return this.client && navigator.onLine;
    }
  };
  
  // Cache de elementos DOM em objeto compacto
  const $ = {
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
    pageInfo: document.getElementById('pageInfo'),
    connectionStatus: document.getElementById('connectionStatus') || document.createElement('div')
  };
  
  // Utilitários de data simplificados
  const DateUtils = {
    formatToBR: date => {
      if (!date) return '';
      if (date.includes('/')) return date;
      const [year, month, day] = date.split('-');
      return `${day}/${month}/${year}`;
    },
    
    formatToISO: date => {
      if (!date) return '';
      const [day, month, year] = date.split('/');
      return `${year}-${month}-${day}`;
    },
    
    areDatesEqual: (d1, d2) => d1 === d2,
    
    createDateFromBR: brDate => {
      if (!brDate) return null;
      const [day, month, year] = brDate.split('/');
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }
  };
  
  // Gerenciamento de dados otimizado
  const DataManager = {
    // Cache para evitar transferência desnecessária
    lastSyncTimestamp: 0,
    syncCooldown: 10000, // 10 segundos entre tentativas
    pendingOperations: [],
    
    // Carrega dados com retry automático e melhor gestão de conectividade
    async load() {
      try {
        // Carrega do localStorage para exibição imediata
        const stored = localStorage.getItem('churchVisitors');
        state.visitors = stored ? JSON.parse(stored) : [];
        this.processVisitors();
        
        // Inicializa Supabase com monitoramento de conectividade
        SUPABASE.init();
        
        // Adiciona indicador de conectividade se existir
        if ($.connectionStatus) {
          this.updateConnectionStatus();
          
          // Monitor de conectividade para sincronização automática
          window.addEventListener('online', () => {
            this.updateConnectionStatus(true);
            this.syncWithBackend(true);
          });
          
          window.addEventListener('offline', () => {
            this.updateConnectionStatus(false);
          });
        }
        
        // Carrega do backend com retry
        this.syncWithBackend(true);
        
        // Configura sincronização periódica a cada 60 segundos
        setInterval(() => this.syncWithBackend(), 60000);
      } catch (error) {
        console.error("Erro ao carregar visitantes:", error);
      }
    },
    
    // Exibe status de conexão para o usuário
    updateConnectionStatus(isOnline = navigator.onLine) {
      if (!$.connectionStatus) return;
      
      $.connectionStatus.textContent = isOnline ? 
        "Conectado ao servidor" : 
        "Modo offline (tentando reconectar...)";
        
      $.connectionStatus.style.color = isOnline ? "#2ecc71" : "#e74c3c";
    },
    
    // Sincronização robusta com o backend
    async syncWithBackend(force = false) {
      // Evita múltiplas tentativas em curto período
      const now = Date.now();
      if (!force && now - this.lastSyncTimestamp < this.syncCooldown) {
        return false;
      }
      
      if (!SUPABASE.isAvailable()) {
        this.updateConnectionStatus(false);
        return false;
      }
      
      this.lastSyncTimestamp = now;
      this.updateConnectionStatus(true);
      
      try {
        // Processa operações pendentes primeiro
        await this.processPendingOperations();
        
        // Busca dados do servidor
        const { data, error } = await SUPABASE.client
          .from('visitors')
          .select('*')
          .order('id', { ascending: false });
        
        if (error) throw error;
        
        if (data && data.length > 0) {
          // Mescla dados locais e remotos de forma eficiente
          const mergedVisitors = this.mergeVisitors(state.visitors, data);
          state.visitors = mergedVisitors;
          localStorage.setItem('churchVisitors', JSON.stringify(mergedVisitors));
          this.processVisitors();
          return true;
        }
      } catch (error) {
        console.error("Erro na sincronização:", error);
        this.updateConnectionStatus(false);
        
        // Agenda nova tentativa em 30 segundos em caso de falha
        setTimeout(() => this.syncWithBackend(true), 30000);
        return false;
      }
    },
    
    // Mescla visistantes locais e remotos eficientemente
    mergeVisitors(local, remote) {
      const merged = new Map();
      [...local, ...remote].forEach(v => merged.set(v.id.toString(), {
        id: v.id,
        name: v.name,
        phone: v.phone,
        isFirstTime: v.isFirstTime,
        date: v.date
      }));
      return Array.from(merged.values());
    },
    
    // Processa operações pendentes (adições/remoções offline)
    async processPendingOperations() {
      if (!SUPABASE.isAvailable() || this.pendingOperations.length === 0) return;
      
      const operations = [...this.pendingOperations];
      this.pendingOperations = [];
      
      for (const op of operations) {
        try {
          if (op.type === 'add') {
            await SUPABASE.client.from('visitors').insert([op.data]);
          } else if (op.type === 'remove') {
            await SUPABASE.client.from('visitors').delete().eq('id', op.id);
          }
        } catch (error) {
          console.error(`Falha na operação ${op.type}:`, error);
          this.pendingOperations.push(op); // Tenta novamente na próxima sincronização
        }
      }
    },
    
    // Remoção com transação otimizada
    async removeVisitor(id) {
      state.visitors = state.visitors.filter(v => v.id !== id);
      localStorage.setItem('churchVisitors', JSON.stringify(state.visitors));
      this.processVisitors();
      
      // Adiciona à fila de operações pendentes
      if (SUPABASE.isAvailable()) {
        try {
          await SUPABASE.client.from('visitors').delete().eq('id', id);
        } catch (error) {
          console.warn("Erro ao remover visitante remotamente:", error);
          this.pendingOperations.push({ type: 'remove', id });
        }
      } else {
        this.pendingOperations.push({ type: 'remove', id });
      }
    },
    
    // Aplicação de filtros otimizada
    applyFilters() {
      state.filtered = state.visitors.filter(v => 
        (!state.filters.date || v.date === state.filters.date) &&
        (!state.filters.name || v.name.toLowerCase().includes(state.filters.name.toLowerCase())) &&
        (!state.filters.firstTimeOnly || v.isFirstTime)
      );
      
      // Ordenação otimizada
      state.filtered.sort((a, b) => {
        const dateA = DateUtils.createDateFromBR(a.date) || new Date(0);
        const dateB = DateUtils.createDateFromBR(b.date) || new Date(0);
        const dateComp = dateB - dateA;
        return dateComp !== 0 ? dateComp : a.name.localeCompare(b.name);
      });
      
      state.pagination.current = 1;
    },
    
    // Processamento central de visitantes
    processVisitors() {
      this.applyFilters();
      this.renderTable();
      this.updateStats();
      this.updatePagination();
    },
    
    // Renderização de tabela otimizada
    renderTable() {
      const start = (state.pagination.current - 1) * state.pagination.itemsPerPage;
      const end = start + state.pagination.itemsPerPage;
      const visible = state.filtered.slice(start, end);
      
      // Usa fragment para manipulação DOM mais rápida
      const fragment = document.createDocumentFragment();
      
      if (visible.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="5" class="text-center py-4">Nenhum visitante encontrado.</td>';
        fragment.appendChild(row);
      } else {
        visible.forEach(v => {
          const row = document.createElement('tr');
          row.innerHTML = `
            <td>${v.name}</td>
            <td>${v.phone}</td>
            <td>${v.date}</td>
            <td>${v.isFirstTime ? '<span class="first-time-badge">Sim</span>' : 'Não'}</td>
            <td><button class="remove-button" data-id="${v.id}">Remover</button></td>
          `;
          fragment.appendChild(row);
        });
      }
      
      $.visitorsTableBody.innerHTML = '';
      $.visitorsTableBody.appendChild(fragment);
    },
    
    // Atualização de estatísticas
    updateStats() {
      $.totalVisitorsCount.textContent = state.filtered.length;
      $.firstTimeVisitorsCount.textContent = state.filtered.filter(v => v.isFirstTime).length;
    },
    
    // Atualização de paginação 
    updatePagination() {
      const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.pagination.itemsPerPage));
      $.pageInfo.textContent = `Página ${state.pagination.current} de ${totalPages}`;
      $.prevPageBtn.disabled = state.pagination.current <= 1;
      $.nextPageBtn.disabled = state.pagination.current >= totalPages;
    },
    
    // Navegação de páginas
    changePage(increment) {
      state.pagination.current += increment;
      this.renderTable();
      this.updatePagination();
    },
    
    // Exportação para PDF otimizada
    async exportToPDF() {
      if (state.filtered.length === 0) {
        return alert('Não há visitantes para exportar.');
      }
      
      try {
        // Carrega biblioteca sob demanda
        if (typeof jspdf === 'undefined') {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document.body.appendChild(script);
          });
        }
        
        const { jsPDF } = jspdf;
        const doc = new jsPDF();
        
        // Configuração do documento
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.text('Lista de Visitantes', 15, 15);
        
        // Resumo do filtro
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        const filterText = [
          state.filters.date ? `Data: ${state.filters.date}` : 'Todas as datas',
          state.filters.name ? `Filtro: ${state.filters.name}` : '',
          state.filters.firstTimeOnly ? 'Somente primeira visita' : ''
        ].filter(Boolean).join(' | ');
        doc.text(filterText, 15, 23);
        
        // Estatísticas
        doc.text(`Total: ${state.filtered.length} visitantes (${state.filtered.filter(v => v.isFirstTime).length} primeira vez)`, 15, 30);
        
        // Cabeçalho da tabela
        doc.setFont('helvetica', 'bold');
        const y = 40;
        doc.text('Nome', 15, y);
        doc.text('Telefone', 85, y);
        doc.text('Data', 135, y);
        doc.text('1ª Vez', 165, y);
        doc.line(15, y + 2, 195, y + 2);
        
        // Conteúdo
        doc.setFont('helvetica', 'normal');
        let rowY = y + 10;
        
        state.filtered.forEach(v => {
          if (rowY > 270) {
            doc.addPage();
            rowY = 20;
          }
          
          doc.text(v.name.substring(0, 30), 15, rowY);
          doc.text(v.phone || '—', 85, rowY);
          doc.text(v.date, 135, rowY);
          doc.text(v.isFirstTime ? 'Sim' : 'Não', 165, rowY);
          rowY += 7;
        });
        
        // Salva o PDF
        doc.save(`visitantes${state.filters.date ? '_' + state.filters.date.replace(/\//g, '-') : ''}.pdf`);
      } catch (error) {
        console.error('Erro ao gerar PDF:', error);
        alert('Não foi possível gerar o PDF. Verifique sua conexão.');
      }
    }
  };
  
  // Interface simplificada
  const UI = {
    setupEvents() {
      // Gestão do dropdown de data
      $.dateFilterBtn.addEventListener('click', () => {
        $.dateFilterDropdown.style.display = $.dateFilterDropdown.style.display === 'none' ? 'block' : 'none';
      });
      
      // Aplicação do filtro de data
      $.dateFilterInput.addEventListener('change', e => {
        state.filters.date = e.target.value ? DateUtils.formatToBR(e.target.value) : null;
        $.selectedFilterDate.textContent = state.filters.date || 'Todos';
        $.dateFilterDropdown.style.display = 'none';
        DataManager.processVisitors();
      });
      
      // Limpeza do filtro de data
      $.clearDateFilterBtn.addEventListener('click', () => {
        state.filters.date = null;
        $.dateFilterInput.value = '';
        $.selectedFilterDate.textContent = 'Todos';
        $.dateFilterDropdown.style.display = 'none';
        DataManager.processVisitors();
      });
      
      // Filtro de nome com debounce
      let searchTimeout;
      $.nameFilter.addEventListener('input', e => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          state.filters.name = e.target.value.trim();
          DataManager.processVisitors();
        }, 300);
      });
      
      // Filtros adicionais
      $.searchBtn.addEventListener('click', () => {
        state.filters.name = $.nameFilter.value.trim();
        DataManager.processVisitors();
      });
      
      $.nameFilter.addEventListener('keypress', e => {
        if (e.key === 'Enter') {
          state.filters.name = e.target.value.trim();
          DataManager.processVisitors();
        }
      });
      
      $.firstTimeFilter.addEventListener('change', e => {
        state.filters.firstTimeOnly = e.target.checked;
        DataManager.processVisitors();
      });
      
      // Paginação
      $.prevPageBtn.addEventListener('click', () => DataManager.changePage(-1));
      $.nextPageBtn.addEventListener('click', () => DataManager.changePage(1));
      
      // Download
      $.downloadBtn.addEventListener('click', () => DataManager.exportToPDF());
      
      // Delegação de eventos para remover visitantes
      $.visitorsTableBody.addEventListener('click', e => {
        if (e.target.classList.contains('remove-button')) {
          const id = parseInt(e.target.dataset.id);
          if (confirm('Tem certeza que deseja remover este visitante?')) {
            DataManager.removeVisitor(id);
          }
        }
      });
      
      // Fecha dropdown ao clicar fora
      document.addEventListener('click', e => {
        if (!$.dateFilterBtn.contains(e.target) && !$.dateFilterDropdown.contains(e.target)) {
          $.dateFilterDropdown.style.display = 'none';
        }
      });
      
      // Força sincronização manual ao pressionar F5
      document.addEventListener('keydown', e => {
        if (e.key === 'F5') {
          e.preventDefault();
          DataManager.syncWithBackend(true);
        }
      });
    }
  };
  
  // Inicialização com retry automático
  (async function init() {
    try {
      UI.setupEvents();
      await DataManager.load();
    } catch (error) {
      console.error('Erro ao inicializar:', error);
      setTimeout(init, 3000); // Tenta novamente após 3 segundos
    }
  })();
  