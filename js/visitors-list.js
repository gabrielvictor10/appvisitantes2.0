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
    isConnected: false,
    
    init() {
      if (!window.supabase) return null;
      try {
        this.client = window.supabase.createClient(this.URL, this.KEY);
        this.testConnection();
        return this.client;
      } catch (e) {
        console.error('Erro ao inicializar Supabase:', e);
        return null;
      }
    },
    
    async testConnection() {
      try {
        const { error } = await this.client.from('visitors').select('count', { count: 'exact', head: true });
        this.isConnected = !error;
        return !error;
      } catch (e) {
        console.error('Falha na conexão com Supabase:', e);
        this.isConnected = false;
        return false;
      }
    },
    
    isAvailable() {
      return this.client && navigator.onLine && this.isConnected;
    }
  };
  
  // Cache de elementos DOM
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
      if (typeof date === 'string' && date.includes('/')) return date;
      
      try {
        if (date.includes('-')) {
          const [year, month, day] = date.split('-');
          return `${day}/${month}/${year}`;
        } else {
          return new Date(date).toLocaleDateString('pt-BR');
        }
      } catch (e) {
        return '';
      }
    },
    
    formatToISO: date => {
      if (!date) return '';
      if (typeof date === 'string' && date.includes('-')) return date;
      
      try {
        if (date.includes('/')) {
          const [day, month, year] = date.split('/');
          return `${year}-${month}-${day}`;
        } else {
          return new Date(date).toISOString().split('T')[0];
        }
      } catch (e) {
        return '';
      }
    },
    
    createDateFromBR: brDate => {
      if (!brDate) return null;
      try {
        const [day, month, year] = brDate.split('/');
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      } catch (e) {
        return null;
      }
    }
  };
  
  // Gerenciamento de operações pendentes simplificado
  const PendingQueue = {
    STORAGE_KEY: 'pendingOperationsQueue',
    
    get() {
      try {
        return JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || [];
      } catch (e) {
        return [];
      }
    },
    
    add(operation) {
      try {
        const queue = this.get();
        queue.push({
          ...operation,
          timestamp: Date.now(),
          retries: 0
        });
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(queue));
        return true;
      } catch (e) {
        return false;
      }
    },
    
    remove(idsToRemove) {
      try {
        if (!Array.isArray(idsToRemove) || idsToRemove.length === 0) return false;
        
        const queue = this.get();
        const newQueue = queue.filter(op => !idsToRemove.includes(op.id));
        
        if (queue.length !== newQueue.length) {
          localStorage.setItem(this.STORAGE_KEY, JSON.stringify(newQueue));
          return true;
        }
        return false;
      } catch (e) {
        return false;
      }
    },
    
    updateRetries(id) {
      try {
        const queue = this.get();
        const index = queue.findIndex(op => op.id === id);
        
        if (index !== -1) {
          queue[index].retries += 1;
          queue[index].lastAttempt = Date.now();
          localStorage.setItem(this.STORAGE_KEY, JSON.stringify(queue));
          return queue[index].retries;
        }
        return 0;
      } catch (e) {
        return 0;
      }
    },
    
    clear() {
      try {
        localStorage.removeItem(this.STORAGE_KEY);
        return true;
      } catch (e) {
        return false;
      }
    }
  };
  
  // Gerenciamento de dados otimizado
  const DataManager = {
    isLoading: false,
    
    async load() {
      if (this.isLoading) return;
      this.isLoading = true;
      
      try {
        // Carrega do localStorage para exibição imediata
        const stored = localStorage.getItem('churchVisitors');
        state.visitors = stored ? JSON.parse(stored) : [];
        this.processVisitors();
        
        // Inicializa Supabase
        SUPABASE.init();
        this.updateConnectionStatus();
        
        // Monitora conectividade
        window.addEventListener('online', () => {
          this.updateConnectionStatus();
          this.syncWithBackend();
        });
        
        window.addEventListener('offline', () => {
          this.updateConnectionStatus();
        });
        
        // Sincroniza com backend
        await this.syncWithBackend();
        
        // Configura sincronização periódica
        setInterval(() => this.syncWithBackend(), 60000);
      } catch (error) {
        console.error("Erro ao carregar visitantes:", error);
      } finally {
        this.isLoading = false;
      }
    },
    
    updateConnectionStatus() {
      if (!$.connectionStatus) return;
      
      const isConnected = navigator.onLine && SUPABASE.isConnected;
      const pendingOperations = PendingQueue.get().length;
      
      $.connectionStatus.textContent = isConnected ? 
        (pendingOperations > 0 ? `Conectado (${pendingOperations} pendentes)` : "Conectado") : 
        "Offline (tentando reconectar...)";
        
      $.connectionStatus.style.color = isConnected ? "#2ecc71" : "#e74c3c";
    },
    
    async syncWithBackend() {
      if (!SUPABASE.isAvailable()) {
        this.updateConnectionStatus();
        SUPABASE.testConnection();
        return false;
      }
      
      this.updateConnectionStatus();
      
      try {
        // Processa operações pendentes
        await this.processPendingOperations();
        
        // Busca dados do servidor
        const { data, error } = await SUPABASE.client
          .from('visitors')
          .select('*')
          .order('id', { ascending: false });
        
        if (error) throw error;
        
        if (data && data.length > 0) {
          // Mescla dados locais e remotos
          state.visitors = this.mergeVisitors(state.visitors, data);
          
          try {
            localStorage.setItem('churchVisitors', JSON.stringify(state.visitors));
          } catch (e) {
            // Fallback: limita dados se necessário
            if (e.name === 'QuotaExceededError') {
              localStorage.setItem('churchVisitors', JSON.stringify(state.visitors.slice(0, 200)));
            }
          }
          
          this.processVisitors();
          return true;
        }
      } catch (error) {
        console.error("Erro na sincronização:", error);
        this.updateConnectionStatus();
        SUPABASE.isConnected = false;
        return false;
      }
    },
    
    mergeVisitors(local, remote) {
      const merged = new Map();
      
      // Função de sanitização
      const sanitizeVisitor = v => {
        if (!v || typeof v !== 'object') return null;
        
        const id = typeof v.id === 'number' ? v.id : parseInt(v.id);
        if (isNaN(id)) return null;
        
        return {
          id,
          name: String(v.name || '').trim(),
          phone: String(v.phone || '').trim(),
          isFirstTime: Boolean(v.isFirstTime),
          date: v.date || DateUtils.formatToBR(new Date())
        };
      };
      
      // Processa visitantes locais e remotos
      [...local, ...remote].forEach(v => {
        const sanitized = sanitizeVisitor(v);
        if (sanitized) merged.set(sanitized.id.toString(), sanitized);
      });
      
      return Array.from(merged.values());
    },
    
    async processPendingOperations() {
      if (!SUPABASE.isAvailable()) return;
      
      const pendingOps = PendingQueue.get();
      if (pendingOps.length === 0) return;
      
      const successful = [];
      
      // Processa remoções
      const removeOps = pendingOps.filter(op => op.type === 'remove');
      for (const op of removeOps) {
        try {
          const { error } = await SUPABASE.client
            .from('visitors')
            .delete()
            .eq('id', op.id);
          
          if (!error || error.code === 'PGRST116') {
            successful.push(op.id);
          } else {
            const retries = PendingQueue.updateRetries(op.id);
            if (retries >= 5) successful.push(op.id);
          }
        } catch (e) {
          console.error(`Erro ao processar remoção do ID ${op.id}:`, e);
        }
      }
      
      // Processa adições
      const addOps = pendingOps.filter(op => op.type === 'add');
      for (const op of addOps) {
        try {
          const { error } = await SUPABASE.client
            .from('visitors')
            .upsert([op.data], { onConflict: 'id' });
          
          if (!error) {
            successful.push(op.id);
          } else {
            const retries = PendingQueue.updateRetries(op.id);
            if (retries >= 5) successful.push(op.id);
          }
        } catch (e) {
          console.error(`Erro ao processar inserção do ID ${op.data.id}:`, e);
        }
      }
      
      // Remove operações bem-sucedidas
      if (successful.length > 0) {
        PendingQueue.remove(successful);
        this.updateConnectionStatus();
      }
    },
    
    async removeVisitor(id) {
      if (!id || isNaN(parseInt(id))) return false;
      
      const numericId = parseInt(id);
      
      // Remove localmente
      state.visitors = state.visitors.filter(v => v.id !== numericId);
      localStorage.setItem('churchVisitors', JSON.stringify(state.visitors));
      this.processVisitors();
      
      // Adiciona à fila de operações pendentes
      PendingQueue.add({ 
        type: 'remove', 
        id: numericId 
      });
      this.updateConnectionStatus();
      
      // Tenta remover remotamente
      if (SUPABASE.isAvailable()) {
        try {
          const { error } = await SUPABASE.client
            .from('visitors')
            .delete()
            .eq('id', numericId);
          
          if (!error) {
            PendingQueue.remove([numericId]);
            this.updateConnectionStatus();
          }
        } catch (error) {
          console.error(`Erro ao remover visitante ${numericId}:`, error);
        }
      }
      
      return true;
    },
    
    applyFilters() {
      state.filtered = state.visitors.filter(v => 
        (!state.filters.date || v.date === state.filters.date) &&
        (!state.filters.name || v.name.toLowerCase().includes(state.filters.name.toLowerCase())) &&
        (!state.filters.firstTimeOnly || v.isFirstTime)
      );
      
      // Ordenação por data e nome
      state.filtered.sort((a, b) => {
        try {
          const dateA = DateUtils.createDateFromBR(a.date) || new Date(0);
          const dateB = DateUtils.createDateFromBR(b.date) || new Date(0);
          const dateComp = dateB - dateA;
          return dateComp !== 0 ? dateComp : (a.name || '').localeCompare(b.name || '');
        } catch (e) {
          return 0;
        }
      });
      
      state.pagination.current = 1;
    },
    
    processVisitors() {
      this.applyFilters();
      this.renderTable();
      this.updateStats();
      this.updatePagination();
    },
    
    renderTable() {
      const start = (state.pagination.current - 1) * state.pagination.itemsPerPage;
      const end = start + state.pagination.itemsPerPage;
      const visible = state.filtered.slice(start, end);
      
      const fragment = document.createDocumentFragment();
      
      if (visible.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="5" class="text-center py-4">Nenhum visitante encontrado.</td>';
        fragment.appendChild(row);
      } else {
        visible.forEach(v => {
          const row = document.createElement('tr');
          row.innerHTML = `
            <td>${v.name || ''}</td>
            <td>${v.phone || ''}</td>
            <td>${v.date || ''}</td>
            <td>${v.isFirstTime ? '<span class="first-time-badge">Sim</span>' : 'Não'}</td>
            <td><button class="remove-button" data-id="${v.id}">Remover</button></td>
          `;
          fragment.appendChild(row);
        });
      }
      
      $.visitorsTableBody.innerHTML = '';
      $.visitorsTableBody.appendChild(fragment);
    },
    
    updateStats() {
      $.totalVisitorsCount.textContent = state.filtered.length;
      $.firstTimeVisitorsCount.textContent = state.filtered.filter(v => v.isFirstTime).length;
    },
    
    updatePagination() {
      const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.pagination.itemsPerPage));
      $.pageInfo.textContent = `Página ${state.pagination.current} de ${totalPages}`;
      $.prevPageBtn.disabled = state.pagination.current <= 1;
      $.nextPageBtn.disabled = state.pagination.current >= totalPages;
    },
    
    changePage(increment) {
      state.pagination.current += increment;
      this.renderTable();
      this.updatePagination();
    },
    
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
        
        // Cabeçalho
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
        
        // Tabela
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
          
          doc.text((v.name || '').substring(0, 30), 15, rowY);
          doc.text(v.phone || '—', 85, rowY);
          doc.text(v.date || '—', 135, rowY);
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
      // Filtro de data
      $.dateFilterBtn.addEventListener('click', () => {
        $.dateFilterDropdown.style.display = $.dateFilterDropdown.style.display === 'none' ? 'block' : 'none';
      });
      
      $.dateFilterInput.addEventListener('change', e => {
        state.filters.date = e.target.value ? DateUtils.formatToBR(e.target.value) : null;
        $.selectedFilterDate.textContent = state.filters.date || 'Todos';
        $.dateFilterDropdown.style.display = 'none';
        DataManager.processVisitors();
      });
      
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
      
      // Fechar dropdown ao clicar fora
      document.addEventListener('click', e => {
        if (!$.dateFilterBtn.contains(e.target) && !$.dateFilterDropdown.contains(e.target)) {
          $.dateFilterDropdown.style.display = 'none';
        }
      });
    },
    
    // Inicialização da UI
    init() {
      this.setupEvents();
      DataManager.load();
    }
  };
  
  // Inicializa a aplicação quando o DOM estiver pronto
  document.addEventListener('DOMContentLoaded', () => UI.init());
  