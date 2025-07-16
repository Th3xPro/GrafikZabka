import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import EditableScheduleTable from './EditableScheduleTable';
import RefreshButton from './RefreshButton';

const API_BASE_URL = 'http://localhost:8080';

const ScheduleCalendar = ({ spreadsheetData, onRefresh, readOnly }) => {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [activeMonth, setActiveMonth] = useState(spreadsheetData?.current_month || 'STYCZEŃ');
  const [scheduleData, setScheduleData] = useState([]);
  const [originalData, setOriginalData] = useState([]);
  const [employees, setEmployees] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [availableTags] = useState(['DOSTAWA', 'PROMO', 'AKTUALIZACJA PROMO']);
  const [cachedData, setCachedData] = useState({});
  const [refreshCooldown, setRefreshCooldown] = useState(0);
  const [isRefreshDisabled, setIsRefreshDisabled] = useState(false);
  // Store unsaved changes for each month
  const [unsavedChanges, setUnsavedChanges] = useState({});
  
  const months = [
    'MANAGEMENT', 'STYCZEŃ', 'LUTY', 'MARZEC', 'KWIECIEŃ', 'MAJ', 'CZERWIEC',
    'LIPIEC', 'SIERPIEŃ', 'WRZESIEŃ', 'PAŹDZIERNIK', 'LISTOPAD', 'GRUDZIEŃ'
  ];

  const availableYears = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i);

  // Load cached data and unsaved changes from localStorage
  useEffect(() => {
    const savedData = localStorage.getItem('scheduleCache');
    const savedUnsavedChanges = localStorage.getItem('unsavedScheduleChanges');
    
    if (savedData) {
      try {
        setCachedData(JSON.parse(savedData));
      } catch (error) {
        console.error('Error loading cached data:', error);
      }
    }
    
    if (savedUnsavedChanges) {
      try {
        setUnsavedChanges(JSON.parse(savedUnsavedChanges));
      } catch (error) {
        console.error('Error loading unsaved changes:', error);
      }
    }
  }, []);

  // Save unsaved changes to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('unsavedScheduleChanges', JSON.stringify(unsavedChanges));
  }, [unsavedChanges]);

  // Get the key for storing unsaved changes
  const getUnsavedChangesKey = useCallback((shopId, year, month) => {
    return `${shopId}-${year}-${month}`;
  }, []);

  // Save current data as unsaved changes
  const saveUnsavedChanges = useCallback((shopId, year, month, data, originalData, employees) => {
    const key = getUnsavedChangesKey(shopId, year, month);
    setUnsavedChanges(prev => ({
      ...prev,
      [key]: {
        data: JSON.parse(JSON.stringify(data)),
        originalData: JSON.parse(JSON.stringify(originalData)),
        employees: JSON.parse(JSON.stringify(employees)),
        timestamp: Date.now(),
        hasChanges: JSON.stringify(data) !== JSON.stringify(originalData)
      }
    }));
  }, [getUnsavedChangesKey]);

  // Remove unsaved changes for a specific month
  const clearUnsavedChanges = useCallback((shopId, year, month) => {
    const key = getUnsavedChangesKey(shopId, year, month);
    setUnsavedChanges(prev => {
      const newUnsaved = { ...prev };
      delete newUnsaved[key];
      return newUnsaved;
    });
  }, [getUnsavedChangesKey]);

  // Save cached data to localStorage
  const saveToCache = useCallback((shopId, year, month, data, employees) => {
    const cacheKey = `${shopId}-${year}-${month}`;
    const newCache = {
      ...cachedData,
      [cacheKey]: {
        data,
        employees,
        timestamp: Date.now()
      }
    };
    setCachedData(newCache);
    localStorage.setItem('scheduleCache', JSON.stringify(newCache));
  }, [cachedData]);

  // Check if cached data is valid (less than 5 minutes old)
  const isCacheValid = useCallback((timestamp) => {
    return Date.now() - timestamp < 5 * 60 * 1000; // 5 minutes
  }, []);

  const fetchScheduleData = useCallback(async (month, year, shopId, forceRefresh = false) => {
    const cacheKey = `${shopId}-${year}-${month}`;
    const unsavedKey = getUnsavedChangesKey(shopId, year, month);
    
    // Check for unsaved changes first (unless force refresh)
    if (!forceRefresh && unsavedChanges[unsavedKey]) {
      console.log('Loading unsaved changes:', unsavedKey);
      const saved = unsavedChanges[unsavedKey];
      setScheduleData(saved.data);
      setOriginalData(saved.originalData);
      setEmployees(saved.employees);
      setHasChanges(saved.hasChanges);
      return;
    }
    
    // Check cache second (unless force refresh)
    if (!forceRefresh && cachedData[cacheKey] && isCacheValid(cachedData[cacheKey].timestamp)) {
      console.log('Loading from cache:', cacheKey);
      const cached = cachedData[cacheKey];
      setScheduleData(cached.data);
      setOriginalData(JSON.parse(JSON.stringify(cached.data)));
      setEmployees(cached.employees);
      setHasChanges(false);
      return;
    }

    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/api/schedule?month=${month}&year=${year}&shop_id=${shopId}`);
      const data = response.data.data || [];
      const employeesData = response.data.employees || {};
      
      setScheduleData(data);
      setOriginalData(JSON.parse(JSON.stringify(data)));
      setEmployees(employeesData);
      setHasChanges(false);
      
      // Save to cache
      saveToCache(shopId, year, month, data, employeesData);
      
      // Clear any existing unsaved changes for this month since we got fresh data
      if (forceRefresh) {
        clearUnsavedChanges(shopId, year, month);
      }
    } catch (error) {
      console.error('Failed to fetch schedule data:', error);
      if (error.response?.status === 404) {
        // Create new spreadsheet for this year
        handleYearChange(year);
      }
    } finally {
      setLoading(false);
    }
  }, [cachedData, isCacheValid, saveToCache, unsavedChanges, getUnsavedChangesKey, clearUnsavedChanges]);

  useEffect(() => {
    if (spreadsheetData) {
      setSelectedYear(spreadsheetData.year || new Date().getFullYear());
      setActiveMonth(spreadsheetData.current_month || 'STYCZEŃ');
      setEmployees(spreadsheetData.employees || {});
    }
  }, [spreadsheetData]);

  // FIXED: Prevent unnecessary API calls when switching to MANAGEMENT
  useEffect(() => {
    if (activeMonth !== 'MANAGEMENT' && spreadsheetData?.shop_id) {
      fetchScheduleData(activeMonth, selectedYear, spreadsheetData.shop_id);
    } else if (activeMonth === 'MANAGEMENT') {
      // Just set the management data without fetching
      setScheduleData([]);
      setOriginalData([]);
      setEmployees(spreadsheetData?.employees || {});
      setHasChanges(false);
    }
  }, [activeMonth, selectedYear, spreadsheetData?.shop_id]); // Removed fetchScheduleData from dependencies

  const handleYearChange = useCallback(async (year) => {
    setSelectedYear(year);
    
    if (spreadsheetData?.shop_id) {
      try {
        // Call onRefresh with the year parameter
        await onRefresh(year);
        
        // Fetch schedule data for the new year
        if (activeMonth !== 'MANAGEMENT') {
          fetchScheduleData(activeMonth, year, spreadsheetData.shop_id, true); // Force refresh for new year
        }
      } catch (error) {
        console.error('Error handling year change:', error);
      }
    }
  }, [spreadsheetData?.shop_id, activeMonth, fetchScheduleData, onRefresh]);

  // FIXED: Improved data change handling
  const handleDataChange = useCallback((newData) => {
    console.log('Data changed in ScheduleCalendar:', {
      newDataLength: newData.length,
      originalDataLength: originalData.length,
      shopId: spreadsheetData?.shop_id,
      month: activeMonth
    });

    setScheduleData(newData);
    
    // Calculate if there are changes
    const dataChanged = JSON.stringify(newData) !== JSON.stringify(originalData);
    console.log('Has changes:', dataChanged);
    setHasChanges(dataChanged);
    
    // Save as unsaved changes if there are changes
    if (dataChanged && spreadsheetData?.shop_id && activeMonth !== 'MANAGEMENT') {
      saveUnsavedChanges(
        spreadsheetData.shop_id, 
        selectedYear, 
        activeMonth, 
        newData, 
        originalData, 
        employees
      );
    }
  }, [originalData, spreadsheetData?.shop_id, selectedYear, activeMonth, employees, saveUnsavedChanges]);

  // Handle month change with unsaved data preservation
  const handleMonthChange = useCallback((newMonth) => {
    if (hasChanges && !readOnly && activeMonth !== 'MANAGEMENT') {
      // Save current unsaved changes before switching
      if (spreadsheetData?.shop_id) {
        saveUnsavedChanges(
          spreadsheetData.shop_id, 
          selectedYear, 
          activeMonth, 
          scheduleData, 
          originalData, 
          employees
        );
      }
    }
    setActiveMonth(newMonth);
  }, [hasChanges, readOnly, activeMonth, spreadsheetData?.shop_id, selectedYear, scheduleData, originalData, employees, saveUnsavedChanges]);

  // Memoize the refresh function to prevent unnecessary re-renders
  const handleRefresh = useCallback(() => {
    if (activeMonth === 'MANAGEMENT') {
      onRefresh(selectedYear);
    } else {
      // Force refresh - clear unsaved changes and fetch fresh data
      if (spreadsheetData?.shop_id) {
        clearUnsavedChanges(spreadsheetData.shop_id, selectedYear, activeMonth);
      }
      fetchScheduleData(activeMonth, selectedYear, spreadsheetData?.shop_id, true);
    }
  }, [activeMonth, selectedYear, spreadsheetData?.shop_id, onRefresh, fetchScheduleData, clearUnsavedChanges]);

  const handleSave = useCallback(async () => {
    console.log('Save button clicked', {
      hasChanges,
      readOnly,
      activeMonth,
      shopId: spreadsheetData?.shop_id,
      scheduleDataLength: scheduleData.length
    });

    if (!hasChanges || readOnly || activeMonth === 'MANAGEMENT' || !spreadsheetData?.shop_id) {
      console.log('Save conditions not met');
      return;
    }

    setSaving(true);
    try {
      console.log('Sending save request...');
      const response = await axios.post(`${API_BASE_URL}/api/schedule/update`, {
        month: activeMonth,
        year: selectedYear,
        shop_id: spreadsheetData.shop_id,
        data: scheduleData
      });

      console.log('Save response:', response.data);

      const newOriginalData = JSON.parse(JSON.stringify(scheduleData));
      setOriginalData(newOriginalData);
      setHasChanges(false);
      
      // Update cache with saved data
      saveToCache(spreadsheetData.shop_id, selectedYear, activeMonth, scheduleData, employees);
      
      // Clear unsaved changes since we just saved
      clearUnsavedChanges(spreadsheetData.shop_id, selectedYear, activeMonth);
      
      alert('Schedule saved successfully!');
    } catch (error) {
      console.error('Failed to save schedule:', error);
      alert(`Failed to save schedule: ${error.response?.data?.message || error.message}`);
    } finally {
      setSaving(false);
    }
  }, [hasChanges, readOnly, activeMonth, spreadsheetData?.shop_id, selectedYear, scheduleData, saveToCache, employees, clearUnsavedChanges]);

  const handleDiscard = useCallback(() => {
    if (!hasChanges) return;
    
    if (window.confirm('Are you sure you want to discard all changes?')) {
      setScheduleData(JSON.parse(JSON.stringify(originalData)));
      setHasChanges(false);
      
      // Clear unsaved changes
      if (spreadsheetData?.shop_id) {
        clearUnsavedChanges(spreadsheetData.shop_id, selectedYear, activeMonth);
      }
    }
  }, [hasChanges, originalData, spreadsheetData?.shop_id, selectedYear, activeMonth, clearUnsavedChanges]);

  const clearCache = useCallback(() => {
    setCachedData({});
    setUnsavedChanges({});
    localStorage.removeItem('scheduleCache');
    localStorage.removeItem('unsavedScheduleChanges');
    alert('Cache and unsaved changes cleared successfully!');
  }, []);

  const calculateHours = useCallback((timeRange) => {
    if (!timeRange || timeRange === 'DW' || timeRange === '') return 0;
    
    const match = timeRange.match(/(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})/);
    if (!match) return 0;

    const startHour = parseInt(match[1]);
    const startMin = parseInt(match[2]);
    const endHour = parseInt(match[3]);
    const endMin = parseInt(match[4]);

    let startTime = startHour + startMin / 60;
    let endTime = endHour + endMin / 60;

    if (endTime < startTime) {
      endTime += 24;
    }

    return endTime - startTime;
  }, []);

  // Check if current month has unsaved changes
  const currentMonthHasUnsavedChanges = useCallback((month) => {
    if (!spreadsheetData?.shop_id || month === 'MANAGEMENT') return false;
    const key = getUnsavedChangesKey(spreadsheetData.shop_id, selectedYear, month);
    return unsavedChanges[key]?.hasChanges || false;
  }, [spreadsheetData?.shop_id, selectedYear, getUnsavedChangesKey, unsavedChanges]);

  // Rest of your render functions remain the same...
  // (renderManagementView, renderScheduleView, and return statement)
  // I'll include them for completeness but they don't need changes

  const renderManagementView = () => (
    <div className="p-6 bg-white rounded-lg shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-2xl font-bold text-gray-900">Employee Management - {spreadsheetData?.shop_name}</h3>
        <div className="flex items-center gap-3">
          <button 
            className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors font-medium"
            onClick={clearCache}
          >
            Clear Cache
          </button>
          <a 
            href={spreadsheetData?.spreadsheet_url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg transition-colors font-medium"
          >
            Open in Google Sheets
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      </div>
      
      <div className="mb-8 p-6 bg-blue-50 border border-blue-200 rounded-lg">
        <h4 className="text-lg font-semibold text-gray-900 mb-3">Current Year: {selectedYear}</h4>
        <div className="space-y-1 text-gray-700">
          <p><span className="font-medium">Shop:</span> {spreadsheetData?.shop_name}</p>
          <p><span className="font-medium">Spreadsheet:</span> {spreadsheetData?.title}</p>
        </div>
      </div>

      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-6 bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 rounded-lg">
            <h4 className="text-lg font-semibold text-gray-900 mb-2">Total Employees</h4>
            <span className="text-3xl font-bold text-blue-600">{Object.keys(employees).length}</span>
          </div>
          <div className="p-6 bg-gradient-to-r from-green-50 to-green-100 border border-green-200 rounded-lg">
            <h4 className="text-lg font-semibold text-gray-900 mb-2">Average Hourly Rate</h4>
            <span className="text-3xl font-bold text-green-600">
              {Object.values(employees).length > 0 
                ? (Object.values(employees).reduce((sum, emp) => sum + emp.hourly_rate, 0) / Object.values(employees).length).toFixed(2)
                : '0.00'
              } PLN
            </span>
          </div>
        </div>

        <div className="overflow-hidden bg-white border border-gray-200 rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h4 className="text-lg font-semibold text-gray-900">Employee Details</h4>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hourly Rate (PLN)</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {Object.values(employees).map((employee, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">👤</span>
                        <span className="text-sm font-medium text-gray-900">{employee.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{employee.email}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{employee.hourly_rate} PLN</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex px-2 py-1 text-xs font-semibold bg-green-100 text-green-800 rounded-full">
                        Active
                      </span>
                    </td>
                  </tr>
                ))}
                {Object.keys(employees).length === 0 && (
                  <tr>
                    <td colSpan="4" className="px-6 py-8 text-center text-gray-500">
                      No employees added yet for this shop.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );

  const renderScheduleView = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center gap-4 py-12 text-gray-600">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
          <p className="text-lg">Loading schedule for {activeMonth} {selectedYear} - {spreadsheetData?.shop_name}...</p>
        </div>
      );
    }

    if (!scheduleData || scheduleData.length === 0) {
      return (
        <div className="text-center py-12">
          <p className="text-gray-600 text-lg mb-4">No schedule data available for {activeMonth} {selectedYear}</p>
          <RefreshButton
            onRefresh={handleRefresh}
            size="large"
            className="bg-blue-600 hover:bg-blue-700"
          />
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between p-6 bg-white rounded-lg shadow-sm border">
          <div>
            <h3 className="text-2xl font-bold text-gray-900">Work Schedule - {activeMonth} {selectedYear}</h3>
            <p className="text-gray-600 mt-1">Shop: {spreadsheetData?.shop_name}</p>
            {hasChanges && !readOnly && (
              <div className="flex items-center gap-2 mt-2">
                <div className="w-2 h-2 bg-orange-400 rounded-full animate-pulse"></div>
                <span className="text-sm text-orange-600 font-medium">Unsaved changes (stored locally)</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {!readOnly && (
              <>
                <button 
                  className="px-4 py-2 text-sm bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors duration-200 disabled:opacity-50 font-medium"
                  onClick={handleDiscard}
                  disabled={!hasChanges || saving}
                >
                  Discard Changes
                </button>
                <button 
                  className="px-4 py-2 text-sm bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors duration-200 disabled:opacity-50 font-medium"
                  onClick={handleSave}
                  disabled={!hasChanges || saving}
                >
                  {saving ? 'Saving...' : 'Save Schedule'}
                </button>
              </>
            )}
            <RefreshButton
              onRefresh={handleRefresh}
              disabled={saving}
              size="normal"
            />
            <a 
              href={spreadsheetData?.spreadsheet_url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg transition-colors duration-200 font-medium"
            >
              <span>Open in Google Sheets</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>

        <EditableScheduleTable
          data={scheduleData}
          employees={employees}
          availableTags={availableTags}
          readOnly={readOnly}
          onChange={handleDataChange}
          calculateHours={calculateHours}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="p-6 bg-blue-50 border border-blue-200 rounded-lg">
            <h4 className="text-lg font-semibold text-gray-900 mb-4">Schedule Instructions</h4>
            <ul className="space-y-2 text-gray-700">
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-1">•</span>
                Enter work hours in format: HH:MM-HH:MM (e.g., 09:00-17:00)
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-1">•</span>
                Use "DW" for days off
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-1">•</span>
                Hours and wages are calculated automatically
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-1">•</span>
                Add tags like DOSTAWA, PROMO in the tags column
              </li>
              {!readOnly && (
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 mt-1">•</span>
                  Your changes are saved locally until you click "Save Schedule"
                </li>
              )}
            </ul>
          </div>
          
          <div className="p-6 bg-green-50 border border-green-200 rounded-lg">
            <h4 className="text-lg font-semibold text-gray-900 mb-4">Available Tags</h4>
            <div className="flex flex-wrap gap-2">
              {availableTags.map((tag, index) => (
                <span 
                  key={index} 
                  className="px-3 py-1 text-sm font-medium bg-white border border-gray-300 rounded-full text-gray-700"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium text-gray-700">Year:</label>
              <select 
                value={selectedYear} 
                onChange={(e) => handleYearChange(parseInt(e.target.value))}
                disabled={loading || saving}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {availableYears.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            {spreadsheetData?.shop_name && (
              <div className="flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                <span className="text-lg">🏪</span>
                <span>{spreadsheetData.shop_name}</span>
              </div>
            )}
          </div>

          <div className="flex overflow-x-auto">
            <div className="flex gap-1 min-w-full">
              {months.map((month) => {
                const monthHasUnsavedChanges = currentMonthHasUnsavedChanges(month);
                
                return (
                  <button
                    key={month}
                    className={`relative px-4 py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
                      activeMonth === month
                        ? 'bg-blue-600 text-white shadow-md'
                        : monthHasUnsavedChanges
                        ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                    onClick={() => handleMonthChange(month)}
                    disabled={loading || saving}
                  >
                    {month}
                    {monthHasUnsavedChanges && (
                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-orange-400 rounded-full animate-pulse"></div>
                    )}
                    {hasChanges && activeMonth === month && activeMonth !== 'MANAGEMENT' && (
                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-400 rounded-full animate-pulse"></div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="p-6">
        {activeMonth === 'MANAGEMENT' ? renderManagementView() : renderScheduleView()}
      </div>
    </div>
  );
};

export default ScheduleCalendar;