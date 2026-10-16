/* ============================================================
   Resume data - the single source of truth for page content.
   Only facts that exist on the résumé: do not invent metrics,
   employers, links, or outcomes here.
   ============================================================ */
export const DATA = {
  hero: {
    name: 'Sho Byde',
    tag: 'SHO BYDE // SOFTWARE ENGINEER — PNW',
    headline: 'I build software that solves <span class="accent">real problems</span>.',
    headlineText: 'I build software that solves real problems.',
    role: `Engineering manager and individual contributor with <strong>12+ years</strong> building APIs, cloud systems, and client-facing applications — now teaching machines and mentoring humans.`,
  },
  about: {
    p1: `I've spent <strong>over 12 years</strong> in software and web development, working primarily in Agile environments across Node.js, Express, Next.js, Vite, and Yii — with deep fluency in JavaScript, PHP, Python, Terraform, C#, and MySQL.`,
    p2: `My track record includes <strong>leading projects</strong>, shipping client-facing applications, implementing OAuth/RBAC authentication at scale, and building large-scale APIs. I care just as much about the people: fostering positive workplace culture, mentoring, and contributing to team life.`,
    p3: `Outside of work I taught an intro computer science class at a local high school — before my regular workday, every day, for a full school year.`,
  },
  stats: [
    { num: 12, suffix: '+', label: 'Years in development' },
    { num: 5, suffix: '+', label: 'Languages shipped in production' },
    { num: 1, suffix: '', label: 'Year of volunteer teaching' },
    { text: '∞', label: 'Tokens spent so you don’t have to' },
  ],
  projects: [
    {
      meta: ['PERSONAL PRODUCT', 'MACOS + LINUX · ALPHA'],
      title: 'Hobnob — private meeting notes, no cloud required',
      summary: `Meeting note-takers ship your conversations to someone else's server. I built <strong>Hobnob</strong> to prove you don't need that: a desktop app that records, transcribes, and summarizes meetings <strong>entirely on-device</strong> — no accounts, no cloud, no telemetry.`,
      contribution: 'Product and engineering: on-device ML pipeline, app architecture, packaging across macOS and Linux, and the hobnob.info site.',
      stack: ['Whisper (large-v3-turbo)', 'Local GGUF LLMs', 'Live captions', 'macOS (Apple Silicon)', 'Linux (AppImage / .deb / .pacman)'],
      links: [
        { label: 'Visit hobnob.info', url: 'https://hobnob.info/' },
        { label: 'Source & releases', url: 'https://github.com/emberscribe/hobnob' },
      ],
      details: {
        architecture: 'Microphone and system audio are captured locally and streamed through a Whisper pass for real-time captions with speaker labels; after the meeting a high-accuracy large-v3-turbo pass produces the final transcript, which a bundled, user-swappable GGUF LLM turns into structured notes (decisions, action items, open questions) and answers chat questions from — nothing leaves the machine at any step.',
        decisions: [
          'Privacy-first by construction: speaker labels are derived from mic-vs-system audio levels instead of any cloud diarization, and calendar integration (macOS + Google) only pulls titles locally.',
          'BYOM — bring your own model: users swap Whisper models and pick their own GGUF LLM, trading accuracy against the ~8 GB RAM/disk budget on the spot.',
          'Shipped a 1.0 on macOS arm64 and Linux in the same week, then iterated 11 alpha releases (v1.0.1 → v1.6.1) from June to September 2026.',
        ],
      },
    },
    {
      meta: ['PERSONAL PROJECT', 'LIVE'],
      title: 'shobyde.com — resume + daily engineering log',
      summary: `A personal site that publishes like a newsroom: I wanted a résumé that stays alive instead of rotting, so I built an <strong>LLM-assisted publishing loop</strong> — automated agents draft daily entries and site updates, a human (me) reviews, curates, and merges every change.`,
      contribution: 'Sole engineer: design, architecture, implementation, and deployment.',
      stack: ['Vite', 'Vanilla JS', 'Three.js (WebGL)', 'Lenis', 'Cloudflare Pages', 'LLM agent tooling'],
      links: [
        { label: 'Visit site', url: 'https://shobyde.com/' },
        { label: 'Case study: how it was built', url: '/posts/2026-10-13-site-kickoff/' },
      ],
      details: {
        architecture: 'Static Vite build deployed to Cloudflare Pages. The daily log is a content store (markdown + a generated index.json) that the client fetches at runtime — writing never requires a redeploy of logic. A WebGL starfield, scroll-reveals, and a streaming-text engine run the page; every animated subsystem is gated on prefers-reduced-motion and the page stays fully readable with JavaScript disabled.',
        decisions: [
          'No framework, no animation library — Three.js is the only heavy dependency, justified by the background scene; everything else is CSS transitions + IntersectionObserver.',
          'Human-in-the-loop publishing: machine-drafted posts only go live after manual curation, so the log stays trustworthy.',
          'Boot is timeout-capped (fonts 2.5 s, content 3 s, loader failsafe 4 s) so a slow network can never strand the visitor on a loading screen.',
        ],
        diagram: { src: '/assets/diagrams/stack.svg', alt: 'Tech stack diagram: content pipeline, build, and hosting layers of this site' },
      },
    },
    {
      meta: ['COURSEWORK · DIGIPEN', '2012–2013'],
      title: 'C++ physics simulation engines',
      summary: `Built physics-based game engines in C++ as part of the DigiPen game-development program — the ground floor of a year that ended with our cohort taking <strong>3 of the 4 game design awards</strong>.`,
      contribution: 'Engine implementation plus cross-team feedback loops with large groups of developers.',
      stack: ['C++', 'Physics simulation', 'Game design'],
      links: [],
      details: {
        architecture: 'Custom simulation loop with collision response and constraint handling, written from scratch in C++.',
        decisions: [
          'Engines were built from first principles rather than middleware, to learn the math underneath.',
          'Regular cross-team review sessions — giving and receiving product feedback at scale.',
        ],
      },
    },
  ],
  experience: [
    {
      role: 'Software Development Engineer 1–3 / Engineering Manager (IC)',
      org: 'Conversica',
      period: 'Jul 2021 – Present',
      bullets: [
        'Collaborated with product teams to distribute tickets and create technical designs for client-facing changes.',
        'Resolved customer escalations on a dedicated team, working directly with customer support and account managers.',
        'Built tooling to identify and troubleshoot customer escalations faster.',
        'Implemented OAuth authentication for client-facing and backend APIs using AWS API Gateway and Auth0.',
        'Streamlined new-hire engineering onboarding, reducing spin-up time and friction.',
        'Maintained the AWS Redshift data warehouse and its API layer for client-facing reporting.',
        'Partnered with UI and backend teams to implement backend-for-frontend (BFF) patterns, increasing UI team maneuverability.',
        'Owned SMS sending operations and kept them compliant with telecom regulatory requirements.',
      ],
    },
    {
      role: 'Volunteer Teacher — Intro to Computer Science',
      org: 'Local high school',
      period: 'Sep 2022 – Jun 2023',
      bullets: [
        'Taught an introductory CS class first period (7:30–8:25), before my regular workday, for a full school year.',
        'Partnered with IT to install VS Code and configure firewall rules, giving students in a rural community real coding access.',
        'Instructed students with no prior experience in writing programs and planning projects.',
        'Promoted refactoring and upfront consideration of design patterns.',
        'Built an inclusive environment by live-coding with my screen shared — demonstrating that mistakes are part of the process.',
        'Used active-learning techniques — state-machine demos, bug hunts — to teach loop and flow reasoning.',
      ],
    },
    {
      role: 'Software Developer',
      org: 'Intuli',
      period: 'Aug 2014 – Jul 2021',
      bullets: [
        'Led a small group of junior developers: assigned work packages, ran QA procedures, and stepped in on projects when needed.',
        'Supported multi-million-dollar client accounts — handling service requests and product alterations in live production systems.',
        'Administered databases and performed routine maintenance in SQL and on Windows Server.',
        'Delivered both web applications and desktop solutions to keep clients served on whichever platform fit them.',
        'Migrated core technologies to cloud-based solutions, easing distribution and company growth.',
        'Trained external developers on internal tooling and best practices, and supported them ongoing.',
      ],
    },
    {
      role: 'Game Developer',
      org: 'DigiPen (Sno-Isle)',
      period: 'Sep 2012 – Jun 2013',
      bullets: [
        'Created physics-based engines in C++.',
        'Collaborated with large groups of developers and provided product feedback.',
        'Won 3 of the 4 game design awards offered throughout the year.',
      ],
    },
  ],
  skills: [
    { group: 'Cloud & Infra', tags: ['AWS Lambda', 'AWS EC2', 'AWS DynamoDB', 'AWS API Gateway', 'AWS Redshift', 'Terraform'] },
    { group: 'Backend', tags: ['Python', 'Node.js', 'Express', 'PHP', 'Yii', 'C#', 'VB.net', 'C++', 'REST APIs', 'OAuth / RBAC', 'Auth0'] },
    { group: 'Frontend', tags: ['JavaScript', 'HTML', 'CSS', 'jQuery', 'Next.js', 'Vite', 'React Three Fiber', 'Three.js'] },
    { group: 'Data', tags: ['MySQL', 'T-SQL', 'SQL maintenance', 'Windows Server'] },
    { group: 'Practice', tags: ['Agile', 'Project Management', 'QA', 'Mentoring', 'BFF patterns'] },
    { group: 'Other', tags: ['Game Dev (C++ physics)', 'IMS/SMS compliance', 'Client-facing apps'] },
  ],
  contact: {
    email: 'shobyde@gmail.com',
    linkedin: 'https://www.linkedin.com/in/sho-byde-556954138/',
  },
};
