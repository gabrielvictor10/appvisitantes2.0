// config.js - Configuração centralizada para a aplicação

// Criar objeto global de configuração
window.CONFIG = {
  // Credenciais do Supabase - em produção seriam injetadas pelo processo de build
  SUPABASE_URL: '%%SUPABASE_URL%%',  // Será substituído durante o build
  SUPABASE_KEY: '%%SUPABASE_KEY%%'   // Será substituído durante o build
};

// Para compatibilidade com código existente que possa usar process.env
if (!window.process) {
  window.process = { env: {} };
}

// Preencher process.env com as mesmas configurações
window.process.env = {
  ...window.process.env,
  SUPABASE_URL: window.CONFIG.SUPABASE_URL,
  SUPABASE_KEY: window.CONFIG.SUPABASE_KEY
};

// Para compatibilidade com código que use a variável 'config'
const config = window.CONFIG;

console.log('Configurações carregadas');