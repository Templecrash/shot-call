import {loadPerpMarkets} from '@/lib/perps';

// Public venue metadata. No wallet, account or private thesis data is returned.
export async function GET() {
  const headers = {'Cache-Control':'no-store'};
  try {
    const {markets, checkedAt} = await loadPerpMarkets();
    return Response.json({markets, checkedAt}, {headers});
  } catch {
    return Response.json({error:'Perp availability could not be verified.'}, {status:503, headers});
  }
}
