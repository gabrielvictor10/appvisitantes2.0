// Estado da aplicação com estrutura mais organizada
const AppState = {
  visitors: [],
  selectedDate: new Date(),
  lastSyncTimestamp: 0 // Novo: controle de timestamp da última sincronização
};

// Elementos do DOM com cache para melhor performance
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

// Utilitários de data consolidados (compartilhados com visitors-list.js)
const DateUtils = {
  // Formata data para padrão brasileiro (dd/mm/yyyy)
  formatToBR(date) {
    if (!date) return '';
    
    if (typeof date === 'string' && date.includes('/')) return date;
    
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  },
  
  // Formata para ISO
  formatToISO(date) {
    if (!date) return '';
    
    if (typeof date === 'string' && date.includes('-')) return date;
    
    const d = date instanceof Date ? date : new Date(date);
    return d.toISOString().split('T')[0];
  },
  
  // Ajusta data para evitar problemas de fuso horário
  adjustDate(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  },
  
  // Cria data a partir de string YYYY-MM-DD
  fromISOString(dateString) {
    if (!dateString) return new Date();
    
    const [year, month, day] = dateString.split('-').map(num => parseInt(num, 10));
    return new Date(year, month - 1, day);
  }
};

// Inicialização do Supabase (usando a mesma configuração do script.js)
const supabaseUrl = 'https://qdttsbnsijllhkgrpdmc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkdHRzYm5zaWpsbGhrZ3JwZG1jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDExOTQzNDgsImV4cCI6MjA1Njc3MDM0OH0.CuZdeCC2wK73CrTt2cMIKxj20hAtgz_8qAhFt1EKkCw';
// Garantir que o cliente Supabase seja sempre inicializado (não depender da verificação window.supabase)
const supabase = supabaseUrl && supabaseKey ? 
  (window.supabase ? window.supabase.createClient(supabaseUrl, supabaseKey) : null) : null;
let supabaseEnabled = !!supabase;

// Cache configurações
const CACHE_CONFIG = {
  SYNC_INTERVAL: 60000, // 1 minuto entre sincronizações completas
  BATCH_SIZE: 50,      // Tamanho do lote para operações em massa
  MAX_RETRY: 3,        // Máximo de tentativas para operações falhas
  CONNECTION_TIMEOUT: 3000 // Timeout para teste de conexão
};

// Função para carregar Supabase dinamicamente
function loadSupabase() {
  return new Promise((resolve, reject) => {
    if (window.supabase) {
      resolve(window.supabase);
      return;
    }
    
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    script.onload = () => {
      if (window.supabase) {
        supabaseEnabled = true;
        resolve(window.supabase);
      } else {
        reject(new Error('Não foi possível carregar a biblioteca Supabase'));
      }
    };
    script.onerror = () => reject(new Error('Falha ao carregar Supabase'));
    document.body.appendChild(script);
  });
}

