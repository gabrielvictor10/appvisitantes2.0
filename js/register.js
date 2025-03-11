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

// Configuração do Supabase
const supabaseUrl = 'https://qdttsbnsijllhkgrpdmc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkdHRzYm5zaWpsbGhrZ3JwZG1jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDExOTQzNDgsImV4cCI6MjA1Njc3MDM0OH0.CuZdeCC2wK73CrTt2cMIKxj20hAtgz_8qAhFt1EKkCw';
// Inicializar como null e definir mais tarde quando o script do Supabase estiver carregado
let supabase = null;
let supabaseEnabled = false;

// Função para carregar Supabase dinamicamente
function loadSupabase() {
  return new Promise((resolve, reject) => {
    if (window.supabase) {
      // Se já estiver carregado, inicializar o cliente
      supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
      supabaseEnabled = true;
      resolve(supabase);
      return;
    }
    
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    script.onload = () => {
      if (window.supabase) {
        // Inicializar o cliente após carregar o script
        supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
        supabaseEnabled = true;
        resolve(supabase);
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
  // Carrega dados com implementação assíncrona
  async load() {
    try {
      // Carregar dados do localStorage para UI responsiva imediata
      const storedVisitors = localStorage.getItem('churchVisitors');
      AppState.visitors = storedVisitors ? JSON.parse(storedVisitors) : [];
      
      // Verificar e carregar Supabase se necessário
      if (!supabaseEnabled && supabaseUrl && supabaseKey) {
        try {
          await loadSupabase();
        } catch (e) {
          console.warn('Não foi possível carregar Supabase:', e);
        }
      }
      
      // Sincroniza com Supabase se disponível e online
      if (supabaseEnabled && navigator.onLine) {
        try {
          // Verificar conexão primeiro
          const { data: connectionTest, error: connectionError } = await supabase
            .from('visitors')
            .select('count')
            .limit(1);
          
          if (connectionError) {
            console.warn('Problema de conexão com Supabase:', connectionError);
            this.updateStats(); // Atualiza apenas com dados locais
            return true;
          }
          
          // Conexão OK, buscar dados
          const { data, error } = await supabase.from('visitors').select('*');
          
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
  
  // Processa operações pendentes
  async processPendingOperations() {
    if (!supabaseEnabled || !navigator.onLine) return;
    
    try {
      // Recuperar operações pendentes
      const pendingOperations = JSON.parse(localStorage.getItem('pendingSync') || '[]');
      if (pendingOperations.length === 0) return;
      
      console.log(`Processando ${pendingOperations.length} operações pendentes...`);
      
      const successfulOps = [];
      
      for (const op of pendingOperations) {
        try {
          if (op.operation === 'insert') {
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
            } else {
              console.error('Erro ao inserir operação pendente:', error);
            }
          } else if (op.operation === 'delete') {
            const { error } = await supabase
              .from('visitors')
              .delete()
              .eq('id', op.id);
            
            if (!error) {
              successfulOps.push(op);
            } else {
              console.error('Erro ao excluir operação pendente:', error);
            }
          }
        } catch (opError) {
          console.error(`Erro ao processar operação pendente:`, opError);
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
  
  // Adiciona visitante com implementação de cache e retry
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
        try {
          // Inserir o dado no Supabase
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
            console.error('Erro ao inserir no Supabase:', error);
            // Implementar sistema de fila para tentar novamente depois
            const pendingOps = JSON.parse(localStorage.getItem('pendingSync') || '[]');
            pendingOps.push({ operation: 'insert', data: visitorData });
            localStorage.setItem('pendingSync', JSON.stringify(pendingOps));
          } else {
            console.log('Visitante adicionado com sucesso ao Supabase:', visitorData.name);
          }
        } catch (error) {
          console.error('Erro ao adicionar visitante ao Supabase:', error);
          // Armazenar para sincronização posterior
          const pendingOps = JSON.parse(localStorage.getItem('pendingSync') || '[]');
          pendingOps.push({ operation: 'insert', data: visitorData });
          localStorage.setItem('pendingSync', JSON.stringify(pendingOps));
        }
      } else {
        // Não está online ou Supabase não está disponível, armazenar para sincronização posterior
        const pendingOps = JSON.parse(localStorage.getItem('pendingSync') || '[]');
        pendingOps.push({ operation: 'insert', data: visitorData });
        localStorage.setItem('pendingSync', JSON.stringify(pendingOps));
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

// Adicionar um listener para verificar periodicamente se há operações pendentes
// e tentar sincronizar quando estiver online
window.addEventListener('online', async () => {
  console.log('Conexão online detectada, verificando operações pendentes...');
  // Carrega o Supabase se necessário e processa pendências
  if (!supabaseEnabled && supabaseUrl && supabaseKey) {
    try {
      await loadSupabase();
      await DataManager.processPendingOperations();
    } catch (error) {
      console.error('Erro ao processar operações pendentes após ficar online:', error);
    }
  } else if (supabaseEnabled) {
    await DataManager.processPendingOperations();
  }
});

// Inicialização da aplicação
async function init() {
  try {
    // Inicializa a UI primeiro para feedback visual imediato
    UIManager.init();
    
    // Carregar Supabase antes de carregar os dados
    if (supabaseUrl && supabaseKey) {
      try {
        await loadSupabase();
      } catch (error) {
        console.warn('Não foi possível carregar Supabase, funcionando em modo offline:', error);
      }
    }
    
    // Carrega os dados (locais e remotos)
    await DataManager.load();
    
    // Verifica se há operações pendentes para processar
    if (supabaseEnabled && navigator.onLine) {
      DataManager.processPendingOperations();
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
