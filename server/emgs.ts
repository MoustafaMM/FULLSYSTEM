/**
 * EMGS status lookup — ported from Pioneer-emgs-tracker/server.ts
 * (performStatusCheck, WAF detection, nationality resolution).
 */
import * as cheerio from 'cheerio';

const NATIONALITY_NAME_TO_CODE: Record<string, string> = {
  "Afghanistan": "AF",
  "Albania": "AL",
  "Algeria": "DZ",
  "Angola": "AO",
  "Argentina": "AR",
  "Australia": "AU",
  "Azerbaijan": "AZ",
  "Bahrain": "BH",
  "Bangladesh": "BD",
  "Belarus": "BY",
  "Belgium": "BE",
  "Benin": "BJ",
  "Bolivia": "BO",
  "Bosnia": "BA",
  "Botswana": "BW",
  "Brazil": "BR",
  "Brunei": "BN",
  "Burkina Faso": "BF",
  "Burundi": "BI",
  "Cambodia": "KH",
  "Cameroon": "CM",
  "Canada": "CA",
  "Central African Republic": "CF",
  "Chad": "TD",
  "Chile": "CL",
  "China": "CN",
  "Colombia": "CO",
  "Comoros": "KM",
  "Congo": "CG",
  "Costa Rica": "CR",
  "Croatia": "HR",
  "Cuba": "CU",
  "Cyprus": "CY",
  "Czech Republic": "CZ",
  "Côte d'Ivoire": "CI",
  "DR Congo": "CD",
  "Denmark": "DK",
  "Djibouti": "DJ",
  "Dominican Republic": "DO",
  "Ecuador": "EC",
  "Egypt": "EG",
  "Eritrea": "ER",
  "Ethiopia": "ET",
  "Finland": "FI",
  "France": "FR",
  "Gabon": "GA",
  "Gambia": "GM",
  "Georgia": "GE",
  "Germany": "DE",
  "Ghana": "GH",
  "Greece": "GR",
  "Guatemala": "GT",
  "Guinea": "GN",
  "Guinea-Bissau": "GW",
  "Haiti": "HT",
  "Honduras": "HN",
  "Hungary": "HU",
  "India": "IN",
  "Indonesia": "ID",
  "Iran": "IR",
  "Iraq": "IQ",
  "Ireland": "IE",
  "Italy": "IT",
  "Ivory Coast": "CI",
  "Jamaica": "JM",
  "Japan": "JP",
  "Jordan": "JO",
  "Kazakhstan": "KZ",
  "Kenya": "KE",
  "Kuwait": "KW",
  "Kyrgyzstan": "KG",
  "Laos": "LA",
  "Lebanon": "LB",
  "Liberia": "LR",
  "Libya": "LY",
  "Madagascar": "MG",
  "Malawi": "MW",
  "Malaysia": "MY",
  "Maldives": "MV",
  "Mali": "ML",
  "Mauritania": "MR",
  "Mauritius": "MU",
  "Mexico": "MX",
  "Moldova": "MD",
  "Mongolia": "MN",
  "Morocco": "MA",
  "Mozambique": "MZ",
  "Myanmar": "MM",
  "Namibia": "NA",
  "Nepal": "NP",
  "Netherlands": "NL",
  "New Zealand": "NZ",
  "Nicaragua": "NI",
  "Niger": "NE",
  "Nigeria": "NG",
  "North Korea": "KP",
  "Norway": "NO",
  "Oman": "OM",
  "Pakistan": "PK",
  "Palestine": "PS",
  "Panama": "PA",
  "Paraguay": "PY",
  "Peru": "PE",
  "Philippines": "PH",
  "Poland": "PL",
  "Portugal": "PT",
  "Qatar": "QA",
  "Romania": "RO",
  "Russia": "RU",
  "Rwanda": "RW",
  "Saudi Arabia": "SA",
  "Senegal": "SN",
  "Sierra Leone": "SL",
  "Singapore": "SG",
  "Somalia": "SO",
  "South Africa": "ZA",
  "South Korea": "KR",
  "South Sudan": "SS",
  "Spain": "ES",
  "Sri Lanka": "LK",
  "Sudan": "SD",
  "Sweden": "SE",
  "Switzerland": "CH",
  "Syria": "SY",
  "Taiwan": "TW",
  "Tajikistan": "TJ",
  "Tanzania": "TZ",
  "Thailand": "TH",
  "Togo": "TG",
  "Tunisia": "TN",
  "Turkey": "TR",
  "Turkmenistan": "TM",
  "UAE": "AE",
  "UK": "GB",
  "USA": "US",
  "Uganda": "UG",
  "Ukraine": "UA",
  "United Arab Emirates": "AE",
  "United Kingdom": "GB",
  "United States": "US",
  "Uruguay": "UY",
  "Uzbekistan": "UZ",
  "Venezuela": "VE",
  "Vietnam": "VN",
  "Yemen": "YE",
  "Zambia": "ZM",
  "Zimbabwe": "ZW"
};

