// Reference data for a fresh database. Contains no secrets and no articles.
// Every feed URL below was checked for a valid response on 2026-11-01 unless marked otherwise.

export const categories = [
  {
    slug: "ai",
    name: "AI News",
    section: "AI",
    desk: "AI",
    sortOrder: 1,
    description:
      "Model releases, research, policy and the companies building artificial intelligence.",
  },
  {
    slug: "technology",
    name: "Technology",
    section: "TECHNOLOGY",
    desk: "AI",
    sortOrder: 2,
    description: "Chips, cloud, devices and the wider technology industry.",
  },
  {
    slug: "markets",
    name: "Indian Markets",
    section: "MARKETS",
    desk: "MARKETS",
    sortOrder: 3,
    description:
      "NSE and BSE, RBI and SEBI, corporate results and the forces moving Indian equities.",
  },
  {
    slug: "ipo",
    name: "IPO",
    section: "IPO",
    desk: "MARKETS",
    sortOrder: 4,
    description: "Draft papers, approvals, subscriptions and listings in India's primary market.",
  },
] as const;

export const authors = [
  {
    slug: "ai-desk",
    name: "The Daily Circuit AI Desk",
    role: "Automated news desk",
    isAutomated: true,
    bio: "Articles under this byline are researched and drafted by an automated system using Anthropic's Claude models, working only from the sources linked in each story. Automated checks verify sourcing, dates and claims before publication, and stories that fail them are held for an editor.",
  },
  {
    slug: "markets-desk",
    name: "The Daily Circuit Markets Desk",
    role: "Automated markets desk",
    isAutomated: true,
    bio: "Articles under this byline are researched and drafted by an automated system using Anthropic's Claude models from exchange, regulator and company disclosures. They report facts and context only and never give investment advice. Anything that could read as a recommendation is held for an editor.",
  },
] as const;

type SeedSource = {
  slug: string;
  name: string;
  kind: "OFFICIAL" | "COMPANY" | "REGULATOR" | "EXCHANGE" | "PUBLISHER" | "WIRE";
  desk: "AI" | "MARKETS";
  feedUrl: string;
  homepageUrl: string;
  reliability: number;
  isEnabled: boolean;
  requiresLicenseReview: boolean;
  maxItemsPerFetch?: number;
  termsNote: string;
};

const PUBLISHER_NOTE =
  "Third-party publisher. Only the headline, feed summary and link are used as a discovery signal; articles are written from facts and always link back. Confirm the publisher's feed terms permit this commercial use.";

