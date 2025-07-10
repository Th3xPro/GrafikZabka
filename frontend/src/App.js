import React, { useState, useEffect } from 'react';
import axios from 'axios';
import SpreadsheetView from './components/SpreadsheetView';
import './App.css';

axios.defaults.withCredentials = true;

const API_BASE_URL = 'http://localhost:8080';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [spreadsheetData, setSpreadsheetData] = useState(null);
  const [loadingSpreadsheet, setLoadingSpreadsheet] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  // Auto-fetch spreadsheet when user is authenticated
  useEffect(() => {
    if (user && !spreadsheetData) {
      fetchSpreadsheet();
    }
  }, [user]);

  const checkAuthStatus = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/user`);
      setUser(response.data);
      setError(null);
    } catch (error) {
      console.log('Not authenticated');
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = () => {
    window.location.href = `${API_BASE_URL}/auth/google`;
  };

  const handleLogout = async () => {
    try {
      await axios.post(`${API_BASE_URL}/logout`);
      setUser(null);
      setSpreadsheetData(null);
      setError(null);
    } catch (error) {
      console.error('Logout failed:', error);
      setError('Failed to logout. Please try again.');
    }
  };

  const fetchSpreadsheet = async () => {
    setLoadingSpreadsheet(true);
    setError(null);
    
    try {
      const response = await axios.post(`${API_BASE_URL}/api/spreadsheet`);
      setSpreadsheetData(response.data);
    } catch (error) {
      console.error('Failed to fetch spreadsheet:', error);
      if (error.response?.status === 401) {
        setError('Session expired. Please login again.');
        setUser(null);
      } else {
        setError('Failed to fetch your spreadsheet. Please try again.');
      }
    } finally {
      setLoadingSpreadsheet(false);
    }
  };

  const updateSpreadsheetData = (newData) => {
    setSpreadsheetData(prev => ({
      ...prev,
      data: newData
    }));
  };

  if (loading) {
    return (
      <div className="App">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="App">
      <header className="App-header">
        {user ? (
          <div className="user-dashboard">
            <div className="user-info">
              <img 
                src={user.picture} 
                alt="Profile" 
                className="profile-picture"
              />
              <div className="user-details">
                <h1>Welcome, {user.name}!</h1>
                <p className="user-email">{user.email}</p>
              </div>
            </div>

            <div className="action-buttons">
              <button 
                className="btn btn-primary"
                onClick={fetchSpreadsheet} 
                disabled={loadingSpreadsheet}
              >
                {loadingSpreadsheet ? 'Loading...' : 'Refresh Spreadsheet'}
              </button>
              <button 
                className="btn btn-secondary"
                onClick={handleLogout}
              >
                Logout
              </button>
            </div>

            {error && (
              <div className="error-message">
                <span className="error-icon">⚠️</span>
                {error}
              </div>
            )}

            {loadingSpreadsheet && (
              <div className="loading-message">
                <div className="spinner"></div>
                <p>Loading your GrafikZabka spreadsheet...</p>
              </div>
            )}

            {spreadsheetData && !loadingSpreadsheet && (
              <SpreadsheetView 
                spreadsheetData={spreadsheetData}
                onDataUpdate={updateSpreadsheetData}
                onRefresh={fetchSpreadsheet}
              />
            )}
          </div>
        ) : (
          <div className="login-screen">
            <div className="login-content">
              <h1>GrafikZabka Schedule Manager</h1>
              <p>Manage your work schedule with Google Sheets integration</p>
              <button className="btn btn-login" onClick={handleLogin}>
                <img 
                  src="https://developers.google.com/identity/images/g-logo.png" 
                  alt="Google" 
                  className="google-icon"
                />
                Login with Google
              </button>
            </div>
          </div>
        )}
      </header>
    </div>
  );
}

export default App;