function resolveNationalityCode(nationalityCode: string, nationalityName: string): string {
  if (nationalityCode && nationalityCode.length === 2 && nationalityCode !== 'XX') {
    return nationalityCode;
  }
  if (nationalityName) {
    const mapped = NATIONALITY_NAME_TO_CODE[nationalityName];
    if (mapped) return mapped;
    const lower = nationalityName.toLowerCase();
    for (const [name, code] of Object.entries(NATIONALITY_NAME_TO_CODE)) {
      if (name.toLowerCase() === lower) return code;
    }
  }
  return nationalityCode || 'XX';
}

// ── Anti-Bot & WAF Helper Functions ──────────────────────────────────────────
const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'same-origin',
  'Sec-Fetch-User': '?1',
  'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
};

function isWafOrCloudflareBlock(status: number, html: string): { blocked: boolean; reason: string } {
  if (status === 429) return { blocked: true, reason: 'EMGS HTTP 429: Too Many Requests / Rate Limited' };
  if (status === 403) return { blocked: true, reason: 'EMGS HTTP 403: Forbidden / WAF Access Denied' };
  if (status >= 500 && status <= 504) return { blocked: true, reason: `EMGS HTTP ${status}: Gateway/Server Error` };

  const lower = (html || '').toLowerCase();
  if (lower.includes('just a moment...') || lower.includes('attention required! | cloudflare')) {
    return { blocked: true, reason: 'Cloudflare Bot Challenge Intercepted' };
  }
  if (lower.includes('cf-browser-verification') || lower.includes('challenges.cloudflare.com')) {
    return { blocked: true, reason: 'Cloudflare JavaScript Verification Active' };
  }
  if (lower.includes('access denied') && lower.includes('cloudflare')) {
    return { blocked: true, reason: 'Cloudflare IP Access Denied' };
  }
  return { blocked: false, reason: '' };
}

