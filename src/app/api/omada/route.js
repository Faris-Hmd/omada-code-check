import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

// Allow connections to local Omada Controllers that use self-signed SSL certificates
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const CONFIG_PATH = path.join(process.cwd(), 'omada-config.json');

async function readConfig() {
  try {
    const data = await fs.readFile(CONFIG_PATH, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return {};
  }
}

async function writeConfig(config) {
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}

async function getValidToken(config) {
  // Check if token exists and is still valid (simplified check, usually tokens last 24h)
  if (config.accessToken && config.tokenExpiry && Date.now() < config.tokenExpiry) {
    return config.accessToken;
  }

  // Need new token
  let sanitizedBaseUrl = config.baseUrl.replace(/\/$/, "").replace(/\/openapi\/v1\/?$/, "");
  
  // Force HTTPS for port 443
  if (sanitizedBaseUrl.includes(':443')) {
    sanitizedBaseUrl = sanitizedBaseUrl.replace('http://', 'https://');
  }
  if (!sanitizedBaseUrl.startsWith("http")) sanitizedBaseUrl = "https://" + sanitizedBaseUrl;
  
  const safeOmadacId = (config.omadacId || "").trim();
  const loginUrl = `${sanitizedBaseUrl}/openapi/v1${safeOmadacId ? `/${safeOmadacId}` : ""}/login`;

  const res = await fetch(loginUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: config.clientId, clientSecret: config.clientSecret })
  });

  const data = await res.json();
  if (data.errorCode === 0) {
    const newToken = data.result.accessToken;
    config.accessToken = newToken;
    config.tokenExpiry = Date.now() + (23 * 60 * 60 * 1000); // 23 hours safety margin
    await writeConfig(config);
    return newToken;
  }
  throw new Error(data.msg || 'Login failed');
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { action } = body;
    let config = await readConfig();

    if (action === 'updateConfig') {
      const { baseUrl, omadacId, clientId, clientSecret, siteId } = body;
      config = { ...config, baseUrl, omadacId, clientId, clientSecret, siteId };
      // Clear token to force fresh login with new credentials
      delete config.accessToken;
      delete config.tokenExpiry;
      await writeConfig(config);
      return NextResponse.json({ errorCode: 0, msg: 'Config saved on server' });
    }

    if (!config.baseUrl || !config.clientId) {
      return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
    }

    // Auth Helpers
    const accessToken = await getValidToken(config);
    const authHeader = `AccessToken=${accessToken}`;
    let sanitizedBaseUrl = config.baseUrl.replace(/\/$/, "").replace(/\/openapi\/v1\/?$/, "");
    
    // Force HTTPS for port 443
    if (sanitizedBaseUrl.includes(':443')) {
        sanitizedBaseUrl = sanitizedBaseUrl.replace('http://', 'https://');
    }
    if (!sanitizedBaseUrl.startsWith("http")) sanitizedBaseUrl = "https://" + sanitizedBaseUrl;
    const safeOmadacId = (config.omadacId || "").trim();
    const apiBase = `${sanitizedBaseUrl}/openapi/v1${safeOmadacId ? `/${safeOmadacId}` : ""}`;
    const siteId = config.siteId;

    if (action === 'getSites') {
      const res = await fetch(`${apiBase}/sites`, { headers: { 'Authorization': authHeader } });
      return NextResponse.json(await res.json());
    }

    if (action === 'authorize') {
      const { clientMac, voucherCode } = body;
      const normalizedMac = (clientMac || "").replace(/:/g, "-").toUpperCase();
      const authUrl = `${apiBase}/sites/${siteId}/hotspot/ext-portal/auth`;
      console.log('Omada Auth Request:', { authUrl, normalizedMac, voucherCode });
      
      const res = await fetch(authUrl, {
        method: 'POST',
        headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientMac: normalizedMac, voucherCode })
      });
      
      const result = await res.json();
      console.log('Omada Auth Response:', result);
      return NextResponse.json(result);
    }

    if (action === 'getHealth') {
      try {
        const sitesRes = await fetch(`${apiBase}/sites`, { headers: { 'Authorization': authHeader } });
        const sites = await sitesRes.json();
        
        const apsRes = await fetch(`${apiBase}/sites/${siteId}/aps`, { headers: { 'Authorization': authHeader } });
        const aps = await apsRes.json();
        
        const clientsRes = await fetch(`${apiBase}/sites/${siteId}/clients`, { headers: { 'Authorization': authHeader } });
        const clients = await clientsRes.json();

        return NextResponse.json({
          errorCode: 0,
          result: {
            sitesCount: sites.result?.data?.length || 0,
            apsCount: aps.result?.data?.length || 0,
            clientsCount: clients.result?.data?.length || 0,
            raw: { sites, aps, clients }
          }
        });
      } catch (e) {
        return NextResponse.json({ error: 'Health check failed', details: e.message });
      }
    }

    if (action === 'getStatus') {
      const { clientMac } = body;
      if (!clientMac) return NextResponse.json({ error: 'Missing clientMac' }, { status: 400 });
      const normalizedMac = clientMac.replace(/:/g, "-").toUpperCase();

      // Fetch Clients
      const clientsRes = await fetch(`${apiBase}/sites/${siteId}/clients`, { headers: { 'Authorization': authHeader } });
      const clientsData = await clientsRes.json();
      const onlineClient = (clientsData.result?.data || []).find(c => c.mac === normalizedMac);

      // Fetch Vouchers
      const vouchersRes = await fetch(`${apiBase}/sites/${siteId}/hotspot/vouchers`, { headers: { 'Authorization': authHeader } });
      const vouchersData = await vouchersRes.json();
      const vouchers = vouchersData.result?.data || [];
      
      let matchedVoucher = vouchers.find(v => v.mac === normalizedMac);
      if (!matchedVoucher && onlineClient?.voucherCode) {
          matchedVoucher = vouchers.find(v => v.code === onlineClient.voucherCode);
      }

      return NextResponse.json({ 
        errorCode: 0, 
        result: { isOnline: !!onlineClient, client: onlineClient || null, voucher: matchedVoucher || null } 
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    return NextResponse.json({ error: 'Server error', details: error.message }, { status: 500 });
  }
}

export async function GET() {
  // Allow fetching current config structure (without secrets) for the UI
  const config = await readConfig();
  return NextResponse.json({
    baseUrl: config.baseUrl || '',
    omadacId: config.omadacId || '',
    clientId: config.clientId || '',
    siteId: config.siteId || '',
    isConfigured: !!(config.baseUrl && config.clientId && config.clientSecret)
  });
}
