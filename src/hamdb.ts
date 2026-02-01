/**
 * HamDB API integration for callsign lookups
 * API Docs: https://hamdb.org/
 * 
 * This provides real-time callsign information lookup from HamDB's free API
 */

export interface CallsignInfo {
  callsign: string;
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  class?: string; // License class
  lastUpdated?: string;
}

const HAMDB_API_BASE = 'https://hamdb.org/api/v1';
const HAMDB_USER_AGENT = 'YAHAML-Contest-Logger/1.0';

/**
 * Lookup a callsign in HamDB
 * Returns callsign info or null if not found
 */
export async function lookupCallsign(callsign: string): Promise<CallsignInfo | null> {
  try {
    const cleanCall = callsign.toUpperCase().trim();
    
    // HamDB API endpoint: /search/{callsign}/{user_agent}
    const url = `${HAMDB_API_BASE}/search/${cleanCall}/${HAMDB_USER_AGENT}`;
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null; // Callsign not found
      }
      throw new Error(`HamDB API error: ${response.status}`);
    }

    const data: any = await response.json();

    // HamDB returns { search: { results: [ { call: {...} } ] } }
    if (data.search?.results?.[0]?.call) {
      const call = data.search.results[0].call;
      
      return {
        callsign: cleanCall,
        name: call.fname && call.lname ? `${call.fname} ${call.lname}` : call.fname || call.lname,
        address: call.addr1,
        city: call.city,
        state: call.state,
        zip: call.zip,
        country: call.country,
        class: call.class, // License class (A, B, C, E, F, T, N)
        lastUpdated: call.updated,
      };
    }

    return null;
  } catch (error) {
    console.error(`HamDB lookup failed for ${callsign}:`, error);
    return null;
  }
}

/**
 * Batch lookup multiple callsigns
 * Returns map of callsign -> info (or null if not found)
 */
export async function lookupMultipleCallsigns(
  callsigns: string[]
): Promise<Record<string, CallsignInfo | null>> {
  const results: Record<string, CallsignInfo | null> = {};
  
  // HamDB has rate limits, so add small delay between requests
  for (const call of callsigns) {
    results[call] = await lookupCallsign(call);
    // Small delay to respect rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return results;
}

/**
 * Validate a callsign format and optionally check if it exists in HamDB
 * Returns { valid: boolean, info?: CallsignInfo }
 */
export async function validateCallsign(
  callsign: string,
  checkHamDB: boolean = false
): Promise<{ valid: boolean; info?: CallsignInfo }> {
  // Basic validation: callsign format
  // US callsigns: [A-K][A-Z0-9][0-9][A-Z]{1,3} (most common)
  // or variations like AA0A, N3LLL, W5ABC, K1A, etc.
  // Allow portable indicators like /M, /QRP but for basic validation just check main call
  const cleanCall = callsign.toUpperCase().trim();
  
  // Remove portable indicators for validation
  const mainCall = cleanCall.split('/')[0];
  
  // Must be 3-6 characters, containing at least one digit
  const hasValidLength = mainCall.length >= 2 && mainCall.length <= 6;
  const hasDigit = /\d/.test(mainCall);
  const onlyValidChars = /^[A-Z0-9]+$/.test(mainCall);
  
  const isValidFormat = hasValidLength && hasDigit && onlyValidChars;
  
  if (!isValidFormat) {
    return { valid: false };
  }

  if (checkHamDB) {
    const info = await lookupCallsign(cleanCall);
    return { valid: !!info, info: info || undefined };
  }

  return { valid: true };
}
