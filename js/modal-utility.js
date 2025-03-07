// Utilitário para criar e gerenciar modais
const ModalUtil = {
    create: function(options) {
        // Criar elementos do modal
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'modal-overlay';
        
        const modalContainer = document.createElement('div');
        modalContainer.className = 'modal-container';
        
        const modalHeader = document.createElement('div');
        modalHeader.className = 'modal-header';
        
        const modalTitle = document.createElement('div');
        modalTitle.className = 'modal-title';
        modalTitle.textContent = options.title || 'Modal';
        
        const closeButton = document.createElement('button');
        closeButton.className = 'modal-close';
        closeButton.innerHTML = '&times;';
        closeButton.addEventListener('click', () => this.close(modalOverlay));
        
        const modalBody = document.createElement('div');
        modalBody.className = 'modal-body';
        
        if (typeof options.content === 'string') {
            modalBody.innerHTML = options.content;
        } else if (options.content instanceof HTMLElement) {
            modalBody.appendChild(options.content);
        }
        
        const modalFooter = document.createElement('div');
        modalFooter.className = 'modal-footer';
        
        // Montar estrutura do modal
        modalHeader.appendChild(modalTitle);
        modalHeader.appendChild(closeButton);
        
        modalContainer.appendChild(modalHeader);
        modalContainer.appendChild(modalBody);
        
        // Adicionar botões conforme necessário
        if (options.buttons && options.buttons.length) {
            options.buttons.forEach(btn => {
                const button = document.createElement('button');
                button.className = `modal-button ${btn.className || ''}`;
                button.textContent = btn.text;
                
                if (btn.onClick) {
                    button.addEventListener('click', () => {
                        btn.onClick();
                        if (btn.closeOnClick !== false) {
                            this.close(modalOverlay);
                        }
                    });
                } else if (btn.closeOnClick !== false) {
                    button.addEventListener('click', () => this.close(modalOverlay));
                }
                
                modalFooter.appendChild(button);
            });
            
            modalContainer.appendChild(modalFooter);
        }
        
        modalOverlay.appendChild(modalContainer);
        document.body.appendChild(modalOverlay);
        
        // Fechar modal ao clicar fora (se permitido)
        if (options.closeOnOutsideClick !== false) {
            modalOverlay.addEventListener('click', (e) => {
                if (e.target === modalOverlay) {
                    this.close(modalOverlay);
                }
            });
        }
        
        // Tecla ESC fecha o modal (se permitido)
        if (options.closeOnEsc !== false) {
            const escHandler = (e) => {
                if (e.key === 'Escape') {
                    this.close(modalOverlay);
                    document.removeEventListener('keydown', escHandler);
                }
            };
            document.addEventListener('keydown', escHandler);
        }
        
        // Exibir o modal (com delay mínimo para permitir a transição)
        setTimeout(() => {
            modalOverlay.classList.add('active');
        }, 10);
        
        return {
            overlay: modalOverlay,
            close: () => this.close(modalOverlay)
        };
    },
    
    close: function(modalOverlay) {
        modalOverlay.classList.remove('active');
        
        // Remove o modal do DOM após a animação
        setTimeout(() => {
            if (modalOverlay.parentNode) {
                modalOverlay.parentNode.removeChild(modalOverlay);
            }
        }, 300);
    },
    
    confirm: function(options) {
        return new Promise((resolve) => {
            this.create({
                title: options.title || 'Confirmação',
                content: options.message || 'Tem certeza?',
                buttons: [
                    {
                        text: options.cancelText || 'Cancelar',
                        className: 'modal-button-secondary',
                        onClick: () => resolve(false)
                    },
                    {
                        text: options.confirmText || 'Confirmar',
                        className: 'modal-button-primary',
                        onClick: () => resolve(true)
                    }
                ],
                closeOnOutsideClick: false
            });
        });
    },
    
    alert: function(options) {
        return new Promise((resolve) => {
            this.create({
                title: options.title || 'Aviso',
                content: options.message || '',
                buttons: [
                    {
                        text: options.okText || 'OK',
                        className: 'modal-button-primary',
                        onClick: () => resolve()
                    }
                ]
            });
        });
    }
};

// Função para debounce de inputs
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

