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
  const [success, setSuccess] = useState('');

  // 1. Initial Load: Fetch Server Config & Detect Client
  useEffect(() => {
    const init = async () => {
      try {
        const configRes = await fetch('/api/omada');
        const serverConfig = await configRes.json();
        setConfig(prev => ({ ...prev, ...serverConfig }));

        // Detect Client from URL params (sent by Omada controller)
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
        if (data.result.isOnline && data.result.voucherCode) {
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
    setSuccess('');
    try {
      const res = await fetch('/api/omada', {
        method: 'POST',
        body: JSON.stringify({ action: 'authorize', clientMac: clientInfo.mac, voucherCode })
      });
      const data = await res.json();
      if (data.errorCode === 0) {
        setSuccess('Authorized! Connecting you to the internet...');
        // Wait a moment then check status / redirect
        setTimeout(async () => {
          await checkClientStatus(clientInfo.mac);
          // If there's a target URL, redirect there
          if (clientInfo.target) {
            window.location.href = clientInfo.target;
          }
        }, 2000);
      } else {
        setError(data.msg || 'Invalid Voucher');
      }
    } catch (err) { setError('Authorization error'); }
    setLoading(false);
  };

  const fetchHealth = async () => {
    setHealth(null);
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
    if (h > 24) {
      const d = Math.floor(h / 24);
      const rh = h % 24;
      return `${d}d ${rh}h`;
    }
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const formatUptime = (seconds) => {
    if (!seconds) return '0m';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  // Build the current page URL info for External Portal config
  const currentUrl = typeof window !== 'undefined' ? window.location.origin : '';

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
      {/* Header */}
      <div className="glass-card" style={{ marginBottom: '2rem', textAlign: 'center', borderBottom: '2px solid var(--primary)' }}>
        <h1 className="gradient-text" style={{ fontSize: '2.5rem' }}>WiFi Portal</h1>
        <p style={{ color: 'var(--muted)', marginTop: '0.5rem' }}>
          Device: <span style={{ color: 'var(--secondary)' }}>{clientInfo.mac || 'Identifying...'}</span>
        </p>
        
        <div style={{ marginTop: '1rem' }}>
          <button onClick={fetchHealth} className="btn" style={{ fontSize: '0.7rem', padding: '0.4rem 0.8rem', background: 'rgba(255,255,255,0.05)', color: 'var(--muted)' }}>
            Check Connection Info
          </button>
          
          {health && (
            <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', justifyContent: 'center', fontSize: '0.8rem', flexWrap: 'wrap' }}>
              <div className="badge badge-muted">Sites: {health.sitesCount}</div>
              <div className="badge badge-muted">APs: {health.devicesCount}</div>
              <div className="badge badge-muted">Users: {health.clientsCount}</div>
            </div>
          )}
        </div>
      </div>

      {/* Server Not Configured Warning */}
      {!config.isConfigured && (
         <div className="glass-card" style={{ marginBottom: '2rem', border: '1px solid var(--warning)' }}>
           <h3 style={{ color: 'var(--warning)' }}>Server Not Configured</h3>
           <p style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>Set OMADA_* environment variables (Vercel) or edit omada-config.json (local).</p>
         </div>
      )}

      {/* Voucher Login View */}
      {view === 'login' && (
        <div className="glass-card" style={{ maxWidth: '500px', margin: '0 auto', border: '2px solid var(--primary)' }}>
          <h2 style={{ marginBottom: '1.5rem', textAlign: 'center' }}>Enter Voucher</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            <input 
              type="text" 
              className="input-field" 
              placeholder="Voucher Code" 
              style={{ fontSize: '1.2rem', textAlign: 'center', letterSpacing: '3px' }}
              value={voucherCode}
              onChange={e => setVoucherCode(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAuthorize()}
            />
            <button onClick={handleAuthorize} className="btn btn-primary" style={{ padding: '1rem' }} disabled={loading || !config.isConfigured}>
              {loading ? 'Processing...' : 'Connect to Internet'}
            </button>
            {error && <p style={{ color: 'var(--danger)', textAlign: 'center' }}>{error}</p>}
            {success && <p style={{ color: 'var(--accent)', textAlign: 'center' }}>{success}</p>}
          </div>
        </div>
      )}

      {/* Connected / Info View */}
      {view === 'info' && status && (
        <div className="glass-card" style={{ border: '3px solid var(--accent)', background: 'rgba(16, 185, 129, 0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
             <h3 style={{ color: 'var(--accent)' }}>NETWORK ACTIVE</h3>
             <span className="badge badge-success">ONLINE</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.5rem', marginTop: '2rem' }}>
             <div>
               <div style={{ color: 'var(--muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Voucher Code</div>
               <div style={{ fontSize: '1.5rem', fontWeight: '900', letterSpacing: '3px', color: 'var(--primary)' }}>
                 {status.voucherCode || '—'}
               </div>
             </div>
             <div>
               <div style={{ color: 'var(--muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Download</div>
               <div style={{ fontSize: '1.8rem', fontWeight: '900' }}>
                 {formatBytes(status.client?.trafficDown || 0)}
               </div>
             </div>
             <div>
               <div style={{ color: 'var(--muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Upload</div>
               <div style={{ fontSize: '1.8rem', fontWeight: '900' }}>
                 {formatBytes(status.client?.trafficUp || 0)}
               </div>
             </div>
             <div>
               <div style={{ color: 'var(--muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Connected</div>
               <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                 {formatUptime(status.client?.uptime || 0)}
               </div>
             </div>
             <div>
               <div style={{ color: 'var(--muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Signal</div>
               <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                 {status.client?.signalLevel || 0}%
               </div>
             </div>
             <div>
               <div style={{ color: 'var(--muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Device</div>
               <div style={{ fontSize: '1rem', fontWeight: 'bold' }}>
                 {status.client?.name || status.client?.hostName || clientInfo.mac}
               </div>
             </div>
          </div>

          {/* Usage Bar */}
          {status.client && (
            <div style={{ marginTop: '2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>
                <span>Total Usage</span>
                <span>{formatBytes((status.client.trafficDown || 0) + (status.client.trafficUp || 0))}</span>
              </div>
              <div className="usage-bar-container">
                <div className="usage-bar" style={{ 
                  width: `${Math.min(100, ((status.client.trafficDown + status.client.trafficUp) / (1024*1024*1024)) * 10)}%`,
                  transition: 'width 0.5s ease'
                }}></div>
              </div>
            </div>
          )}

          <div style={{ marginTop: '2rem', textAlign: 'center' }}>
             <button onClick={() => window.location.href = clientInfo.target || 'https://google.com'} className="btn btn-primary">
               Start Browsing
             </button>
             <button onClick={() => checkClientStatus(clientInfo.mac)} className="btn" style={{ marginLeft: '1rem', background: 'rgba(255,255,255,0.05)', color: 'var(--muted)' }}>
               Refresh
             </button>
          </div>
        </div>
      )}

      {/* Portal Setup Info (for admin) */}
      <details style={{ marginTop: '3rem' }}>
        <summary className="btn" style={{ cursor: 'pointer', fontSize: '0.75rem', padding: '0.4rem 1rem', background: 'rgba(255,255,255,0.03)', color: 'var(--muted)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px' }}>
          External Portal Setup Info
        </summary>
        <div className="glass-card" style={{ marginTop: '1rem', fontSize: '0.8rem' }}>
          <h4 style={{ marginBottom: '1rem', color: 'var(--secondary)' }}>Omada Controller → External Portal Configuration</h4>
          <p style={{ color: 'var(--muted)', marginBottom: '1rem' }}>Set these in your Omada Controller under <b>Settings → Authentication → Portal</b>:</p>
          
          <div style={{ display: 'grid', gap: '0.8rem' }}>
            <div>
              <div style={{ color: 'var(--muted)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Portal URL (Landing Page)</div>
              <code style={{ background: 'rgba(139,92,246,0.1)', padding: '0.5rem', borderRadius: '6px', display: 'block', wordBreak: 'break-all', color: 'var(--primary)' }}>
                {currentUrl || 'https://your-vercel-app.vercel.app'}
              </code>
            </div>
            <div>
              <div style={{ color: 'var(--muted)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Success Page URL (redirect after auth)</div>
              <code style={{ background: 'rgba(16,185,129,0.1)', padding: '0.5rem', borderRadius: '6px', display: 'block', wordBreak: 'break-all', color: 'var(--accent)' }}>
                {currentUrl ? `${currentUrl}?authSuccess=true` : 'https://your-vercel-app.vercel.app?authSuccess=true'}
              </code>
            </div>
            <div>
              <div style={{ color: 'var(--muted)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Portal Type</div>
              <code style={{ background: 'rgba(255,255,255,0.05)', padding: '0.5rem', borderRadius: '6px', display: 'block', color: 'var(--foreground)' }}>
                External Portal Server
              </code>
            </div>
            <div>
              <div style={{ color: 'var(--muted)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Authentication Type</div>
              <code style={{ background: 'rgba(255,255,255,0.05)', padding: '0.5rem', borderRadius: '6px', display: 'block', color: 'var(--foreground)' }}>
                Voucher
              </code>
            </div>
          </div>

          <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(59,130,246,0.05)', borderRadius: '8px', border: '1px solid rgba(59,130,246,0.15)' }}>
            <p style={{ color: 'var(--secondary)', fontSize: '0.75rem', margin: 0 }}>
              <b>Note:</b> The controller appends <code>?clientMac=XX-XX-XX&clientIp=X.X.X.X&target=URL</code> to the Portal URL when redirecting clients. This portal reads those parameters automatically.
            </p>
          </div>

          <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(139,92,246,0.05)', borderRadius: '8px', border: '1px solid rgba(139,92,246,0.15)' }}>
            <p style={{ color: 'var(--primary)', fontSize: '0.75rem', marginBottom: '0.5rem' }}><b>Vercel Environment Variables:</b></p>
            <div style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: 'var(--muted)', lineHeight: '1.8' }}>
              OMADA_BASE_URL={config.baseUrl || '192.168.1.117'}<br/>
              OMADA_OMADAC_ID={config.omadacId || 'your_omadac_id'}<br/>
              OMADA_CLIENT_ID={config.clientId || 'your_client_id'}<br/>
              OMADA_CLIENT_SECRET=your_client_secret<br/>
              OMADA_SITE_ID={config.siteId || 'your_site_id'}
            </div>
          </div>
        </div>
      </details>

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
