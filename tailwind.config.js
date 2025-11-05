/*
 * ============================================
 * AGENDA TELEFÔNICA - Configuração Tailwind CSS
 * ============================================
 * 
 * PROPÓSITO:
 * Define configurações customizadas do Tailwind CSS para a aplicação.
 * Especifica quais arquivos devem ser escaneados e estende o tema padrão.
 * 
 * POR QUE EXISTE:
 * - Tailwind precisa saber onde procurar classes CSS (content)
 * - Permite adicionar cores e fontes customizadas ao design system
 * - Otimiza o CSS final incluindo apenas classes utilizadas (tree-shaking)
 * 
 * CONFIGURAÇÕES:
 * 1. content: Arquivos HTML/JS a serem escaneados (public/**)
 * 2. theme.extend: Cores e fontes customizadas sem sobrescrever padrões
 * 3. plugins: Extensões do Tailwind (vazio neste projeto)
 * 
 * COMO FUNCIONA:
 * - Tailwind CLI lê este arquivo
 * - Escaneia todos .html e .js em public/
 * - Gera output.css apenas com classes usadas
 * - Aplica cores e fontes customizadas definidas aqui
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  // Arquivos a serem escaneados para encontrar classes Tailwind
  content: [
    "./public/**/*.{html,js}",
  ],
  
  // Customizações do tema (cores, fontes, etc)
  theme: {
    extend: {
      // Cores customizadas do projeto (além das padrões do Tailwind)
      colors: {
        primary: '#4A90E2',      // Azul principal
        secondary: '#7B68EE',    // Roxo secundário
        dark: '#2c3e50',         // Cinza escuro
      },
      
      // Fonte padrão (Inter do Google Fonts)
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  
  // Plugins do Tailwind (nenhum neste projeto)
  plugins: [],
}