export const sources: SeedSource[] = [
  // ── AI desk: primary company sources
  { slug: "openai-news", name: "OpenAI", kind: "COMPANY", desk: "AI", feedUrl: "https://openai.com/news/rss.xml", homepageUrl: "https://openai.com/news/", reliability: 0.9, isEnabled: true, requiresLicenseReview: false, maxItemsPerFetch: 40, termsNote: "Official company newsroom feed." },
  { slug: "google-deepmind", name: "Google DeepMind", kind: "COMPANY", desk: "AI", feedUrl: "https://deepmind.google/blog/rss.xml", homepageUrl: "https://deepmind.google/discover/blog/", reliability: 0.9, isEnabled: true, requiresLicenseReview: false, maxItemsPerFetch: 30, termsNote: "Official company blog feed." },
  { slug: "google-ai", name: "Google AI", kind: "COMPANY", desk: "AI", feedUrl: "https://blog.google/technology/ai/rss/", homepageUrl: "https://blog.google/technology/ai/", reliability: 0.85, isEnabled: true, requiresLicenseReview: false, termsNote: "Official company blog feed." },
  { slug: "microsoft-blog", name: "Microsoft", kind: "COMPANY", desk: "AI", feedUrl: "https://blogs.microsoft.com/feed/", homepageUrl: "https://blogs.microsoft.com/", reliability: 0.85, isEnabled: true, requiresLicenseReview: false, termsNote: "Official company blog feed." },
  { slug: "microsoft-source-ai", name: "Microsoft Source", kind: "COMPANY", desk: "AI", feedUrl: "https://news.microsoft.com/source/topics/ai/feed/", homepageUrl: "https://news.microsoft.com/source/topics/ai/", reliability: 0.85, isEnabled: true, requiresLicenseReview: false, termsNote: "Official company newsroom feed." },
  { slug: "nvidia-blog", name: "NVIDIA", kind: "COMPANY", desk: "AI", feedUrl: "https://blogs.nvidia.com/feed/", homepageUrl: "https://blogs.nvidia.com/", reliability: 0.85, isEnabled: true, requiresLicenseReview: false, termsNote: "Official company blog feed." },
  { slug: "hugging-face", name: "Hugging Face", kind: "COMPANY", desk: "AI", feedUrl: "https://huggingface.co/blog/feed.xml", homepageUrl: "https://huggingface.co/blog", reliability: 0.8, isEnabled: true, requiresLicenseReview: false, maxItemsPerFetch: 30, termsNote: "Official company blog feed." },
  // ── AI desk: technology publishers
  { slug: "techcrunch-ai", name: "TechCrunch", kind: "PUBLISHER", desk: "AI", feedUrl: "https://techcrunch.com/category/artificial-intelligence/feed/", homepageUrl: "https://techcrunch.com/category/artificial-intelligence/", reliability: 0.8, isEnabled: true, requiresLicenseReview: true, termsNote: PUBLISHER_NOTE },
  { slug: "mit-technology-review-ai", name: "MIT Technology Review", kind: "PUBLISHER", desk: "AI", feedUrl: "https://www.technologyreview.com/topic/artificial-intelligence/feed", homepageUrl: "https://www.technologyreview.com/topic/artificial-intelligence/", reliability: 0.85, isEnabled: true, requiresLicenseReview: true, termsNote: PUBLISHER_NOTE },
  { slug: "the-verge-ai", name: "The Verge", kind: "PUBLISHER", desk: "AI", feedUrl: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", homepageUrl: "https://www.theverge.com/ai-artificial-intelligence", reliability: 0.75, isEnabled: true, requiresLicenseReview: true, termsNote: PUBLISHER_NOTE },
  { slug: "ars-technica", name: "Ars Technica", kind: "PUBLISHER", desk: "AI", feedUrl: "https://feeds.arstechnica.com/arstechnica/technology-lab", homepageUrl: "https://arstechnica.com/", reliability: 0.8, isEnabled: true, requiresLicenseReview: true, termsNote: PUBLISHER_NOTE },
  { slug: "wired-ai", name: "WIRED", kind: "PUBLISHER", desk: "AI", feedUrl: "https://www.wired.com/feed/tag/ai/latest/rss", homepageUrl: "https://www.wired.com/tag/artificial-intelligence/", reliability: 0.75, isEnabled: true, requiresLicenseReview: true, termsNote: PUBLISHER_NOTE },

  // ── Markets desk: regulators (public official releases)
  { slug: "rbi-press-releases", name: "Reserve Bank of India", kind: "REGULATOR", desk: "MARKETS", feedUrl: "https://www.rbi.org.in/pressreleases_rss.xml", homepageUrl: "https://www.rbi.org.in/", reliability: 0.95, isEnabled: true, requiresLicenseReview: false, termsNote: "Official RBI press release feed." },
  { slug: "rbi-notifications", name: "RBI Notifications", kind: "REGULATOR", desk: "MARKETS", feedUrl: "https://www.rbi.org.in/notifications_rss.xml", homepageUrl: "https://www.rbi.org.in/", reliability: 0.95, isEnabled: true, requiresLicenseReview: false, termsNote: "Official RBI notifications feed." },
  { slug: "sebi", name: "SEBI", kind: "REGULATOR", desk: "MARKETS", feedUrl: "https://www.sebi.gov.in/sebirss.xml", homepageUrl: "https://www.sebi.gov.in/", reliability: 0.95, isEnabled: true, requiresLicenseReview: false, termsNote: "Official SEBI feed (orders, circulars, press releases)." },
  // ── Markets desk: exchanges (disabled until access is confirmed)
  { slug: "nse-announcements", name: "NSE Corporate Announcements", kind: "EXCHANGE", desk: "MARKETS", feedUrl: "https://nsearchives.nseindia.com/content/RSS/Online_announcements.xml", homepageUrl: "https://www.nseindia.com/companies-listing/corporate-filings-announcements", reliability: 0.95, isEnabled: false, requiresLicenseReview: true, termsNote: "NSE publishes this feed, but it did not answer automated requests from the build environment. Enable after confirming access from the worker's network and NSE's terms of use." },
  { slug: "nse-financial-results", name: "NSE Financial Results", kind: "EXCHANGE", desk: "MARKETS", feedUrl: "https://nsearchives.nseindia.com/content/RSS/Financial_Results.xml", homepageUrl: "https://www.nseindia.com/companies-listing/corporate-filings-financial-results", reliability: 0.95, isEnabled: false, requiresLicenseReview: true, termsNote: "See NSE Corporate Announcements note." },
  { slug: "nse-corporate-actions", name: "NSE Corporate Actions", kind: "EXCHANGE", desk: "MARKETS", feedUrl: "https://nsearchives.nseindia.com/content/RSS/Corporate_action.xml", homepageUrl: "https://www.nseindia.com/companies-listing/corporate-filings-actions", reliability: 0.95, isEnabled: false, requiresLicenseReview: true, termsNote: "See NSE Corporate Announcements note." },
  // ── Markets desk: financial publishers (disabled until a licence is confirmed)
  { slug: "economic-times-markets", name: "The Economic Times", kind: "PUBLISHER", desk: "MARKETS", feedUrl: "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms", homepageUrl: "https://economictimes.indiatimes.com/markets", reliability: 0.8, isEnabled: false, requiresLicenseReview: true, termsNote: `${PUBLISHER_NOTE} Disabled by default: Indian financial news must come from a licensed provider.` },
  { slug: "mint-markets", name: "Mint", kind: "PUBLISHER", desk: "MARKETS", feedUrl: "https://www.livemint.com/rss/markets", homepageUrl: "https://www.livemint.com/market", reliability: 0.8, isEnabled: false, requiresLicenseReview: true, termsNote: `${PUBLISHER_NOTE} Disabled by default: Indian financial news must come from a licensed provider.` },
  { slug: "businessline-markets", name: "BusinessLine", kind: "PUBLISHER", desk: "MARKETS", feedUrl: "https://www.thehindubusinessline.com/markets/feeder/default.rss", homepageUrl: "https://www.thehindubusinessline.com/markets/", reliability: 0.8, isEnabled: false, requiresLicenseReview: true, termsNote: `${PUBLISHER_NOTE} Disabled by default: Indian financial news must come from a licensed provider.` },
];

export const defaultScoringWeights = {
  importance: 0.3,
  credibility: 0.25,
  freshness: 0.2,
  impact: 0.15,
  interest: 0.1,
};

/**
 * Instruments tracked for the market snapshot. `providerSymbol` is the code used by the
 * configured market-data provider; confirm index codes with your provider before go-live.
 */
export const defaultWatchlist = [
  { symbol: "NIFTY 50", exchange: "NSE", name: "NIFTY 50", type: "INDEX", providerSymbol: "NSEI.INDX" },
  { symbol: "SENSEX", exchange: "BSE", name: "S&P BSE SENSEX", type: "INDEX", providerSymbol: "BSESN.INDX" },
  { symbol: "NIFTY BANK", exchange: "NSE", name: "NIFTY Bank", type: "INDEX", providerSymbol: "NSEBANK.INDX" },
  { symbol: "RELIANCE", exchange: "NSE", name: "Reliance Industries", type: "EQUITY", sector: "Energy", providerSymbol: "RELIANCE.NSE" },
  { symbol: "TCS", exchange: "NSE", name: "Tata Consultancy Services", type: "EQUITY", sector: "IT", providerSymbol: "TCS.NSE" },
  { symbol: "HDFCBANK", exchange: "NSE", name: "HDFC Bank", type: "EQUITY", sector: "Banking", providerSymbol: "HDFCBANK.NSE" },
  { symbol: "INFY", exchange: "NSE", name: "Infosys", type: "EQUITY", sector: "IT", providerSymbol: "INFY.NSE" },
  { symbol: "ICICIBANK", exchange: "NSE", name: "ICICI Bank", type: "EQUITY", sector: "Banking", providerSymbol: "ICICIBANK.NSE" },
  { symbol: "SBIN", exchange: "NSE", name: "State Bank of India", type: "EQUITY", sector: "Banking", providerSymbol: "SBIN.NSE" },
  { symbol: "BHARTIARTL", exchange: "NSE", name: "Bharti Airtel", type: "EQUITY", sector: "Telecom", providerSymbol: "BHARTIARTL.NSE" },
  { symbol: "ITC", exchange: "NSE", name: "ITC", type: "EQUITY", sector: "FMCG", providerSymbol: "ITC.NSE" },
  { symbol: "LT", exchange: "NSE", name: "Larsen & Toubro", type: "EQUITY", sector: "Infrastructure", providerSymbol: "LT.NSE" },
  { symbol: "HINDUNILVR", exchange: "NSE", name: "Hindustan Unilever", type: "EQUITY", sector: "FMCG", providerSymbol: "HINDUNILVR.NSE" },
  { symbol: "TATAMOTORS", exchange: "NSE", name: "Tata Motors", type: "EQUITY", sector: "Auto", providerSymbol: "TATAMOTORS.NSE" },
];
