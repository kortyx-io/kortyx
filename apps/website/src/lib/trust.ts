// Confirm these details and review the notices before publishing this foundation.
// A proposed company name is not the identity of the current website operator.
export const providerIdentity = {
  brand: "Kortyx",
  operatorName: null,
  contactAddress: null,
  contactEmail: null,
  registrationNumber: null,
  taxNumber: null,
} as const;

export const legalPublicationReady = false;
export const trustContentUpdated = "2026-10-04";
export const cloudAvailability = "In development";

type TrustSection = {
  id: string;
  title: string;
  paragraphs: string[];
  links?: { label: string; href: string }[];
};

type TrustPageContent = {
  title: string;
  label: string;
  description: string;
  eyebrow: string;
  isLegal?: boolean;
  cards?: { label: string; title: string; description: string; href: string }[];
  sections: TrustSection[];
};

export const trustPages = {
  about: {
    title: "Built for developers. Accountable by design.",
    label: "About",
    eyebrow: "About Kortyx",
    description:
      "Kortyx is a TypeScript framework for building agent applications with explicit workflows, persisted runs, human approval, and streamed React state.",
    cards: [
      {
        label: "Available today",
        title: "Build on your infrastructure",
        description:
          "Run the open-source framework on your infrastructure. Add the self-hosted Studio preview for visibility into your runs.",
        href: "/open-source",
      },
      {
        label: "In development",
        title: "Kortyx Cloud",
        description:
          "The hosted offering is being prepared. Cloud availability, service terms, and data-processing details will be published before access opens.",
        href: "/security#cloud",
      },
    ],
    sections: [
      {
        id: "approach",
        title: "Software you can inspect",
        paragraphs: [
          "Agent applications need more than a model call. Kortyx makes workflows, runtime state, persistence, and human decisions explicit so developers can understand how their application behaves.",
          "The framework is Apache-2.0 licensed. Studio uses the Elastic License 2.0. The source, documentation, and release history are public; the repository’s license files define the terms for each component.",
        ],
        links: [
          { label: "Explore the documentation", href: "/docs" },
          {
            label: "Source and releases",
            href: "https://github.com/kortyx-io/kortyx/releases",
          },
        ],
      },
      {
        id: "company",
        title: "A clear stage of development",
        paragraphs: [
          "Kortyx is the project and product brand. Operator information and the applicable website notices are collected in our legal section.",
          "Explore the available framework, inspect the self-hosted Studio preview, and follow the development of Kortyx Cloud through our documentation and release history.",
        ],
        links: [{ label: "Legal information", href: "/legal" }],
      },
    ],
  },
  contact: {
    title: "A clear route to the right conversation.",
    label: "Contact",
    eyebrow: "Contact Kortyx",
    description:
      "Find the right channel for product questions, bug reports, and private vulnerability reports.",
    cards: [
      {
        label: "Product & community",
        title: "Ask a question",
        description:
          "Discuss the framework, integrations, and use cases with the project community. These conversations are public.",
        href: "https://github.com/kortyx-io/kortyx/discussions",
      },
      {
        label: "Security",
        title: "Report a vulnerability privately",
        description:
          "Share vulnerability details securely through GitHub’s private reporting route.",
        href: "https://github.com/kortyx-io/kortyx/security/advisories/new",
      },
    ],
    sections: [
      {
        id: "technical",
        title: "Technical support",
        paragraphs: [
          "Start with the documentation for installation and configuration. For a reproducible bug, include the affected version, expected behavior, and a minimal example in a GitHub issue.",
          "Share a redacted example with sample data in public project channels. Keep credentials, model keys, and personal or customer information private.",
        ],
        links: [
          { label: "Read the docs", href: "/docs" },
          {
            label: "Report a bug",
            href: "https://github.com/kortyx-io/kortyx/issues/new",
          },
        ],
      },
      {
        id: "private-contact",
        title: "Business, privacy & legal contact",
        paragraphs: [
          "Use a verified private contact route for business, privacy, and legal correspondence. Confirm the operator identity, business contact address, and private email as part of the legal publication review.",
          "Cloud support channels and service commitments will accompany the hosted service launch.",
        ],
        links: [{ label: "Operator information", href: "/legal#operator" }],
      },
    ],
  },
  security: {
    title: "Security starts with clarity.",
    label: "Security & Data",
    eyebrow: "Security & data",
    description:
      "Explore how the Kortyx website handles preferences, how you control your own deployment, and how Cloud preparation is progressing.",
    cards: [
      {
        label: "Self-hosted",
        title: "Your deployment, your controls",
        description:
          "Choose your infrastructure, model providers, credentials, storage, and telemetry configuration. Your deployment processes application data through the services you configure.",
        href: "/docs",
      },
      {
        label: "Cloud · in development",
        title: "Preparing Kortyx Cloud",
        description:
          "Cloud deployment work is in progress. Service details will cover hosting, data handling, support, and the agreements governing the hosted offering.",
        href: "#cloud",
      },
    ],
    sections: [
      {
        id: "website",
        title: "This website",
        paragraphs: [
          "The website provides product information and documentation over HTTPS. Its browser storage supports privacy preferences and your selected theme. Fonts are served directly with the website.",
          "c15t powers privacy settings and stores your preference state locally in your browser. You can review those settings from the website footer.",
        ],
        links: [{ label: "Cookies & browser storage", href: "/cookies" }],
      },
      {
        id: "self-hosted",
        title: "Software you run yourself",
        paragraphs: [
          "Run Kortyx directly in your application. Choose the services and model providers it connects to, and review their terms and data practices.",
          "You remain responsible for securing your deployment, access controls, backups, secrets, and retention. Telemetry can contain prompts, outputs, or other sensitive data depending on your configuration. Review what you collect before enabling it.",
        ],
        links: [
          {
            label: "Self-hosted Studio setup",
            href: "/docs/studio/run-locally",
          },
          { label: "Licensing & open source", href: "/open-source" },
        ],
      },
      {
        id: "cloud",
        title: "Kortyx Cloud: in development",
        paragraphs: [
          "Cloud deployment and readiness work are in progress. Follow product development through the documentation and release history.",
          "Cloud launch information will describe the service operator, hosting locations, subprocessors, model-provider integrations, retention and deletion practices, security controls, service terms, and data-processing agreement.",
        ],
      },
      {
        id: "reporting",
        title: "Responsible vulnerability reporting",
        paragraphs: [
          "Send vulnerability reports through GitHub’s private reporting flow, following the repository security policy. Include affected versions, reproduction steps with sample data, and the impact you observed. Coordinate disclosure privately with the maintainers.",
        ],
        links: [
          {
            label: "Private vulnerability report",
            href: "https://github.com/kortyx-io/kortyx/security/advisories/new",
          },
          {
            label: "Repository security policy",
            href: "https://github.com/kortyx-io/kortyx/security/policy",
          },
        ],
      },
    ],
  },
  privacy: {
    title: "Privacy, explained for this website.",
    label: "Privacy",
    eyebrow: "Website privacy notice",
    isLegal: true,
    description:
      "A draft notice covering this website’s browser preferences, technical delivery, external links, and privacy rights.",
    sections: [
      {
        id: "scope",
        title: "Scope & controller",
        paragraphs: [
          "This draft covers kortyx.io and its documentation. Cloud data processing and self-hosted deployments have their own service-specific scope.",
          "Kortyx is the product brand. The current controller’s identity, contact address, and private contact email must be confirmed before this becomes a published privacy notice.",
        ],
        links: [{ label: "Operator information", href: "/legal#operator" }],
      },
      {
        id: "data",
        title: "What the website processes",
        paragraphs: [
          "Delivering a page involves your IP address and request metadata, such as browser information, requested URLs, and request times. Our hosting and delivery arrangements, any associated logging, and their retention periods must be confirmed in the final notice.",
          "Browser storage is limited to your selected theme and c15t privacy-preference state. The cookies page lists each storage mechanism, its purpose, and its duration.",
          "Where you choose to contact the project through GitHub, GitHub processes the information under its own privacy notice. Use redacted examples and sample data in public issues and discussions, and keep personal or confidential information private.",
        ],
        links: [{ label: "Storage inventory & controls", href: "/cookies" }],
      },
      {
        id: "purposes",
        title: "Purposes, providers & retention",
        paragraphs: [
          "The website uses browser preferences to remember choices you make. Technical request data is necessary to deliver and protect the website. The final notice must specify the applicable legal bases, named service providers, retention periods, and any international-transfer safeguards for the actual deployment.",
          "Website preferences are stored locally in your browser. Future Cloud terms acceptance will use a separate authenticated flow with version-specific records and retention disclosures.",
        ],
      },
      {
        id: "rights",
        title: "Your privacy rights",
        paragraphs: [
          "Depending on applicable law and the processing involved, you may have rights to access, correct or delete personal data, restrict or object to processing, and receive portable data. Where processing relies on consent, you can withdraw it at any time; processing carried out lawfully before withdrawal retains its lawful status.",
          "You may also complain to the competent data-protection authority. Privacy requests belong in a verified private contact channel. Confirm that route as part of this notice’s publication review.",
        ],
        links: [
          { label: "Contact information", href: "/contact#private-contact" },
          {
            label: "Spanish data-protection authority",
            href: "https://www.aepd.es/en",
          },
        ],
      },
      {
        id: "updates",
        title: "Changes to this notice",
        paragraphs: [
          "The page carries a revision date. Changes to data practices require an updated notice and storage inventory. Introducing optional services also requires the applicable user choices and tested consent controls before those services load.",
        ],
      },
    ],
  },
  terms: {
    title: "Clear terms. Clear product boundaries.",
    label: "Website Terms",
    eyebrow: "Website terms",
    isLegal: true,
    description:
      "Draft terms for this informational website. Software licenses and future Cloud service agreements are separate.",
    sections: [
      {
        id: "scope",
        title: "Website scope",
        paragraphs: [
          "These draft terms concern access to product information and documentation on kortyx.io. Cloud subscriptions, support commitments, and data-processing arrangements will be governed by separate service agreements.",
          "The current website operator must be identified and these terms reviewed before publication.",
        ],
        links: [{ label: "Legal information", href: "/legal" }],
      },
      {
        id: "software",
        title: "Software & intellectual property",
        paragraphs: [
          "Software is governed by the license accompanying the relevant package or repository component. The framework is Apache-2.0 licensed; Studio uses the Elastic License 2.0. Review the applicable license before use or redistribution.",
          "Use of the Kortyx name, branding, and website content requires permission from the relevant rights holder. Permissions provided by a software license remain subject to that license.",
        ],
        links: [{ label: "Open-source licensing", href: "/open-source" }],
      },
      {
        id: "conduct",
        title: "Use the website responsibly",
        paragraphs: [
          "Use the website lawfully, respect its availability and security, and access only resources you are authorized to use. Report suspected vulnerabilities privately through the documented reporting channel.",
          "Examples and documentation are development guidance. Evaluate security, accuracy, and suitability for your own application; preview features may change.",
        ],
        links: [{ label: "Security reporting", href: "/security#reporting" }],
      },
      {
        id: "availability",
        title: "Availability & external services",
        paragraphs: [
          "Website content and product descriptions may change. Development and preview labels describe the current stage of a feature; release details accompany its availability.",
          "External services, including GitHub and model providers, operate under their own terms. Kortyx Cloud agreements will identify the services within their scope.",
          "Your mandatory legal rights remain fully applicable. Applicable-law and liability provisions require review against the confirmed operator and intended audience before publication.",
        ],
      },
      {
        id: "cloud-terms",
        title: "Future Cloud terms & updates",
        paragraphs: [
          "Cloud service terms will be published separately before the hosted service opens. Account-level acceptance will identify the exact version accepted, the authenticated accepting user, and the acceptance time.",
          "Website privacy settings manage browser preferences. Cloud service-term acceptance will take place in its own authenticated account flow.",
        ],
      },
    ],
  },
  legal: {
    title: "Who is behind the website.",
    label: "Legal",
    eyebrow: "Legal & operator information",
    isLegal: true,
    description:
      "Kortyx is the product brand. Current operator details require confirmation before publication.",
    sections: [
      {
        id: "operator",
        title: "Operator information",
        paragraphs: [
          "Publish this legal notice with the verified identity of the current website operator, business contact address, and private contact email. Include applicable registration and tax details once verified.",
        ],
      },
      {
        id: "documents",
        title: "Website documents",
        paragraphs: [
          "The privacy notice explains website data practices; the cookies page inventories browser storage; website terms concern the informational site. Cloud service terms and a Cloud data-processing agreement will be separate launch documents.",
        ],
        links: [
          { label: "Privacy notice", href: "/privacy" },
          { label: "Website terms", href: "/terms" },
          { label: "Cookies & storage", href: "/cookies" },
        ],
      },
      {
        id: "licenses",
        title: "Software licenses & third-party services",
        paragraphs: [
          "The framework uses Apache-2.0; Studio uses the Elastic License 2.0. c15t’s Next.js consent package uses Apache-2.0. The applicable source and package license files remain authoritative.",
          "Names of third-party services and technologies belong to their respective owners. Each service’s own documentation describes its products, agreements, and relationships.",
        ],
        links: [
          {
            label: "Repository license overview",
            href: "https://github.com/kortyx-io/kortyx/blob/main/LICENSES.md",
          },
          { label: "Contact routes", href: "/contact" },
        ],
      },
    ],
  },
  cookies: {
    title: "Your browser. Your preferences.",
    label: "Cookies & Storage",
    eyebrow: "Cookies & browser storage",
    isLegal: true,
    description:
      "This draft inventory explains the necessary browser-local storage used for privacy preferences and your selected theme.",
    sections: [
      {
        id: "current-use",
        title: "What is used today",
        paragraphs: [
          "Theme storage remembers the display preference you choose. c15t stores your choices, a browser-local preference identifier, and a timestamp in a cookie and local storage on your device. This preference state remains local to your browser.",
          "A first-visit banner explains this necessary storage. Choosing Got it acknowledges the notice and remembers your browser preferences. Cloud terms acceptance uses a separate account flow. Privacy settings remain available from the footer, including on documentation pages.",
        ],
      },
      {
        id: "controls",
        title: "Change or clear your preferences",
        paragraphs: [
          "Open Privacy settings to review the storage categories currently configured. This website uses only necessary browser storage for the preferences described here.",
          "You can delete cookies and site storage through your browser settings. Clearing local storage also resets the selected theme. Your browser’s storage settings control whether these preferences can persist.",
        ],
      },
      {
        id: "external-services",
        title: "External links are separate",
        paragraphs: [
          "Following a link to GitHub, a model provider, or another external site brings you under that site’s own storage and privacy practices. Review that provider’s notice when visiting its website.",
        ],
      },
      {
        id: "future-changes",
        title: "Before adding optional services",
        paragraphs: [
          "Any future optional analytics, advertising, or embedded service must have a documented purpose and provider, an appropriate consent or opt-out flow, and tested enforcement before it loads. The inventory and privacy notice must be updated at the same time.",
          "Website privacy preferences remain separate from Cloud account terms acceptance and any future server-side acceptance history.",
        ],
        links: [{ label: "Website privacy notice", href: "/privacy" }],
      },
    ],
  },
} satisfies Record<string, TrustPageContent>;

export type TrustPageSlug = keyof typeof trustPages;
export const trustPageSlugs = Object.keys(trustPages) as TrustPageSlug[];

export function isTrustPageSlug(value: string): value is TrustPageSlug {
  return Object.hasOwn(trustPages, value);
}

export function getTrustPage(slug: TrustPageSlug): TrustPageContent {
  return trustPages[slug];
}
