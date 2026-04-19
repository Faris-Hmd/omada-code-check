'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

// ============================================================
// Portal Content
// ============================================================
function PortalContent() {
  const searchParams = useSearchParams();

  const [clientInfo, setClientInfo] = useState({ mac: '', ip: '', target: '' });
  const [status, setStatus] = useState(null);
  const [health, setHealth] = useState(null);
  const [view, setView] = useState('loading');
  const [voucherCode, setVoucherCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // 1. Init: detect client from URL params
  useEffect(() => {
    const urlMac = searchParams.get('clientMac');
    const urlIp = searchParams.get('clientIp');
    const urlTarget = searchParams.get('target');
    const storedMac = typeof window !== 'undefined' ? localStorage.getItem('last_client_mac') : '';
    const mac = urlMac || storedMac || '';

    setClientInfo({ mac, ip: urlIp || '', target: urlTarget || '' });
    if (mac && typeof window !== 'undefined') localStorage.setItem('last_client_mac', mac);

    if (mac) {
      checkClientStatus(mac);
    } else {
      setView('login');
    }
  }, [searchParams]);

  const checkClientStatus = async (mac) => {
    setView('loading');
    try {
      const res = await fetch(`/api/omada?action=status&mac=${mac}`);
      const data = await res.json();
      
      if (res.ok) {
        setStatus(data);
        setView(data.isOnline && data.voucherCode ? 'info' : 'login');
      } else {
        setError(data.error || 'Failed to check status');
        setView('login');
      }
    } catch (err) {
      setError('Could not reach cloud proxy. Ensure you are on the internet.');
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientMac: clientInfo.mac,
          voucherCode,
        }),
      });

      const data = await res.json();
      if (data.errorCode === 0) {
        setSuccess('✅ Authorized! Connecting you to the internet...');
        setTimeout(async () => {
          await checkClientStatus(clientInfo.mac);
          if (clientInfo.target) window.location.href = clientInfo.target;
        }, 2000);
      } else {
        setError(data.msg || data.error || 'Invalid Voucher');
      }
    } catch (err) {
      setError('Authorization error — please check your internet connection.');
    }
    setLoading(false);
  };

  const fetchHealth = async () => {
    setHealth(null);
    setError('');
    try {
      const res = await fetch('/api/omada?action=health');
      const data = await res.json();
      if (res.ok) {
        setHealth(data);
      } else {
        setError(data.error || 'Cloud connection failed');
      }
    } catch (err) {
      setError('Cannot reach cloud server. Are you online?');
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes || bytes < 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatUptime = (seconds) => {
    if (!seconds) return '0m';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  if (view === 'loading') {
    return (
      <div className="main-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80vh' }}>
        <div className="glass-card" style={{ textAlign: 'center' }}>
          <div className="gradient-text" style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Syncing with Cloud...</div>
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
        <h1 className="gradient-text" style={{ fontSize: '2.5rem' }}>Cloud WiFi Portal</h1>
        <p style={{ color: 'var(--muted)', marginTop: '0.5rem' }}>
          Device: <span style={{ color: 'var(--secondary)' }}>{clientInfo.mac || 'Identifying...'}</span>
        </p>

        <div style={{ marginTop: '1rem' }}>
          <button onClick={fetchHealth} className="btn" style={{ fontSize: '0.7rem', padding: '0.4rem 0.8rem', background: 'rgba(255,255,255,0.05)', color: 'var(--muted)' }}>
            Check Network Health
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

      {/* Voucher Login */}
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
            <button onClick={handleAuthorize} className="btn btn-primary" style={{ padding: '1rem' }} disabled={loading}>
              {loading ? 'Processing...' : 'Connect to Internet'}
            </button>
            {error && <p style={{ color: 'var(--danger)', textAlign: 'center', fontSize: '0.9rem' }}>{error}</p>}
            {success && <p style={{ color: 'var(--accent)', textAlign: 'center', fontSize: '0.9rem' }}>{success}</p>}
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
              <div style={{ fontSize: '1.8rem', fontWeight: '900' }}>{formatBytes(status.client?.trafficDown || 0)}</div>
            </div>
            <div>
              <div style={{ color: 'var(--muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Upload</div>
              <div style={{ fontSize: '1.8rem', fontWeight: '900' }}>{formatBytes(status.client?.trafficUp || 0)}</div>
            </div>
            <div>
              <div style={{ color: 'var(--muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Connected</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{formatUptime(status.client?.uptime || 0)}</div>
            </div>
            <div>
              <div style={{ color: 'var(--muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Signal</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{status.client?.signalLevel || 0}%</div>
            </div>
            <div>
              <div style={{ color: 'var(--muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Device</div>
              <div style={{ fontSize: '1rem', fontWeight: 'bold' }}>{status.client?.name || status.client?.hostName || clientInfo.mac}</div>
            </div>
          </div>

          {status.client && (
            <div style={{ marginTop: '2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>
                <span>Total Usage</span>
                <span>{formatBytes((status.client.trafficDown || 0) + (status.client.trafficUp || 0))}</span>
              </div>
              <div className="usage-bar-container">
                <div className="usage-bar" style={{
                  width: `${Math.min(100, ((status.client.trafficDown + status.client.trafficUp) / (1024 * 1024 * 1024)) * 10)}%`,
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

      {/* Cloud Info */}
      <div className="glass-card" style={{ marginTop: '3rem', fontSize: '0.8rem', opacity: 0.7 }}>
        <h4 style={{ marginBottom: '1rem', color: 'var(--secondary)' }}>Cloud Integration Status</h4>
        <p style={{ color: 'var(--muted)' }}>
          This portal is connected to your Omada Controller via the <b>TP-Link Cloud Northbound API</b>.
          All credentials are encrypted and stored on the server.
        </p>
      </div>

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
