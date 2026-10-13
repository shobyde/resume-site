/* ============================================================
   Resume data - the single source of truth for page content
   ============================================================ */
export const DATA = {
  hero: {
    tag: 'Software engineer · PNW',
    name: 'Sho Byde',
    role: 'Building <span class="accent">APIs, cloud systems & client-facing apps</span> for 12+ years – now teaching machines and mentoring humans.',
  },
  about: {
    p1: `I've spent <strong>over 12 years</strong> in software and web development, working primarily in Agile environments across Node.js, Express, Next.js, Vite, and Yii - with deep fluency in JavaScript, PHP, Python, Terraform, C#, and MySQL.`,
    p2: `My track record includes <strong>leading projects</strong>, shipping client-facing applications, implementing OAuth/RBAC authentication at scale, and building large-scale APIs. I care just as much about the people: fostering positive workplace culture, mentoring, and contributing to team life.`,
    p3: `Outside of work I taught an intro computer science class at a local high school - before my regular workday, every day, for a full school year.`,
  },
  stats: [
    { num: 12, suffix: '+', label: 'Years in software' },
    { num: 5, suffix: '', label: 'Languages shipped in prod' },
    { num: 3, suffix: '/4', label: 'Game design awards won' },
    { num: 1, suffix: 'yr', label: 'Volunteer CS teaching' },
  ],
  experience: [
    {
      role: 'Software Development Engineer 1-3 / Engineering Manager (IC)',
      org: 'Conversica',
      period: 'Jul 2021 - Present',
      bullets: [
        'Collaborated with product teams to distribute tickets and create technical designs for client-facing changes.',
        'Part of a dedicated team resolving customer escalations, directly interacting with customer support and account managers.',
        'Developed tools for identifying and troubleshooting customer escalations.',
        'Implemented OAuth and deployed authentication for client-facing and backend APIs using API Gateway and Auth0.',
        'Updated and streamlined new hire engineering onboarding procedures, reducing spin-up time and friction.',
        'Maintained and updated AWS Redshift data warehouse and API implementation for client-based reporting.',
        'Partnered with UI and backend teams to implement backend-for-frontend practices, enhancing UI team maneuverability.',
        'Oversaw SMS sending operations and ensured compliance with regulatory requirements.',
      ],
    },
    {
      role: 'Volunteer Teacher - Intro to Computer Science',
      org: 'a local high school',
      period: 'Sep 2022 - Jun 2023',
      bullets: [
        'Taught an introductory computer science class during the first period (7:30–8:25) before my regular workday.',
        'Collaborated with IT to install and set up VS Code and configure firewall rules, enabling student access in a rural community.',
        'Instructed young adults with no prior coding experience on writing programs and project planning.',
        'Promoted refactoring and upfront consideration of design patterns.',
        'Created an inclusive learning environment by sharing my screen while coding, demonstrating that mistakes are part of the learning process.',
        'Employed active learning techniques to identify loops and bugs, using state machine demonstrations in class.',
      ],
    },
    {
      role: 'Software Developer',
      org: 'Intuli',
      period: 'Aug 2014 - Jul 2021',
      bullets: [
        'Managed and oversaw a small group of junior developers. Assigning work packages, providing quality assurance procedures, and assisting in projects when needed.',
        'Interfaced with multi-million dollar companies. Doing support or service requests when needed, and accommodating product alterations in production systems.',
        'Overseeing databases, and doing routine maintenance in SQL, and Windows Server machines.',
        'Creating both web applications, and desktop based solutions to ensure client satisfaction.',
        'Transfering core technologies to cloud based solutions allowing for easier distribution and growth to our company.',
        'Training outside developers to use developer tools, and providing support for best techniques.',
      ],
    },
    {
      role: 'Game Developer',
      org: 'DigiPen (Sno-Isle)',
      period: 'Sep 2012 - Jun 2013',
      bullets: [
        'Created physics based engines in C++.',
        'Interfaced with large groups of developers, and provided feedback on products.',
        'Produced quality outcomes, winning 3 of the 4 game design awards throughout the year.',
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