// ── Core EMGS Scraper ────────────────────────────────────────────────────────
export async function performStatusCheck(travelDocNo: string, nationality: string) {
  try {
    if (!travelDocNo || !nationality) {
      return { success: false, error: 'Passport Number and Nationality code are required.' };
    }

    // 1. Fetch search form page to extract form_key and session cookies with exponential backoff
    let initialRes: Response | null = null;
    let initialHtml = '';
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        initialRes = await fetch('https://visa.educationmalaysia.gov.my/emgs/application/searchForm/', {
          headers: BROWSER_HEADERS,
          signal: AbortSignal.timeout(30000)
        });

        initialHtml = await initialRes.text();

        const blockCheck = isWafOrCloudflareBlock(initialRes.status, initialHtml);
        if (blockCheck.blocked) {
          if (attempt === maxAttempts) {
            return { success: false, error: blockCheck.reason };
          }
          const backoffDelay = attempt * 3000;
          console.warn(`⚠️ ${blockCheck.reason} on GET attempt ${attempt}. Retrying in ${backoffDelay / 1000}s...`);
          await new Promise(r => setTimeout(r, backoffDelay));
          continue;
        }

        if (initialRes.ok) {
          break; // Success
        }
      } catch (fetchErr: any) {
        if (attempt === maxAttempts) {
          return { success: false, error: `EMGS Connection Timeout / Network Error: ${fetchErr.message}` };
        }
        const backoffDelay = attempt * 2000;
        console.warn(`EMGS GET attempt ${attempt} network error (${fetchErr.message}), retrying in ${backoffDelay / 1000}s...`);
        await new Promise(r => setTimeout(r, backoffDelay));
      }
    }

    if (!initialRes || !initialRes.ok) {
      return { success: false, error: `Failed to connect to EMGS portal (Status: ${initialRes?.status || 'Unknown'})` };
    }

    // Extract cookies
    const cookies = initialRes.headers.get('set-cookie') || '';

    // Extract form_key
    const $initial = cheerio.load(initialHtml);
    let formKey = $initial('input[name="form_key"]').val()
      || $initial('input[name="form-key"]').val()
      || $initial('meta[name="form_key"]').attr('content');

    if (!formKey) {
      // Inline script fallback
      const scriptContent = $initial('script').map((_, el) => $initial(el).html()).get().join('');
      const fkMatch = scriptContent.match(/["'](form_key|formKey)["']\s*:\s*["']([a-zA-Z0-9]+)["']/) ||
                      scriptContent.match(/form_key\s*=\s*["']([a-zA-Z0-9]+)["']/);
      if (fkMatch) formKey = fkMatch[fkMatch.length - 1];
    }

    if (!formKey) {
      const blockCheck = isWafOrCloudflareBlock(initialRes.status, initialHtml);
      if (blockCheck.blocked) {
        return { success: false, error: blockCheck.reason };
      }
      return { success: false, error: 'Could not extract EMGS security form_key token from portal response.' };
    }

    // 2. POST Search Payload
    const params = new URLSearchParams();
    params.append('form_key', String(formKey));
    params.append('travel_doc_no', travelDocNo.trim());
    params.append('nationality', nationality.trim());
    params.append('agreement', '1');

    const postHeaders = {
      ...BROWSER_HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookies,
      'Referer': 'https://visa.educationmalaysia.gov.my/emgs/application/searchForm/',
      'Origin': 'https://visa.educationmalaysia.gov.my'
    };

    const postRes = await fetch('https://visa.educationmalaysia.gov.my/emgs/application/searchPost/', {
      method: 'POST',
      headers: postHeaders,
      body: params.toString(),
      signal: AbortSignal.timeout(35000)
    });

    const resultHtml = await postRes.text();

    const postBlockCheck = isWafOrCloudflareBlock(postRes.status, resultHtml);
    if (postBlockCheck.blocked) {
      return { success: false, error: postBlockCheck.reason };
    }

    if (!postRes.ok) {
      return { success: false, error: `EMGS search request rejected with HTTP ${postRes.status}` };
    }

    // 3. Cheerio DOM Parsing
    const $ = cheerio.load(resultHtml);
    
    // Remove search form and page title
    $('form#search-form-validate').remove();
    $('.page-title').remove();
    
    let extractedHtml = $('.col-main .padding-s').html() || $('.col-main').html();
    
    if (!extractedHtml) {
      const messages = $('.messages').text().trim();
      if (messages) {
        extractedHtml = `<div class="messages">${messages}</div>`;
      } else {
        extractedHtml = '<div class="error">No results found or EMGS site structure changed.</div>';
      }
    }

    let progress: number | null = null;
    let status = '';
    let progressColor = '#337ab7'; // Default blue

    // Check progress bar element
    const progressBar = $('.progress-bar');
    if (progressBar.length) {
      const style = progressBar.attr('style');
      if (style) {
        const match = style.match(/width:\s*(\d+)%/);
        if (match) {
          progress = parseInt(match[1], 10);
          if (progressBar.hasClass('progress-bar-success')) progressColor = '#5cb85c';
          else if (progressBar.hasClass('progress-bar-info')) progressColor = '#5bc0de';
          else if (progressBar.hasClass('progress-bar-warning')) progressColor = '#f0ad4e';
          else if (progressBar.hasClass('progress-bar-danger')) progressColor = '#d9534f';
        }
      }
    }

    // Percentage box fallback
    if (progress === null) {
      const percentageBox = $('.percentage-box, .progress-percentage, .percent, .percentage, .progress-circle, .c100 > span');
      if (percentageBox.length) {
        const text = percentageBox.text().trim();
        const match = text.match(/(\d+)%/);
        if (match) progress = parseInt(match[1], 10);
      }
    }

    // Standalone % fallback
    if (progress === null) {
      $('*').each((_, el) => {
        if (progress !== null) return;
        const text = $(el).text().trim();
        const match = text.match(/^(\d+)%$/);
        if (match) progress = parseInt(match[1], 10);
      });
    }

    // RadialBar Canvas fallback
    const scripts = $('script').map((_, el) => $(el).html()).get().join('');
    if (progress === null) {
      const staticMatch = scripts.match(/isShowStaticInfoText[^:]*:[^'"]*['"](\d+)%['"]/);
      if (staticMatch) progress = parseInt(staticMatch[1], 10);
    }

    // Color extraction from canvas backLineFill
    const colorMatch = scripts.match(/backLineFill[^:]*:[^'"]*['"]([^'"]+)['"]/);
    if (colorMatch) {
      const c = colorMatch[1];
      if (c.includes('098136')) progressColor = '#098136';      // Green
      else if (c.includes('f0ad4e') || c.includes('ffa5')) progressColor = '#f0ad4e'; // Amber
      else if (c.includes('d9534f') || c.includes('c0392')) progressColor = '#d9534f'; // Red
      else progressColor = c;
    }

    // Extract table details
    const details: Record<string, string> = {};
    
    $('table tr').each((_, row) => {
      const th = $(row).find('th').text().trim().replace(/:$/, '');
      const td = $(row).find('td').text().trim();
      if (th && td) details[th] = td;
    });

    $('.application-summary li').each((_, li) => {
      const label = $(li).find('label').text().trim().replace(/:$/, '');
      let value = $(li).text().replace($(li).find('label').text(), '').trim();
      value = value.replace(/^:\s*/, '').replace(/&nbsp;/g, ' ').trim();
      if (label && value) details[label] = value;
    });

    // Extract Application Issues table
    const issues: Array<{no: string, issue: string, status: string, comment: string, updatedAt: string}> = [];
    $('table').each((_, table) => {
      const headers = $(table).find('th').map((_, th) => $(th).text().trim().toLowerCase()).get();
      if (headers.some(h => h.includes('issue')) || headers.some(h => h.includes('no.'))) {
        $(table).find('tbody tr').each((_, row) => {
          const cells = $(row).find('td').map((_, td) => $(td).text().trim()).get();
          if (cells.length >= 3) {
            issues.push({
              no: cells[0] || '',
              issue: cells[1] || '',
              status: cells[2] || '',
              comment: cells[3] || '',
              updatedAt: cells[4] || '',
            });
          }
        });
      }
    });

    if (issues.length > 0) {
      details['_issues'] = JSON.stringify(issues);
    }

    status = details['Application Status'] || details['Status'] || '';
    
    if (status) {
      const progMatch = status.match(/(\d+)%/);
      if (progMatch && progress === null) progress = parseInt(progMatch[1], 10);
    }

    if (progress === null && status) {
      const s = status.toLowerCase();
      if (s.includes('completed') || s.includes('approved') || s.includes('issued')) {
        progress = 100;
      }
    }

    let name = details['Full Name'] || details['Student Name'] || details['Name'] || '';
    if (!name) {
      const headerName = $('h3, h4').filter(function() { 
        const text = $(this).text().toLowerCase();
        return !text.includes('status') && !text.includes('application') && !text.includes('track') && text.length > 5;
      }).first().text().trim();
      if (headerName) name = headerName;
    }

    if (!status) {
      const strongText = $('strong').filter(function() { return $(this).text().includes('%'); }).parent().text();
      if (strongText) {
        const progMatch = strongText.match(/(\d+)%/);
        if (progMatch && progress === null) progress = parseInt(progMatch[1], 10);
        status = strongText.trim();
      }
    }

    // Check for "No Application Found"
    const isNoRecordFound = !status && !name && progress === null && 
      (resultHtml.includes('No application found') || resultHtml.includes('Record not found') || resultHtml.includes('No Record Found'));

    if (isNoRecordFound) {
      return {
        success: true,
        notFound: true,
        html: extractedHtml,
        progress: null,
        status: 'No Record Found',
        name: '',
        details: {},
        progressColor: '#d9534f'
      };
    }

    return { 
      success: true, 
      notFound: false,
      html: extractedHtml, 
      progress, 
      status, 
      name, 
      details, 
      progressColor 
    };
  } catch (error: any) {
    console.error('EMGS scraping unexpected error:', error);
    return { success: false, error: error.message || 'Scraping failed' };
  }
}

// ── Adapter used by Express Tracker ─────────────────────────────────────────
export interface EmgsInput {
  passportNo: string;
  nationality: string;       // country name
  nationalityCode?: string;  // ISO-2, preferred
}

export interface EmgsIssue { no: string; issue: string; status: string; comment: string; updatedAt: string }

export interface EmgsResult {
  status: string;
  percent: number | null;
  progressColor: string;
  notFound: boolean;
  applicationNo?: string;
  applicationType?: string;
  courseName?: string;
  issues: EmgsIssue[];
  details: Record<string, string>;
}

/** Returns null when EMGS could not be reached (blocked / timeout) so the previous status is kept. */
export async function checkEmgsStatus(input: EmgsInput): Promise<EmgsResult | null> {
  if (!input.passportNo?.trim()) return null;
  const code = resolveNationalityCode(input.nationalityCode || '', input.nationality || '');
  const r: any = await performStatusCheck(input.passportNo, code);
  if (!r?.success) {
    console.warn(`[emgs] ${input.passportNo}: ${r?.error}`);
    return null;
  }
  const details: Record<string, string> = { ...(r.details || {}) };
  let issues: EmgsIssue[] = [];
  if (details['_issues']) {
    try { issues = JSON.parse(details['_issues']); } catch { /* ignore */ }
    delete details['_issues'];
  }
  return {
    status: r.status || (r.progress === null ? 'New Application' : 'Processing'),
    percent: r.progress,
    progressColor: r.progressColor || '#337ab7',
    notFound: !!r.notFound,
    applicationNo: details['Application Number'],
    applicationType: details['Application Type'],
    courseName: details['Course Name'],
    issues,
    details,
  };
}
