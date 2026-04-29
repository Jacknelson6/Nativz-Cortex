/**
 * Per-client Google Chat webhook URLs for content-calendar approval pings.
 *
 * Source of truth is the AC ops sheet "Client & Internal Google Chats"
 * (1gd6HmR4tDVw-pThGu1SR55BuweYuZLEW7E3BuCo3oJ8). Mirrored here so the
 * approval write path doesn't depend on a Sheets API call. When the sheet
 * changes (new client, rotated webhook), update this map to match.
 *
 * Lookup is case-insensitive on a trimmed client name. Aliases — including
 * the `aka` short name and known location-suffixed variants — point to the
 * same webhook so DB rows that store a slightly different label still
 * resolve.
 */

interface WebhookEntry {
  url: string;
  /** Display name from the sheet — used for logging. */
  label: string;
}

// Each tuple: [primary client name from the sheet, aliases…, url]
const ENTRIES: Array<{ names: string[]; url: string }> = [
  {
    names: ['Owings Auto', 'Owings'],
    url: 'https://chat.googleapis.com/v1/spaces/AAQAC3vNyMA/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=pkHzVB-IyYIEtoN1yKhO4yjg5DYGJSjn67mX8lcF-uY',
  },
  {
    names: ['Landshark Vodka Seltzer', 'Landshark'],
    url: 'https://chat.googleapis.com/v1/spaces/AAQA186GOsE/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=Ra5f4x4rwH_5bE0Lj5zPqwSTpGBj9loM7jgLbAZ3Z_o',
  },
  {
    names: ['Coast to Coast Motors', 'CTC', 'CTC Motors'],
    url: 'https://chat.googleapis.com/v1/spaces/AAAAUeAwtSM/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=9tsS-uTO1u_MdPXfa9PYSUYkRG_2b65k2bTBHYdjftk',
  },
  {
    names: ['Equidad Homes', 'Equidad'],
    url: 'https://chat.googleapis.com/v1/spaces/AAQAdbawUhM/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=5r8eN8BT-F7UtiNXmMgbwEdIMaVIxWDCS-dZhzkU7HI',
  },
  {
    names: ['Toastique', 'Toastique - Fran Dev', 'Toastique Fran Dev'],
    url: 'https://chat.googleapis.com/v1/spaces/AAQA57motAE/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=58SrSSMGrZU8o2bZ9XUGUp1vUOtRtoUp_nYmg7jWdMM',
  },
  {
    names: [
      'Ampersand Studios',
      'Ampersand',
      'Ampersand Studios - Miami',
      'Ampersand Miami',
      'Ampersand Studios - Nashville Music Row',
      'Ampersand Nashville MR',
      'Ampersand Studios - Nashville Yards',
      'Ampersand Nashville Yards',
    ],
    url: 'https://chat.googleapis.com/v1/spaces/AAAAWF9OHa4/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=k8nku-ICuAD-AzQxR680p1GFUqQjYved8iOLaZ1n4hY',
  },
  {
    names: ['Rana Furniture', 'Rana'],
    url: 'https://chat.googleapis.com/v1/spaces/AAQAbM6kjsw/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=qHOcsLI977lnFemU3SyBgP3Qe73oSqP-eKPp6sbcfPg',
  },
  {
    names: ['College Hunks Hauling Junk', 'CHHJ'],
    url: 'https://chat.googleapis.com/v1/spaces/AAQA0lVQLak/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=dZBsNGzjRkr04QJ4WaGGkV6ak2_fgurNGlBOQnqTqz0',
  },
  {
    names: [
      'All Shutters & Blinds',
      'All Shutters and Blinds',
      'ASAB',
      'Custom Shade & Shutter',
      'Custom Shade and Shutter',
      'CSS',
    ],
    url: 'https://chat.googleapis.com/v1/spaces/AAAAZExnol8/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=3nOmIlRD0bN6E6VuBJCHAWaE2dtR64BPCRSuRp9Xue0',
  },
  {
    names: ['Ecoview'],
    url: 'https://chat.googleapis.com/v1/spaces/AAQAs0ZJJ14/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=ViNTGwuYARHuMYp4abVm5loSWg3RG2jS10AhBjYRKX4',
  },
  {
    names: ['JAMNOLA'],
    url: 'https://chat.googleapis.com/v1/spaces/AAAAQOl4GOM/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=BcgpwXcDlpWJV-pXo1yfegtXIB60gnaT76oGpUhMz_Y',
  },
  {
    names: [
      'MOI DC',
      'MOI DC - Ghida',
      'MOI Montreal',
      'MOI Montreal - Michaela',
      'MOI Toronto',
      'MOI Toronto - Michaela',
    ],
    url: 'https://chat.googleapis.com/v1/spaces/AAAAjt_uRW4/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=4fi192QmgUztX17dK-W1xXOLbOgGvq-rJ44Pv8oqiEE',
  },
  {
    names: ['Skibell Fine Jewelry', 'Skibell'],
    url: 'https://chat.googleapis.com/v1/spaces/AAQATO-qwyc/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=Toz3aX5DAJB-eRplDw4EJzFoinzbif5QM1Nzl4IAkeI',
  },
  {
    names: ['Stealth Health', 'Stealth Health Content Team'],
    url: 'https://chat.googleapis.com/v1/spaces/AAAAN7rhoNs/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=vpwclaLpMM2fK-GJdzRB1m1uhgWHapenu1VJ8HTn2mk',
  },
  {
    names: ['Stealth Health Containers'],
    url: 'https://chat.googleapis.com/v1/spaces/AAQABvc5AOg/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=HxYWsFmz3fVnd4HoenDVhDWLDnWqqlFQE4NR2Y6asEs',
  },
  {
    names: ['Stealth Health Life'],
    url: 'https://chat.googleapis.com/v1/spaces/AAAAy_Ao2tM/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=x7EkcxjhiNhb2WcL_V6VQvujCFEIjS-KqHqOeavfS2I',
  },
  {
    names: ['Nativz'],
    url: 'https://chat.googleapis.com/v1/spaces/AAQAeBYGZmI/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=rm_6jtCPs56a8lPGuPRFs3WbhM5g9kRYTpS-tJOijFo',
  },
  {
    names: ['KQ Communications', 'KQ'],
    url: 'https://chat.googleapis.com/v1/spaces/AAQAUSbdxTc/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=vj24Tnzi_eVwRiLuL2U_2DpXmB7fHAexA1uzSWI8kzk',
  },
  {
    names: ['Varsity Vault', 'Fusion Brands'],
    url: 'https://chat.googleapis.com/v1/spaces/AAQAWCiiI14/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=9T4kpkuAwrGhFLrKW3pDVEaOzpbmKnx0nh0wjHXVL28',
  },
  {
    names: ['Dunstons'],
    url: 'https://chat.googleapis.com/v1/spaces/AAQAzkuqNQU/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=5nutwco_dWepvpHtfBIGCMxixMRAr4UBuTKUk78-X4s',
  },
  {
    names: ['Goldback', 'Goldback Paid Media Team'],
    url: 'https://chat.googleapis.com/v1/spaces/AAQA7Mt1670/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=pj4frYCC1_k0g3pLr-nMe75r_rZ8KEBH8vYzVS7zvkw',
  },
  {
    names: ['Safe Stop'],
    url: 'https://chat.googleapis.com/v1/spaces/AAQA8Fr0qSs/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=dNRTv_FO4CPxHJbHdVvH4Hup7hZFNDGwS1mT9OtYgio',
  },
  {
    names: ['Weston Funding', 'Weston'],
    url: 'https://chat.googleapis.com/v1/spaces/AAQAZLBXO2M/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=bHip2oA3vRTWtoVYYWHHYJ1DfQ5OHEM59LEp62UCpao',
  },
  {
    names: ['Boxes to Go'],
    url: 'https://chat.googleapis.com/v1/spaces/AAQAHyh1_tU/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=GnhMxC9anhBSjlu3ZP7HKVxZullb8_S8f4_hebKxeBA',
  },
  {
    names: ['Memphis Airport', 'MEM'],
    url: 'https://chat.googleapis.com/v1/spaces/AAQAUWSjx2I/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=MjSRlGcudhHTtfOAPRYXNlBTQpGqAHwev8x2NBRb6VU',
  },
  {
    names: ['Hartley Law'],
    url: 'https://chat.googleapis.com/v1/spaces/AAQAihTbeQs/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=A1qRiWnIGf-wYshZ0oG__mca44ARAGoQ_gJJxswE6pA',
  },
  {
    names: ['Goodier Labs'],
    url: 'https://chat.googleapis.com/v1/spaces/AAQATLlw7f8/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=3NCZqUepAs1zAXCZuD5x-iZfJ6hMl6k_7vACVXL74ss',
  },
  {
    names: ["Shah's Halal", 'Shahs Halal'],
    url: 'https://chat.googleapis.com/v1/spaces/AAQAr9n1J1M/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=AIbzQzvv8DWuuaVFde4zCOg4_jHireLrEr0kc6YFOAY',
  },
  {
    names: ['Crystal Creek Cattle', 'Crystal Creek'],
    url: 'https://chat.googleapis.com/v1/spaces/AAQAmKnxzkw/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=ODWmtgVvvUkHaKBnPJkS4YkPmkC9-fPMuqfyOAF152o',
  },
  {
    names: ['Kumon'],
    url: 'https://chat.googleapis.com/v1/spaces/AAQA4b6P8Jk/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=XGH5h50Fzi1ds7K4uem5dDiCwwR1pP8ygf3C17zoyjc',
  },
  {
    names: ['Avondale Private Lending', 'Avondale'],
    url: 'https://chat.googleapis.com/v1/spaces/AAQAG60wOcM/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=l_IsbobdVIVCfvXLKdhPpsTqRfAml4vEc7VZxGkhJvU',
  },
  {
    names: ['BOO! & SNOWDAY Dallas', 'BOO & SNOWDAY', 'BOO SNOWDAY'],
    url: 'https://chat.googleapis.com/v1/spaces/AAAAM1mjXL0/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=PBzIB40sT-62DoNy1qvu6F3_jhnwWDKK6pmSQSTzUUM',
  },
  {
    names: ['IUCX'],
    url: 'https://chat.googleapis.com/v1/spaces/AAQAJdih1hA/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=n8xYOJtf-FdIF_FYGPLkNUCuEBM_U_ZPjr4LZm8ULyg',
  },
  {
    names: ['Netze Homes', 'Netze'],
    url: 'https://chat.googleapis.com/v1/spaces/AAQAR7Mn02c/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=hh4S8zzPJMMjzI64tgr1omzktvNZQElKzGO8xkJC-Tg',
  },
  {
    names: ['Active Arena'],
    url: 'https://chat.googleapis.com/v1/spaces/AAAAZcY_nho/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=BUmEWOYmgvHFEJE8u3dwd4nlVlpN7jGW99E-0pjR5eo',
  },
  {
    names: ['Rank Prompt'],
    url: 'https://chat.googleapis.com/v1/spaces/AAQAHufvenY/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=OaQPLw4Av1R01khnftcTjyiEq6nkCJr2NrlbiMDO_m8',
  },
  {
    names: ['ATS Solutions', 'ATS'],
    url: 'https://chat.googleapis.com/v1/spaces/AAQAxacwRXo/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=3HaXg9e93H1TKVgF5Azc-IP06jhKX6IbYezFBffblJk',
  },
  {
    names: ['Bit Bunker', 'BitBunker'],
    url: 'https://chat.googleapis.com/v1/spaces/AAQAB848QEM/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=Qc8sC1u2_0_vS4tYm4IBvv3xSiSNF5yJC-oTFDaEmUQ',
  },
  {
    names: ['National Lenders'],
    url: 'https://chat.googleapis.com/v1/spaces/AAQAj96vyjQ/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=rxGiULCwMNyUHBAJBXWQkPcDlDs9RHJ3okr5cjfksJ0',
  },
];

const WEBHOOK_BY_KEY = new Map<string, WebhookEntry>();
for (const entry of ENTRIES) {
  for (const name of entry.names) {
    WEBHOOK_BY_KEY.set(normalize(name), { url: entry.url, label: entry.names[0] });
  }
}

function normalize(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

export function getCalendarTeamWebhook(clientName: string): WebhookEntry | null {
  return WEBHOOK_BY_KEY.get(normalize(clientName)) ?? null;
}
