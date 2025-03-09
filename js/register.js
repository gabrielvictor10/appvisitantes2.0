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
  todayFirstTimeCount: document.getElementById('todayFirstTimeCount'),
  connectionStatus: document.createElement('div') // Elemento para status de conexão
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

// Gerenciamento Supabase melhorado
let supabaseClient = null;
let connectionCheckInterval = null;

// Gerenciamento de dados otimizado
const DataManager = {
  // Melhorado com verificação de disponibilidade
  initSupabase() {
    if (!window.supabase) {
      console.warn('Biblioteca Supabase não encontrada.');
      return null;
    }
    
    try {
      const SUPABASE_URL = 'https://qdttsbnsijllhkgrpdmc.supabase.co';
      const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkdHRzYm5zaWpsbGhrZ3JwZG1jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDExOTQzNDgsImV4cCI6MjA1Njc3MDM0OH0.CuZdeCC2wK73CrTt2cMIKxj20hAtgz_8qAhFt1EKkCw';
      
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      
      // Verificar conexão imediatamente
      this.checkConnection();
      
      // Monitoramento de conexão a cada 30 segundos
      if (connectionCheckInterval) clearInterval(connectionCheckInterval);
      connectionCheckInterval = setInterval(() => this.checkConnection(), 30000);
      
      return supabaseClient;
    } catch (error) {
      console.error('Erro ao inicializar Supabase:', error);
      return null;
    }
  },
  
  // Nova função para verificar conexão
  async checkConnection() {
    if (!supabaseClient) return false;
    
    try {
      const { error } = await supabaseClient.from('visitors').select('count', { count: 'exact', head: true });
      
      const isConnected = !error;
      this.updateConnectionStatus(isConnected);
      
      if (isConnected && this.getPendingQueue().length > 0) {
        console.log('Conexão verificada, processando fila pendente...');
        this.processPendingQueue();
      }
      
      return isConnected;
    } catch (error) {
      console.error('Erro ao verificar conexão:', error);
      this.updateConnectionStatus(false);
      return false;
    }
  },
  
  // Nova função para mostrar status da conexão
  updateConnectionStatus(isConnected) {
    const statusElement = document.getElementById('connectionStatus');
    if (statusElement) {
      statusElement.textContent = isConnected 
        ? 'Conectado ao banco de dados' 
        : 'Modo offline (salvando localmente)';
      statusElement.style.color = isConnected ? '#2ecc71' : '#e74c3c';
    }
  },

  // Carrega dados com implementação assíncrona melhorada
  async load() {
    try {
      // Carrega do localStorage primeiro para UI imediata
      const storedVisitors = localStorage.getItem('churchVisitors');
      AppState.visitors = storedVisitors ? JSON.parse(storedVisitors) : [];
      this.updateStats();
      
      // Adiciona indicador de status se não existir
      const containerElement = document.querySelector('.container');
      if (containerElement && !document.getElementById('connectionStatus')) {
        const statusElement = document.createElement('div');
        statusElement.id = 'connectionStatus';
        statusElement.style.textAlign = 'center';
        statusElement.style.padding = '5px';
        statusElement.style.marginBottom = '10px';
        statusElement.style.borderRadius = '4px';
        statusElement.style.backgroundColor = '#f8f9fa';
        containerElement.prepend(statusElement);
      }
      
      // Tenta inicializar Supabase
      if (!supabaseClient) {
        supabaseClient = this.initSupabase();
      }
      
      // Configura ouvintes de conexão
      window.addEventListener('online', () => {
        console.log('Conexão de rede restabelecida');
        this.checkConnection();
      });
      
      window.addEventListener('offline', () => {
        console.log('Conexão de rede perdida');
        this.updateConnectionStatus(false);
      });
      
      // Verifica se há visitantes pendentes e processa
      const hasPendingData = this.getPendingQueue().length > 0;
      if (hasPendingData && navigator.onLine) {
        await this.processPendingQueue();
      }
      
      // Sincroniza com o banco se online
      if (navigator.onLine) {
        await this.syncWithSupabase();
      }
      
      return true;
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      return false;
    }
  },
  
  // Sincronização com Supabase melhorada
  async syncWithSupabase() {
    if (!supabaseClient || !navigator.onLine) {
      this.updateConnectionStatus(false);
      return false;
    }
    
    try {
      const isConnected = await this.checkConnection();
      if (!isConnected) return false;
      
      const { data, error } = await supabaseClient.from('visitors').select('*');
      
      if (error) {
        console.error('Erro ao buscar dados:', error);
        this.updateConnectionStatus(false);
        return false;
      }
      
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
      await this.processPendingQueue();
      
      this.updateConnectionStatus(true);
      return true;
    } catch (error) {
      console.error('Erro na sincronização com Supabase:', error);
      this.updateConnectionStatus(false);
      return false;
    }
  },
  
  // Fila de operações pendentes melhorada
  getPendingQueue() {
    const queue = localStorage.getItem('pendingVisitors');
    return queue ? JSON.parse(queue) : [];
  },
  
  addToPendingQueue(visitor) {
    const pendingQueue = this.getPendingQueue();
    
    // Evita duplicados na fila
    const exists = pendingQueue.some(v => v.id === visitor.id);
    if (!exists) {
      pendingQueue.push(visitor);
      localStorage.setItem('pendingVisitors', JSON.stringify(pendingQueue));
      console.log(`Visitante ${visitor.name} adicionado à fila pendente.`);
    }
  },
  
  async processPendingQueue() {
    if (!supabaseClient || !navigator.onLine) {
      this.updateConnectionStatus(false);
      return false;
    }
    
    const isConnected = await this.checkConnection();
    if (!isConnected) return false;
    
    const pendingQueue = this.getPendingQueue();
    if (pendingQueue.length === 0) return true;
    
    console.log(`Processando ${pendingQueue.length} visitantes pendentes...`);
    
    const successItems = [];
    const failedItems = [];
    
    for (const visitor of pendingQueue) {
      try {
        // Verifica se o visitante já existe no banco
        const { data: existingData } = await supabaseClient
          .from('visitors')
          .select('id')
          .eq('id', visitor.id)
          .maybeSingle();
          
        if (existingData) {
          // Se já existe, considera como sucesso
          console.log(`Visitante ${visitor.name} já existe no banco.`);
          successItems.push(visitor);
          continue;
        }
          
        // Tenta inserir com retry
        let success = false;
        let attempts = 0;
        const maxAttempts = 3;
        
        while (!success && attempts < maxAttempts) {
          attempts++;
          
          try {
            const { error } = await supabaseClient.from('visitors').insert([visitor]);
            
            if (error) {
              console.warn(`Tentativa ${attempts}: Erro ao inserir visitante ${visitor.name}:`, error);
              
              // Espera antes de tentar novamente (backoff exponencial)
              await new Promise(r => setTimeout(r, 1000 * attempts));
            } else {
              success = true;
              successItems.push(visitor);
              console.log(`Visitante ${visitor.name} sincronizado com sucesso.`);
            }
          } catch (insertError) {
            console.error(`Tentativa ${attempts}: Exceção ao inserir visitante:`, insertError);
            
            // Espera antes de tentar novamente
            await new Promise(r => setTimeout(r, 1000 * attempts));
          }
        }
        
        if (!success) {
          failedItems.push(visitor);
        }
      } catch (err) {
        console.warn('Falha ao processar item pendente:', err);
        failedItems.push(visitor);
      }
    }
    
    // Atualiza a fila pendente
    if (successItems.length > 0 || failedItems.length > 0) {
      const newQueue = pendingQueue.filter(v => 
        !successItems.some(s => s.id === v.id)
      );
      
      localStorage.setItem('pendingVisitors', JSON.stringify(newQueue));
      console.log(`Processamento concluído: ${successItems.length} sucesso, ${failedItems.length} falhas.`);
    }
    
    this.updateConnectionStatus(true);
    return successItems.length > 0;
  },
  
  // Adiciona visitante com melhor tratamento de erros
  async addVisitor(visitorData) {
    try {
      // Valida dados antes de inserir
      if (!visitorData.name || !visitorData.date) {
        console.error('Dados de visitante inválidos:', visitorData);
        return false;
      }
      
      // Adiciona ID se não existir
      if (!visitorData.id) {
        visitorData.id = Date.now();
      }
      
      // Adiciona localmente primeiro para feedback imediato
      AppState.visitors.push(visitorData);
      localStorage.setItem('churchVisitors', JSON.stringify(AppState.visitors));
      this.updateStats();
      
      // Verifica status da conexão
      const isConnected = await this.checkConnection();
      let added = false;
      
      if (isConnected) {
        try {
          // Tenta inserir diretamente
          const { error } = await supabaseClient.from('visitors').insert([visitorData]);
          
          if (error) {
            console.warn('Erro ao inserir visitante no Supabase:', error);
            // Adiciona à fila para tentar mais tarde
            this.addToPendingQueue(visitorData);
          } else {
            added = true;
            console.log('Visitante adicionado com sucesso ao Supabase.');
          }
        } catch (e) {
          console.error('Exceção ao inserir visitante no Supabase:', e);
          this.addToPendingQueue(visitorData);
        }
      } else {
        // Se desconectado, adiciona à fila
        this.addToPendingQueue(visitorData);
      }
      
      return true;
    } catch (error) {
      console.error('Erro ao adicionar visitante:', error);
      // Mesmo com erro, adiciona à fila para não perder dados
      this.addToPendingQueue(visitorData);
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
    
    // Configura estado inicial dos botões
    this.updateButtonStates();
  },
  
  updateButtonStates() {
    // Desabilita o botão de adicionar se não houver nome
    const nameValue = DOM.nameInput.value.trim();
    DOM.addVisitorBtn.disabled = nameValue === '';
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
    
    // Validação em tempo real
    DOM.nameInput.addEventListener('input', () => {
      this.updateButtonStates();
    });
    
    // Adicionar visitante com feedback melhorado
    DOM.addVisitorBtn.addEventListener('click', async () => {
      const name = DOM.nameInput.value.trim();
      const phone = DOM.phoneInput.value.trim();
      
      if (!name) {
        alert('Por favor, informe o nome do visitante.');
        DOM.nameInput.focus();
        return;
      }
      
      // Desabilita o botão durante o processamento
      DOM.addVisitorBtn.disabled = true;
      DOM.addVisitorBtn.textContent = 'Processando...';
      
      const visitorData = {
        id: Date.now(),
        name,
        phone,
        isFirstTime: DOM.firstTimeCheckbox.checked,
        date: DateUtils.formatToBR(AppState.selectedDate)
      };
      
      try {
        const success = await DataManager.addVisitor(visitorData);
        
        if (success) {
          DOM.nameInput.value = '';
          DOM.phoneInput.value = '';
          DOM.firstTimeCheckbox.checked = false;
          
          const isOnline = navigator.onLine && await DataManager.checkConnection();
          alert(`Visitante "${name}" registrado com sucesso!` + 
                (isOnline ? '' : ' (Modo offline - será sincronizado quando houver conexão)'));
          DOM.nameInput.focus();
        } else {
          alert('Erro ao registrar visitante. Os dados foram salvos localmente e serão sincronizados mais tarde.');
        }
      } catch (error) {
        console.error('Erro ao processar adição de visitante:', error);
        alert('Ocorreu um erro, mas os dados foram salvos localmente.');
      } finally {
        // Restaura o botão
        DOM.addVisitorBtn.disabled = false;
        DOM.addVisitorBtn.textContent = 'Adicionar Visitante';
        this.updateButtonStates();
      }
    });
    
    // Enter para enviar
    const submitOnEnter = (e) => {
      if (e.key === 'Enter' && !DOM.addVisitorBtn.disabled) {
        e.preventDefault();
        DOM.addVisitorBtn.click();
      }
    };
    
    DOM.nameInput.addEventListener('keypress', submitOnEnter);
    DOM.phoneInput.addEventListener('keypress', submitOnEnter);
    
    // Fechar dropdown ao clicar fora
    document.addEventListener('click', (e) => {
      if (!DOM.dateSelectorBtn.contains(e.target) && !DOM.datePickerDropdown.contains(e.target)) {
        DOM.datePickerDropdown.style.display = 'none';
      }
    });
    
    // Verificação de status de conexão
    window.addEventListener('online', () => {
      console.log('Conexão restabelecida, sincronizando dados...');
      DataManager.checkConnection();
    });
    
    // Sincronização manual com F5
    document.addEventListener('keydown', (e) => {
      if (e.key === 'F5') {
        e.preventDefault();
        DataManager.syncWithSupabase();
      }
    });
  }
};

// Inicialização com retry
(async function initialize() {
  try {
    UIManager.init();
    const loaded = await DataManager.load();
    
    if (!loaded) {
      console.warn('Falha na inicialização inicial, tentando novamente...');
      setTimeout(initialize, 3000);
      return;
    }
    
    // Tenta sincronizar a cada 3 minutos
    setInterval(() => {
      if (navigator.onLine) DataManager.syncWithSupabase();
    }, 180000);
    
  } catch (error) {
    console.error('Erro na inicialização:', error);
    setTimeout(initialize, 3000);
  }
})();
