/**
 * secopUrl — converts any SECOP II process identifier or old community URL
 * to the current working URL on www.secop.gov.co.
 *
 * Old (broken):
 *   community.secop.gov.co/Public/Tendering/OpportunityDetail/Index?noticeUID=CO1.NTC.XXXXX
 *
 * New (working):
 *   www.secop.gov.co/CO1BusinessLine/Tendering/ContractNoticeView/Index?notice=CO1.NTC.XXXXX
 *
 * IMPORTANT: CO1.REQ.XXXXX ≠ CO1.NTC.XXXXX — they are different identifiers.
 * Only extract CO1.NTC from url_proceso; never use CO1.REQ as a notice ID.
 */
export function secopUrl(urlProceso?: string | null, procesoId?: string): string {
  // Strategy 1: extract CO1.NTC from url_proceso (most reliable)
  if (urlProceso) {
    const ntcMatch = urlProceso.match(/CO1\.NTC\.(\d+)/);
    if (ntcMatch) {
      return `https://www.secop.gov.co/CO1BusinessLine/Tendering/ContractNoticeView/Index?notice=CO1.NTC.${ntcMatch[1]}`;
    }
    // If url_proceso itself is already a working URL, use it
    if (urlProceso.includes('www.secop.gov.co') && urlProceso.includes('notice=')) {
      return urlProceso;
    }
  }

  // Strategy 2: procesoId is already CO1.NTC.XXXXX
  if (procesoId) {
    const ntcDirect = procesoId.match(/^CO1\.NTC\.(\d+)/);
    if (ntcDirect) {
      return `https://www.secop.gov.co/CO1BusinessLine/Tendering/ContractNoticeView/Index?notice=${procesoId}`;
    }
  }

  // Strategy 3: fallback — search SECOP II by the proceso_id as a keyword
  // (avoids broken notice= URLs with CO1.REQ.XXXXX format)
  if (procesoId && !procesoId.startsWith('EXT-') && procesoId !== '') {
    // Encode for URL
    const q = encodeURIComponent(procesoId);
    return `https://www.secop.gov.co/Public/Tendering/ProcessSearch/Index?q=${q}`;
  }

  return 'https://www.secop.gov.co';
}
