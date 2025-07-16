import React, { useState, useEffect } from 'react';
import axios from 'axios';
import EmployerDashboard from './components/EmployerDashboard';
import EmployeeDashboard from './components/EmployeeDashboard';

axios.defaults.withCredentials = true;

const API_BASE_URL = 'http://localhost:8080';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    checkAuthStatus();
  }, []);

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
      setError(null);
    } catch (error) {
      console.error('Logout failed:', error);
      setError('Failed to logout. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
          <p className="text-white text-lg font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500">
      <div className="min-h-screen flex flex-col items-center justify-start p-5 text-black">
        {user ? (
          <div className="w-full max-w-6xl">
            {/* User Info Header */}
            <div className="flex items-center justify-between bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-8">
              <div className="flex items-center space-x-5">
                <img 
                  src={user.picture} 
                  alt="Profile" 
                  className="w-16 h-16 rounded-full border-4 border-white/30"
                />
                <div>
                  <h1 className="text-2xl font-bold text-white mb-1">
                    Welcome, {user.name}!
                  </h1>
                  <p className="text-white/80 mb-2">{user.email}</p>
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                    user.role === 'employer' 
                      ? 'bg-green-500 text-white' 
                      : 'bg-blue-500 text-white'
                  }`}>
                    {user.role === 'employer' ? '👔 Employer' : '👤 Employee'}
                  </span>
                </div>
              </div>
              
              <button 
                className="px-6 py-3 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg"
                onClick={handleLogout}
              >
                Logout
              </button>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-500/90 text-white p-4 rounded-xl mb-6 flex items-center space-x-3">
                <span className="text-xl">⚠️</span>
                <span>{error}</span>
              </div>
            )}

            {/* Dashboard Content */}
            {user.role === 'employer' ? (
              <EmployerDashboard user={user} />
            ) : user.role === 'employee' ? (
              <EmployeeDashboard user={user} />
            ) : (
              <div className="text-center py-16 bg-white/10 backdrop-blur-lg rounded-2xl">
                <h2 className="text-3xl font-bold text-white mb-4">Unauthorized Access</h2>
                <p className="text-white/80 text-lg">You are not registered as an employer or employee.</p>
              </div>
            )}
          </div>
        ) : (
          /* Login Screen */
          <div className="flex items-center justify-center min-h-[80vh]">
            <div className="max-w-md bg-white/10 backdrop-blur-lg rounded-3xl p-10 text-center">
              <h1 className="text-4xl font-bold text-white mb-4">
                GrafikZabka Schedule Manager
              </h1>
              <p className="text-white/90 mb-8 text-lg">
                Manage work schedules with role-based access
              </p>
              
              {/* Role Info Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6">
                  <h3 className="text-xl font-semibold text-white mb-2">👔 Employers</h3>
                  <p className="text-white/80 text-sm">Create and manage schedules, add employees</p>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6">
                  <h3 className="text-xl font-semibold text-white mb-2">👤 Employees</h3>
                  <p className="text-white/80 text-sm">View assigned schedules (read-only access)</p>
                </div>
              </div>

              {/* Login Button */}
              <button 
                className="inline-flex items-center space-x-3 bg-white text-gray-800 px-8 py-4 rounded-xl font-semibold text-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
                onClick={handleLogin}
              >
                <img 
                  src="https://developers.google.com/identity/images/g-logo.png" 
                  alt="Google" 
                  className="w-6 h-6"
                />
                <span>Login with Google</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;