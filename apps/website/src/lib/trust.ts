// Confirm these details and review the notices before publishing this foundation.
// A proposed company name is not the identity of the current website operator.
export const providerIdentity = {
  brand: "Kortyx",
  incorporationStatus: "In formation",
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
          "Use the open-source framework without a Kortyx Cloud account. Add the self-hosted Studio preview when you need a view into your runs.",
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
          "Kortyx is the project and product brand. Company incorporation is in formation. Operator information and the applicable website notices are collected in our legal section.",
          "Our website distinguishes what is available today from what is in development. Security certifications, service-level commitments, and hosted data residency are not claimed unless they have been established and documented.",
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
          "Use GitHub’s private vulnerability reporting route. Do not disclose vulnerabilities in a public issue or discussion.",
        href: "https://github.com/kortyx-io/kortyx/security/advisories/new",
      },
    ],
    sections: [
      {
        id: "technical",
        title: "Technical support",
        paragraphs: [
          "Start with the documentation for installation and configuration. For a reproducible bug, include the affected version, expected behavior, and a minimal example in a GitHub issue.",
          "Remove credentials, model keys, customer data, and other personal information before posting. Public project channels are not a private support inbox.",
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
          "The current operator identity, business contact address, and private contact email still need confirmation before these notices are published. Do not send privacy requests or sensitive information through public GitHub channels.",
          "Cloud support channels and response commitments will be specified when the hosted service opens; the website does not currently promise a response time or service-level agreement.",
        ],
        links: [{ label: "Operator information", href: "/legal#operator" }],
      },
    ],
  },
  security: {
    title: "Know the boundary. Inspect the details.",
    label: "Security & Data",
    eyebrow: "Security & data",
    description:
      "Understand the difference between the Kortyx website, software you run yourself, and the Cloud offering in development.",
    cards: [
      {
        label: "Self-hosted",
        title: "Your deployment, your controls",
        description:
          "You choose your infrastructure, model providers, credentials, storage, and telemetry configuration. Hosting the framework yourself does not make this website the processor of your application data.",
        href: "/docs",
      },
      {
        label: "Cloud · in development",
        title: "Hosted claims need hosted evidence",
        description:
          "Cloud is not represented as generally available. Hosting regions, subprocessors, retention, support, and contractual commitments remain launch disclosures.",
        href: "#cloud",
      },
    ],
    sections: [
      {
        id: "website",
        title: "This website",
        paragraphs: [
          "The website provides product information and documentation over HTTPS. The current implementation has no optional analytics or advertising scripts. Fonts are served with the website rather than fetched from Google Fonts by your browser.",
          "c15t powers browser-local privacy preferences. This website integration does not send consent records to a hosted c15t service or create account-level legal acceptance records.",
        ],
        links: [{ label: "Cookies & browser storage", href: "/cookies" }],
      },
      {
        id: "self-hosted",
        title: "Software you run yourself",
        paragraphs: [
          "Running Kortyx locally does not require a Kortyx Cloud account. Your application connects to the services and model providers you configure; those providers have their own terms and data practices.",
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
          "Cloud deployment and readiness work are in progress. This page is not a Cloud security attestation or an offer of a live hosted service.",
          "Before Cloud opens, its disclosures must identify the service operator, hosting locations, subprocessors and model-provider boundaries, retention and deletion behavior, security controls, and applicable service terms and data-processing agreement.",
          "We do not currently claim SOC 2 certification, ISO 27001 certification, a guaranteed uptime percentage, or established EU-only processing for the hosted offering.",
        ],
      },
      {
        id: "reporting",
        title: "Responsible vulnerability reporting",
        paragraphs: [
          "Send vulnerability reports through GitHub’s private reporting flow, following the repository security policy. Include affected versions, reproduction steps, and the impact you observed. Do not include real customer data or publicly disclose an unpatched issue.",
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
      "A website-specific draft notice covering browser preferences, technical delivery, external links, and privacy rights—not future Cloud customer data processing.",
    sections: [
      {
        id: "scope",
        title: "Scope & controller",
        paragraphs: [
          "This draft covers kortyx.io and its documentation. It does not establish terms for Kortyx Cloud or describe data you process in your own Kortyx deployment.",
          "Kortyx is the product brand; company incorporation is in formation. The current controller’s identity, contact address, and private contact email must be confirmed before this becomes a published privacy notice.",
        ],
        links: [{ label: "Operator information", href: "/legal#operator" }],
      },
      {
        id: "data",
        title: "What the website processes",
        paragraphs: [
          "Delivering a page involves your IP address and request metadata, such as browser information, requested URLs, and request times. Our hosting and delivery arrangements, any associated logging, and their retention periods must be confirmed in the final notice.",
          "The browser can store your selected theme and c15t privacy-preference state. The current website does not include optional analytics, advertising pixels, a newsletter form, or a customer-account signup form.",
          "Where you choose to contact the project through GitHub, GitHub processes the information under its own privacy notice. Public issues and discussions are visible to others; do not submit personal or confidential information there.",
        ],
        links: [{ label: "Storage inventory & controls", href: "/cookies" }],
      },
      {
        id: "purposes",
        title: "Purposes, providers & retention",
        paragraphs: [
          "The website uses browser preferences to remember choices you make. Technical request data is necessary to deliver and protect the website. The final notice must specify the applicable legal bases, named service providers, retention periods, and any international-transfer safeguards for the actual deployment.",
          "Browser-local preferences are not a durable server-side audit history. Future Cloud terms acceptance will be a separate authenticated flow with its own records and retention disclosures.",
        ],
      },
      {
        id: "rights",
        title: "Your privacy rights",
        paragraphs: [
          "Depending on applicable law and the processing involved, you may have rights to access, correct or delete personal data, restrict or object to processing, and receive portable data. Where processing relies on consent, you can withdraw it without affecting the lawfulness of prior processing.",
          "You may also complain to the competent data-protection authority. A private contact route for exercising these rights must be confirmed before publication; public GitHub channels should not be used for these requests.",
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
          "The page carries a revision date. If data practices change, the notice and storage inventory must change with them. Optional tracking cannot be added merely because a privacy-settings interface already exists.",
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
        title: "This website, not a Cloud contract",
        paragraphs: [
          "These draft terms concern access to product information and documentation on kortyx.io. They do not create a Cloud subscription, service-level agreement, support contract, or data-processing agreement.",
          "The current website operator must be identified and these terms reviewed before publication. Company incorporation is in formation.",
        ],
        links: [{ label: "Legal information", href: "/legal" }],
      },
      {
        id: "software",
        title: "Software & intellectual property",
        paragraphs: [
          "Software is governed by the license accompanying the relevant package or repository component—not by these website terms. The framework is Apache-2.0 licensed; Studio uses the Elastic License 2.0. Review the applicable license before use or redistribution.",
          "Rights in the Kortyx name, branding, and website content are not granted merely by visiting the website. Any permissions provided by a software license remain subject to that license.",
        ],
        links: [{ label: "Open-source licensing", href: "/open-source" }],
      },
      {
        id: "conduct",
        title: "Use the website responsibly",
        paragraphs: [
          "Do not misuse the website, disrupt its operation, distribute malicious content, or attempt unauthorized access. Report suspected vulnerabilities privately through the documented reporting channel.",
          "Examples and documentation are development guidance. Evaluate security, accuracy, and suitability for your own application; preview features may change.",
        ],
        links: [{ label: "Security reporting", href: "/security#reporting" }],
      },
      {
        id: "availability",
        title: "Availability & external services",
        paragraphs: [
          "Website content and product descriptions may change. Features marked in development or preview are not promises of a release date or production availability.",
          "External services, including GitHub and model providers, have their own terms. Linking to them does not make their services part of a Kortyx Cloud contract.",
          "Nothing in these draft terms is intended to exclude rights or liability that cannot lawfully be excluded. Applicable-law and liability provisions require review against the confirmed operator and intended audience before publication.",
        ],
      },
      {
        id: "cloud-terms",
        title: "Future Cloud terms & updates",
        paragraphs: [
          "Cloud service terms will be published separately before the hosted service opens. Account-level acceptance will identify the exact version accepted, the authenticated accepting user, and the acceptance time.",
          "Cookie preferences do not constitute acceptance of service terms. The current website privacy-settings integration does not collect Cloud terms acceptance records.",
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
      "Kortyx is the product brand. Company incorporation is in formation; current operator details require confirmation before publication.",
    sections: [
      {
        id: "operator",
        title: "Operator information",
        paragraphs: [
          "A future company name does not identify the person or entity currently responsible for this website. The operator name, contact address, and private email must be supplied before this legal notice is published.",
          "No registration number or tax number is represented as issued. The proposed form or name of a future company is not a claim that a company has been incorporated.",
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
          "Names of third-party services and technologies belong to their respective owners. References do not imply endorsement, certification, or an affiliation.",
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
      "The current website has no optional analytics or advertising scripts. This draft inventory explains the browser-local preferences used by the site.",
    sections: [
      {
        id: "current-use",
        title: "What is used today",
        paragraphs: [
          "Theme storage remembers a display preference you choose. c15t can store your choices, a browser-local preference identifier, and a timestamp in a cookie and local storage on your device. We do not currently use that state to enable optional trackers or send it to a consent backend.",
          "There is no automatic first-visit cookie banner because the current site has no optional tracking to accept or reject. Privacy settings remain available from the footer, including on documentation pages.",
        ],
      },
      {
        id: "controls",
        title: "Change or clear your preferences",
        paragraphs: [
          "Open Privacy settings to review the categories currently configured. Only necessary storage is listed; there are no analytics or marketing switches for nonexistent services.",
          "You can delete cookies and site storage through your browser settings. Clearing local storage also resets the selected theme. Blocking storage may prevent preferences from persisting, but does not enable optional tracking.",
        ],
      },
      {
        id: "external-services",
        title: "External links are separate",
        paragraphs: [
          "Following a link to GitHub, a model provider, or another external site brings you under that site’s own storage and privacy practices. Links alone do not embed those sites’ tracking scripts here.",
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
