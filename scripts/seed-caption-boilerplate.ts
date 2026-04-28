/**
 * Seeds caption_cta + caption_hashtags onto each client from Jack's roster.
 *
 * Bilingual brands (Owings Auto, Equidad Homes, Coast to Coast) use the
 * English copy because there is one boilerplate row per client. When the
 * scheduler grows per-language lanes we'll fan out.
 *
 * Run:
 *   npx tsx scripts/seed-caption-boilerplate.ts            # dry-run report
 *   npx tsx scripts/seed-caption-boilerplate.ts --apply    # write to DB
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createAdminClient } from '@/lib/supabase/admin';

interface SeedEntry {
  slug: string;
  cta: string;
  hashtags: string[];
}

// CTAs are stored without Markdown link wrappers — every URL renders as
// plain text on social platforms anyway. Hashtags are stored without the
// leading '#' (the renderer adds it on display).
const ENTRIES: SeedEntry[] = [
  {
    slug: 'landshark-vodka-seltzer',
    cta: '🌊 Now available in Texas and Florida. Grab yours today!',
    hashtags: [
      'LandsharkVodkaSeltzer', 'VodkaSeltzer', 'HardSeltzer', 'NewDrinkAlert',
      'ComingSoon', 'TexasDrinks', 'FloridaDrinks', 'BeachVibes',
      'SummerDrinks', 'SeltzerSeason', 'DrinkLocal', 'SipEasy', 'IslandEnergy',
    ],
  },
  {
    slug: 'the-standard-ranch-water',
    cta: 'The Standard Ranch Water is made with 100% agave tequila in Jalisco, Mexico 📍 Visit TheStandardRanchWater.com or click the link in our bio for more info 🍻',
    hashtags: [
      'thestandardranchwater', 'raisethestandard', 'ranchwater', 'cheers',
      'cocktail', 'cocktails', 'cocktailhour', 'cocktailgram',
      'cocktailoftheday', 'tequila',
    ],
  },
  {
    slug: 'coast-to-coast',
    cta: '0% financing available 🤝 Sign and drive off the same day.',
    hashtags: [
      'usedcars', 'carfinance', 'carshopping', 'autodeals', 'carsforsale',
      'driveaway', 'carbuyer', 'carloans', 'preownedcars', 'affordablecars',
      'carlove', 'dealership', 'fastapproval', 'lowpayments', 'carsdaily',
      'autoloans', 'carlifestyle',
    ],
  },
  {
    slug: 'crystal-creek-cattle',
    cta: '🔗 Click the link in our bio to get premium Texas beef delivered to your door.',
    hashtags: [
      'crystalcreekcattleco', 'carnivorediet', 'meatheals', 'texasbeef',
      'steaklover', 'fromtexaswithlove', 'meatismedicine', 'grassfedbeef',
    ],
  },
  {
    slug: 'total-plumbing',
    cta: '👉🏼 Visit our website at totalplumbing.net or call us at (972) 681-4434 to schedule your Total Plumbing Service today! 🗓️',
    hashtags: [
      'plumbing', 'plumbers', 'plumbinglife', 'plumbingproblems',
      'plumbingservices', 'plumbingwork', 'plumbingrepair',
      'plumbingsolutions', 'plumbingservice', 'plumbing101',
    ],
  },
  {
    slug: 'rank-prompt',
    cta: '👉 See how your website ranks for FREE at rankprompt.com',
    hashtags: [
      'rankprompt', 'seo', 'aiseo', 'saas', 'marketing', 'advertising',
      'aitools', 'websiteranking', 'chatgptseo', 'perplexityseo', 'claudeseo',
      'seoaudit', 'aimarketing', 'growyoursite', 'websiteoptimization',
      'digitalmarketing', 'seotips', 'marketingtools', 'onlinemarketing',
      'rankingstrategy',
    ],
  },
  {
    slug: 'dunstons-steakhouse',
    cta: '🔥 Come visit the OLDEST steakhouse in Dallas!',
    hashtags: [
      'steakhouse', 'steak', 'ribeye', 'bonemarrow', 'porterhouse', 'tbone',
      'steaktok', 'grilling', 'dryagedsteak', 'woodfiregrill',
      'mediumraresteak', 'boneinribeye',
    ],
  },
  {
    slug: 'skibell-fine-jewelry',
    cta: 'Click the link in our bio or visit skibellfinejewelry.com to find your next piece 💍\n\n📍 Visit us to select your jewelry in person (By Appointment Only):\n8411 Preston Rd #110\nDallas, TX 75225',
    hashtags: [
      'SkibellFineJewelry', 'jewelry', 'jewellery', 'fashion', 'handmade',
      'earrings', 'necklace', 'gold', 'handmadejewelry', 'accessories',
      'jewelrydesigner', 'love', 'jewelryaddict', 'silver', 'style', 'ring',
      'jewelrydesign', 'rings', 'bracelet', 'jewels', 'diamonds', 'bracelets',
      'smallbusiness',
    ],
  },
  {
    slug: 'all-shutters-and-blinds',
    cta: '👉 Get yours at allshuttersandblinds.com',
    hashtags: [
      'AllShuttersAndBlinds', 'WindowTreatments', 'HomeImprovement',
      'InteriorDesign', 'CustomShutters', 'RollerBlinds', 'Curtains',
      'OutdoorBlinds', 'HomeDecor',
    ],
  },
  {
    slug: 'custom-shade-and-shutter',
    cta: '👉🏻 Get yours at customshadeandshutter.com',
    hashtags: [
      'homeinteriors', 'housedesigninspo', 'homedecorideas',
      'interiorhomedecor', 'interiordesign', 'customshades', 'dreamhome',
      'smarthome', 'smarthomes',
    ],
  },
  {
    slug: 'varsity-vault',
    cta: '🔗 Click the link in our bio to create your team’s online store!',
    hashtags: [
      'varsityvault', 'txhsfb', 'fridaynightlights', 'highschoolhoops',
      'highschoolbaseball', 'tshirtdesign', 'tshirts',
    ],
  },
  {
    slug: 'fusion-brands',
    cta: '🔗 Click the link in our bio to start your custom order today!',
    hashtags: [
      'custommerch', 'customapparel', 'promotionalproducts', 'dtfprinting',
      'screenprinting', 'embroidery', 'corporateapparel', 'customhats',
      'companymerch', 'brandedmerch', 'entrepreneur', 'smallbusiness',
      'custombranding', 'businessbranding', 'businessmerch',
    ],
  },
  {
    slug: 'ecoview',
    cta: '👉 Ready to transform your windows and doors? Get your FREE quote today!',
    hashtags: [
      'EcoView', 'Windows', 'Doors', 'HomeImprovement', 'EnergyEfficiency',
      'WindowReplacement', 'DoorReplacement', 'HomeRenovation', 'CurbAppeal',
      'HomeDesign', 'ExteriorDesign', 'HomeUpgrade',
    ],
  },
  {
    slug: 'stealth-health-containers',
    cta: '👉 Grab your containers at stealthhealthcontainers.com',
    hashtags: [
      'stealthhealth', 'macrofriendly', 'healthyrecipes', 'mealprep',
      'frozenmealprep', 'lowcalorierecipe', 'highproteinrecipe',
      'highproteinrecipes',
    ],
  },
  {
    slug: 'hartley-law',
    cta: '👉 Get the results you need with trusted personal injury attorneys. Call 469-289-6063 for a free consultation today',
    hashtags: [
      'HartleyLawTX', 'TexasAttorney', 'PersonalInjuryLawyer',
      'AccidentAttorney', 'DallasLawyer', 'LegalHelp', 'JusticeForYou',
      'InjuryLawyer', 'ResultsMatter',
    ],
  },
  {
    slug: 'owings-auto',
    cta: '🤝 Get approved fast. Shop Owings Auto and drive home today.',
    hashtags: [
      'OwingsAuto', 'BuyHerePayHere', 'EasyFinancing', 'DriveToday',
      'FastApproval', 'UsedCars', 'UsedCarsForSale', 'CarDeals',
      'CarShopping', 'AutoFinancing', 'AffordableCars', 'CarLot',
      'UsedCarDealer',
    ],
  },
  {
    slug: 'equidad-homes',
    cta: '🏡 Start your path to homeownership. Apply today!',
    hashtags: [
      'EquidadHomes', 'PathToHomeownership', 'FromRenterToOwner',
      'HomeownershipJourney', 'AffordableHomeownership', 'FlexibleFinancing',
      'FirstTimeHomebuyer', 'ITINHomeLoans', 'TexasHomes',
      'BuildingGenerationalWealth',
    ],
  },
  {
    slug: 'weston-funding',
    cta: "🏠 Funding For Real Estate Investors, BY Real Estate Investors. We're Weston Funding. We close loans ✅",
    hashtags: [
      'WestonFunding', 'RealEstateInvesting', 'FixAndFlip',
      'GroundUpConstruction', 'BuilderLife', 'RealEstateDevelopment',
      'InvestmentOpportunity', 'PropertyInvesting', 'ConstructionFinance',
      'BuildToScale', 'RealEstateGrowth',
    ],
  },
  {
    slug: 'rana-furniture',
    cta: 'Comment, ‘LOCATION’, to find the nearest Rana Furniture store near you! 📍',
    hashtags: [
      'RanaFurniture', 'POV', 'FurnitureShopping', 'ShowroomVibes',
      'HomeInspo', 'InteriorDesign', 'FurnitureLovers', 'HomeRefresh',
      'ElevatedLiving', 'ThatRanaEffect',
    ],
  },
  {
    slug: 'goodier-labs',
    // Goodier Labs only had hashtags in the dump; leaving CTA blank rather than inventing one.
    cta: '',
    hashtags: [
      'weformulatesuccess', 'performanceskincare', 'contractmanufacturing',
      'skincare', 'cosmeticchemist',
    ],
  },
];

async function main() {
  const apply = process.argv.includes('--apply');
  const admin = createAdminClient();

  const slugs = ENTRIES.map((e) => e.slug);
  const { data: clients, error } = await admin
    .from('clients')
    .select('id, slug, name')
    .in('slug', slugs);
  if (error) throw error;

  const bySlug = new Map((clients ?? []).map((c) => [c.slug as string, c as { id: string; slug: string; name: string }]));

  const missing = ENTRIES.filter((e) => !bySlug.has(e.slug));
  if (missing.length) {
    console.warn(`⚠ ${missing.length} slug(s) not found:`);
    for (const m of missing) console.warn(`    ${m.slug}`);
  }

  const ok = ENTRIES.filter((e) => bySlug.has(e.slug));
  console.log(`${apply ? 'APPLYING' : 'DRY-RUN'}: ${ok.length} client(s) to update`);
  for (const entry of ok) {
    const client = bySlug.get(entry.slug)!;
    const ctaPreview = entry.cta ? `"${entry.cta.slice(0, 60)}${entry.cta.length > 60 ? '…' : ''}"` : '(blank)';
    console.log(`  ${client.name.padEnd(32)} cta=${ctaPreview}  tags=${entry.hashtags.length}`);

    if (apply) {
      const { error: updErr } = await admin
        .from('clients')
        .update({
          caption_cta: entry.cta.trim() === '' ? null : entry.cta.trim(),
          caption_hashtags: entry.hashtags.map((h) => h.replace(/^#/, '').trim()).filter(Boolean),
        })
        .eq('id', client.id);
      if (updErr) {
        console.error(`    ✗ ${client.slug}: ${updErr.message}`);
      }
    }
  }

  if (!apply) console.log('\nRe-run with --apply to write changes.');
}

main().catch((err) => {
  console.error('✗ seed crashed:', err);
  process.exit(1);
});
