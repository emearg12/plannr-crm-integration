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
      try { return await res.json(); } catch { /* fall through */ }
    }
    const text = await res.text();
    return text ? { error_text: text } : null;
  };

  // OAuth2 Configuration (same-origin API)
  const OAUTH_CONFIG = {
    clientId: '9fda3bc7-4b43-43d2-91cb-aea9cd6edd37',
    redirectUri: `${window.location.origin}/auth/callback`, // <- derives from current host
    authUrl: 'https://api.plannrcrm.com/oauth/authorize',
    scope: '*',
    // We now call same-origin /api routes, so no base URL needed
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

  // --- Use your proxy instead of calling Plannr direct from the browser ---
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

      const data = aw
