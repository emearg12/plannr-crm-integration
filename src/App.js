import React, { useState, useEffect, useCallback } from 'react';

const PlannrDashboard = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [testResult, setTestResult] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  // OAuth2 Configuration
  const OAUTH_CONFIG = {
    clientId: '9fda3bc7-4b43-43d2-91cb-aea9cd6edd37',
    redirectUri: 'https://red-glacier-0d6485a03.1.azurestaticapps.net/auth/callback',
    authUrl: 'https://api.plannrcrm.com/oauth/authorize',
    scope: '*',
    azureFunctionUrl: 'https://mkfa-plannr-v1-czadhde2bccrb4a7.uksouth-01.azurewebsites.net'
  };

  // Generate random state for OAuth security
  const generateState = () => {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  };

  const checkAuthStatus = useCallback(() => {
    setIsLoading(true);
    try {
      const storedUser = localStorage.getItem('plannr_oauth_user');
      const storedTokens = localStorage.getItem('plannr_oauth_tokens');
      
      if (storedUser && storedTokens) {
        const userData = JSON.parse(storedUser);
        const tokenData = JSON.parse(storedTokens);
        
        // Check if access token is still valid
        if (tokenData.expires_at && new Date().getTime() < tokenData.expires_at) {
          setCurrentUser(userData);
          setIsAuthenticated(true);
          autoTestConnection(tokenData.access_token);
        } else if (tokenData.refresh_token) {
          // Try to refresh the token
          refreshAccessToken(tokenData.refresh_token);
        } else {
          // Token expired and no refresh token
          clearAuthData();
        }
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
      clearAuthData();
    }
    setIsLoading(false);
  }, []);

  const handleOAuthCallback = useCallback(async (code, state) => {
    setIsLoading(true);
    setAuthError('');
    
    try {
      // Verify state parameter
      const storedState = localStorage.getItem('oauth_state');
      if (state !== storedState) {
        throw new Error('Invalid state parameter - possible CSRF attack');
      }
      
      // Exchange code for tokens via Azure Function
      const response = await fetch(`${OAUTH_CONFIG.azureFunctionUrl}/api/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: code,
          redirect_uri: OAUTH_CONFIG.redirectUri
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Token exchange failed');
      }
      
      const tokenData = await response.json();
      
      // Calculate expiry time
      const expiresAt = new Date().getTime() + (tokenData.expires_in * 1000);
      const tokens = {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: expiresAt
      };
      
      // Get user info from PlannrCRM API
      const userInfo = await fetchUserInfo(tokenData.access_token);
      
      // Store tokens and user data
      localStorage.setItem('plannr_oauth_tokens', JSON.stringify(tokens));
      localStorage.setItem('plannr_oauth_user', JSON.stringify(userInfo));
      localStorage.removeItem('oauth_state');
      
      setCurrentUser(userInfo);
      setIsAuthenticated(true);
      setTestResult('✅ OAuth2 Authentication Successful');
      
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
      
    } catch (error) {
      console.error('OAuth callback error:', error);
      setAuthError(error.message);
      localStorage.removeItem('oauth_state');
    }
    
    setIsLoading(false);
  }, [OAUTH_CONFIG.azureFunctionUrl, OAUTH_CONFIG.redirectUri]);

  const fetchUserInfo = async (accessToken) => {
    try {
      const response = await fetch('https://api.plannrcrm.com/api/v1/logins', {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch user info');
      }
      
      const data = await response.json();
      
      // Extract user information from the response
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
      const response = await fetch(`${OAUTH_CONFIG.azureFunctionUrl}/api/oauth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          refresh_token: refreshToken
        })
      });
      
      if (!response.ok) {
        throw new Error('Token refresh failed');
      }
      
      const tokenData = await response.json();
      
      // Calculate expiry time
      const expiresAt = new Date().getTime() + (tokenData.expires_in * 1000);
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

  const autoTestConnection = async (accessToken) => {
    try {
      const response = await fetch('https://api.plannrcrm.com/api/v1/logins', {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      if (response.ok) {
        setTestResult('✅ Connected to PlannrCRM API');
      } else {
        setTestResult('❌ API Connection Failed');
      }
    } catch (error) {
      setTestResult('❌ Connection Error');
    }
  };

  const clearAuthData = () => {
    localStorage.removeItem('plannr_oauth_tokens');
    localStorage.removeItem('plannr_oauth_user');
    localStorage.removeItem('oauth_state');
    setCurrentUser(null);
    setIsAuthenticated(false);
    setTestResult('');
  };

  const handleOAuthLogin = () => {
    setAuthError('');
    
    // Generate and store state for security
    const state = generateState();
    localStorage.setItem('oauth_state', state);
    
    // Build OAuth URL
    const authUrl = new URL(OAUTH_CONFIG.authUrl);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('client_id', OAUTH_CONFIG.clientId);
    authUrl.searchParams.append('scope', OAUTH_CONFIG.scope);
    authUrl.searchParams.append('redirect_uri', OAUTH_CONFIG.redirectUri);
    authUrl.searchParams.append('state', state);
    
    // Redirect to PlannrCRM OAuth
    window.location.href = authUrl.toString();
  };

  const handleLogout = () => {
    clearAuthData();
    setShowSettings(false);
  };

  const openFactFindGenerator = () => {
    window.open('/factfind-generator', '_blank');
  };

  // Check authentication status on component mount
  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  // Handle OAuth callback when component mounts
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const error = urlParams.get('error');

    if (error) {
      setAuthError(`OAuth Error: ${error}`);
      setIsLoading(false);
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if (code && state) {
      handleOAuthCallback(code, state);
    }
  }, [handleOAuthCallback]);

  // App grid - 32 total slots for development
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

  // Loading screen
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-2xl border border-white/20 p-8 text-center">
          <div className="mb-4">
            <img 
              src="/MKFA Logo no subtext.png" 
              alt="MKFA Logo" 
              className="h-12 w-auto object-contain mx-auto"
            />
          </div>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto mb-4" style={{borderColor: '#1B1D8D'}}></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Login screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-2xl border border-white/20 p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <div className="mb-6">
              <div className="flex justify-center mb-4">
                <img 
                  src="/MKFA Logo no subtext.png" 
                  alt="MKFA Logo" 
                  className="h-16 w-auto object-contain"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'block';
                  }}
                />
                <div 
                  className="text-5xl font-black tracking-wider mb-2 hidden"
                  style={{
                    color: '#1B1D8D',
                    textShadow: '0 2px 4px rgba(27, 29, 141, 0.1)'
                  }}
                >
                  MKFA
                </div>
              </div>
              <div className="w-16 h-1 mx-auto rounded-full" style={{backgroundColor: '#1B1D8D'}}></div>
            </div>
            <h1 className="text-2xl font-bold text-gray-800 mb-2">Plannr API Suite</h1>
            <p className="text-gray-600">Sign in with your PlannrCRM account</p>
          </div>
          
          <div className="space-y-6">
            {authError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm text-center">
                {authError}
              </div>
            )}
            
            <button
              onClick={handleOAuthLogin}
              className="w-full text-white py-4 px-6 rounded-xl font-semibold hover:opacity-90 hover:scale-105 active:scale-95 transition-all duration-200 shadow-lg flex items-center justify-center space-x-3"
              style={{
                backgroundColor: '#1B1D8D',
                boxShadow: '0 4px 15px rgba(27, 29, 141, 0.2)'
              }}
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v1a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" clipRule="evenodd" />
              </svg>
              <span>Sign in with PlannrCRM</span>
            </button>
            
            <div className="text-xs text-gray-500 text-center mt-6 bg-gray-50 rounded-lg p-3">
              <div className="font-medium mb-1">Secure OAuth2 Authentication</div>
              <div>You'll be redirected to PlannrCRM to authorize access</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main Dashboard
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100">
      {/* Header */}
      <div className="bg-white/90 backdrop-blur-md shadow-lg border-b border-white/20">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center space-x-6">
              <div className="flex items-center">
                <img 
                  src="/MKFA Logo no subtext.png" 
                  alt="MKFA Logo" 
                  className="h-10 w-auto object-contain"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'block';
                  }}
                />
                <div 
                  className="text-3xl font-black tracking-wider hidden"
                  style={{
                    color: '#1B1D8D',
                    textShadow: '0 2px 4px rgba(27, 29, 141, 0.1)'
                  }}
                >
                  MKFA
                </div>
              </div>
              <div className="border-l border-gray-300 pl-6">
                <h1 className="text-xl font-bold text-gray-800">Plannr API Suite</h1>
                <p className="text-sm text-gray-600">Welcome back, {currentUser?.name}</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2 px-3 py-2">
                <div className={`w-3 h-3 rounded-full ${
                  testResult.includes('✅') ? 'bg-green-500' : 
                  testResult.includes('❌') ? 'bg-red-500' : 
                  'bg-gray-400'
                }`}></div>
                <span className="text-sm text-gray-700">
                  {testResult.includes('✅') ? 'Connected' : 
                   testResult.includes('❌') ? 'Disconnected' : 
                   'Checking...'}
                </span>
              </div>
              <button
                onClick={() => setShowSettings(true)}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-xl font-medium transition-all duration-200 hover:scale-105 flex items-center space-x-2"
              >
                <span>⚙️</span>
                <span className="text-sm">Settings</span>
              </button>
              <button
                onClick={handleLogout}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-xl font-medium transition-all duration-200 hover:scale-105"
              >
                <span className="text-sm">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-8">
        {/* Apps Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
          {gridApps.map((app) => (
            <button
              key={app.id}
              onClick={app.isActive ? app.action : undefined}
              disabled={!app.isActive}
              className={`
                group relative h-28 p-4 rounded-2xl border-2 transition-all duration-300 flex flex-col items-center justify-center text-center
                ${app.isActive 
                  ? 'bg-white/80 backdrop-blur-sm hover:shadow-xl hover:scale-105 cursor-pointer shadow-lg' 
                  : 'bg-gray-50/50 border-gray-200 cursor-not-allowed opacity-60'
                }
              `}
              style={{
                borderColor: app.isActive ? '#1B1D8D' : '#e5e7eb',
                boxShadow: app.isActive ? '0 4px 20px rgba(27, 29, 141, 0.1)' : 'none'
              }}
            >
              <div 
                className={`
                  w-10 h-10 rounded-xl mb-2 flex items-center justify-center text-lg font-bold transition-all duration-300
                  ${app.isActive ? 'text-white shadow-lg group-hover:scale-110' : 'bg-gray-200 text-gray-400'}
                `}
                style={{
                  backgroundColor: app.isActive ? '#1B1D8D' : '#e5e7eb',
                  boxShadow: app.isActive ? '0 4px 15px rgba(27, 29, 141, 0.3)' : 'none'
                }}
              >
                {app.icon}
              </div>
              <h3 className={`
                font-semibold text-base leading-tight
                ${app.isActive ? 'text-gray-800' : 'text-gray-400'}
              `}>
                {app.name}
              </h3>
              {!app.isActive && (
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full mt-1">Soon</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-white/20 p-8 w-full max-w-md">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">User Settings</h2>
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Current User
                </label>
                <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                  <p className="font-medium text-gray-800">{currentUser?.name}</p>
                  <p className="text-sm text-gray-600">Email: {currentUser?.email || 'Not available'}</p>
                  <p className="text-sm text-gray-600">Firm: {currentUser?.firm}</p>
                  <p className="text-sm text-gray-600">ID: {currentUser?.id}</p>
                </div>
              </div>
              
              <div className="bg-blue-50 rounded-xl p-4">
                <h3 className="font-medium text-blue-800 mb-2">OAuth2 Authentication</h3>
                <p className="text-sm text-blue-600">
                  You are authenticated via OAuth2 with PlannrCRM. 
                  Your access tokens are managed automatically and will refresh as needed.
                </p>
              </div>
              
              <div className="flex space-x-4">
                <button
                  onClick={() => setShowSettings(false)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 px-6 rounded-xl font-semibold transition-all duration-200"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlannrDashboard;
