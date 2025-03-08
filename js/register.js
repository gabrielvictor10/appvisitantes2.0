// Estado da aplicação e elementos DOM
const AppState = { visitors: [], selectedDate: new Date() };
const DOM = {
  selectedDateText: document.getElementById('selectedDateText'),
  selectedDateInput: document.getElementById('selectedDateInput'),
  datePickerDropdown: document.getElementById('datePickerDropdown'),
  dateSelectorBtn: document.getElementById('dateSelectorBtn'),
  nameInput: document.getElementById('nameInput'),
  phoneInput: document.getElementById('phoneInput'),
  firstTimeCheckbox: document.getElementById('firstTimeCheckbox'),
  addVisitorBtn: document.getElementById('addVisitorBtn'),
  todayVisitorsCount: document.getElementById('todayVisitorsCount'),
  todayFirstTimeCount: document.getElementById('todayFirstTimeCount')
};

// Utilitários de data simplificados
const DateUtils = {
  formatToBR(date) {
    if (!date) return '';
    if (typeof date === 'string' && date.includes('/')) return date;
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  },
  formatToISO(date) {
    if (!date) return '';
    if (typeof date === 'string' && date.includes('-')) return date;
    const d = date instanceof Date ? date : new Date(date);
    return d.toISOString().split('T')[0];
  },
  adjustDate(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  },
  fromISOString(dateString) {
    if (!dateString) return new Date();
    const [year, month, day] = dateString.split('-').map(num => parseInt(num, 10));
    return new Date(year, month - 1, day);
  }
};

// Gerenciamento Supabase com melhor tratamento de falhas
let supabaseClient = null;

// Gerenciamento de dados otimizado
const DataManager = {
  // Inicializa Supabase com retry automático
  initSupabase() {
    if (!window.supabase) return null;
    try {
      const SUPABASE_URL = 'https://qdttsbnsijllhkgrpdmc.supabase.co';
      const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkdHRzYm5zaWpsbGhrZ3JwZG1jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDExOTQzNDgsImV4cCI6MjA1Njc3MDM0OH0.CuZdeCC2wK73CrTt2cMIKxj20hAtgz_8qAhFt1EKkCw';
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      return supabaseClient;
    } catch (error) {
      console.error('Erro ao inicializar Supabase:', error);
      return null;
    }
  },

  // Carrega dados com implementação assíncrona e fallback
  async load() {
    try {
      // Carrega do localStorage primeiro para UI imediata
      const storedVisitors = localStorage.getItem('churchVisitors');
      AppState.visitors = storedVisitors ? JSON.parse(storedVisitors) : [];
      this.updateStats();
      
      // Tenta inicializar Supabase em background
      if (!supabaseClient) {
        supabaseClient = this.initSupabase();
      }
      
      // Se Supabase disponível, sincroniza
      if (supabaseClient && navigator.onLine) {
        this.syncWithSupabase();
      }
      
      // Configura ouvinte para reconexão
      window.addEventListener('online', () => this.syncWithSupabase());
      
      return true;
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      return false;
    }
  },
  
  // Sincronização com Supabase com retry e queue
  async syncWithSupabase() {
    if (!supabaseClient || !navigator.onLine) return;
    
    try {
      const { data, error } = await supabaseClient.from('visitors').select('*');
      
      if (error) throw error;
      
      if (data && data.length > 0) {
        // Mesclagem eficiente de dados
        const visitorMap = new Map(AppState.visitors.map(v => [v.id.toString(), v]));
        data.forEach(v => visitorMap.set(v.id.toString(), {
          id: v.id, name: v.name, phone: v.phone, isFirstTime: v.isFirstTime, date: v.date
        }));
        
        AppState.visitors = Array.from(visitorMap.values());
        localStorage.setItem('churchVisitors', JSON.stringify(AppState.visitors));
        this.updateStats();
      }
      
      // Processa fila de pendências
      this.processPendingQueue();
    } catch (error) {
      console.error('Erro na sincronização com Supabase:', error);
    }
  },
  
  // Fila de operações pendentes para retry
  getPendingQueue() {
    const queue = localStorage.getItem('pendingVisitors');
    return queue ? JSON.parse(queue) : [];
  },
  
  addToPendingQueue(visitor) {
    const pendingQueue = this.getPendingQueue();
    pendingQueue.push(visitor);
    localStorage.setItem('pendingVisitors', JSON.stringify(pendingQueue));
  },
  
  async processPendingQueue() {
    if (!supabaseClient || !navigator.onLine) return;
    
    const pendingQueue = this.getPendingQueue();
    if (pendingQueue.length === 0) return;
    
    const successItems = [];
    
    for (const visitor of pendingQueue) {
      try {
        const { error } = await supabaseClient.from('visitors').insert([visitor]);
        if (!error) successItems.push(visitor);
      } catch (err) {
        console.warn('Falha ao sincronizar item pendente:', err);
      }
    }
    
    // Remove itens sincronizados da fila
    if (successItems.length > 0) {
      const newQueue = pendingQueue.filter(v => !successItems.some(s => s.id === v.id));
      localStorage.setItem('pendingVisitors', JSON.stringify(newQueue));
    }
  },
  
  // Adiciona visitante com fallback offline
  async addVisitor(visitorData) {
    try {
      // Adiciona ID se não existir
      if (!visitorData.id) {
        visitorData.id = Date.now();
      }
      
      // Adiciona localmente primeiro para feedback imediato
      AppState.visitors.push(visitorData);
      localStorage.setItem('churchVisitors', JSON.stringify(AppState.visitors));
      this.updateStats();
      
      // Tenta adicionar ao Supabase ou coloca na fila
      let added = false;
      if (supabaseClient && navigator.onLine) {
        try {
          const { error } = await supabaseClient.from('visitors').insert([visitorData]);
          added = !error;
        } catch (e) {
          added = false;
        }
      }
      
      // Se não conseguiu adicionar, coloca na fila de pendências
      if (!added) {
        this.addToPendingQueue(visitorData);
      }
      
      return true;
    } catch (error) {
      console.error('Erro ao adicionar visitante:', error);
      return false;
    }
  },
  
  // Atualiza estatísticas da data atual
  updateStats() {
    const todayFormatted = DateUtils.formatToBR(AppState.selectedDate);
    const todayVisitors = AppState.visitors.filter(v => v.date === todayFormatted);
    
    DOM.todayVisitorsCount.textContent = todayVisitors.length;
    DOM.todayFirstTimeCount.textContent = todayVisitors.filter(v => v.isFirstTime).length;
  }
};

