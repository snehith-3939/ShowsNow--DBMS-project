import { createContext, useState, useEffect } from 'react';

export const AppContext = createContext();

const API = 'http://localhost:5000';

export const AppProvider = ({ children }) => {
  const [selectedCity, setSelectedCity] = useState(localStorage.getItem('bms_city') || 'Mumbai');
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('bms_token') || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [authLoading, setAuthLoading] = useState(true); // true while restoring session

  // Persist city
  useEffect(() => {
    localStorage.setItem('bms_city', selectedCity);
  }, [selectedCity]);

  // On mount: validate stored token and restore session
  useEffect(() => {
    const storedToken = localStorage.getItem('bms_token');
    if (!storedToken) {
      setAuthLoading(false);
      return;
    }
    fetch(`${API}/api/auth/me`, {
      headers: { Authorization: `Bearer ${storedToken}` }
    })
      .then(r => {
        if (!r.ok) throw new Error('Token invalid');
        return r.json();
      })
      .then(userData => {
        setUser(userData);
        setToken(storedToken);
      })
      .catch(() => {
        // Token expired or invalid — clear it
        localStorage.removeItem('bms_token');
        setToken(null);
        setUser(null);
      })
      .finally(() => setAuthLoading(false));
  }, []);

  // Persist token
  useEffect(() => {
    if (token) {
      localStorage.setItem('bms_token', token);
    } else {
      localStorage.removeItem('bms_token');
    }
  }, [token]);

  /**
   * Register a new user. Returns { success, error }.
   */
  const register = async (name, email, password, phone) => {
    try {
      const res = await fetch(`${API}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, phone })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      setToken(data.token);
      setUser(data.user);
      return { success: true };
    } catch {
      return { success: false, error: 'Network error. Please try again.' };
    }
  };

  /**
   * Login an existing user. Returns { success, error }.
   */
  const login = async (email, password) => {
    try {
      const res = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      setToken(data.token);
      setUser(data.user);
      return { success: true };
    } catch {
      return { success: false, error: 'Network error. Please try again.' };
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  return (
    <AppContext.Provider value={{
      selectedCity, setSelectedCity,
      user, token, login, logout, register,
      searchQuery, setSearchQuery,
      authLoading
    }}>
      {children}
    </AppContext.Provider>
  );
};
