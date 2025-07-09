import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

// Configure axios to include credentials
axios.defaults.withCredentials = true;

const API_BASE_URL = 'http://localhost:8080';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/user`);
      setUser(response.data);
    } catch (error) {
      console.log('Not authenticated');
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
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  if (loading) {
    return <div className="App">Loading...</div>;
  }

  return (
    <div className="App">
      <header className="App-header">
        {user ? (
          <div>
            <h1>Welcome, {user.name}!</h1>
            <img src={user.picture} alt="Profile" style={{borderRadius: '50%', width: '100px'}} />
            <p>Email: {user.email}</p>
            <button onClick={handleLogout}>Logout</button>
          </div>
        ) : (
          <div>
            <h1>OAuth Demo</h1>
            <button onClick={handleLogin}>Login with Google</button>
          </div>
        )}
      </header>
    </div>
  );
}

export default App;