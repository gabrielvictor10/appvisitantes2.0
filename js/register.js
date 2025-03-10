// Estado da aplicação com estrutura mais organizada
const AppState = {
  visitors: [],
  selectedDate: new Date()
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
// Inicializar Supabase apenas uma vez
const supabase = window.supabase && supabaseUrl && supabaseKey ? 
  window.supabase.createClient(supabaseUrl, supabaseKey) : null;
let supabaseEnabled = !!supabase;

// Cache de conexão para evitar múltiplas verificações
let supabaseConnectionStatus = null;
let lastConnectionCheck = 0;
const CONNECTION_CHECK_INTERVAL = 60000; // 1 minuto

// Função para carregar Supabase dinamicamente
function loadSupabase() {
  // Verificar se já existe uma promessa de carregamento em andamento
  if (window._supabaseLoadPromise) {
    return window._supabaseLoadPromise;
  }
  
  window._supabaseLoadPromise = new Promise((resolve, reject) => {
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
  
  return window._supabaseLoadPromise;
}

// Gerenciamento de dados otimizado
const DataManager = {
  // Verifica status da conexão com cache
  async checkSupabaseConnection() {
    const now = Date.now();
    
    // Usar resultado em cache se disponível e recente
    if (supabaseConnectionStatus !== null && (now - lastConnectionCheck) < CONNECTION_CHECK_INTERVAL) {
      return supabaseConnectionStatus;
    }
    
    if (!supabaseEnabled || !navigator.onLine) {
      supabaseConnectionStatus = false;
      lastConnectionCheck = now;
      return false;
    }
    
    try {
      // Testar conexão com operação leve
      const { data, error } = await supabase
        .from('visitors')
        .select('id')
        .limit(1)
        .maybeSingle();
      
      supabaseConnectionStatus = !error;
      lastConnectionCheck = now;
      return !error;
    } catch (e) {
      supabaseConnectionStatus = false;
      lastConnectionCheck = now;
      return false;
    }
  },
  
  // Carrega dados com implementação assíncrona e otimizada
  async load() {
    try {
      // Carrega visitantes do localStorage primeiro para UI responsiva imediata
      const storedVisitors = localStorage.getItem('churchVisitors');
      AppState.visitors = storedVisitors ? JSON.parse(storedVisitors) : [];
      
      // Verifica e carrega Supabase se necessário (apenas uma vez)
      if (!window.supabase && supabaseUrl && supabaseKey) {
        try {
          await loadSupabase();
          // Inicializa cliente Supabase se necessário (apenas uma vez)
          if (window.supabase && !supabase) {
            const supabaseInstance = window.supabase.createClient(supabaseUrl, supabaseKey);
            window._supabaseClient = supabaseInstance;
            supabaseEnabled = true;
          }
        } catch (e) {
          console.warn('Não foi possível carregar Supabase:', e);
        }
      }
      
      // Sincroniza com Supabase em segundo plano se disponível
      if (await this.checkSupabaseConnection()) {
        try {
          // Otimização: Buscar apenas os dados que não existem localmente
          // Encontrar ID mais recente para sincronização incremental
          const latestLocalId = Math.max(...AppState.visitors.map(v => Number(v.id) || 0), 0);
          
          // Buscar apenas dados novos
          const { data, error } = await supabase
            .from('visitors')
            .select('*')
            .gt('id', latestLocalId);
          
          if (error) throw error;
          
          if (data && data.length > 0) {
            // Mesclar dados novos
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
          }
          
          // Processa operações pendentes
          await this.processPendingOperations();
        } catch (error) {
          console.error('Erro ao sincronizar com Supabase:', error);
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
  
  // Processa operações pendentes com batch processing
  async processPendingOperations() {
    if (!await this.checkSupabaseConnection()) return;
    
    try {
      // Recuperar operações pendentes
      const pendingOperations = JSON.parse(localStorage.getItem('pendingSync') || '[]');
      if (pendingOperations.length === 0) return;
      
      console.log(`Processando ${pendingOperations.length} operações pendentes...`);
      
      const successfulOps = [];
      const BATCH_SIZE = 10; // Processa em lotes de 10 operações
      
      // Agrupar operações por tipo para processamento em lote
      const insertOps = pendingOperations.filter(op => op.operation === 'insert');
      const deleteOps = pendingOperations.filter(op => op.operation === 'delete');
      
      // Processar inserções em lote
      for (let i = 0; i < insertOps.length; i += BATCH_SIZE) {
        const batch = insertOps.slice(i, i + BATCH_SIZE);
        const batchData = batch.map(op => ({
          id: op.data.id,
          name: op.data.name,
          phone: op.data.phone,
          isFirstTime: op.data.isFirstTime,
          date: op.data.date
        }));
        
        try {
          const { error } = await supabase.from('visitors').insert(batchData);
          
          if (!error) {
            successfulOps.push(...batch);
          } else {
            // Se falhar em lote, tenta um por um
            for (const op of batch) {
              try {
                const { error } = await supabase.from('visitors').insert([{
                  id: op.data.id,
                  name: op.data.name,
                  phone: op.data.phone,
                  isFirstTime: op.data.isFirstTime,
                  date: op.data.date
                }]);
                
                if (!error) {
                  successfulOps.push(op);
                }
              } catch (e) {
                console.error('Erro em operação individual:', e);
              }
            }
          }
        } catch (e) {
          console.error('Erro em lote de inserções:', e);
        }
      }
      
      // Processar exclusões em lote (se suportado pela API)
      for (let i = 0; i < deleteOps.length; i += BATCH_SIZE) {
        const batch = deleteOps.slice(i, i + BATCH_SIZE);
        const ids = batch.map(op => op.id);
        
        try {
          const { error } = await supabase.from('visitors').delete().in('id', ids);
          
          if (!error) {
            successfulOps.push(...batch);
          } else {
            // Se falhar em lote, tenta um por um
            for (const op of batch) {
              try {
                const { error } = await supabase.from('visitors').delete().eq('id', op.id);
                
                if (!error) {
                  successfulOps.push(op);
                }
              } catch (e) {
                console.error('Erro em operação individual de exclusão:', e);
              }
            }
          }
        } catch (e) {
          console.error('Erro em lote de exclusões:', e);
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
      if (await this.checkSupabaseConnection()) {
        try {
          // Usando upsert para evitar conflitos e reduzir operações
          const { error } = await supabase
            .from('visitors')
            .upsert([{
              id: visitorData.id,
              name: visitorData.name,
              phone: visitorData.phone,
              isFirstTime: visitorData.isFirstTime,
              date: visitorData.date
            }], {
              onConflict: 'id'
            });
          
          if (error) {
            console.error('Erro ao inserir no Supabase:', error);
            // Implementar sistema de fila para tentar novamente depois
            this.addToPendingSync('insert', visitorData);
          }
        } catch (error) {
          console.error('Erro ao adicionar visitante ao Supabase:', error);
          // Armazenar para sincronização posterior
          this.addToPendingSync('insert', visitorData);
        }
      } else {
        // Conexão não disponível, armazenar para sincronização posterior
        this.addToPendingSync('insert', visitorData);
      }
      
      return true;
    } catch (error) {
      console.error('Erro ao adicionar visitante:', error);
      return false;
    }
  },
  
  // Adiciona operação à fila de sincronização pendente
  addToPendingSync(operation, data) {
    const pendingOperations = JSON.parse(localStorage.getItem('pendingSync') || '[]');
    
    // Verificar se já existe uma operação idêntica pendente para evitar duplicação
    const isDuplicate = pendingOperations.some(op => 
      op.operation === operation && 
      ((operation === 'insert' && op.data.id === data.id) || 
       (operation === 'delete' && op.id === data))
    );
    
    if (!isDuplicate) {
      pendingOperations.push(
        operation === 'insert' 
          ? { operation, data } 
          : { operation, id: data }
      );
      
      localStorage.setItem('pendingSync', JSON.stringify(pendingOperations));
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
    // Verificar e carregar Supabase se necessário, usando promise caching
    if (!window.supabase && supabaseUrl && supabaseKey) {
      await loadSupabase();
    }
    
    UIManager.init();
    await DataManager.load();
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