// Gerenciamento da interface otimizado
const UIManager = {
  init() {
    // Inicializa data
    AppState.selectedDate = DateUtils.adjustDate(new Date());
    DOM.selectedDateText.textContent = `Data do Registro: ${DateUtils.formatToBR(AppState.selectedDate)}`;
    DOM.selectedDateInput.value = DateUtils.formatToISO(AppState.selectedDate);
    
    // Configura eventos
    this.setupEventListeners();
  },
  
  setupEventListeners() {
    // Selector de data
    DOM.dateSelectorBtn.addEventListener('click', () => {
      DOM.datePickerDropdown.style.display = DOM.datePickerDropdown.style.display === 'none' ? 'block' : 'none';
    });
    
    DOM.selectedDateInput.addEventListener('change', (e) => {
      if (!e.target.value) return;
      AppState.selectedDate = DateUtils.fromISOString(e.target.value);
      DOM.selectedDateText.textContent = `Data do Registro: ${DateUtils.formatToBR(AppState.selectedDate)}`;
      DOM.datePickerDropdown.style.display = 'none';
      DataManager.updateStats();
    });
    
    // Adicionar visitante
    DOM.addVisitorBtn.addEventListener('click', async () => {
      const name = DOM.nameInput.value.trim();
      const phone = DOM.phoneInput.value.trim();
      
      if (!name) {
        alert('Por favor, informe o nome do visitante.');
        DOM.nameInput.focus();
        return;
      }
      
      const visitorData = {
        id: Date.now(),
        name,
        phone,
        isFirstTime: DOM.firstTimeCheckbox.checked,
        date: DateUtils.formatToBR(AppState.selectedDate)
      };
      
      const success = await DataManager.addVisitor(visitorData);
      
      if (success) {
        DOM.nameInput.value = '';
        DOM.phoneInput.value = '';
        DOM.firstTimeCheckbox.checked = false;
        alert('Visitante registrado com sucesso!' + (navigator.onLine ? '' : ' (Modo offline - será sincronizado quando houver conexão)'));
        DOM.nameInput.focus();
      } else {
        alert('Erro ao registrar visitante. Os dados foram salvos localmente e serão sincronizados mais tarde.');
      }
    });
    
    // Enter para enviar
    DOM.phoneInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') DOM.addVisitorBtn.click();
    });
    
    // Fechar dropdown ao clicar fora
    document.addEventListener('click', (e) => {
      if (!DOM.dateSelectorBtn.contains(e.target) && !DOM.datePickerDropdown.contains(e.target)) {
        DOM.datePickerDropdown.style.display = 'none';
      }
    });
    
    // Verificação de status de conexão
    window.addEventListener('online', () => {
      console.log('Conexão restabelecida, sincronizando dados...');
      DataManager.syncWithSupabase();
    });
  }
};

// Inicialização
document.addEventListener('DOMContentLoaded', async () => {
  try {
    UIManager.init();
    await DataManager.load();
    
    // Tenta sincronizar a cada 5 minutos
    setInterval(() => {
      if (navigator.onLine) DataManager.syncWithSupabase();
    }, 300000);
  } catch (error) {
    console.error('Erro ao inicializar:', error);
    alert('Ocorreu um erro ao inicializar. A aplicação continuará funcionando no modo offline.');
  }
});
