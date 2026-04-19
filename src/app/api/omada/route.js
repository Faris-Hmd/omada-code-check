import { NextResponse } from 'next/server';

// ============================================================
// HARDCODED CLOUD CONFIG — Vercel Production
// ============================================================
const OMADA = {
  baseUrl: 'https://aps1-api-omada-controller-connector.tplinkcloud.com',
  omadacId: '68db34ef6433d085eb685a0577c90675',
  clientId: 'e1e30310e96e4c5bb3846167bbcaa01d',
  clientSecret: '07af65f2e8ca4d2692e62e5731313de9',
  siteId: '68aca8d1dd81920e684cfff0',
};

// ============================================================
// Token Caching
// ============================================================
let cachedToken = null;
let cachedTokenExpiry = 0;

async function getToken() {
  if (cachedToken && Date.now() < cachedTokenExpiry) return cachedToken;

  const url = `${OMADA.baseUrl}/openapi/authorize/token`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: OMADA.clientId,
      client_secret: OMADA.clientSecret,
      omadacId: OMADA.omadacId,
    }),
  });

  const data = await res.json();
  if (data.errorCode === 0 && data.result?.accessToken) {
    cachedToken = data.result.accessToken;
    cachedTokenExpiry = Date.now() + (data.result.expiresIn || 7200) * 1000 - 60000;
    return cachedToken;
  }
  throw new Error(data.msg || 'Auth Failed');
}

async function omadaApi(path, method = 'GET', body = null) {
  const token = await getToken();
  const url = `${OMADA.baseUrl}/openapi/v1/${OMADA.omadacId}${path}`;
  
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `AccessToken=${token}`
    }
  };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(url, options);
  return res.json();
}

// ============================================================
// API Handlers
// ============================================================

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const mac = searchParams.get('mac');

  try {
    if (action === 'health') {
      const [sites, devices, clients] = await Promise.all([
        omadaApi(`/sites?page=1&pageSize=100`),
        omadaApi(`/sites/${OMADA.siteId}/devices?page=1&pageSize=100`),
        omadaApi(`/sites/${OMADA.siteId}/clients?page=1&pageSize=1000`),
      ]);
      return NextResponse.json({
        sitesCount: sites.result?.data?.length || 0,
        devicesCount: devices.result?.data?.length || 0,
        clientsCount: clients.result?.data?.length || 0,
      });
    }

    if (action === 'status' && mac) {
      const data = await omadaApi(`/sites/${OMADA.siteId}/clients?page=1&pageSize=1000`);
      const normalizedMac = mac.replace(/:/g, '-').toUpperCase();
      const client = (data.result?.data || []).find(c => c.mac === normalizedMac);
      
      let vCode = null;
      if (client?.authInfo) {
        const va = client.authInfo.find(a => a.authType === 3);
        if (va) vCode = va.info;
      }

      return NextResponse.json({
        isOnline: !!client,
        client: client || null,
        voucherCode: vCode
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { clientMac, voucherCode } = body;

    const data = await omadaApi(`/sites/${OMADA.siteId}/hotspot/ext-portal/auth`, 'POST', {
      clientMac: clientMac.replace(/:/g, '-').toUpperCase(),
      voucherCode,
    });

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
