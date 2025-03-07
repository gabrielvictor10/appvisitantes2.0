// Estado da aplicação
let visitors = [];
let filteredVisitors = [];
let selectedDate = null;
let nameFilter = '';
let firstTimeFilter = false;
let currentPage = 1;
let itemsPerPage = 10;
let supabaseEnabled = !!window.supabase;

// Inicialização do Supabase
const supabaseUrl = 'https://qdttsbnsijllhkgrpdmc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkdHRzYm5zaWpsbGhrZ3JwZG1jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDExOTQzNDgsImV4cCI6MjA1Njc3MDM0OH0.CuZdeCC2wK73CrTt2cMIKxj20hAtgz_8qAhFt1EKkCw';
const supabase = window.supabase ? window.supabase.createClient(supabaseUrl, supabaseKey) : null;

// Elementos do DOM
const DOM = {
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
    pageInfo: document.getElementById('pageInfo')
};

// Formatação de data no padrão brasileiro (dd/mm/yyyy)
function formatDate(dateString) {
    if (!dateString) return '';
    
    // Se já estiver no formato brasileiro, retorna o próprio
    if (dateString.includes('/')) return dateString;
    
    // Converte formato ISO para formato brasileiro
    const [year, month, day] = dateString.split('-');
    return `${day}/${month}/${year}`;
}

// Converte formato brasileiro para ISO
function formatDateToISO(dateString) {
    if (!dateString) return '';
    
    const [day, month, year] = dateString.split('/');
    return `${year}-${month}-${day}`;
}

// Verifica se duas datas são iguais (no formato dd/mm/yyyy)
function areDatesEqual(date1, date2) {
    if (!date1 || !date2) return false;
    return date1 === date2;
}