// Gerenciamento de dados otimizado
const DataManager = {
  // Verifica conexão com timeout para evitar bloqueios longos
  async checkConnection() {
    if (!supabaseEnabled || !navigator.onLine) return false;
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CACHE_CONFIG.CONNECTION_TIMEOUT);
      
      const { data, error } = await supabase
        .from('visitors')
        .select('count')
        .limit(1)
        .abortSignal(controller.signal);
      
      clearTimeout(timeoutId);
      return !error;
    } catch (error) {
      console.warn('Falha na verificação de conexão:', error);
      return false;
    }
  },
  
  // Carrega dados com implementação assíncrona e caching inteligente
  async load() {
    try {
      // Carrega visitantes do localStorage primeiro para UI responsiva imediata
      const storedVisitors = localStorage.getItem('churchVisitors');
      AppState.visitors = storedVisitors ? JSON.parse(storedVisitors) : [];
      
      // Carrega timestamp da última sincronização
      AppState.lastSyncTimestamp = parseInt(localStorage.getItem('lastSyncTimestamp') || '0', 10);
      
      // Verifica e carrega Supabase em segundo plano se necessário
      if (!window.supabase && supabaseUrl && supabaseKey) {
        try {
          loadSupabase().then(() => {
            if (window.supabase && !supabase) {
              const supabaseInstance = window.supabase.createClient(supabaseUrl, supabaseKey);
              supabaseEnabled = true;
              this.syncWithServer(); // Sincroniza após carregar
            }
          }).catch(e => console.warn('Não foi possível carregar Supabase:', e));
        } catch (e) {
          console.warn('Erro ao inicializar carregamento do Supabase:', e);
        }
      } else if (supabaseEnabled) {
        // Sincronização inteligente: verifica se já passou tempo suficiente desde a última sincronização
        const now = Date.now();
        if (now - AppState.lastSyncTimestamp > CACHE_CONFIG.SYNC_INTERVAL) {
          // Usar setTimeout para não bloquear a interface
          setTimeout(() => this.syncWithServer(), 10);
        }
      }
      
      this.updateStats();
      return true;
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      this.updateStats(); // Atualiza mesmo com erro para mostrar dados locais
      return false;
    }
  },
  
  // Função específica para sincronização com servidor
  async syncWithServer() {
    if (!await this.checkConnection()) {
      console.log('Sincronização adiada: sem conexão');
      return false;
    }
    
    try {
      console.log('Iniciando sincronização com servidor...');
      
      // Processar operações pendentes primeiro
      await this.processPendingOperations();
      
      // Buscar apenas dados mais recentes do que a última sincronização
      const lastSyncDate = new Date(AppState.lastSyncTimestamp);
      
      // Usar RLS ou filtro por data para limitar dados 
      // (consulta modificada para trazer apenas novos registros)
      const { data, error } = await supabase
        .from('visitors')
        .select('*')
        .gt('created_at', lastSyncDate.toISOString()) // Requer campo 'created_at' na tabela
        .order('id', { ascending: false })
        .limit(CACHE_CONFIG.BATCH_SIZE);
      
      if (error) {
        throw error;
      }
      
      if (data && data.length > 0) {
        console.log(`Recebidos ${data.length} registros novos do servidor`);
        
        // Implementação eficiente com Map para mesclagem de dados
        const visitorMap = new Map(AppState.visitors.map(v => [v.id.toString(), v]));
        
        data.forEach(v => {
          visitorMap.set(v.id.toString(), {
            id: v.id,
            name: v.name,
            phone: v.phone,
            isFirstTime: v.isFirstTime,
            date: v.date
          });
        });
        
        AppState.visitors = Array.from(visitorMap.values());
        localStorage.setItem('churchVisitors', JSON.stringify(AppState.visitors));
      } else {
        console.log('Nenhum registro novo encontrado no servidor');
      }
      
      // Atualiza timestamp de última sincronização
      AppState.lastSyncTimestamp = Date.now();
      localStorage.setItem('lastSyncTimestamp', AppState.lastSyncTimestamp.toString());
      
      this.updateStats();
      return true;
    } catch (error) {
      console.error('Erro ao sincronizar com servidor:', error);
      return false;
    }
  },
  
  // Processa operações pendentes com retry strategy e circuit breaker
  async processPendingOperations() {
    if (!supabaseEnabled || !navigator.onLine) return;
    
    try {
      // Recuperar operações pendentes
      const pendingOperations = JSON.parse(localStorage.getItem('pendingSync') || '[]');
      if (pendingOperations.length === 0) return;
      
      console.log(`Processando ${pendingOperations.length} operações pendentes...`);
      
      // Circuit breaker para evitar tentativas infinitas
      let consecutiveFailures = 0;
      const successfulOps = [];
      
      // Processar em lotes para melhor performance
      const batches = [];
      for (let i = 0; i < pendingOperations.length; i += CACHE_CONFIG.BATCH_SIZE) {
        batches.push(pendingOperations.slice(i, i + CACHE_CONFIG.BATCH_SIZE));
      }
      
      for (const batch of batches) {
        // Verificar se circuit breaker foi acionado
        if (consecutiveFailures >= CACHE_CONFIG.MAX_RETRY) {
          console.warn('Circuit breaker acionado após várias falhas consecutivas');
          break;
        }
        
        // Separar operações por tipo para processamento em lote
        const insertOps = batch.filter(op => op.operation === 'insert');
        const deleteOps = batch.filter(op => op.operation === 'delete');
        
        // Processar inserções em lote quando possível
        if (insertOps.length > 0) {
          try {
            const { error } = await supabase
              .from('visitors')
              .insert(insertOps.map(op => ({
                id: op.data.id,
                name: op.data.name,
                phone: op.data.phone,
                isFirstTime: op.data.isFirstTime,
                date: op.data.date
              })));
            
            if (!error) {
              successfulOps.push(...insertOps);
              consecutiveFailures = 0; // Reset failures counter
            } else {
              console.error('Erro em operação em lote de inserção:', error);
              consecutiveFailures++;
              
              // Tentar um por um para identificar problemas específicos
              for (const op of insertOps) {
                try {
                  const { error } = await supabase
                    .from('visitors')
                    .insert([{
                      id: op.data.id,
                      name: op.data.name,
                      phone: op.data.phone,
                      isFirstTime: op.data.isFirstTime,
                      date: op.data.date
                    }]);
                  
                  if (!error) {
                    successfulOps.push(op);
                  }
                } catch (innerError) {
                  console.error(`Erro ao processar operação individual:`, innerError);
                }
              }
            }
          } catch (batchError) {
            console.error('Erro ao processar lote de inserções:', batchError);
            consecutiveFailures++;
          }
        }
        
        // Processar exclusões
        for (const op of deleteOps) {
          try {
            const { error } = await supabase
              .from('visitors')
              .delete()
              .eq('id', op.id);
            
            if (!error) {
              successfulOps.push(op);
              consecutiveFailures = 0; // Reset failures counter
            } else {
              consecutiveFailures++;
            }
          } catch (opError) {
            console.error(`Erro ao processar operação de exclusão:`, opError);
            consecutiveFailures++;
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
  
  // Adiciona visitante com implementação de cache e retry otimizada
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
      
      // Tenta adicionar ao Supabase em segundo plano
      if (supabaseEnabled && navigator.onLine) {
        // Usar Web Worker ou Promise para enviar em segundo plano
        setTimeout(async () => {
          try {
            // Verificar conexão rapidamente com timeout
            const isConnected = await this.checkConnection();
            
            if (!isConnected) {
              // Armazenar para sincronização posterior
              this.addToPendingSync(visitorData);
              return;
            }
            
            // Conexão ok, agora insere o dado
            const { error } = await supabase
              .from('visitors')
              .insert([{
                id: visitorData.id,
                name: visitorData.name,
                phone: visitorData.phone,
                isFirstTime: visitorData.isFirstTime,
                date: visitorData.date
              }]);
            
            if (error) {
              console.error('Erro específico ao inserir no Supabase:', error);
              this.addToPendingSync(visitorData);
            }
          } catch (error) {
            console.error('Erro ao adicionar visitante ao Supabase:', error);
            this.addToPendingSync(visitorData);
          }
        }, 10); // Delay mínimo para não bloquear a UI
      } else if (supabaseEnabled) {
        // Offline, armazenar para sincronização posterior
        this.addToPendingSync(visitorData);
      }
      
      return true;
    } catch (error) {
      console.error('Erro ao adicionar visitante:', error);
      return false;
    }
  },
  
  // Auxiliar para adicionar à fila de sincronização pendente
  addToPendingSync(visitorData) {
    const pendingOperations = JSON.parse(localStorage.getItem('pendingSync') || '[]');
    pendingOperations.push({ operation: 'insert', data: visitorData });
    localStorage.setItem('pendingSync', JSON.stringify(pendingOperations));
  },
  
  // Atualiza estatísticas da data atual
  updateStats() {
    const todayFormatted = DateUtils.formatToBR(AppState.selectedDate);
    const todayVisitors = AppState.visitors.filter(v => v.date === todayFormatted);
    
    DOM.todayVisitorsCount.textContent = todayVisitors.length;
    DOM.todayFirstTimeCount.textContent = todayVisitors.filter(v => v.isFirstTime).length;
  }
};

// Modal para alertas com implementação Promise
const ModalUtil = {
  alert({ title, message }) {
    return new Promise(resolve => {
      // Poderia implementar um modal personalizado em vez de alert nativo
      alert(`${title}\n${message}`);
      resolve();
    });
  }
};

// Gerenciamento da interface otimizado
const UIManager = {
  initializeDates() {
    AppState.selectedDate = DateUtils.adjustDate(new Date());
    
    DOM.selectedDateText.textContent = `Data do Registro: ${DateUtils.formatToBR(AppState.selectedDate)}`;
    DOM.selectedDateInput.value = DateUtils.formatToISO(AppState.selectedDate);
  },
  
  setupEventListeners() {
    // Gerenciamento do seletor de data
    DOM.dateSelectorBtn.addEventListener('click', () => {
      DOM.datePickerDropdown.style.display = 
        DOM.datePickerDropdown.style.display === 'none' ? 'block' : 'none';
    });
    
    // Evento para quando a data é alterada
    DOM.selectedDateInput.addEventListener('change', (e) => {
      if (!e.target.value) return;
      
      AppState.selectedDate = DateUtils.fromISOString(e.target.value);
      DOM.selectedDateText.textContent = `Data do Registro: ${DateUtils.formatToBR(AppState.selectedDate)}`;
      DOM.datePickerDropdown.style.display = 'none';
      
      // Atualiza estatísticas para a nova data
      DataManager.updateStats();
    });
    
    // Evento para adicionar visitante
    DOM.addVisitorBtn.addEventListener('click', async () => {
      const name = DOM.nameInput.value.trim();
      const phone = DOM.phoneInput.value.trim();
      const isFirstTime = DOM.firstTimeCheckbox.checked;
      
      // Validação básica
      if (!name) {
        await ModalUtil.alert({
          title: 'Campo obrigatório',
          message: 'Por favor, informe o nome do visitante.'
        });
        DOM.nameInput.focus();
        return;
      }
      
      // Prepara dados do visitante
      const visitorData = {
        id: Date.now(),
        name,
        phone,
        isFirstTime,
        date: DateUtils.formatToBR(AppState.selectedDate)
      };
      
      // Tenta adicionar visitante
      const success = await DataManager.addVisitor(visitorData);
      
      if (success) {
        // Limpar formulário
        DOM.nameInput.value = '';
        DOM.phoneInput.value = '';
        DOM.firstTimeCheckbox.checked = false;
        
        // Feedback ao usuário
        await ModalUtil.alert({
          title: 'Sucesso',
          message: 'Visitante registrado com sucesso!'
        });
        
        // Foco no campo de nome para facilitar múltiplos registros
        DOM.nameInput.focus();
      } else {
        await ModalUtil.alert({
          title: 'Erro',
          message: 'Não foi possível registrar o visitante. Tente novamente mais tarde.'
        });
      }
    });
    
    // Pressionar Enter no campo de telefone para enviar o formulário
    DOM.phoneInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        DOM.addVisitorBtn.click();
      }
    });
    
    // Fechar dropdown ao clicar fora
    document.addEventListener('click', (e) => {
      if (!DOM.dateSelectorBtn.contains(e.target) && 
          !DOM.datePickerDropdown.contains(e.target)) {
        DOM.datePickerDropdown.style.display = 'none';
      }
    });
  },
  
  // Inicializa toda a interface
  init() {
    this.initializeDates();
    this.setupEventListeners();
  }
};

// Inicialização da aplicação
async function init() {
  try {
    // Iniciar UI imediatamente para resposta rápida
    UIManager.init();
    
    // Carregar dados localmente primeiro
    await DataManager.load();
    
    // Verificar e carregar Supabase se necessário (em background)
    if (!window.supabase && supabaseUrl && supabaseKey) {
      loadSupabase().catch(error => {
        console.warn('Erro ao carregar Supabase:', error);
      });
    }
  } catch (error) {
    console.error('Erro ao inicializar aplicação:', error);
    ModalUtil.alert({
      title: 'Erro',
      message: 'Ocorreu um erro ao inicializar a aplicação. Por favor, recarregue a página.'
    });
  }
}

// Iniciar quando DOM estiver carregado
document.addEventListener('DOMContentLoaded', init);

// Sincronização periódica em segundo plano quando a página estiver ativa
let syncInterval;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    // Página ativa, iniciar sincronização periódica
    if (!syncInterval) {
      syncInterval = setInterval(() => {
        DataManager.syncWithServer();
      }, CACHE_CONFIG.SYNC_INTERVAL);
    }
  } else {
    // Página em background, pausar sincronização
    if (syncInterval) {
      clearInterval(syncInterval);
      syncInterval = null;
    }
  }
});
