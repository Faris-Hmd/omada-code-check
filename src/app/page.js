'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function PortalContent() {
  const searchParams = useSearchParams();
  
  const [config, setConfig] = useState({
    baseUrl: '',
    omadacId: '',
    clientId: '',
    clientSecret: '',
    siteId: '',
    isConfigured: false
  });

  const [clientInfo, setClientInfo] = useState({
    mac: '',
    ip: '',
    target: ''
  });

  const [status, setStatus] = useState(null);
  const [health, setHealth] = useState(null);
  const [view, setView] = useState('loading');
  const [voucherCode, setVoucherCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sites, setSites] = useState([]);

  // 1. Initial Load: Fetch Server Config & Detect Client
  useEffect(() => {
    const init = async () => {
      try {
        // Get server-side config status
        const configRes = await fetch('/api/omada');
        const serverConfig = await configRes.json();
        setConfig(prev => ({ ...prev, ...serverConfig }));

        // Detect Client
        const urlMac = searchParams.get('clientMac');
        const urlIp = searchParams.get('clientIp');
        const urlTarget = searchParams.get('target');
        const storedMac = localStorage.getItem('last_client_mac');
        
        const mac = urlMac || storedMac || '';
        setClientInfo({ mac, ip: urlIp || '', target: urlTarget || '' });

        if (mac) {
          localStorage.setItem('last_client_mac', mac);
          if (serverConfig.isConfigured) {
            checkClientStatus(mac);
          } else {
            setView('login');
          }
        } else {
          setView('login');
        }
      } catch (err) {
        setError('Initialization failed');
        setView('login');
      }
    };
    init();
  }, [searchParams]);

  const checkClientStatus = async (mac) => {
    setView('loading');
    try {
      const res = await fetch('/api/omada', {
        method: 'POST',
        body: JSON.stringify({ action: 'getStatus', clientMac: mac })
      });
      const data = await res.json();
      if (data.errorCode === 0) {
        setStatus(data.result);
        if (data.result.isOnline && data.result.voucher) {
          setView('info');
        } else {
          setView('login');
        }
      } else {
        setView('login');
      }
    } catch (err) { 
      setView('login');
    }
  };

  const handleAuthorize = async () => {
    if (!voucherCode) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/omada', {
        method: 'POST',
        body: JSON.stringify({ action: 'authorize', clientMac: clientInfo.mac, voucherCode })
      });
      const data = await res.json();
      if (data.errorCode === 0) {
        await checkClientStatus(clientInfo.mac);
      } else {
        setError(data.msg || 'Invalid Voucher');
      }
    } catch (err) { setError('Authorization error'); }
    setLoading(false);
  };

  const updateServerConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/omada', {
        method: 'POST',
        body: JSON.stringify({ action: 'updateConfig', ...config })
      });
      const data = await res.json();
      if (data.errorCode === 0) {
        const sitesRes = await fetch('/api/omada', { method: 'POST', body: JSON.stringify({ action: 'getSites' }) });
        const sitesData = await sitesRes.json();
        if (sitesData.errorCode === 0) setSites(sitesData.result.data || sitesData.result);
        alert('Configuration saved to server!');
      }
    } catch (err) { alert('Failed to save config'); }
    setLoading(false);
  };

  const fetchHealth = async () => {
    try {
      const res = await fetch('/api/omada', {
        method: 'POST',
        body: JSON.stringify({ action: 'getHealth' })
      });
      const data = await res.json();
      if (data.errorCode === 0) {
        setHealth(data.result);
      } else {
        setError('Health check failed: ' + (data.msg || 'Unknown error'));
      }
    } catch (err) { setError('Connection error during health check'); }
  };

  const formatBytes = (bytes) => {
    if (!bytes || bytes < 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (min) => {
    if (!min) return 'Unlimited';
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  if (view === 'loading') {
    return (
      <div className="main-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80vh' }}>
        <div className="glass-card" style={{ textAlign: 'center' }}>
          <div className="gradient-text" style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Connecting...</div>
          <div className="usage-bar-container" style={{ width: '200px', margin: '1rem auto' }}>
            <div className="usage-bar" style={{ width: '100%', animation: 'pulse 1s infinite' }}></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="main-container">
      <div className="glass-card" style={{ marginBottom: '2rem', textAlign: 'center', borderBottom: '2px solid var(--primary)' }}>
        <h1 className="gradient-text" style={{ fontSize: '2.5rem' }}>WiFi Portal</h1>
        <p style={{ color: 'var(--muted)', marginTop: '0.5rem' }}>Device: <span style={{ color: 'var(--secondary)' }}>{clientInfo.mac || 'Identifying...'}</span></p>
        
        <div style={{ marginTop: '1rem' }}>
          <button onClick={fetchHealth} className="btn" style={{ fontSize: '0.7rem', padding: '0.4rem 0.8rem', background: 'rgba(255,255,255,0.05)', color: 'var(--muted)' }}>
            Check Connection Info
          </button>
          
          {health && (
            <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', justifyContent: 'center', fontSize: '0.8rem' }}>
              <div className="badge badge-muted">Sites: {health.sitesCount}</div>
              <div className="badge badge-muted">APs: {health.apsCount}</div>
              <div className="badge badge-muted">Users: {health.clientsCount}</div>
            </div>
          )}
        </div>
      </div>

      {!config.isConfigured && (
         <div className="glass-card" style={{ marginBottom: '2rem', border: '1px solid var(--warning)' }}>
           <h3 style={{ color: 'var(--warning)' }}>Server Not Configured</h3>
           <p style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>Please use the configuration panel at the bottom to set up the Omada credentials.</p>
         </div>
      )}

      {view === 'login' && (
        <div className="glass-card" style={{ maxWidth: '500px', margin: '0 auto', border: '2px solid var(--primary)' }}>
          <h2 style={{ marginBottom: '1.5rem', textAlign: 'center' }}>Enter Voucher</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            <input 
              type="text" 
              className="input-field" 
              placeholder="Voucher Code" 
              style={{ fontSize: '1.2rem', textAlign: 'center' }}
              value={voucherCode}
              onChange={e => setVoucherCode(e.target.value)}
            />
            <button onClick={handleAuthorize} className="btn btn-primary" style={{ padding: '1rem' }} disabled={loading || !config.isConfigured}>
              {loading ? 'Processing...' : 'Connect to Internet'}
            </button>
            {error && <p style={{ color: 'var(--danger)', textAlign: 'center' }}>{error}</p>}
          </div>
        </div>
      )}

      {view === 'info' && status && (
        <div className="glass-card" style={{ border: '3px solid var(--accent)', background: 'rgba(16, 185, 129, 0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
             <h3 style={{ color: 'var(--accent)' }}>NETWORK ACTIVE</h3>
             <span className="badge badge-success">ONLINE</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '2rem', marginTop: '2rem' }}>
             <div>
               <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>USAGE</div>
               <div style={{ fontSize: '2.5rem', fontWeight: '900' }}>{formatBytes((status.voucher?.usedTraffic || 0) + (status.client?.trafficDown || 0) + (status.client?.trafficUp || 0))}</div>
             </div>
             <div>
               <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>REMAINING TIME</div>
               <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{formatDuration(status.voucher?.duration)}</div>
             </div>
          </div>
          <div style={{ marginTop: '2rem', textAlign: 'center' }}>
             <button onClick={() => window.location.href = clientInfo.target || 'https://google.com'} className="btn btn-primary">Start Browsing</button>
          </div>
        </div>
      )}

    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div>Loading Portal...</div>}>
      <PortalContent />
    </Suspense>
  );
}
