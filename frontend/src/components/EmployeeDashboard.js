import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ScheduleCalendar from './ScheduleCalendar';

const API_BASE_URL = 'http://localhost:8080';

const EmployeeDashboard = ({ user }) => {
  const [selectedShop, setSelectedShop] = useState(null);
  const [shops, setShops] = useState([]);
  const [spreadsheetData, setSpreadsheetData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchShops();
  }, []);

  useEffect(() => {
    if (selectedShop) {
      fetchSpreadsheet(selectedShop.id);
    }
  }, [selectedShop]);

  const fetchShops = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/shops`);
      const shopsData = response.data.shops || [];
      setShops(shopsData);
      
      // Auto-select first shop if none selected
      if (shopsData.length > 0 && !selectedShop) {
        setSelectedShop(shopsData[0]);
      }
    } catch (error) {
      console.error('Failed to fetch shops:', error);
      setError('Failed to fetch your assigned shops');
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
      if (error.response?.status === 404) {
        setError('No schedule found for this shop. Contact your employer to create a schedule.');
      } else if (error.response?.status === 403) {
        setError('You don\'t have access to this shop\'s schedule.');
      } else {
        setError('Failed to load schedule. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleShopSelect = (shop) => {
    setSelectedShop(shop);
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      {/* Dashboard Header */}
      <div className="text-center bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20">
        <div className="flex items-center justify-center mb-4">
          <div className="w-16 h-16 bg-blue-500/20 backdrop-blur-sm rounded-2xl flex items-center justify-center">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
        </div>
        <h2 className="text-3xl font-bold text-white mb-2">Employee Dashboard</h2>
        <p className="text-white/80 text-lg">View your work schedules across different shops</p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-500/90 backdrop-blur-sm text-white p-4 rounded-xl border border-red-400/50 flex items-center space-x-3 animate-in slide-in-from-top duration-300">
          <div className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="font-medium">{error}</p>
          </div>
          <button 
            onClick={() => setError(null)}
            className="text-red-200 hover:text-white transition-colors duration-200"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Shop Selector */}
      <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white">Your Assigned Shops</h3>
              <p className="text-white/70 text-sm">Select a shop to view its schedule</p>
            </div>
          </div>
          <div className="bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full">
            <span className="text-white font-medium text-sm">{shops.length} shop{shops.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {shops.length > 0 ? (
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
                    <div className="flex items-center space-x-2 mb-2">
                      <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-blue-600 rounded-lg flex items-center justify-center">
                        <span className="text-white font-semibold text-sm">{shop.name.charAt(0).toUpperCase()}</span>
                      </div>
                      <h4 className="font-semibold text-white text-lg">{shop.name}</h4>
                    </div>
                    <p className="text-white/70 text-sm mb-3">
                      {shop.employee_count} employee{shop.employee_count !== 1 ? 's' : ''}
                    </p>
                    <div className="flex items-center space-x-2">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/20 text-blue-200 border border-blue-400/30">
                        👁️ Read-Only
                      </span>
                    </div>
                  </div>
                  
                  {selectedShop?.id === shop.id && (
                    <div className="flex flex-col items-end space-y-2">
                      <div className="w-6 h-6 bg-green-400 rounded-full flex items-center justify-center animate-pulse">
                        <svg className="w-3 h-3 text-green-900" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <span className="text-xs text-green-400 font-medium">Selected</span>
                    </div>
                  )}
                </div>

                {selectedShop?.id === shop.id && (
                  <div className="absolute inset-0 bg-gradient-to-r from-green-400/10 to-blue-400/10 rounded-xl pointer-events-none"></div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="w-20 h-20 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-10 h-10 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-white mb-2">No Shops Assigned</h3>
            <p className="text-white/70 mb-4">You haven't been assigned to any shops yet.</p>
            <div className="bg-yellow-500/20 border border-yellow-400/30 rounded-lg p-4 inline-block">
              <p className="text-yellow-200 text-sm">
                💡 Contact your employer to get access to shop schedules
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Selected Shop Content */}
      {selectedShop && (
        <div className="space-y-6">
          {/* Access Information */}
          <div className="bg-blue-50/10 backdrop-blur-sm border border-blue-400/30 rounded-xl p-6">
            <div className="flex items-start space-x-4">
              <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </div>
              <div className="flex-1">
                <h4 className="text-lg font-semibold text-white mb-1">
                  Read-Only Access - {selectedShop.name}
                </h4>
                <p className="text-white/70 text-sm leading-relaxed">
                  You can view the schedule but cannot make changes. Contact your employer for any updates or questions about your shifts.
                </p>
              </div>
            </div>
          </div>

          {/* Content Area */}
          {loading ? (
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-12 text-center border border-white/20">
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
                  <p className="text-white/70">Fetching schedule for {selectedShop.name}...</p>
                </div>
              </div>
            </div>
          ) : spreadsheetData ? (
            <ScheduleCalendar 
              spreadsheetData={spreadsheetData}
              onRefresh={(year) => fetchSpreadsheet(selectedShop.id, year)}
              readOnly={true}
            />
          ) : !error && (
            <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-12 text-center border border-white/20">
              <div className="w-20 h-20 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">No Schedule Available</h3>
              <p className="text-white/70 mb-6">No schedule data available for {selectedShop.name}</p>
              <button 
                onClick={() => fetchSpreadsheet(selectedShop.id)}
                className="inline-flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default EmployeeDashboard;