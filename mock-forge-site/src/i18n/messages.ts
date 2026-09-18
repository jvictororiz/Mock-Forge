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
    title: 'MockForge — Mock server visual para APIs e apps mobile',
    description:
      'Simule APIs no seu computador: intercepte o tráfego, configure regras de request e respostas completas. Offline, open source e sem cadastro.',
  },
  nav: {
    product: 'Visão geral',
    features: 'Recursos',
    how: 'Como funciona',
    screenshots: 'Interface',
    download: 'Download',
    github: 'GitHub',
  },
  hero: {
    brand: 'MockForge',
    headline: 'Simule APIs com controle total do tráfego.',
    sub: 'Um mock server visual para desenvolvimento. Intercepte chamadas HTTP, combine regras de request com respostas personalizadas e teste seu app mobile ou cliente sem depender do backend.',
    ctaPrimary: 'Baixar agora',
    ctaSecondary: 'Conhecer o produto',
  },
  product: {
    title: 'Do tráfego real ao mock em poucos cliques',
    sub: 'Veja as requisições ao vivo, configure quando o mock deve responder e defina exatamente o que volta — status, headers e body.',
    points: [
      {
        title: 'Inspeção em tempo real',
        body: 'Acompanhe método, path, headers e body enquanto o app ou o cliente HTTP conversa com o MockForge.',
      },
      {
        title: 'Regras de matching',
        body: 'Combine path, query, headers e campos do body para o mock entrar em ação só quando a chamada fizer sentido.',
      },
      {
        title: 'Respostas sob medida',
        body: 'Monte a resposta a partir de uma chamada capturada, com templates, variantes e edição completa do payload.',
      },
    ],
  },
  screenshots: {
    title: 'Interface pensada para o dia a dia',
    sub: 'Tráfego, editor de mocks e ambientes no mesmo lugar — pronto para o fluxo de desenvolvimento.',
    items: [
      {
        title: 'Monitor de tráfego',
        caption: 'Visualize requisições e respostas que passam pelo proxy.',
        file: 'traffic.svg',
      },
      {
        title: 'Editor de mocks',
        caption: 'Ajuste matching e payload da resposta lado a lado.',
        file: 'mock-editor.svg',
      },
      {
        title: 'Ambientes e rotas',
        caption: 'Organize portas, proxies e modos de encaminhamento.',
        file: 'routes.svg',
      },
    ],
    placeholderHint: '',
  },
  features: {
    title: 'Tudo o que você precisa no fluxo de mock',
    sub: 'Além da captura e do editor, o MockForge cobre o restante do ciclo de desenvolvimento local.',
    items: [
      {
        title: 'MockServer embutido',
        body: 'Suba e pare o servidor local com um clique. Runtime incluso, porta configurável, sem depender de nuvem.',
      },
      {
        title: 'Modos de rota flexíveis',
        body: 'Resposta mockada, alteração + encaminhamento ou passthrough — combine no mesmo ambiente.',
      },
      {
        title: 'Ambientes versionáveis',
        body: 'Salve configurações em JSON, exporte e compartilhe com o time sem fricção.',
      },
      {
        title: 'Integração com Android',
        body: 'Túnel ADB para devices físicos e emuladores, com URLs prontas para colar no app.',
      },
      {
        title: 'Espelho de tela',
        body: 'Acompanhe o device Android ao lado do tráfego, com captura de tela e gravação.',
      },
      {
        title: 'Histórico e comparação',
        body: 'Grave sessões de tráfego e compare fluxos para detectar mudanças nas APIs.',
      },
      {
        title: 'Pronto para IA (MCP)',
        body: 'Conecte assistentes compatíveis com MCP para consultar ambientes, sessões e diffs.',
      },
    ],
  },
  how: {
    title: 'Comece em três passos',
    sub: 'Sem cadastro e sem configuração pesada. Instale, aponte o app e comece a simular.',
    steps: [
      {
        title: 'Instale',
        body: 'Baixe o instalador para Windows ou macOS. No Apple Silicon, também há opção via Homebrew.',
      },
      {
        title: 'Inicie o servidor',
        body: 'Abra o MockForge, escolha a porta e inicie. Use as URLs locais, de emulador ou da rede.',
      },
      {
        title: 'Capture e simule',
        body: 'Envie tráfego do seu app, selecione uma chamada e transforme em mock — refine matching e resposta até ficar pronto.',
      },
    ],
  },
  download: {
    title: 'Download',
    sub: 'Instaladores para Windows e macOS. Atualizações pelo próprio app usam a mesma fonte.',
    windows: 'Windows',
    mac: 'macOS',
    brew: 'Copiar comando Homebrew',
    brewHint: 'Disponível para Apple Silicon:',
    gatekeeper:
      'No macOS, se o sistema bloquear a abertura, use Abrir com o botão direito ou permita em Privacidade e Segurança. O app ainda não é notarizado pela Apple.',
    allReleases: 'Todas as versões no GitHub',
    detecting: 'Identificando seu sistema…',
    recommended: 'Sugerido para este dispositivo',
    copied: 'Copiado',
  },
  openSource: {
    title: 'Código aberto',
    body: 'MockForge é MIT: use, contribua e adapte. Sem conta, sem telemetria obrigatória e com controle total na sua máquina.',
    cta: 'Repositório no GitHub',
  },
  footer: {
    rights: 'MockForge',
    mit: 'Licença MIT',
  },
};
