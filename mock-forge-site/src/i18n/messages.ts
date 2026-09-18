export type Messages = {
  meta: {
    title: string;
    description: string;
  };
  nav: {
    product: string;
    features: string;
    how: string;
    screenshots: string;
    download: string;
    github: string;
  };
  hero: {
    brand: string;
    headline: string;
    sub: string;
    ctaPrimary: string;
    ctaSecondary: string;
  };
  product: {
    title: string;
    sub: string;
    points: { title: string; body: string }[];
  };
  screenshots: {
    title: string;
    sub: string;
    items: { title: string; caption: string; file: string }[];
    placeholderHint: string;
  };
  features: {
    title: string;
    sub: string;
    items: { title: string; body: string }[];
  };
  how: {
    title: string;
    sub: string;
    steps: { title: string; body: string }[];
  };
  download: {
    title: string;
    sub: string;
    windows: string;
    mac: string;
    brew: string;
    brewHint: string;
    gatekeeper: string;
    allReleases: string;
    detecting: string;
    recommended: string;
    copied: string;
  };
  openSource: {
    title: string;
    body: string;
    cta: string;
  };
  footer: {
    rights: string;
    mit: string;
  };
};

/** Conteúdo do site — apenas português. */
export const messages: Messages = {
  meta: {
    title: 'MockForge — Mock de request e response do tráfego',
    description:
      'App desktop offline para MockServer. Capture tráfego e moca request e response. Sem conta.',
  },
  nav: {
    product: 'Produto',
    features: 'Recursos',
    how: 'Como funciona',
    screenshots: 'Telas',
    download: 'Baixar',
    github: 'GitHub',
  },
  hero: {
    brand: 'MockForge',
    headline: 'Moca request e response do tráfego.',
    sub: 'Capture as chamadas do seu app, defina o que precisa bater no request e monte a response — offline, no desktop, sem conta.',
    ctaPrimary: 'Baixar para desktop',
    ctaSecondary: 'Saiba mais',
  },
  product: {
    title: 'Mock de tráfego de ponta a ponta',
    sub: 'Você controla o que o cliente envia e o que volta: match no request e corpo, headers e status na response.',
    points: [
      {
        title: 'Capture o tráfego',
        body: 'O proxy mostra requests e responses ao vivo — headers, body e status — enquanto o app mobile ou cliente HTTP fala com o MockForge.',
      },
      {
        title: 'Moca o request',
        body: 'Defina o que precisa bater: path, método, query, headers e body. O mock só dispara quando o request encaixa.',
      },
      {
        title: 'Moca a response',
        body: 'Monte status, headers e body (com templates e variantes) a partir da chamada capturada — ou edite do zero.',
      },
    ],
  },
  screenshots: {
    title: 'Como fica na prática',
    sub: 'Espaço reservado para prints do app. Troque os arquivos em public/screenshots/ quando tiver capturas reais.',
    items: [
      {
        title: 'Tráfego ao vivo',
        caption: 'Lista de requests e responses passando pelo proxy.',
        file: 'traffic.svg',
      },
      {
        title: 'Editor de mock',
        caption: 'Regras de match no request e resposta montada lado a lado.',
        file: 'mock-editor.svg',
      },
      {
        title: 'Ambiente e rotas',
        caption: 'Portas, rotas e modos (mock, modificar, passthrough).',
        file: 'routes.svg',
      },
    ],
    placeholderHint:
      'Placeholders SVG em public/screenshots/. Troque por PNG/WebP reais e atualize o nome do arquivo em messages.ts.',
  },
  features: {
    title: 'Também faz parte do app',
    sub: 'Recursos que complementam o mock de request + response.',
    items: [
      {
        title: 'MockServer local',
        body: 'Inicie e pare o MockServer na sua máquina. Porta 1080 por padrão, runtime embutido, zero nuvem.',
      },
      {
        title: 'Três modos de rota',
        body: 'Mock response, modificar + encaminhar, ou passthrough. Combine tudo no mesmo ambiente.',
      },
      {
        title: 'Ambientes em JSON',
        body: 'Salve portas, proxies e rotas em ~/.mockforge. Exporte e compartilhe com o time.',
      },
      {
        title: 'Túnel ADB Android',
        body: 'Reverse de localhost no device para o celular físico falar com o MockForge sem gambiarra de Wi‑Fi.',
      },
      {
        title: 'Espelho do device',
        body: 'Veja a tela Android ao lado do tráfego. Capture screenshots e gravações enquanto debuga.',
      },
      {
        title: 'Sessões e comparação',
        body: 'Grave fluxos, renomeie e compare duas sessões para achar regressões no tráfego de API.',
      },
      {
        title: 'MCP para assistentes de IA',
        body: 'Conecte Cursor e outros clientes MCP para ler ambientes, sessões e comparações.',
      },
    ],
  },
  how: {
    title: 'Do zero ao mock em minutos',
    sub: 'Sem cadastro. Instale, inicie, aponte o app.',
    steps: [
      {
        title: 'Instale',
        body: 'Baixe o instalador Windows (.exe) ou o DMG do macOS. No Apple Silicon também dá para usar Homebrew.',
      },
      {
        title: 'Inicie o servidor',
        body: 'Clique em Start no header. O MockForge escuta na porta escolhida e mostra URLs local, emulador e LAN.',
      },
      {
        title: 'Capture e moca request + response',
        body: 'Envie tráfego do app, escolha uma chamada, defina o match do request e a response — e itere até encaixar.',
      },
    ],
  },
  download: {
    title: 'Baixe o MockForge',
    sub: 'Instaladores diretos das GitHub Releases (Windows e macOS). O botão Atualizar no app usa a mesma fonte.',
    windows: 'Windows (setup.exe)',
    mac: 'macOS (.dmg)',
    brew: 'Instalar com Homebrew',
    brewHint: 'Apple Silicon. Ideal se você quiser atualizar com um comando.',
    gatekeeper:
      'Builds de macOS não são notarizadas. Se o Gatekeeper bloquear, clique com o botão direito → Abrir, ou libere em Privacidade e Segurança.',
    allReleases: 'Ver releases no GitHub',
    detecting: 'Detectando seu sistema…',
    recommended: 'Recomendado para este dispositivo',
    copied: 'Copiado',
  },
  openSource: {
    title: 'Open source, licença MIT',
    body: 'Leia o código, abra issues e contribua. O MockForge continua offline-first e sem conta.',
    cta: 'Ver no GitHub',
  },
  footer: {
    rights: 'MockForge',
    mit: 'Licença MIT',
  },
};
