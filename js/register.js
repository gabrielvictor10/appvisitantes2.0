// Estado da aplicação com estrutura mais organizada
const AppState = {
  visitors: [],
  selectedDate: new Date(),
  lastSyncTimestamp: null // Adicionado para controle de sincronização incremental
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

// Cache para evitar consultas repetidas
const VisitorCache = {
  // Cache por data
  byDate: new Map(),
  
  // Adiciona visitantes ao cache
  addToCache(visitorsList) {
    if (!Array.isArray(visitorsList)) return;
    
    visitorsList.forEach(visitor => {
      if (!visitor.date) return;
      
      if (!this.byDate.has(visitor.date)) {
        this.byDate.set(visitor.date, []);
      }
      
      // Evitar duplicação no cache
      const dateVisitors = this.byDate.get(visitor.date);
      const existingIndex = dateVisitors.findIndex(v => v.id === visitor.id);
      
      if (existingIndex >= 0) {
        dateVisitors[existingIndex] = visitor;
      } else {
        dateVisitors.push(visitor);
      }
    });
  },
  
  // Obtém visitantes para uma data específica
  getByDate(date) {
    const formattedDate = DateUtils.formatToBR(date);
    return this.byDate.has(formattedDate) ? this.byDate.get(formattedDate) : [];
  },
  
  // Limpa cache
  clear() {
    this.byDate.clear();
  }
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
  // Carrega dados com implementação assíncrona e otimizada
  async load() {
    try {
      // Verifica e carrega Supabase se necessário
      if (!window.supabase && supabaseUrl && supabaseKey) {
        try {
          await loadSupabase();
          // Reinicializa cliente Supabase se necessário
          if (window.supabase && !supabase) {
            const supabaseInstance = window.supabase.createClient(supabaseUrl, supabaseKey);
            supabaseEnabled = true;
          }
        } catch (e) {
          console.warn('Não foi possível carregar Supabase:', e);
        }
      }
      
      // Carrega visitantes do localStorage primeiro para UI responsiva imediata
      const storedVisitors = localStorage.getItem('churchVisitors');
      AppState.visitors = storedVisitors ? JSON.parse(storedVisitors) : [];
      
      // Carregar timestamp da última sincronização
      AppState.lastSyncTimestamp = localStorage.getItem('lastSyncTimestamp') 
        ? parseInt(localStorage.getItem('lastSyncTimestamp'), 10)
        : 0;
      
      // Preencher cache inicial
      VisitorCache.addToCache(AppState.visitors);
      
      // Sincroniza com Supabase em segundo plano se disponível
      if (supabaseEnabled && navigator.onLine) {
        try {
          // Otimizando: Verificar conexão e buscar dados em uma única operação
          let query = supabase.from('visitors').select('*');
          
          // Sincronização incremental: buscar apenas dados novos ou alterados
          if (AppState.lastSyncTimestamp) {
            query = query.gt('updated_at', new Date(AppState.lastSyncTimestamp).toISOString());
          }
          
          // Limitar número de registros por consulta para melhor performance
          const { data, error } = await query.order('id', { ascending: false }).limit(500);
          
          if (error) throw error;
          
          if (data && data.length > 0) {
            // Usa Map para mesclagem eficiente de dados
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
            
            // Atualizar cache
            VisitorCache.clear();
            VisitorCache.addToCache(AppState.visitors);
            
            // Atualizar timestamp de sincronização
            AppState.lastSyncTimestamp = Date.now();
            localStorage.setItem('lastSyncTimestamp', AppState.lastSyncTimestamp.toString());
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
  
  // Processa operações pendentes com tratamento em lote
  async processPendingOperations() {
    if (!supabaseEnabled || !navigator.onLine) return;
    
    try {
      // Recuperar operações pendentes
      const pendingOperations = JSON.parse(localStorage.getItem('pendingSync') || '[]');
      if (pendingOperations.length === 0) return;
      
      console.log(`Processando ${pendingOperations.length} operações pendentes...`);
      
      const successfulOps = [];
      const batchSize = 50; // Tamanho do lote para operações em batch
      
      // Agrupar operações por tipo para processamento em lote
      const insertOps = pendingOperations.filter(op => op.operation === 'insert');
      const deleteOps = pendingOperations.filter(op => op.operation === 'delete');
      
      // Processar inserções em lote
      if (insertOps.length > 0) {
        for (let i = 0; i < insertOps.length; i += batchSize) {
          const batch = insertOps.slice(i, i + batchSize);
          const insertData = batch.map(op => ({
            id: op.data.id,
            name: op.data.name,
            phone: op.data.phone,
            isFirstTime: op.data.isFirstTime,
            date: op.data.date
          }));
          
          try {
            const { error } = await supabase.from('visitors').insert(insertData);
            
            if (!error) {
              successfulOps.push(...batch);
            } else {
              // Se falhar o lote, tenta individualmente para identificar registros problemáticos
              for (const op of batch) {
                try {
                  const { error: indivError } = await supabase
                    .from('visitors')
                    .insert([{
                      id: op.data.id,
                      name: op.data.name,
                      phone: op.data.phone,
                      isFirstTime: op.data.isFirstTime,
                      date: op.data.date
                    }]);
                  
                  if (!indivError) {
                    successfulOps.push(op);
                  }
                } catch (e) {
                  console.error('Erro ao inserir individualmente:', e);
                }
              }
            }
          } catch (batchError) {
            console.error('Erro ao processar lote de inserções:', batchError);
          }
        }
      }
      
      // Processar exclusões em lote
      if (deleteOps.length > 0) {
        for (let i = 0; i < deleteOps.length; i += batchSize) {
          const batch = deleteOps.slice(i, i + batchSize);
          const ids = batch.map(op => op.id);
          
          try {
            const { error } = await supabase
              .from('visitors')
              .delete()
              .in('id', ids);
            
            if (!error) {
              successfulOps.push(...batch);
            } else {
              // Se falhar o lote, tenta individualmente
              for (const op of batch) {
                try {
                  const { error: indivError } = await supabase
                    .from('visitors')
                    .delete()
                    .eq('id', op.id);
                  
                  if (!indivError) {
                    successfulOps.push(op);
                  }
                } catch (e) {
                  console.error('Erro ao excluir individualmente:', e);
                }
              }
            }
          } catch (batchError) {
            console.error('Erro ao processar lote de exclusões:', batchError);
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
  
  // Adiciona visitante com implementação de cache e retry otimizados
  async addVisitor(visitorData) {
    try {
      // Adiciona ID se não existir
      if (!visitorData.id) {
        visitorData.id = Date.now();
      }
      
      // Adiciona localmente primeiro para feedback imediato
      AppState.visitors.push(visitorData);
      localStorage.setItem('churchVisitors', JSON.stringify(AppState.visitors));
      
      // Atualizar cache
      VisitorCache.addToCache([visitorData]);
      
      this.updateStats();
      
      // Tenta adicionar ao Supabase em segundo plano
      if (supabaseEnabled && navigator.onLine) {
        // Usar sendBeacon para operações assíncronas não-bloqueantes quando disponível
        if (navigator.sendBeacon && typeof Blob !== 'undefined') {
          try {
            const data = {
              method: 'POST',
              path: `rest/v1/visitors`,
              headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Prefer': 'return=minimal'
              },
              body: JSON.stringify([{
                id: visitorData.id,
                name: visitorData.name,
                phone: visitorData.phone,
                isFirstTime: visitorData.isFirstTime,
                date: visitorData.date
              }])
            };
            
            const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
            const beaconSuccess = navigator.sendBeacon(`${supabaseUrl}/rest/v1/visitors`, blob);
            
            if (!beaconSuccess) {
              throw new Error('sendBeacon failed');
            }
            
            return true;
          } catch (beaconError) {
            console.warn('Falha ao usar sendBeacon, tentando método alternativo:', beaconError);
            // Continuar com método tradicional se sendBeacon falhar
          }
        }
        
        try {
          // Otimização: usar um timeout para evitar esperas muito longas
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 segundos timeout
          
          const { error } = await supabase
            .from('visitors')
            .insert([{
              id: visitorData.id,
              name: visitorData.name,
              phone: visitorData.phone,
              isFirstTime: visitorData.isFirstTime,
              date: visitorData.date
            }], { signal: controller.signal });
          
          clearTimeout(timeoutId);
          
          if (error) {
            console.error('Erro específico ao inserir no Supabase:', error);
            // Implementar sistema de fila para tentar novamente depois
            this.addToPendingOperations('insert', visitorData);
          }
        } catch (error) {
          console.error('Erro ao adicionar visitante ao Supabase:', error);
          // Armazenar para sincronização posterior
          this.addToPendingOperations('insert', visitorData);
        }
      } else {
        // Offline ou Supabase desabilitado: adicionar à fila de sincronização
        this.addToPendingOperations('insert', visitorData);
      }
      
      return true;
    } catch (error) {
      console.error('Erro ao adicionar visitante:', error);
      return false;
    }
  },
  
  // Adiciona operação à fila de sincronização pendente
  addToPendingOperations(operation, data) {
    const pendingOperations = JSON.parse(localStorage.getItem('pendingSync') || '[]');
    
    // Verificar se já existe operação idêntica para evitar duplicações
    const existingIndex = pendingOperations.findIndex(op => 
      op.operation === operation && 
      ((operation === 'insert' && op.data && op.data.id === data.id) ||
       (operation === 'delete' && op.id === data))
    );
    
    if (existingIndex >= 0) {
      // Se já existe, atualizar em vez de adicionar novamente
      if (operation === 'insert') {
        pendingOperations[existingIndex].data = data;
      }
    } else {
      // Caso contrário, adicionar nova operação
      if (operation === 'insert') {
        pendingOperations.push({ operation, data });
      } else if (operation === 'delete') {
        pendingOperations.push({ operation, id: data });
      }
    }
    
    localStorage.setItem('pendingSync', JSON.stringify(pendingOperations));
  },
  
  // Atualiza estatísticas da data atual usando cache
  updateStats() {
    const todayFormatted = DateUtils.formatToBR(AppState.selectedDate);
    
    // Usar o cache para performance
    const todayVisitors = VisitorCache.getByDate(AppState.selectedDate);
    
    // Fallback para método original se o cache falhar
    const visitorCount = todayVisitors.length || 
      AppState.visitors.filter(v => v.date === todayFormatted).length;
    
    const firstTimeCount = todayVisitors.filter(v => v.isFirstTime).length || 
      AppState.visitors.filter(v => v.date === todayFormatted && v.isFirstTime).length;
    
    DOM.todayVisitorsCount.textContent = visitorCount;
    DOM.todayFirstTimeCount.textContent = firstTimeCount;
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
    
    // Evento para adicionar visitante - implementação debounce para evitar submissões duplicadas
    let submitInProgress = false;
    DOM.addVisitorBtn.addEventListener('click', async () => {
      if (submitInProgress) return;
      submitInProgress = true;
      
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
        submitInProgress = false;
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
      
      submitInProgress = false;
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
    
    // Adicionar listener para sincronização em segundo plano quando a conectividade retornar
    window.addEventListener('online', () => {
      if (supabaseEnabled) {
        DataManager.processPendingOperations();
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
    // Verificar e carregar Supabase se necessário
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
