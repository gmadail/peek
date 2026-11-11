# Peek

Extensão do Chrome que mostra um site em vários tamanhos de ecrã lado a lado, com scroll e navegação sincronizados.

## Instalar (só no teu Chrome)

1. Abre `chrome://extensions`
2. Liga o **Modo de programador** (canto superior direito)
3. Clica em **Carregar expandida** e escolhe esta pasta (`viewport-sync`)
4. Fixa o ícone na barra: clica no ícone de puzzle e depois no pin

Depois de mudares algum ficheiro, carrega no botão de recarregar da extensão em `chrome://extensions`.

## Usar

- Num site qualquer, clica no ícone da extensão. O visualizador abre por cima da própria página, com o site em Desktop (1440) e Mobile (402).
- Para voltar ao normal, carrega em **Sair** (canto superior direito) ou outra vez no ícone da extensão. Voltas à página onde estavas a navegar.
- Enquanto está ligado, o ícone mostra **ON**. Se mudares de página pela barra de endereço do Chrome (ou atualizares), o visualizador volta a abrir sozinho nesse separador.
- **Cookies e login**: são os normais do site. Se aceitares os cookies num ecrã, os outros recarregam e o aviso desaparece, e fica gravado para as próximas vezes (e na navegação normal).
- **Botões dos ecrãs** (barra de topo): clica para mostrar ou esconder cada um.
- **Largura**: muda diretamente no número por cima de cada ecrã.
- **Redimensionar com o cursor**: arrasta a borda direita (largura), a de baixo (altura) ou o canto (as duas). Duplo clique na borda de baixo volta à altura automática.
- **Tema**: o botão no canto superior direito muda entre claro e escuro (só muda a extensão, não os sites). Da primeira vez segue o tema do Windows.
- **Definições** (ícone com dois cursores, na barra de topo): sincronizar scroll, sincronizar navegação e idioma (inglês por defeito, português ou francês).
- **+ Ecrãs**: adiciona ecrãs predefinidos (iPhone, iPad, Full HD…) ou personalizados, muda nome, tipo, largura e altura, ou apaga.
- **Tipo** (Desktop / Tablet / Mobile): nos tipos Tablet e Mobile o site também julga que está num iPhone ou iPad.
- **Zoom**: "Ajustar à janela" encolhe tudo para caber; ou escolhe uma percentagem fixa.

As definições ficam guardadas no Chrome.

## Modo Inspecionar

Na barra de topo, à esquerda, escolhes o modo: **Navegar** (usar o site normalmente) ou **Inspecionar**.

- Com o Inspecionar ligado, clica num elemento em qualquer ecrã. Os cliques não abrem links.
- O painel à direita mostra: tamanho, margin, border e padding (desenho da caixa), tipo de letra, tamanho e peso do texto, cores, contraste, borda, raio, layout e sombra.
- O mesmo elemento fica marcado em todos os ecrãs. No topo do painel escolhes o ecrã (ex: Desktop ou Mobile) para comparar os valores.
- Clica num valor para o copiar. **Copiar CSS** copia tudo de uma vez.
- O caminho por baixo do nome (ex: `section > div > h2`) deixa selecionar um elemento pai.
- **Esc** limpa a seleção. Outra vez **Esc** volta ao modo Navegar.

## Partilhar

- **Rápido**: comprime esta pasta num .zip e envia. Cada pessoa descomprime e segue os passos de "Instalar".
- **Chrome Web Store**: cria uma conta de programador (taxa única de 5 USD), carrega o .zip e escolhe a visibilidade "Pública", "Não listada" (só quem tem o link) ou "Privada" (só para uma organização no Google Workspace). Passa por uma revisão da Google antes de ficar disponível. As atualizações instalam-se sozinhas.

## Limitações

- Se navegares dentro dos ecrãs para **outro** site (outro domínio), os cookies e o login desse site podem não funcionar. Para isso, abre esse site num separador e clica no ícone lá.
- O recarregar automático depois de aceitar cookies funciona com os avisos de cookies mais comuns. Se algum não recarregar, usa o botão ↻.
- O servidor do site recebe sempre o user agent de computador. Só o JavaScript do site vê iPhone/iPad. Sites que mandam uma versão mobile diferente a partir do servidor (ex: `m.site.com`) podem mostrar a versão desktop estreita.
- Sites que fazem scroll dentro de uma caixa (em vez da página inteira) não sincronizam o scroll.
- Em páginas `chrome://` e na Chrome Web Store a extensão não pode entrar: aí abre numa página própria, sem esta partilha de cookies.
