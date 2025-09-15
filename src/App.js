import React, { useState, useEffect } from 'react';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [testResult, setTestResult] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  // --- Helper: safe JSON parsing for error responses ---
  const parseJsonSafe = async (res) => {
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      try { return await res.json(); } catch { /* fall through to text */ }
    }
    const text = await res.text();
    return text ? { error_text: text } : null;
  };

  // OAuth2 Configuration (same-origin API)
  const OAUTH_CONFIG = {
    clientId: '9fda3bc7-4b43-43d2-91cb-aea9cd6edd37',
    redirectUri: `${window.location.origin}/auth/callback`, // derive from current host
    authUrl: 'https://api.plannrcrm.com/oauth/authorize',
    scope: '*'
  };

  // Generate random state for OAuth security
  const generateState = () =>
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15);

  const clearAuthData = () => {
    localStorage.removeItem('plannr_oauth_tokens');
    localStorage.removeItem('plannr_oauth_user');
    localStorage.removeItem('oauth_state');
    setCurrentUser(null);
    setIsAuthenticated(false);
    setTestResult('');
  };

  // Use your proxy instead of calling Plannr direct from the browser
  const autoTestConnection = async (accessToken) => {
    try {
      const response = await fetch(`/api/proxy?endpoint=logins`, {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      });
      if (response.ok) {
        setTestResult('Connected to PlannrCRM API');
      } else {
        setTestResult('API Connection Failed');
      }
    } catch (error) {
      setTestResult('Connection Error');
    }
  };

  const fetchUserInfo = async (accessToken) => {
    try {
      const response = await fetch(`/api/proxy?endpoint=logins`, {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      });
      if (!response.ok) {
        throw new Error('Failed to fetch user info');
      }
      const data = await response.json();
      return {
        id: data.results?.[0]?.uuid || 'unknown',
        name: data.results?.[0]?.full_name || 'PlannrCRM User',
        email: data.results?.[0]?.email || '',
        firm: data.results?.[0]?.firm?.name || 'MKFA'
      };
    } catch (error) {
      console.error('Error fetching user info:', error);
      return {
        id: 'unknown',
        name: 'PlannrCRM User',
        email: '',
        firm: 'MKFA'
      };
    }
  };

  const refreshAccessToken = async (refreshToken) => {
    try {
      const response = await fetch(`/api/oauth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken })
      });

      const data = await parseJsonSafe(response);
      if (!response.ok) {
        const msg = data?.error || data?.error_description || data?.error_text || 'Token refresh failed';
        throw new Error(msg);
      }

      const tokenData = data;
      const expiresAt = Date.now() + (tokenData.expires_in * 1000);
      const tokens = {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || refreshToken,
        expires_at: expiresAt
      };

      localStorage.setItem('plannr_oauth_tokens', JSON.stringify(tokens));
      const storedUser = JSON.parse(localStorage.getItem('plannr_oauth_user'));
      setCurrentUser(storedUser);
      setIsAuthenticated(true);
      autoTestConnection(tokenData.access_token);

    } catch (error) {
      console.error('Token refresh error:', error);
      clearAuthData();
    }
  };

  const checkAuthStatus = () => {
    setIsLoading(true);
    try {
      const storedUser = localStorage.getItem('plannr_oauth_user');
      const storedTokens = localStorage.getItem('plannr_oauth_tokens');

      if (storedUser && storedTokens) {
        const userData = JSON.parse(storedUser);
        const tokenData = JSON.parse(storedTokens);

        if (tokenData.expires_at && Date.now() < tokenData.expires_at) {
          setCurrentUser(userData);
          setIsAuthenticated(true);
          autoTestConnection(tokenData.access_token);
        } else if (tokenData.refresh_token) {
          refreshAccessToken(tokenData.refresh_token);
        } else {
          clearAuthData();
        }
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
      clearAuthData();
    }
    setIsLoading(false);
  };

  const handleOAuthCallback = async (code, state) => {
    setIsLoading(true);
    setAuthError('');

    try {
      const storedState = localStorage.getItem('oauth_state');
      if (state !== storedState) {
        throw new Error('Invalid state parameter - possible CSRF attack');
      }

      // Same-origin token exchange
      const response = await fetch(`/api/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code,
          redirect_uri: OAUTH_CONFIG.redirectUri
        })
      });

      const data = await parseJsonSafe(response);
      if (!response.ok) {
        const msg = data?.error || data?.error_description || data?.error_text || 'Token exchange failed';
        throw new Error(msg);
      }

      const tokenData = data;
      const expiresAt = Date.now() + (tokenData.expires_in * 1000);
      const tokens = {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: expiresAt
      };

      const userInfo = await fetchUserInfo(tokenData.access_token);

      localStorage.setItem('plannr_oauth_tokens', JSON.stringify(tokens));
      localStorage.setItem('plannr_oauth_user', JSON.stringify(userInfo));
      localStorage.removeItem('oauth_state');

      setCurrentUser(userInfo);
      setIsAuthenticated(true);
      setTestResult('OAuth2 Authentication Successful');

      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);

    } catch (error) {
      console.error('OAuth callback error:', error);
      setAuthError(error.message);
      localStorage.removeItem('oauth_state');
    }

    setIsLoading(false);
  };

  const handleOAuthLogin = () => {
    setAuthError('');
    const state = generateState();
    localStorage.setItem('oauth_state', state);

    const authUrl = new URL(OAUTH_CONFIG.authUrl);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('client_id', OAUTH_CONFIG.clientId);
    authUrl.searchParams.append('scope', OAUTH_CONFIG.scope);
    authUrl.searchParams.append('redirect_uri', OAUTH_CONFIG.redirectUri);
    authUrl.searchParams.append('state', state);

    window.location.href = authUrl.toString();
  };

  const handleLogout = () => {
    clearAuthData();
    setShowSettings(false);
  };

  const openFactFindGenerator = () => {
    window.open('/factfind-generator', '_blank');
  };

  // Check authentication on mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

  // Handle OAuth callback
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const error = urlParams.get('error');

    if (error) {
      setAuthError(`OAuth Error: ${error}`);
      setIsLoading(false);
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if (code && state) {
      handleOAuthCallback(code, state);
    }
  }, []);

  // App grid
  const gridApps = [
    { id: 1, name: 'Fact Find Generator', isActive: true, action: () => openFactFindGenerator(), icon: '📋' },
    { id: 2, name: 'Available Slot', isActive: false, icon: '⭕' },
    { id: 3, name: 'Available Slot', isActive: false, icon: '⭕' },
    { id: 4, name: 'Available Slot', isActive: false, icon: '⭕' },
    { id: 5, name: 'Available Slot', isActive: false, icon: '⭕' },
    { id: 6, name: 'Available Slot', isActive: false, icon: '⭕' },
    { id: 7, name: 'Available Slot', isActive: false, icon: '⭕' },
    { id: 8, name: 'Available Slot', isActive: false, icon: '⭕' },
    { id: 9, name: 'Available Slot', isActive: false, icon: '⭕' },
    { id: 10, name: 'Available Slot', isActive: false, icon: '⭕' },
    { id: 11, name: 'Available Slot', isActive: false, icon: '⭕' },
    { id: 12, name: 'Available Slot', isActive: false, icon: '⭕' },
    { id: 13, name: 'Available Slot', isActive: false, icon: '⭕' },
    { id: 14, name: 'Available Slot', isActive: false, icon: '⭕' },
    { id: 15, name: 'Available Slot', isActive: false, icon: '⭕' },
    { id: 16, name: 'Available Slot', isActive: false, icon: '⭕' },
    { id: 17, name: 'Available Slot', isActive: false, icon: '⭕' },
    { id: 18, name: 'Available Slot', isActive: false, icon: '⭕' },
    { id: 19, name: 'Available Slot', isActive: false, icon: '⭕' },
    { id: 20, name: 'Available Slot', isActive: false, icon: '⭕' },
    { id: 21, name: 'Available Slot', isActive: false, icon: '⭕' },
    { id: 22, name: 'Available Slot', isActive: false, icon: '⭕' },
    { id: 23, name: 'Available Slot', isActive: false, icon: '⭕' },
    { id: 24, name: 'Available Slot', isActive: false, icon: '⭕' },
    { id: 25, name: 'Available Slot', isActive: false, icon: '⭕' },
    { id: 26, name: 'Available Slot', isActive: false, icon: '⭕' },
    { id: 27, name: 'Available Slot', isActive: false, icon: '⭕' },
    { id: 28, name: 'Available Slot', isActive: false, icon: '⭕' },
    { id: 29, name: 'Available Slot', isActive: false, icon: '⭕' },
    { id: 30, name: 'Available Slot', isActive: false, icon: '⭕' },
    { id: 31, name: 'Available Slot', isActive: false, icon: '⭕' },
    { id: 32, name: 'Available Slot', isActive: false, icon: '⭕' }
  ];

  if (isLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #f1f5f9 0%, #e0f2fe 50%, #e8eaf6 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          borderRadius: '16px',
          padding: '32px',
          textAlign: 'center',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)'
        }}>
          <img
            src="/MKFA Logo no subtext.png"
            alt="MKFA Logo"
            style={{ height: '48px', width: 'auto', marginBottom: '16px' }}
          />
          <div style={{
            width: '32px',
            height: '32px',
            border: '3px solid #f3f4f6',
            borderTop: '3px solid #1B1D8D',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px'
          }}></div>
          <p style={{ color: '#6b7280', margin: 0 }}>Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #f1f5f9 0%, #e0f2fe 50%, #e8eaf6 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}>
        <div style={{
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          borderRadius: '16px',
          padding: '32px',
          width: '100%',
          maxWidth: '400px',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)'
        }}>
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={{ marginBottom: '24px' }}>
              <img
                src="/MKFA Logo no subtext.png"
                alt="MKFA Logo"
                style={{ height: '64px', width: 'auto', marginBottom: '16px' }}
              />
              <div style={{
                width: '64px',
                height: '4px',
                backgroundColor: '#1B1D8D',
                borderRadius: '2px',
                margin: '0 auto'
              }}></div>
            </div>
            <h1 style={{
              fontSize: '24px',
              fontWeight: 'bold',
              color: '#1f2937',
              marginBottom: '8px',
              margin: 0
            }}>
              Plannr API Suite
            </h1>
            <p style={{ color: '#6b7280', margin: 0 }}>
              Sign in with your PlannrCRM account
            </p>
          </div>

          <div>
            {authError && (
              <div style={{
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#dc2626',
                padding: '12px 16px',
                borderRadius: '12px',
                fontSize: '14px',
                textAlign: 'center',
                marginBottom: '24px'
              }}>
                {authError}
              </div>
            )}

            <button
              onClick={handleOAuthLogin}
              style={{
                width: '100%',
                backgroundColor: '#1B1D8D',
                color: 'white',
                padding: '16px 24px',
                borderRadius: '12px',
                fontWeight: '600',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                boxShadow: '0 4px 15px rgba(27, 29, 141, 0.2)',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.opacity = '0.9'}
              onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
            >
              <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v1a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" clipRule="evenodd" />
              </svg>
              <span>Sign in with PlannrCRM</span>
            </button>

            <div style={{
              fontSize: '12px',
              color: '#6b7280',
              textAlign: 'center',
              marginTop: '24px',
              backgroundColor: '#f9fafb',
              borderRadius: '8px',
              padding: '12px'
            }}>
              <div style={{ fontWeight: '500', marginBottom: '4px' }}>
                Secure OAuth2 Authentication
              </div>
              <div>You'll be redirected to PlannrCRM to authorize access</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #f1f5f9 0%, #e0f2fe 50%, #e8eaf6 100%)'
    }}>
      {/* Header */}
      <div style={{
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{
          maxWidth: '1280px',
          margin: '0 auto',
          padding: '0 24px'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '24px 0'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
              <img
                src="/MKFA Logo no subtext.png"
                alt="MKFA Logo"
                style={{ height: '40px', width: 'auto' }}
              />
              <div style={{ borderLeft: '1px solid #d1d5db', paddingLeft: '24px' }}>
                <h1 style={{
                  fontSize: '20px',
                  fontWeight: 'bold',
                  color: '#1f2937',
                  margin: '0 0 4px 0'
                }}>
                  Plannr API Suite
                </h1>
                <p style={{
                  fontSize: '14px',
                  color: '#6b7280',
                  margin: 0
                }}>
                  Welcome back, {currentUser?.name}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px'
              }}>
                <div style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  backgroundColor:
                    testResult.includes('Successful') || testResult.includes('Connected') ? '#10b981' :
                    testResult.includes('Failed') || testResult.includes('Error') ? '#ef4444' : '#6b7280'
                }}></div>
                <span style={{ fontSize: '14px', color: '#374151' }}>
                  {testResult.includes('Successful') || testResult.includes('Connected') ? 'Connected' :
                   testResult.includes('Failed') || testResult.includes('Error') ? 'Disconnected' :
                   'Checking...'}
                </span>
              </div>
              <button
                onClick={() => setShowSettings(true)}
                style={{
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  padding: '8px 12px',
                  borderRadius: '12px',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '14px'
                }}
              >
                <span>⚙️</span>
                <span>Settings</span>
              </button>
              <button
                onClick={handleLogout}
                style={{
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  padding: '8px 16px',
                  borderRadius: '12px',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: '500',
                  fontSize: '14px'
                }}
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{
        maxWidth: '1280px',
        margin: '0 auto',
        padding: '32px 24px'
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '24px'
        }}>
          {gridApps.map((app) => (
            <button
              key={app.id}
              onClick={app.isActive ? app.action : undefined}
              disabled={!app.isActive}
              style={{
                height: '112px',
                padding: '16px',
                borderRadius: '16px',
                border: app.isActive ? `2px solid #1B1D8D` : '2px solid #e5e7eb',
                backgroundColor: app.isActive ? 'rgba(255, 255, 255, 0.9)' : 'rgba(249, 250, 251, 0.5)',
                backdropFilter: 'blur(8px)',
                boxShadow: app.isActive ? '0 4px 20px rgba(27, 29, 141, 0.1)' : 'none',
                cursor: app.isActive ? 'pointer' : 'not-allowed',
                opacity: app.isActive ? 1 : 0.6,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                transition: 'all 0.3s'
              }}
            >
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                backgroundColor: app.isActive ? '#1B1D8D' : '#e5e7eb',
                color: app.isActive ? 'white' : '#9ca3af',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
                fontWeight: 'bold',
                marginBottom: '8px',
                boxShadow: app.isActive ? '0 4px 15px rgba(27, 29, 141, 0.3)' : 'none'
              }}>
                {app.icon}
              </div>
              <h3 style={{
                fontWeight: '600',
                fontSize: '16px',
                lineHeight: '1.2',
                color: app.isActive ? '#1f2937' : '#9ca3af',
                margin: 0
              }}>
                {app.name}
              </h3>
              {!app.isActive && (
                <span style={{
                  fontSize: '12px',
                  color: '#9ca3af',
                  backgroundColor: '#f3f4f6',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  marginTop: '4px'
                }}>
                  Soon
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
          zIndex: 50
        }}>
          <div style={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(12px)',
            borderRadius: '16px',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
            padding: '32px',
            width: '100%',
            maxWidth: '400px'
          }}>
            <h2 style={{
              fontSize: '24px',
              fontWeight: 'bold',
              color: '#1f2937',
              margin: '0 0 24px 0'
            }}>
              User Settings
            </h2>

            <div style={{ marginBottom: '24px' }}>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '600',
                color: '#374151',
                marginBottom: '8px'
              }}>
                Current User
              </label>
              <div style={{
                backgroundColor: '#f9fafb',
                borderRadius: '12px',
                padding: '16px'
              }}>
                <p style={{ fontWeight: '500', color: '#1f2937', margin: '0 0 8px 0' }}>
                  {currentUser?.name}
                </p>
                <p style={{ fontSize: '14px', color: '#6b7280', margin: '0 0 4px 0' }}>
                  Email: {currentUser?.email || 'Not available'}
                </p>
                <p style={{ fontSize: '14px', color: '#6b7280', margin: '0 0 4px 0' }}>
                  Firm: {currentUser?.firm}
                </p>
                <p style={{ fontSize: '14px', color: '#6b7280', margin: 0 }}>
                  ID: {currentUser?.id}
                </p>
              </div>
            </div>

            <div style={{
              backgroundColor: '#eff6ff',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '24px'
            }}>
              <h3 style={{
                fontWeight: '500',
                color: '#1e40af',
                margin: '0 0 8px 0'
              }}>
                OAuth2 Authentication
              </h3>
              <p style={{
                fontSize: '14px',
                color: '#1e40af',
                margin: 0
              }}>
                You are authenticated via OAuth2 with PlannrCRM.
                Your access tokens are managed automatically and will refresh as needed.
              </p>
            </div>

            <button
              onClick={() => setShowSettings(false)}
              style={{
                width: '100%',
                backgroundColor: '#f3f4f6',
                color: '#374151',
                padding: '12px 24px',
                borderRadius: '12px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: '600'
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