// Gerenciador de tags/categorias
const TagManager = {
    // Lista padrão de tags disponíveis
    defaultTags: [
        'Jovem', 'Adulto', 'Idoso', 'Criança', 
        'Indicação', 'Batismo', 'Evento', 'Familiar', 
        'Estudante', 'Membro Potencial', 'Necessita Visita'
    ],
    
    // Obter tags do localStorage ou usar default
    getTags: function() {
        const storedTags = localStorage.getItem('churchVisitorTags');
        return storedTags ? JSON.parse(storedTags) : this.defaultTags;
    },
    
    // Salvar tags no localStorage
    saveTags: function(tags) {
        localStorage.setItem('churchVisitorTags', JSON.stringify(tags));
    },
    
    // Adicionar uma nova tag
    addTag: function(tag) {
        const tags = this.getTags();
        if (!tags.includes(tag)) {
            tags.push(tag);
            this.saveTags(tags);
        }
        return tags;
    },
    
    // Criar seletor de tags
    createTagSelector: function(selectedTags = []) {
        const container = document.createElement('div');
        container.className = 'tag-list';
        
        const tags = this.getTags();
        
        tags.forEach(tag => {
            const label = document.createElement('label');
            
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.className = 'tag-checkbox';
            input.value = tag;
            input.checked = selectedTags.includes(tag);
            
            const span = document.createElement('span');
            span.className = 'tag-item';
            span.textContent = tag;
            
            label.appendChild(input);
            label.appendChild(span);
            container.appendChild(label);
        });
        
        // Adicionar opção para criar nova tag
        const addNewBtn = document.createElement('button');
        addNewBtn.textContent = '+ Nova Categoria';
        addNewBtn.className = 'tag-button';
        addNewBtn.addEventListener('click', () => {
            const newTagPrompt = prompt('Digite o nome da nova categoria:');
            if (newTagPrompt && newTagPrompt.trim()) {
                const newTag = newTagPrompt.trim();
                this.addTag(newTag);
                
                // Recriar seletor de tags para incluir a nova
                const newContainer = this.createTagSelector([...selectedTags, newTag]);
                container.parentNode.replaceChild(newContainer, container);
            }
        });
        
        container.appendChild(addNewBtn);
        
        return container;
    },
    
    // Obter tags selecionadas a partir de um container
    getSelectedTags: function(container) {
        const selectedInputs = container.querySelectorAll('.tag-checkbox:checked');
        return Array.from(selectedInputs).map(input => input.value);
    }
};

// Utilitário para status de acompanhamento
const FollowUpManager = {
    statuses: [
        { id: 'pending', label: 'Pendente', class: 'status-pending' },
        { id: 'contacted', label: 'Contatado', class: 'status-contacted' },
        { id: 'regular', label: 'Frequentador', class: 'status-regular' },
        { id: 'inactive', label: 'Inativo', class: 'status-inactive' }
    ],
    
    getStatusById: function(id) {
        return this.statuses.find(status => status.id === id) || this.statuses[0];
    },
    
    createStatusSelector: function(currentStatusId = 'pending') {
        const select = document.createElement('select');
        select.className = 'input-field';
        
        this.statuses.forEach(status => {
            const option = document.createElement('option');
            option.value = status.id;
            option.textContent = status.label;
            option.selected = status.id === currentStatusId;
            select.appendChild(option);
        });
        
        return select;
    },
    
    getStatusBadge: function(statusId) {
        const status = this.getStatusById(statusId);
        const badge = document.createElement('span');
        badge.className = `status-badge ${status.class}`;
        badge.textContent = status.label;
        return badge;
    }
};

// Utilitário para backup e restauração de dados
const BackupManager = {
    createBackup: function() {
        const data = {
            visitors: JSON.parse(localStorage.getItem('churchVisitors') || '[]'),
            tags: JSON.parse(localStorage.getItem('churchVisitorTags') || '[]'),
            version: '1.0',
            timestamp: Date.now()
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
        
        const date = new Date();
        const formattedDate = `${date.getFullYear()}-${(date.getMonth()+1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
        
        return {
            blob,
            filename: `visitantes-backup-${formattedDate}.json`
        };
    },
    
    downloadBackup: function() {
        const backup = this.createBackup();
        
        const a = document.createElement('a');
        a.href = URL.createObjectURL(backup.blob);
        a.download = backup.filename;
        a.style.display = 'none';
        
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);
        }, 100);
    },
    
    restoreFromFile: function(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = function(e) {
                try {
                    const data = JSON.parse(e.target.result);
                    
                    // Verificações básicas de integridade
                    if (!data.visitors || !Array.isArray(data.visitors)) {
                        throw new Error('Dados de visitantes inválidos no arquivo de backup');
                    }
                    
                    // Restaurar os dados
                    localStorage.setItem('churchVisitors', JSON.stringify(data.visitors));
                    
                    if (data.tags && Array.isArray(data.tags)) {
                        localStorage.setItem('churchVisitorTags', JSON.stringify(data.tags));
                    }
                    
                    resolve({
                        visitorCount: data.visitors.length,
                        tagCount: data.tags ? data.tags.length : 0
                    });
                    
                } catch (error) {
                    reject('O arquivo não contém dados válidos de backup');
                }
            };
            
            reader.onerror = function() {
                reject('Erro ao ler o arquivo');
            };
            
            reader.readAsText(file);
        });
    }
};
