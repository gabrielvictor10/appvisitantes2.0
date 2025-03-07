// Estado da aplicação
let visitors = [];
let selectedDate = new Date();

// Elementos do DOM
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

// Formatação de data no padrão brasileiro (dd/mm/yyyy)
function formatDate(date) {
    return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

// Ajustar data para evitar problemas de fuso horário
function adjustDate(date) {
    const userTimezoneOffset = date.getTimezoneOffset() * 60000;
    const adjusted = new Date(date.getTime() + userTimezoneOffset);
    adjusted.setHours(0, 0, 0, 0);
    return adjusted;
}

// Função para criar data a partir de string YYYY-MM-DD
function createDateFromString(dateString) {
    const [year, month, day] = dateString.split('-').map(num => parseInt(num, 10));
    return new Date(year, month - 1, day);
}

// Atualizar estatísticas da data atual
function updateStats() {
    const todayFormatted = formatDate(selectedDate);
    const todayVisitors = visitors.filter(v => v.date === todayFormatted);
    
    DOM.todayVisitorsCount.textContent = todayVisitors.length;
    DOM.todayFirstTimeCount.textContent = todayVisitors.filter(v => v.isFirstTime).length;
}

// Gerenciamento de dados - versão simplificada
const DataManager = {
    load() {
        // Carrega visitantes do localStorage
        visitors = JSON.parse(localStorage.getItem('churchVisitors') || '[]');
        updateStats();
    },
    
    addVisitor(visitorData) {
        // Adiciona visitante à lista local
        visitors.push(visitorData);
        
        // Salva no localStorage
        localStorage.setItem('churchVisitors', JSON.stringify(visitors));
        updateStats();
        return true;
    }
};

// Modal para alertas
const ModalUtil = {
    alert({ title, message }) {
        return new Promise(resolve => {
            alert(`${title}\n${message}`);
            resolve();
        });
    }
};

// Gerenciamento da interface
const UIManager = {
    initializeDates() {
        selectedDate = adjustDate(new Date());
        
        DOM.selectedDateText.textContent = `Data do Registro: ${formatDate(selectedDate)}`;
        DOM.selectedDateInput.value = selectedDate.toISOString().split('T')[0];
    },
    
    setupEventListeners() {
        // Gerenciamento do seletor de data
        DOM.dateSelectorBtn.addEventListener('click', () => {
            DOM.datePickerDropdown.style.display = DOM.datePickerDropdown.style.display === 'none' ? 'block' : 'none';
        });
        
        DOM.selectedDateInput.addEventListener('change', (e) => {
            selectedDate = createDateFromString(e.target.value);
            DOM.selectedDateText.textContent = `Data do Registro: ${formatDate(selectedDate)}`;
            DOM.datePickerDropdown.style.display = 'none';
            updateStats();
        });
        
        // Adicionar visitante
        DOM.addVisitorBtn.addEventListener('click', async () => {
            const name = DOM.nameInput.value.trim();
            const phone = DOM.phoneInput.value.trim();
            const isFirstTime = DOM.firstTimeCheckbox.checked;
            
            if (!name || !phone) {
                await ModalUtil.alert({
                    title: 'Campos Obrigatórios',
                    message: 'Por favor, preencha nome e telefone'
                });
                return;
            }
            
            const newVisitor = {
                id: Date.now(),
                name,
                phone,
                isFirstTime,
                date: formatDate(selectedDate)
            };
            
            DataManager.addVisitor(newVisitor);
            
            // Limpar campos
            DOM.nameInput.value = '';
            DOM.phoneInput.value = '';
            DOM.firstTimeCheckbox.checked = false;
            
            await ModalUtil.alert({
                title: 'Sucesso',
                message: 'Visitante adicionado com sucesso!'
            });
            
            // Foco no campo de nome para o próximo registro
            DOM.nameInput.focus();
        });
    }
};

// Inicialização
function init() {
    // Inicializar componentes da interface
    UIManager.initializeDates();
    
    // Configurar event listeners
    UIManager.setupEventListeners();
    
    // Carregar dados
    DataManager.load();
}

// Iniciar a aplicação quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', init);
