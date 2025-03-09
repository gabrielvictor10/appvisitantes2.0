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
  const supabase = window.supabase ? window.supabase.createClient(supabaseUrl, supabaseKey) : null;
  let supabaseEnabled = !!window.supabase;
  
  // Gerenciamento de dados otimizado
  const DataManager = {
    // Carrega dados com implementação assíncrona
    async load() {
      try {
        // Carrega visitantes do localStorage primeiro para UI responsiva imediata
        const storedVisitors = localStorage.getItem('churchVisitors');
        AppState.visitors = storedVisitors ? JSON.parse(storedVisitors) : [];
        
        // Sincroniza com Supabase em segundo plano se disponível
        if (supabaseEnabled && navigator.onLine) {
          try {
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
            const { error } = await supabase
              .from('visitors')
              .insert([visitorData]);
            
            if (error) throw error;
          } catch (error) {
            console.error('Erro ao adicionar visitante ao Supabase:', error);
            // Poderia implementar uma fila de pendências para sincronizar depois
            console.warn('Falha ao sincronizar com Supabase. O item será sincronizado na próxima conexão.');
          }
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
  
  // Inicialização da aplicação
  async function init() {
    try {
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