// Gerenciamento de dados
const DataManager = {
    async load() {
        // Carrega visitantes do localStorage
        const storedVisitors = localStorage.getItem('churchVisitors');
        visitors = storedVisitors ? JSON.parse(storedVisitors) : [];
        
        // Tenta carregar do Supabase se disponível
        if (supabaseEnabled && navigator.onLine) {
            await this.loadFromSupabase();
        }
        
        this.applyFilters();
        this.renderTable();
        this.updateStats();
        this.updatePagination();
        
        // Inicializa escuta em tempo real se disponível
        if (supabaseEnabled && navigator.onLine) {
            this.initializeRealtime();
        }
    },
    
    async loadFromSupabase() {
        try {
            const { data, error } = await supabase.from('visitors').select('*');
            
            if (error) throw error;
            
            if (data && data.length > 0) {
                console.log(`Carregados ${data.length} visitantes do Supabase`);
                
                // Criar um mapa com os visitantes existentes para mesclagem eficiente
                const visitorMap = new Map();
                visitors.forEach(v => visitorMap.set(v.id.toString(), v));
                
                // Adicionar ou atualizar com dados do Supabase
                data.forEach(v => {
                    visitorMap.set(v.id.toString(), {
                        id: v.id,
                        name: v.name,
                        phone: v.phone,
                        isFirstTime: v.isFirstTime,
                        date: v.date
                    });
                });
                
                visitors = Array.from(visitorMap.values());
                localStorage.setItem('churchVisitors', JSON.stringify(visitors));
            }
        } catch (error) {
            console.error("Erro ao carregar visitantes do Supabase:", error);
        }
    },
    
    initializeRealtime() {
        if (!supabase) return;
        
        console.log('Inicializando escuta em tempo real do Supabase');
        
        supabase
            .channel('visitors-changes')
            .on('postgres_changes', 
                { event: '*', schema: 'public', table: 'visitors' }, 
                payload => {
                    console.log('Alteração detectada:', payload);
                    this.loadFromSupabase()
                        .then(() => {
                            this.applyFilters();
                            this.renderTable();
                            this.updateStats();
                            this.updatePagination();
                        });
                }
            )
            .subscribe();
    },
    
    async removeVisitor(id) {
        // Remove do array local
        visitors = visitors.filter(visitor => visitor.id !== id);
        localStorage.setItem('churchVisitors', JSON.stringify(visitors));
        
        // Remove do Supabase se disponível
        if (supabaseEnabled && navigator.onLine) {
            try {
                const { error } = await supabase
                    .from('visitors')
                    .delete()
                    .eq('id', id);
                
                if (error) throw error;
                console.log(`Visitante ${id} removido do Supabase`);
            } catch (error) {
                console.error("Erro ao remover visitante do Supabase:", error);
            }
        }
        
        this.applyFilters();
        this.renderTable();
        this.updateStats();
        this.updatePagination();
    },
    
    applyFilters() {
        filteredVisitors = visitors;
        
        // Aplicar filtro de data
        if (selectedDate) {
            filteredVisitors = filteredVisitors.filter(visitor => 
                areDatesEqual(visitor.date, selectedDate));
        }
        
        // Aplicar filtro de nome
        if (nameFilter) {
            const searchTerm = nameFilter.toLowerCase();
            filteredVisitors = filteredVisitors.filter(visitor => 
                visitor.name.toLowerCase().includes(searchTerm));
        }
        
        // Aplicar filtro de primeira vez
        if (firstTimeFilter) {
            filteredVisitors = filteredVisitors.filter(visitor => visitor.isFirstTime);
        }
        
        // Ordenar por data (mais recente primeiro) e depois por nome
        filteredVisitors.sort((a, b) => {
            // Converter datas do formato brasileiro (dd/mm/yyyy) para objetos Date
            const dateA = a.date.split('/').reverse().join('-');
            const dateB = b.date.split('/').reverse().join('-');
            
            // Comparar datas (mais recente primeiro)
            if (dateA !== dateB) {
                return new Date(dateB) - new Date(dateA);
            }
            
            // Se as datas forem iguais, ordenar por nome
            return a.name.localeCompare(b.name);
        });
        
        // Resetar para a primeira página quando os filtros mudam
        currentPage = 1;
    },
    
    renderTable() {
        // Limpa a tabela
        DOM.visitorsTableBody.innerHTML = '';
        
        // Calcula intervalo para paginação
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const visibleVisitors = filteredVisitors.slice(startIndex, endIndex);
        
        if (visibleVisitors.length === 0) {
            // Exibe mensagem de nenhum visitante encontrado
            const row = document.createElement('tr');
            row.innerHTML = `
                <td colspan="5" class="text-center py-4">
                    Nenhum visitante encontrado com os filtros atuais.
                </td>
            `;
            DOM.visitorsTableBody.appendChild(row);
            return;
        }
        
        // Adiciona visitantes à tabela
        visibleVisitors.forEach(visitor => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${visitor.name}</td>
                <td>${visitor.phone}</td>
                <td>${visitor.date}</td>
                <td>
                    ${visitor.isFirstTime ? 
                        '<span class="first-time-badge">Sim</span>' : 
                        'Não'}
                </td>
                <td class="visitor-actions">
                    <button class="remove-button" data-id="${visitor.id}">Remover</button>
                </td>
            `;
            DOM.visitorsTableBody.appendChild(row);
        });
        
        // Adiciona eventos aos botões de remover
        const removeButtons = document.querySelectorAll('.remove-button');
        removeButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const id = parseInt(e.target.getAttribute('data-id'));
                if (confirm('Tem certeza que deseja remover este visitante?')) {
                    DataManager.removeVisitor(id);
                }
            });
        });
    },
    
    updateStats() {
        // Atualiza estatísticas gerais
        DOM.totalVisitorsCount.textContent = filteredVisitors.length;
        DOM.firstTimeVisitorsCount.textContent = filteredVisitors.filter(v => v.isFirstTime).length;
    },
    
    updatePagination() {
        const totalPages = Math.ceil(filteredVisitors.length / itemsPerPage);
        
        // Atualiza texto de paginação
        DOM.pageInfo.textContent = `Página ${currentPage} de ${totalPages || 1}`;
        
        // Atualiza estado dos botões
        DOM.prevPageBtn.disabled = currentPage <= 1;
        DOM.nextPageBtn.disabled = currentPage >= totalPages;
    },
    
    changePage(increment) {
        currentPage += increment;
        this.renderTable();
        this.updatePagination();
    },
    
    exportToPDF() {
        if (filteredVisitors.length === 0) {
            alert('Não há visitantes para exportar.');
            return;
        }
        
        // Função para criar o PDF com jsPDF
        const createPDF = () => {
            if (typeof jspdf === 'undefined') {
                alert('Biblioteca PDF não carregada. Tente novamente mais tarde.');
                return;
            }
            
            const { jsPDF } = jspdf;
            const doc = new jsPDF();
            
            // Título
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(16);
            doc.text('Lista de Visitantes - Igreja Evangélica Internacional Semente Santa', 15, 15, {
                maxWidth: 180
            });
            
            // Informações de filtro
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            let yPos = 30;
            
            // Informação de data se houver filtro
            if (selectedDate) {
                doc.text(`Data do Relatório: ${selectedDate}`, 15, yPos);
                yPos += 7;
            } else {
                doc.text(`Data do Relatório: Todos os períodos`, 15, yPos);
                yPos += 7;
            }
            
            // Informação de filtro de nome
            if (nameFilter) {
                doc.text(`Filtro de Nome: ${nameFilter}`, 15, yPos);
                yPos += 7;
            }
            
            // Informação de filtro de primeira vez
            if (firstTimeFilter) {
                doc.text('Filtro: Apenas visitantes de primeira vez', 15, yPos);
                yPos += 7;
            }
            
            // Estatísticas
            doc.text(`Total de Visitantes: ${filteredVisitors.length}`, 15, yPos);
            yPos += 7;
            doc.text(`Visitantes pela primeira vez: ${filteredVisitors.filter(v => v.isFirstTime).length}`, 15, yPos);
            yPos += 15;
            
            // Cabeçalho da tabela
            doc.setFont('helvetica', 'bold');
            doc.text('Nome', 15, yPos);
            doc.text('Telefone', 85, yPos);
            doc.text('Data', 135, yPos);
            doc.text('Primeira Vez', 165, yPos);
            yPos += 7;
            
            // Linha divisória
            doc.setDrawColor(200, 200, 200);
            doc.line(15, yPos - 3, 195, yPos - 3);
            
            // Conteúdo da tabela
            doc.setFont('helvetica', 'normal');
            
            filteredVisitors.forEach(visitor => {
                // Verificação para nova página
                if (yPos > 270) {
                    doc.addPage();
                    yPos = 20;
                }
                
                doc.text(visitor.name.substring(0, 30), 15, yPos);
                doc.text(visitor.phone, 85, yPos);
                doc.text(visitor.date, 135, yPos);
                doc.text(visitor.isFirstTime ? 'Sim' : 'Não', 165, yPos);
                
                yPos += 7;
            });
            
            // Define nome do arquivo baseado nos filtros atuais
            let fileName = 'visitantes';
            if (selectedDate) fileName += `_${selectedDate.replace(/\//g, '-')}`;
            fileName += '.pdf';
            
            // Salva o PDF
            doc.save(fileName);
        };
        
        // Verifica se jsPDF já está carregado
        if (typeof jspdf === 'undefined') {
            // Carrega a biblioteca jsPDF se ainda não estiver disponível
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
            script.onload = createPDF;
            document.body.appendChild(script);
        } else {
            createPDF();
        }
    }
};

// Gerenciamento da interface
const UIManager = {
    setupEventListeners() {
        // Eventos para o filtro de data
        DOM.dateFilterBtn.addEventListener('click', () => {
            DOM.dateFilterDropdown.style.display = 
                DOM.dateFilterDropdown.style.display === 'none' ? 'block' : 'none';
        });
        
        DOM.dateFilterInput.addEventListener('change', (e) => {
            if (e.target.value) {
                selectedDate = formatDate(e.target.value);
                DOM.selectedFilterDate.textContent = selectedDate;
            } else {
                selectedDate = null;
                DOM.selectedFilterDate.textContent = 'Todos';
            }
            
            DOM.dateFilterDropdown.style.display = 'none';
            DataManager.applyFilters();
            DataManager.renderTable();
            DataManager.updateStats();
            DataManager.updatePagination();
        });
        
        DOM.clearDateFilterBtn.addEventListener('click', () => {
            selectedDate = null;
            DOM.selectedFilterDate.textContent = 'Todos';
            DOM.dateFilterInput.value = '';
            DOM.dateFilterDropdown.style.display = 'none';
            
            DataManager.applyFilters();
            DataManager.renderTable();
            DataManager.updateStats();
            DataManager.updatePagination();
        });
        
        // Evento para o filtro de nome
        DOM.nameFilter.addEventListener('input', (e) => {
            nameFilter = e.target.value.trim();
        });
        
        // Evento para o botão de pesquisa
        DOM.searchBtn.addEventListener('click', () => {
            nameFilter = DOM.nameFilter.value.trim();
            DataManager.applyFilters();
            DataManager.renderTable();
            DataManager.updateStats();
            DataManager.updatePagination();
        });
        
        // Adicionar evento para pesquisar ao pressionar Enter no campo de busca
        DOM.nameFilter.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                nameFilter = e.target.value.trim();
                DataManager.applyFilters();
                DataManager.renderTable();
                DataManager.updateStats();
                DataManager.updatePagination();
            }
        });
        
        // Evento para o filtro de primeira vez
        DOM.firstTimeFilter.addEventListener('change', (e) => {
            firstTimeFilter = e.target.checked;
            DataManager.applyFilters();
            DataManager.renderTable();
            DataManager.updateStats();
            DataManager.updatePagination();
        });
        
        // Eventos para os botões de paginação
        DOM.prevPageBtn.addEventListener('click', () => {
            DataManager.changePage(-1);
        });
        
        DOM.nextPageBtn.addEventListener('click', () => {
            DataManager.changePage(1);
        });
        
        // Evento para o botão de download
        DOM.downloadBtn.addEventListener('click', () => {
            DataManager.exportToPDF();
        });
        
        // Fechar dropdowns ao clicar fora
        document.addEventListener('click', (e) => {
            if (!DOM.dateFilterBtn.contains(e.target) && !DOM.dateFilterDropdown.contains(e.target)) {
                DOM.dateFilterDropdown.style.display = 'none';
            }
        });
    }
};

// Inicialização
async function init() {
    UIManager.setupEventListeners();
    await DataManager.load();
}

// Iniciar aplicação
init();
