import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ScheduleCalendar from './ScheduleCalendar';
import EmployeeManagement from './EmployeeManagement';
import ShopManagement from './ShopManagement';

const API_BASE_URL = 'http://localhost:8080';

const EmployerDashboard = ({ user }) => {
  const [activeTab, setActiveTab] = useState('shops'); // Default to shops tab
  const [selectedShop, setSelectedShop] = useState(null);
  const [shops, setShops] = useState([]);
  const [spreadsheetData, setSpreadsheetData] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchShops();
  }, []);

  useEffect(() => {
    if (selectedShop) {
      // Only fetch spreadsheet and employees if we're on those tabs
      if (activeTab === 'schedule') {
        fetchSpreadsheet(selectedShop.id);
      }
      if (activeTab === 'employees') {
        fetchEmployees(selectedShop.id);
      }
    }
  }, [selectedShop, activeTab]);

  const fetchShops = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/shops`);
      const shopsData = response.data.shops || [];
      setShops(shopsData);

      // Auto-select first shop if none selected and shops exist
      if (shopsData.length > 0 && !selectedShop) {
        setSelectedShop(shopsData[0]);
        // If we have shops and currently on shops tab, switch to schedule
        if (activeTab === 'shops' && shopsData.length > 0) {
          setActiveTab('schedule');
        }
      } else if (shopsData.length === 0) {
        // If no shops exist, make sure we're on the shops tab
        setSelectedShop(null);
        setActiveTab('shops');
        setSpreadsheetData(null);
        setEmployees([]);
      }
    } catch (error) {
      console.error('Failed to fetch shops:', error);
      setError('Failed to fetch shops');
    }
  };

  const fetchSpreadsheet = async (shopId, year = null) => {
    setLoading(true);
    setError(null);
    try {
      const yearParam = year ? `&year=${year}` : '';
      const response = await axios.post(`${API_BASE_URL}/api/spreadsheet?shop_id=${shopId}${yearParam}`);
      setSpreadsheetData(response.data);
    } catch (error) {
      console.error('Failed to fetch spreadsheet:', error);
      setError('Failed to fetch spreadsheet: ' + (error.response?.data || error.message));
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployees = async (shopId) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/employees?shop_id=${shopId}`);
      setEmployees(response.data.employees || []);
    } catch (error) {
      console.error('Failed to fetch employees:', error);
    }
  };

  const handleShopSelect = (shop) => {
    setSelectedShop(shop);
    // When selecting a shop, switch to schedule tab if not already on a valid tab
    if (activeTab === 'shops') {
      setActiveTab('schedule');
    }
  };

  const handleShopCreated = () => {
    fetchShops();
  };

  const handleShopDeleted = () => {
    const currentShopId = selectedShop?.id;
    fetchShops().then(() => {
      // If the deleted shop was the selected one, clear selection
      if (selectedShop?.id === currentShopId) {
        setSelectedShop(null);
        setSpreadsheetData(null);
        setEmployees([]);
      }
    });
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    
    // Load data when switching to specific tabs
    if (selectedShop) {
      if (tab === 'schedule' && !spreadsheetData) {
        fetchSpreadsheet(selectedShop.id);
      }
      if (tab === 'employees' && employees.length === 0) {
        fetchEmployees(selectedShop.id);
      }
    }
  };

  // Determine which tabs should be visible
  const showScheduleTab = shops.length > 0 && selectedShop;
  const showEmployeesTab = shops.length > 0 && selectedShop;
  const showShopsTab = true; // Always show shops tab

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      {/* Dashboard Header */}
      <div className="text-center bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20">
        <div className="flex items-center justify-center mb-4">
          <div className="w-16 h-16 bg-green-500/20 backdrop-blur-sm rounded-2xl flex items-center justify-center">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2-2v2m8 0V6a2 2 0 112 2v6a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 112-2V6" />
            </svg>
          </div>
        </div>
        <h2 className="text-3xl font-bold text-white mb-2">Employer Dashboard</h2>
        <p className="text-white/80 text-lg">Manage your shops and employee schedules</p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-500/90 backdrop-blur-sm text-white p-4 rounded-xl border border-red-400/50 flex items-center justify-between animate-in slide-in-from-top duration-300">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <p className="font-medium">{error}</p>
          </div>
          <button 
            onClick={() => setError(null)}
            className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium transition-colors duration-200"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Shop Selector - Only show when shops exist */}
      {shops.length > 0 && (
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-green-500/20 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">Select Shop</h3>
                <p className="text-white/70 text-sm">Choose a shop to manage</p>
              </div>
            </div>
            <div className="bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full">
              <span className="text-white font-medium text-sm">{shops.length} shop{shops.length !== 1 ? 's' : ''}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {shops.map((shop) => (
              <div
                key={shop.id}
                onClick={() => handleShopSelect(shop)}
                className={`
                  relative cursor-pointer p-6 rounded-xl border-2 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl
                  ${selectedShop?.id === shop.id 
                    ? 'bg-white/20 border-green-400 shadow-lg shadow-green-400/20' 
                    : 'bg-white/10 border-white/20 hover:bg-white/15 hover:border-white/40'
                  }
                `}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-green-400 to-green-600 rounded-xl flex items-center justify-center">
                        <span className="text-white font-bold text-lg">{shop.name.charAt(0).toUpperCase()}</span>
                      </div>
                      <div>
                        <h4 className="font-semibold text-white text-lg">{shop.name}</h4>
                        <p className="text-white/70 text-sm">{shop.employee_count} employee{shop.employee_count !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                  </div>
                  
                  {selectedShop?.id === shop.id && (
                    <div className="flex flex-col items-center space-y-1">
                      <div className="w-6 h-6 bg-green-400 rounded-full flex items-center justify-center animate-pulse">
                        <svg className="w-3 h-3 text-green-900" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <span className="text-xs text-green-400 font-medium">Active</span>
                    </div>
                  )}
                </div>

                {selectedShop?.id === shop.id && (
                  <div className="absolute inset-0 bg-gradient-to-r from-green-400/10 to-blue-400/10 rounded-xl pointer-events-none"></div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="bg-white/10 backdrop-blur-lg rounded-2xl border border-white/20 overflow-hidden">
        <div className="flex border-b border-white/20">
          {showScheduleTab && (
            <button 
              onClick={() => handleTabChange('schedule')}
              className={`
                flex-1 px-6 py-4 text-sm font-medium transition-all duration-200 border-b-2 flex items-center justify-center space-x-2
                ${activeTab === 'schedule' 
                  ? 'text-white bg-white/10 border-green-400' 
                  : 'text-white/70 hover:text-white hover:bg-white/5 border-transparent'
                }
              `}
            >
              <span className="text-lg">📅</span>
              <span>Schedule Management</span>
            </button>
          )}
          
          {showEmployeesTab && (
            <button 
              onClick={() => handleTabChange('employees')}
              className={`
                flex-1 px-6 py-4 text-sm font-medium transition-all duration-200 border-b-2 flex items-center justify-center space-x-2
                ${activeTab === 'employees' 
                  ? 'text-white bg-white/10 border-blue-400' 
                  : 'text-white/70 hover:text-white hover:bg-white/5 border-transparent'
                }
              `}
            >
              <span className="text-lg">👥</span>
              <span>Employee Management</span>
              {employees.length > 0 && (
                <span className="bg-blue-500 text-white text-xs px-2 py-1 rounded-full ml-1">
                  {employees.length}
                </span>
              )}
            </button>
          )}
          
          {showShopsTab && (
            <button 
              onClick={() => handleTabChange('shops')}
              className={`
                flex-1 px-6 py-4 text-sm font-medium transition-all duration-200 border-b-2 flex items-center justify-center space-x-2
                ${activeTab === 'shops' 
                  ? 'text-white bg-white/10 border-purple-400' 
                  : 'text-white/70 hover:text-white hover:bg-white/5 border-transparent'
                }
              `}
            >
              <span className="text-lg">🏪</span>
              <span>Shop Management</span>
            </button>
          )}
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'schedule' && (
            <div>
              {selectedShop ? (
                loading ? (
                  <div className="text-center py-12">
                    <div className="flex flex-col items-center space-y-4">
                      <div className="relative">
                        <div className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <svg className="w-6 h-6 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-lg font-medium text-white mb-1">Loading Schedule</h3>
                        <p className="text-white/70">Loading schedule for {selectedShop.name}...</p>
                      </div>
                    </div>
                  </div>
                ) : spreadsheetData ? (
                  <ScheduleCalendar 
                    spreadsheetData={spreadsheetData}
                    onRefresh={(year) => fetchSpreadsheet(selectedShop.id, year)}
                    readOnly={false}
                  />
                ) : (
                  <div className="text-center py-12">
                    <div className="w-20 h-20 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                      <svg className="w-10 h-10 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-semibold text-white mb-2">Failed to Load Schedule</h3>
                    <p className="text-white/70 mb-6">Failed to load schedule for {selectedShop.name}</p>
                    <button 
                      onClick={() => fetchSpreadsheet(selectedShop.id)}
                      className="inline-flex items-center px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Retry
                    </button>
                  </div>
                )
              ) : (
                <div className="text-center py-12">
                  <div className="w-20 h-20 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <svg className="w-10 h-10 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">No Shop Selected</h3>
                  <p className="text-white/70">Please select a shop to view its schedule, or create a new shop in the Shop Management tab.</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'employees' && (
            <div>
              {selectedShop ? (
                <EmployeeManagement 
                  shopId={selectedShop.id}
                  shopName={selectedShop.name}
                  employees={employees}
                  loading={loading}
                  onEmployeeUpdate={() => fetchEmployees(selectedShop.id)}
                />
              ) : (
                <div className="text-center py-12">
                  <div className="w-20 h-20 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <svg className="w-10 h-10 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">No Shop Selected</h3>
                  <p className="text-white/70">Please select a shop to manage its employees, or create a new shop in the Shop Management tab.</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'shops' && (
            <div>
              {shops.length === 0 && (
                <div className="text-center py-12 mb-8">
                  <div className="w-24 h-24 bg-gradient-to-br from-green-400/20 to-blue-400/20 rounded-3xl flex items-center justify-center mx-auto mb-6">
                    <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-3">Welcome to Your Employer Dashboard!</h3>
                  <p className="text-white/80 text-lg mb-6">Get started by creating your first shop to manage employee schedules.</p>
                  <div className="bg-gradient-to-r from-green-500/20 to-blue-500/20 border border-green-400/30 rounded-xl p-6 inline-block">
                    <p className="text-green-200 text-sm">
                      💡 Once you create a shop, you can add employees and manage their schedules
                    </p>
                  </div>
                </div>
              )}
              <ShopManagement 
                shops={shops}
                selectedShop={selectedShop}
                onShopCreated={handleShopCreated}
                onShopDeleted={handleShopDeleted}
                onShopSelect={handleShopSelect}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmployerDashboard;