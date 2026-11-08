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
 * The notice UID (CO1.NTC.XXXXX) is different from the process/request ID
 * (CO1.REQ.XXXXX) — we can only convert when we have the NTC from the URL.
 */
export function secopUrl(urlProceso?: string | null, procesoId?: string): string {
  // Strategy 1: extract CO1.NTC from existing url_proceso
  if (urlProceso) {
    const ntcMatch = urlProceso.match(/CO1\.NTC\.(\d+)/);
    if (ntcMatch) {
      return `https://www.secop.gov.co/CO1BusinessLine/Tendering/ContractNoticeView/Index?notice=CO1.NTC.${ntcMatch[1]}`;
    }
  }

  // Strategy 2: the procesoId itself might already be CO1.NTC.XXXXX
  if (procesoId) {
    const ntcMatch = procesoId.match(/^CO1\.NTC\.(\d+)/);
    if (ntcMatch) {
      return `https://www.secop.gov.co/CO1BusinessLine/Tendering/ContractNoticeView/Index?notice=${procesoId}`;
    }
  }

  // Strategy 3: fallback to search page with the ID as query
  if (procesoId && !procesoId.startsWith('EXT-')) {
    return `https://www.secop.gov.co/CO1BusinessLine/Tendering/ContractNoticeView/Index?notice=${procesoId}`;
  }

  // Can't construct a valid URL
  return 'https://www.secop.gov.co';
}
