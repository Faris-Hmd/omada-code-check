import { NextResponse } from 'next/server';

// Allow connections to Omada Controllers that use self-signed SSL certificates
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// ============================================================
// HARDCODED CONFIG — Omada OC200 Controller
// ============================================================
const OMADA_CONFIG = {
  baseUrl: '192.168.1.117',
  omadacId: '68db34ef6433d085eb685a0577c90675',
  clientId: '82278e730b6244778ab8f99748d20978',
  clientSecret: '386b5d72b2634ea7b09b08351e91df64',
  siteId: '68aca8d1dd81920e684cfff0',
};

let cachedToken = null;
let cachedTokenExpiry = 0;

function readConfig() {
  return { ...OMADA_CONFIG };
}

function buildBaseUrl(raw) {
  let url = (raw || '').replace(/\/$/, '').replace(/\/openapi\/v1\/?$/, '');
  url = url.replace(':443', '');
  if (!url.startsWith('http')) url = 'https://' + url;
  url = url.replace(/^http:\/\//, 'https://');
  return url;
}

async function getValidToken(config) {
  // Check in-memory cache first (works on Vercel too)
  if (cachedToken && Date.now() < cachedTokenExpiry) {
    return cachedToken;
  }
  // No file-based cache with hardcoded config

  const sanitizedBaseUrl = buildBaseUrl(config.baseUrl);
  const safeOmadacId = (config.omadacId || '').trim();

  // ====================================================================
  // WORKING METHOD: /openapi/authorize/token with snake_case parameters
  // This was the ONLY endpoint that successfully authenticated with this OC200.
  // DO NOT change to /login with camelCase — that returns -44113.
  // ====================================================================
  const tokenUrl = `${sanitizedBaseUrl}/openapi/authorize/token?grant_type=client_credentials`;
  const payload = {
    grant_type: 'client_credentials',
    client_id: config.clientId?.trim(),
    client_secret: config.clientSecret,
    omadacId: safeOmadacId
  };
  if (!safeOmadacId) delete payload.omadacId;

  console.log(`[Omada] Token URL: ${tokenUrl}`);

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  console.log(`[Omada] Token response: errorCode=${data.errorCode}, msg=${data.msg || 'OK'}`);

  if (data.errorCode === 0 && data.result?.accessToken) {
    const newToken = data.result.accessToken;
    const expiry = Date.now() + ((data.result.expiresIn || 7200) * 1000 * 0.9); // 90% of stated expiry
    cachedToken = newToken;
    cachedTokenExpiry = expiry;
    console.log('[Omada] Token obtained successfully');
    return newToken;
  }

  // Fallback: try /login with camelCase (for newer firmware)
  const loginUrl = `${sanitizedBaseUrl}/openapi/v1${safeOmadacId ? `/${safeOmadacId}` : ''}/login`;
  console.log(`[Omada] Fallback login URL: ${loginUrl}`);
  const res2 = await fetch(loginUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: config.clientId, clientSecret: config.clientSecret })
  });
  const data2 = await res2.json();
  console.log(`[Omada] Fallback response: errorCode=${data2.errorCode}, msg=${data2.msg || 'OK'}`);

  if (data2.errorCode === 0 && data2.result?.accessToken) {
    const newToken = data2.result.accessToken;
    const expiry = Date.now() + ((data2.result.expiresIn || 7200) * 1000 * 0.9);
    cachedToken = newToken;
    cachedTokenExpiry = expiry;
    console.log('[Omada] Token obtained via fallback');
    return newToken;
  }

  throw new Error(data.msg || data2.msg || 'Login failed with both endpoints');
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { action } = body;
    const config = readConfig();

    if (action === 'updateConfig') {
      cachedToken = null;
      cachedTokenExpiry = 0;
      return NextResponse.json({ errorCode: 0, msg: 'Config refreshed (hardcoded)' });
    }

    if (!config.baseUrl || !config.clientId) {
      return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
    }

    // Auth Helpers
    const accessToken = await getValidToken(config);
    const authHeader = `AccessToken=${accessToken}`;
    const sanitizedBaseUrl = buildBaseUrl(config.baseUrl);
    const safeOmadacId = (config.omadacId || '').trim();
    const apiBase = `${sanitizedBaseUrl}/openapi/v1${safeOmadacId ? `/${safeOmadacId}` : ''}`;
    const siteId = config.siteId;

    if (action === 'getSites') {
      const res = await fetch(`${apiBase}/sites?page=1&pageSize=100`, { headers: { 'Authorization': authHeader } });
      return NextResponse.json(await res.json());
    }

    if (action === 'getClients') {
      const res = await fetch(`${apiBase}/sites/${siteId}/clients?page=1&pageSize=1000`, { headers: { 'Authorization': authHeader } });
      const data = await res.json();
      console.log(`[Omada] Clients: found ${data.result?.data?.length || 0} clients`);
      return NextResponse.json(data);
    }

    if (action === 'getVoucherGroups') {
      const res = await fetch(`${apiBase}/sites/${siteId}/hotspot/voucher-groups?page=1&pageSize=100`, { headers: { 'Authorization': authHeader } });
      const data = await res.json();
      console.log(`[Omada] Voucher Groups: found ${data.result?.data?.length || 0} groups`);
      return NextResponse.json(data);
    }

    if (action === 'authorize') {
      const { clientMac, voucherCode } = body;
      const normalizedMac = (clientMac || '').replace(/:/g, '-').toUpperCase();
      const authUrl = `${apiBase}/sites/${siteId}/hotspot/ext-portal/auth`;
      console.log('[Omada] Auth Request:', { authUrl, normalizedMac, voucherCode });
      
      const res = await fetch(authUrl, {
        method: 'POST',
        headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientMac: normalizedMac, voucherCode })
      });
      
      const result = await res.json();
      console.log('[Omada] Auth Response:', result);
      return NextResponse.json(result);
    }

    if (action === 'getHealth') {
      try {
        console.log(`[Omada] Health check starting for site: ${siteId}`);

        // Sites
        const sitesRes = await fetch(`${apiBase}/sites?page=1&pageSize=100`, { headers: { 'Authorization': authHeader }, signal: AbortSignal.timeout(5000) });
        const sites = JSON.parse(await sitesRes.text());

        // Devices (OC200 uses /devices not /aps)
        const devicesRes = await fetch(`${apiBase}/sites/${siteId}/devices?page=1&pageSize=100`, { headers: { 'Authorization': authHeader }, signal: AbortSignal.timeout(5000) });
        const devices = JSON.parse(await devicesRes.text());
        
        // Clients
        const clientsRes = await fetch(`${apiBase}/sites/${siteId}/clients?page=1&pageSize=1000`, { headers: { 'Authorization': authHeader }, signal: AbortSignal.timeout(5000) });
        const clients = JSON.parse(await clientsRes.text());

        return NextResponse.json({
          errorCode: 0,
          result: {
            sitesCount: sites.result?.data?.length || 0,
            devicesCount: devices.result?.data?.length || 0,
            clientsCount: clients.result?.data?.length || 0,
            raw: { sites, devices, clients }
          }
        });
      } catch (e) {
        console.error('[Omada] Health Check Error:', e.message);
        return NextResponse.json({ errorCode: 1, msg: e.message, details: 'Check server logs for details' });
      }
    }

    if (action === 'getStatus') {
      const { clientMac } = body;
      if (!clientMac) return NextResponse.json({ error: 'Missing clientMac' }, { status: 400 });
      const normalizedMac = clientMac.replace(/:/g, '-').toUpperCase();

      // Fetch Clients
      const clientsRes = await fetch(`${apiBase}/sites/${siteId}/clients?page=1&pageSize=1000`, { headers: { 'Authorization': authHeader } });
      const clientsData = await clientsRes.json();
      const allClients = clientsData.result?.data || [];
      const onlineClient = allClients.find(c => c.mac === normalizedMac);

      // Extract voucher code from client's authInfo (authType 3 = voucher)
      let voucherCode = null;
      if (onlineClient?.authInfo) {
        const voucherAuth = onlineClient.authInfo.find(a => a.authType === 3);
        if (voucherAuth) voucherCode = voucherAuth.info;
      }

      return NextResponse.json({ 
        errorCode: 0, 
        result: { 
          isOnline: !!onlineClient, 
          client: onlineClient || null, 
          voucherCode 
        } 
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('[Omada] Route Error:', error.message);
    return NextResponse.json({ error: 'Server error', details: error.message }, { status: 500 });
  }
}

export async function GET() {
  const config = readConfig();
  return NextResponse.json({
    baseUrl: config.baseUrl || '',
    omadacId: config.omadacId || '',
    clientId: config.clientId || '',
    siteId: config.siteId || '',
    isConfigured: !!(config.baseUrl && config.clientId && config.clientSecret)
  });
}
