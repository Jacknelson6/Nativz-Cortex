/**
 * Updates vault client profiles with scraped website data.
 * Run: node scripts/update-vault-profiles.mjs
 */

import { readFileSync } from 'fs';
try {
  const envFile = readFileSync('.env.local', 'utf-8');
  for (const line of envFile.split('\n')) {
    const match = line.match(/^([A-Z_]+)=(.+)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
} catch { /* no .env.local */ }

const GITHUB_TOKEN = process.env.GITHUB_VAULT_TOKEN;
const GITHUB_REPO = process.env.GITHUB_VAULT_REPO;
const GITHUB_BRANCH = process.env.GITHUB_VAULT_BRANCH || 'main';

if (!GITHUB_TOKEN || !GITHUB_REPO) {
  console.error('Missing GITHUB_VAULT_TOKEN or GITHUB_VAULT_REPO.');
  process.exit(1);
}

const BASE = 'https://api.github.com';
const hdrs = {
  Authorization: `Bearer ${GITHUB_TOKEN}`,
  Accept: 'application/vnd.github.v3+json',
  'Content-Type': 'application/json',
};

function encodePath(p) {
  return p.split('/').map(s => encodeURIComponent(s)).join('/');
}

async function readFile(path) {
  const res = await fetch(`${BASE}/repos/${GITHUB_REPO}/contents/${encodePath(path)}?ref=${GITHUB_BRANCH}`, {
    headers: hdrs,
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Read failed: ${res.status}`);
  const d = await res.json();
  return { content: Buffer.from(d.content, 'base64').toString('utf-8'), sha: d.sha };
}

async function writeFile(path, content, message) {
  let sha;
  const existing = await readFile(path);
  if (existing) sha = existing.sha;

  const body = {
    message,
    content: Buffer.from(content, 'utf-8').toString('base64'),
    branch: GITHUB_BRANCH,
  };
  if (sha) body.sha = sha;

  const res = await fetch(`${BASE}/repos/${GITHUB_REPO}/contents/${encodePath(path)}`, {
    method: 'PUT',
    headers: hdrs,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Write failed (${res.status}): ${t}`);
  }
  console.log(`  ✓ Updated: ${path}`);
}

// ---------------------------------------------------------------------------
// Client data from web scraping
// ---------------------------------------------------------------------------

const clientData = [
  // Batch 1
  {
    name: "Weston Funding",
    website: "https://westonfunding.com/",
    target_audience: "Real estate investors seeking fast, flexible financing for fix-and-flip projects, DSCR rental properties, and other investment property acquisitions. Individuals who need quick capital access without traditional bank lending barriers.",
    brand_voice: "Professional, direct, trustworthy, action-oriented",
    topic_keywords: ["real estate investment financing", "fix and flip loans", "DSCR rental property loans", "private lending", "fast funding for investors", "alternative real estate lending", "investment property strategies"]
  },
  {
    name: "Safe Stop",
    website: "https://sablerealty.com/",
    target_audience: "Self-storage facility investors, owners, buyers, and sellers — including both individual investors with single facilities and institutional investors managing property portfolios. People seeking to acquire, sell, refinance, or optimize self-storage assets.",
    brand_voice: "Professional, knowledgeable, approachable, experienced",
    topic_keywords: ["self-storage investing", "storage facility acquisition", "self-storage property valuation", "storage facility operations", "commercial real estate brokerage", "self-storage market trends", "passive income real estate"]
  },
  {
    name: "All Shutters and Blinds",
    website: "https://two-usa.com/",
    target_audience: "Homeowners looking for custom window treatments (interior and exterior), as well as trade professionals such as architects, interior designers, and developers. Customers who value premium quality, sustainability, and American-made products for both residential and commercial projects.",
    brand_voice: "Elegant, purposeful, aspirational, innovative",
    topic_keywords: ["plantation shutters", "custom window treatments", "motorized roller shades", "outdoor shading solutions", "sustainable window coverings", "interior design trends", "smart home window automation"]
  },
  {
    name: "Crystal Creek Cattle",
    website: "https://www.crystalcreekcattle.net/",
    target_audience: "DFW Metroplex families and food enthusiasts seeking premium, pasture-raised beef delivered to their doorstep; restaurants, hotels, and food-service businesses (240+ establishments) needing consistent, high-quality meat supply in North Texas.",
    brand_voice: "Trustworthy, premium, locally-rooted, customer-centric",
    topic_keywords: ["pasture-raised beef delivery", "premium Texas meat", "ranch-to-table sourcing", "never-frozen hand-cut steaks", "DFW home meat delivery", "hormone-free cattle ranching", "Texas family farms"]
  },
  {
    name: "Custom Shade and Shutter",
    website: "https://www.customshadeandshutter.com/",
    target_audience: "Homeowners seeking custom window treatments and outdoor shading solutions, from budget-conscious buyers to premium product seekers. Also targets trade professionals, builders, and commercial clients looking for quality American-made window coverings.",
    brand_voice: "Professional, aspirational, approachable, trustworthy",
    topic_keywords: ["custom window treatments", "motorized shading systems", "plantation shutters", "outdoor patio shading", "home design and functionality", "energy-efficient window coverings", "made in USA shutters"]
  },
  {
    name: "Dunston's Steakhouse",
    website: "https://dunstonssteakhouse.com/",
    target_audience: "Dallas locals and visitors seeking classic steakhouse dining; families celebrating milestones, professionals hosting dinners, and patrons who value heritage, tradition, and authentic Texas cuisine over trendy concepts. Multi-generational diners who appreciate old-school ambiance.",
    brand_voice: "Warm, heritage-focused, unpretentious, nostalgic",
    topic_keywords: ["classic Dallas steakhouse", "mesquite-grilled steaks", "Dallas dining heritage", "Texas fine dining tradition", "family restaurant legacy", "special occasion dining", "authentic Texas cuisine"]
  },
  {
    name: "EcoView",
    website: "https://www.ecoviewdfw.com/",
    target_audience: "Homeowners in the Dallas-Fort Worth, Austin, Waco, and Temple areas seeking energy-efficient window and door replacements. Families looking to reduce energy costs, boost curb appeal, and increase home value through professional, locally-installed upgrades.",
    brand_voice: "Trustworthy, educational, warm, locally-focused",
    topic_keywords: ["energy-efficient windows", "replacement windows DFW", "door replacement installation", "Energy Star rated products", "home energy savings", "curb appeal upgrades", "lifetime warranty windows"]
  },
  // Batch 2
  {
    name: "Fitzy Shades MedSpa",
    website: "https://fitzyshadesmedspa.com/",
    target_audience: "Inclusive aesthetic seekers across all skin tones, ages (teens to adults), and genders in Prosper and Wylie, TX who prioritize self-care, confidence enhancement, and accessible medical-grade beauty treatments.",
    brand_voice: "Inclusive, modern, approachable, confident",
    topic_keywords: ["skin treatments for all skin tones", "non-invasive aesthetic procedures", "injectables and dermal fillers", "laser skin treatments", "body contouring", "self-care and confidence", "weight loss and wellness"]
  },
  {
    name: "Fusion Brands",
    website: "https://www.fusion-brands.com/",
    target_audience: "Small to mid-sized businesses, organizations, schools, corporate teams, non-profits, and event planners in Texas seeking bulk custom branded apparel and promotional products with professional customization services.",
    brand_voice: "Professional, approachable, reliable, solution-focused",
    topic_keywords: ["custom branded apparel", "promotional products and merchandise", "screen printing and embroidery", "corporate team apparel", "bulk order branded gear", "company swag and uniforms", "event merchandise"]
  },
  {
    name: "Hartley Law",
    website: "https://hartleylawtx.com/",
    target_audience: "Individuals and families in the Dallas-Fort Worth area who have been injured in accidents (car, truck, motorcycle, pedestrian, workplace) and need legal representation to pursue compensation for their injuries.",
    brand_voice: "Empathetic, assertive, trustworthy, client-focused",
    topic_keywords: ["personal injury claims", "car accident lawyer Dallas", "truck accident attorney", "injury compensation and settlements", "accident recovery rights", "wrongful death claims", "workplace injury law"]
  },
  {
    name: "House of Jack",
    website: "https://www.houseofjackco.com/",
    target_audience: "Men aged 25-55 who value quality craftsmanship and timeless style in everyday accessories, plus gift-givers shopping for fathers, groomsmen, and graduates seeking personalized leather goods.",
    brand_voice: "Masculine, artisanal, approachable, heritage-driven",
    topic_keywords: ["full grain leather wallets", "handcrafted men's accessories", "personalized gifts for men", "leather care and patina", "everyday carry essentials", "groomsmen gift ideas", "quality leather goods"]
  },
  {
    name: "Skibell Fine Jewelry",
    website: "https://www.skibellfinejewelry.com/",
    target_audience: "Affluent individuals in the Dallas Preston Hollow, Highland Park, and University Park communities seeking luxury fine jewelry, custom pieces, estate jewelry, expert repairs, and appraisal services in a personalized, appointment-based setting.",
    brand_voice: "Elegant, sophisticated, warm, professional",
    topic_keywords: ["fine jewelry and luxury gems", "jewelry appraisal services", "estate and vintage jewelry", "custom jewelry design", "jewelry repair and restoration", "engagement rings and bridal", "jewelry consignment Dallas"]
  },
  {
    name: "The Standard Ranch Water",
    website: "https://thestandardranchwater.com/",
    target_audience: "Adults aged 25-45 in Texas and Oklahoma who appreciate premium ready-to-drink cocktails, value authentic ingredients like 100% agave tequila, and seek an elevated alternative to mass-market hard seltzers and canned drinks.",
    brand_voice: "Bold, Texas-proud, premium, straightforward",
    topic_keywords: ["premium canned cocktails", "ranch water cocktail culture", "100% agave tequila drinks", "ready-to-drink spirits", "Texas craft beverages", "cocktail lifestyle and events", "authentic ranch water"]
  },
  {
    name: "Total Plumbing",
    website: "https://totalplumbing.net/",
    target_audience: "Homeowners and property managers in the Dallas-Fort Worth metropolitan area (Rowlett, Mesquite, Richardson, Plano, Rockwall) seeking reliable, licensed plumbing services for emergencies, repairs, installations, and remodels.",
    brand_voice: "Trustworthy, professional, approachable, community-rooted",
    topic_keywords: ["emergency plumbing services", "leak detection and repair", "water heater installation", "slab leak repair", "drain cleaning solutions", "bathroom and kitchen remodels", "licensed Dallas plumbers"]
  },
  // Batch 3
  {
    name: "Varsity Vault",
    website: "https://varsityvault.io/",
    target_audience: "School administrators, athletic directors, team leaders, booster clubs, and parent organizations seeking zero-risk fundraising through custom school merchandise stores; secondary audience includes students, parents, and fans purchasing spirit wear.",
    brand_voice: "Approachable, reliable, community-driven, confident",
    topic_keywords: ["custom school merchandise", "school spirit wear", "school fundraising ideas", "print-on-demand apparel", "team store management", "booster club fundraising", "school branding"]
  },
  {
    name: "Coast to Coast",
    website: "https://www.ctcautogroup.com/",
    target_audience: "Buyers with bad credit, limited credit history, or non-traditional credit profiles (including ITIN/tax ID holders) seeking used vehicle financing in Texas and Oklahoma; individuals rejected by traditional lenders who need flexible in-house payment options.",
    brand_voice: "Empathetic, trustworthy, action-oriented, inclusive",
    topic_keywords: ["bad credit car loans", "buy here pay here financing", "in-house auto financing", "used cars Texas Oklahoma", "flexible car payment plans", "ITIN auto loans", "credit rebuilding through auto loans"]
  },
  {
    name: "Netze Homes",
    website: "https://netzehomes.com/",
    target_audience: "Affluent homebuyers in the DFW Texas region seeking premium, sustainable new-construction homes built with steel-framed architecture; environmentally conscious buyers who want luxury without compromising on energy efficiency or resilience.",
    brand_voice: "Innovative, sophisticated, eco-conscious, forward-thinking",
    topic_keywords: ["steel-framed home construction", "energy-efficient luxury homes", "sustainable homebuilding", "DFW new construction communities", "net-zero home design", "eco-friendly residential development", "resilient home building"]
  },
  {
    name: "Rank Prompt",
    website: "https://rankprompt.com/",
    target_audience: "Digital marketers, SEO professionals, content strategists, and enterprise marketing teams who need to monitor and optimize their brand's visibility in AI-powered search engines like ChatGPT, Gemini, Claude, and Perplexity.",
    brand_voice: "Professional, innovative, data-driven, competitive",
    topic_keywords: ["AI search visibility", "LLM brand monitoring", "generative engine optimization", "AI SEO strategy", "ChatGPT brand ranking", "AI competitive analysis", "answer engine optimization"]
  },
  {
    name: "Stealth Health Containers",
    website: "https://stealthhealthcontainers.com/",
    target_audience: "Health-conscious meal preppers aged 25-45 who track macros and calories, fitness enthusiasts who cook in bulk, and sustainability-minded consumers looking for plastic-free food storage solutions.",
    brand_voice: "Authentic, eco-conscious, practical, aspirational",
    topic_keywords: ["compostable meal prep containers", "sustainable food storage", "plastic-free meal prep", "bamboo fiber containers", "freezer-safe eco containers", "bulk meal prep tips", "zero-waste kitchen essentials"]
  },
  {
    name: "Kumon",
    website: "https://www.kumon.com/",
    target_audience: "Parents of PreK-12 children seeking structured after-school math and reading programs that build foundational skills, self-discipline, and independent learning habits; families wanting affordable supplementary education to keep children at or above grade level.",
    brand_voice: "Nurturing, empowering, disciplined, trustworthy",
    topic_keywords: ["after-school learning programs", "children's math and reading skills", "self-directed learning for kids", "academic confidence building", "early childhood education enrichment", "study habits for children", "grade-level advancement"]
  },
  {
    name: "Goldback",
    website: "https://www.goldback.com/",
    target_audience: "Precious metals investors, alternative currency enthusiasts, inflation-concerned individuals, and financially independent-minded consumers seeking tangible gold-backed assets as a hedge against currency devaluation; also small businesses interested in accepting alternative payment.",
    brand_voice: "Premium, authoritative, innovative, aspirational",
    topic_keywords: ["gold-backed currency", "inflation-resistant investing", "alternative currency", "precious metals for everyday use", "wealth preservation", "fractional gold ownership", "sound money movement"]
  },
  // Batch 4
  {
    name: "Goodier Labs",
    website: "https://www.goodierlabs.com/",
    target_audience: "Established and emerging skincare brands seeking contract development and manufacturing, including physician-dispensed, medspas, boutique retailers, and DTC e-commerce brands.",
    brand_voice: "Professional, innovative, confident, partnership-driven",
    topic_keywords: ["skincare formulation development", "contract cosmetics manufacturing", "private label skincare", "clinical efficacy in skincare", "CDMO skincare solutions", "product innovation and R&D", "beauty brand scaling"]
  },
  {
    name: "Stealth Health Life",
    website: "https://stealthhealthcookbook.com/",
    target_audience: "Fitness-minded individuals and flexible dieters who want to enjoy indulgent, nostalgic comfort foods made healthier with macro-friendly recipes, primarily ages 20-40 pursuing sustainable weight management.",
    brand_voice: "Approachable, encouraging, pragmatic, relatable",
    topic_keywords: ["high-protein meal prep", "macro-friendly recipes", "healthy comfort food swaps", "slow cooker meal prep", "flexible dieting", "sustainable weight management", "batch cooking"]
  },
  {
    name: "Toastique",
    website: "https://toastique.com/",
    target_audience: "Health-conscious professionals and busy urban consumers seeking nutritious, convenient, and Instagram-worthy breakfast and lunch options, plus prospective franchise owners looking for a wellness-focused fast-casual concept.",
    brand_voice: "Fresh, approachable, upscale-casual, wellness-forward",
    topic_keywords: ["gourmet toast recipes", "acai and smoothie bowls", "cold-pressed juice", "healthy breakfast franchise", "clean eating lifestyle", "fast-casual wellness dining", "locally sourced ingredients"]
  },
  {
    name: "Owings Auto",
    website: "https://owings-auto.com/",
    target_audience: "Used car buyers in the Arlington-Fort Worth, TX area who need flexible in-house financing, including buyers with bad credit, limited credit history, or non-traditional financial situations.",
    brand_voice: "Approachable, practical, reassuring, straightforward",
    topic_keywords: ["buy here pay here financing", "bad credit auto loans", "used cars Arlington TX", "in-house car financing", "affordable used vehicles", "flexible car payments", "trade-in value"]
  },
  {
    name: "Landshark Vodka Seltzer",
    website: "https://www.landsharklager.com/",
    target_audience: "Legal-drinking-age adults (21+) who enjoy beach and island lifestyle culture, social occasions, and are drawn to refreshing, low-calorie alcoholic beverages with tropical flavor profiles.",
    brand_voice: "Bold, laid-back, tropical, fun",
    topic_keywords: ["hard seltzer flavors", "beach lifestyle drinks", "low-calorie alcoholic beverages", "tropical cocktail culture", "island-inspired beverages", "summer drinking occasions", "craft seltzer"]
  },
  {
    name: "Equidad Homes",
    website: "https://equidadhomes.com/",
    target_audience: "Renters and aspiring homeowners in Texas who may not qualify for traditional bank financing, including first-time homebuyers, individuals with credit challenges, and families seeking affordable owner-financed properties.",
    brand_voice: "Accessible, empowering, community-focused, solution-oriented",
    topic_keywords: ["owner financing homes Texas", "affordable homeownership", "no-bank home buying", "alternative mortgage options", "first-time homebuyer guidance", "rent-to-own homes", "financial literacy for homebuyers"]
  },
  {
    name: "Rana Furniture",
    website: "https://www.ranafurniture.com/",
    target_audience: "South Florida residents, particularly in Miami-Dade, Broward, and surrounding Hispanic communities, seeking stylish and affordable furniture across modern-contemporary, eclectic, and traditional styles.",
    brand_voice: "Welcoming, value-driven, family-oriented, style-conscious",
    topic_keywords: ["affordable modern furniture Miami", "South Florida home furnishings", "contemporary living room sets", "bedroom furniture deals", "mattress shopping South Florida", "home decor inspiration", "furniture store near me"]
  },
];

// ---------------------------------------------------------------------------
// Build updated profile markdown
// ---------------------------------------------------------------------------

function buildProfile(existing, data) {
  // Parse the existing file to preserve frontmatter fields we don't want to overwrite
  const fmMatch = existing.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return existing; // Can't parse, skip

  const fmBlock = fmMatch[1];
  const afterFm = existing.slice(fmMatch[0].length);

  // Parse existing frontmatter into key-value pairs
  const fmLines = fmBlock.split('\n');
  const fm = {};
  let currentKey = null;
  let currentArray = null;
  for (const line of fmLines) {
    const kvMatch = line.match(/^(\w[\w_]*?):\s*(.*)$/);
    if (kvMatch) {
      if (currentKey && currentArray) {
        fm[currentKey] = currentArray;
        currentArray = null;
      }
      currentKey = kvMatch[1];
      const val = kvMatch[2].trim();
      if (val === '') {
        // Could be start of array
        currentArray = [];
      } else {
        fm[currentKey] = val;
        currentKey = null;
      }
    } else if (currentArray !== null && line.match(/^\s+-\s/)) {
      currentArray.push(line.replace(/^\s+-\s*/, '').replace(/^"|"$/g, ''));
    }
  }
  if (currentKey && currentArray) {
    fm[currentKey] = currentArray;
  }

  // Add website to frontmatter if not present
  if (data.website && !fm.website) {
    fm.website = `"${data.website}"`;
  }

  // Rebuild frontmatter
  const newFmLines = ['---'];
  // Preserve order: type, client, abbreviation, industry, agency, website, services, updated, monday_synced
  const orderedKeys = ['type', 'client', 'abbreviation', 'industry', 'agency', 'website', 'services', 'updated', 'monday_synced'];
  const usedKeys = new Set();
  for (const key of orderedKeys) {
    if (fm[key] !== undefined) {
      usedKeys.add(key);
      if (Array.isArray(fm[key])) {
        newFmLines.push(`${key}:`);
        for (const item of fm[key]) {
          newFmLines.push(`  - "${item}"`);
        }
      } else {
        newFmLines.push(`${key}: ${fm[key]}`);
      }
    }
  }
  // Any remaining keys
  for (const [key, val] of Object.entries(fm)) {
    if (!usedKeys.has(key)) {
      if (Array.isArray(val)) {
        newFmLines.push(`${key}:`);
        for (const item of val) {
          newFmLines.push(`  - "${item}"`);
        }
      } else {
        newFmLines.push(`${key}: ${val}`);
      }
    }
  }
  newFmLines.push('---');

  // Now rebuild the body sections
  // Extract existing heading and quote line
  const nameMatch = afterFm.match(/\n# (.+)/);
  const clientName = nameMatch ? nameMatch[1] : data.name;

  // Extract existing metadata line (abbreviation | agency)
  const quoteMatch = afterFm.match(/\n> (.+)/);
  const quoteLine = quoteMatch ? quoteMatch[1] : '';

  const sections = [
    newFmLines.join('\n'),
    '',
    `# ${clientName}`,
    '',
  ];

  if (quoteLine) {
    sections.push(`> ${quoteLine}`, '');
  }

  // Website
  if (data.website) {
    sections.push(`**Website:** ${data.website}`, '');
  }

  // Services (preserve from existing)
  const servicesMatch = afterFm.match(/## Services\n([\s\S]*?)(?=\n## |\n$)/);
  if (servicesMatch) {
    sections.push('## Services', servicesMatch[1].trim(), '');
  }

  // POC (preserve from existing)
  const pocMatch = afterFm.match(/## Point of contact\n([\s\S]*?)(?=\n## |\n$)/);
  if (pocMatch) {
    sections.push('## Point of contact', pocMatch[1].trim(), '');
  }

  // Target audience (new from scraping)
  sections.push('## Target audience', '', data.target_audience, '');

  // Brand voice (new from scraping)
  sections.push('## Brand voice', '', data.brand_voice, '');

  // Topic keywords (new from scraping)
  sections.push('## Topic keywords', '', data.topic_keywords.map(k => `- ${k}`).join('\n'), '');

  return sections.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('Updating vault profiles with scraped website data...\n');

  let updated = 0;
  let failed = 0;

  for (const data of clientData) {
    const path = `Clients/${data.name}/_profile.md`;
    try {
      const existing = await readFile(path);
      if (!existing) {
        console.log(`  ✗ Not found: ${path}`);
        failed++;
        continue;
      }

      const newContent = buildProfile(existing.content, data);
      await writeFile(path, newContent, `enrich: ${data.name} — target audience, brand voice, topic keywords`);
      updated++;
    } catch (err) {
      console.error(`  ✗ Error updating ${data.name}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n✅ Done! Updated ${updated} profiles, ${failed} failed.`);
}

main().catch(e => console.error('Error:', e));
