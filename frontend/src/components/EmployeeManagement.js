import React, { useState } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE_URL = 'http://localhost:8080';

const EmployeeManagement = ({ shopId, shopName, employees, loading, onEmployeeUpdate }) => {
  const [newEmployee, setNewEmployee] = useState({
    email: '',
    name: '',
    hourlyRate: 30.0
  });
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [editData, setEditData] = useState({});
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [updating, setUpdating] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Clear messages after 5 seconds
  React.useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError(null);
        setSuccess(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  const handleAddEmployee = async (e) => {
    e.preventDefault();
    if (!newEmployee.email.trim() || !newEmployee.name.trim()) return;

    setAdding(true);
    setError(null);
    setSuccess(null);

    try {
      await axios.post(`${API_BASE_URL}/api/employees`, {
        shop_id: shopId,
        employee_email: newEmployee.email.trim(),
        employee_name: newEmployee.name.trim(),
        hourly_rate: newEmployee.hourlyRate
      });
      
      setNewEmployee({ email: '', name: '', hourlyRate: 30.0 });
      setSuccess(`Employee ${newEmployee.name} added successfully!`);
      onEmployeeUpdate();
    } catch (error) {
      console.error('Failed to add employee:', error);
      setError(error.response?.data || 'Failed to add employee');
    } finally {
      setAdding(false);
    }
  };

  const handleEditEmployee = (employee) => {
    setEditingEmployee(employee.email);
    setEditData({
      name: employee.name,
      hourlyRate: employee.hourly_rate
    });
  };

  const handleSaveEdit = async (employeeEmail) => {
    setUpdating(employeeEmail);
    setError(null);
    setSuccess(null);

    try {
      // Remove old employee
      await axios.delete(`${API_BASE_URL}/api/employees`, {
        data: { 
          shop_id: shopId,
          employee_email: employeeEmail 
        }
      });

      // Add employee with updated data
      await axios.post(`${API_BASE_URL}/api/employees`, {
        shop_id: shopId,
        employee_email: employeeEmail,
        employee_name: editData.name.trim(),
        hourly_rate: editData.hourlyRate
      });

      setEditingEmployee(null);
      setEditData({});
      setSuccess(`Employee ${editData.name} updated successfully!`);
      onEmployeeUpdate();
    } catch (error) {
      console.error('Failed to update employee:', error);
      setError(error.response?.data || 'Failed to update employee');
    } finally {
      setUpdating(null);
    }
  };

  const handleCancelEdit = () => {
    setEditingEmployee(null);
    setEditData({});
  };

  const handleRemoveEmployee = async (employeeEmail, employeeName) => {
    if (!window.confirm(`Remove ${employeeName} from ${shopName}?`)) return;

    setRemoving(employeeEmail);
    setError(null);
    setSuccess(null);

    try {
      await axios.delete(`${API_BASE_URL}/api/employees`, {
        data: { 
          shop_id: shopId,
          employee_email: employeeEmail 
        }
      });
      
      setSuccess(`Employee ${employeeName} removed successfully!`);
      onEmployeeUpdate();
    } catch (error) {
      console.error('Failed to remove employee:', error);
      setError(error.response?.data || 'Failed to remove employee');
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <div>
            <h3 className="text-2xl font-bold text-gray-900">Employee Management</h3>
            <p className="text-gray-600 mt-1">{shopName} • {employees.length} employee{employees.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center space-x-3"
          >
            <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <p className="text-red-800 font-medium">{error}</p>
            <button 
              onClick={() => setError(null)}
              className="ml-auto text-red-400 hover:text-red-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </motion.div>
        )}

        {success && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center space-x-3"
          >
            <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-green-800 font-medium">{success}</p>
            <button 
              onClick={() => setSuccess(null)}
              className="ml-auto text-green-400 hover:text-green-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Employee Form */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center space-x-2 mb-6">
          <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          <h4 className="text-lg font-semibold text-gray-900">Add New Employee</h4>
        </div>

        <form onSubmit={handleAddEmployee} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Email Address</label>
              <input
                type="email"
                placeholder="employee@example.com"
                value={newEmployee.email}
                onChange={(e) => setNewEmployee({...newEmployee, email: e.target.value})}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                required
              />
            </div>
            
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Full Name</label>
              <input
                type="text"
                placeholder="Jan Kowalski"
                value={newEmployee.name}
                onChange={(e) => setNewEmployee({...newEmployee, name: e.target.value})}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                required
              />
            </div>
            
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Hourly Rate (PLN)</label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={newEmployee.hourlyRate}
                onChange={(e) => setNewEmployee({...newEmployee, hourlyRate: parseFloat(e.target.value) || 0})}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                required
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={adding || !newEmployee.email.trim() || !newEmployee.name.trim()}
            className="w-full md:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-all duration-200 flex items-center justify-center space-x-2"
          >
            {adding ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Adding...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <span>Add Employee</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* Employee List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h4 className="text-lg font-semibold text-gray-900">
              Team Members ({employees.length})
            </h4>
            {employees.length > 0 && (
              <div className="text-sm text-gray-500">
                Avg. Rate: {(employees.reduce((sum, emp) => sum + emp.hourly_rate, 0) / employees.length).toFixed(2)} PLN/hr
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-100 rounded-full mb-4">
              <svg className="animate-spin w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <p className="text-gray-600">Loading employees...</p>
          </div>
        ) : employees.length > 0 ? (
          <div className="divide-y divide-gray-200">
            <AnimatePresence>
              {employees.map((employee, index) => (
                <motion.div
                  key={employee.email}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ delay: index * 0.1 }}
                  className="p-6 hover:bg-gray-50 transition-colors duration-200"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4 flex-1">
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center text-white font-semibold text-lg">
                        {employee.name.charAt(0).toUpperCase()}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        {editingEmployee === employee.email ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <input
                              type="text"
                              value={editData.name}
                              onChange={(e) => setEditData({...editData, name: e.target.value})}
                              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              placeholder="Employee name"
                            />
                            <div className="flex items-center space-x-2">
                              <input
                                type="number"
                                step="0.5"
                                min="0"
                                value={editData.hourlyRate}
                                onChange={(e) => setEditData({...editData, hourlyRate: parseFloat(e.target.value) || 0})}
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="Rate"
                              />
                              <span className="text-gray-500 text-sm">PLN/hr</span>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <h3 className="font-semibold text-gray-900 text-lg">{employee.name}</h3>
                            <p className="text-gray-600 text-sm">{employee.email}</p>
                            <div className="flex items-center space-x-4 mt-2">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                {employee.hourly_rate} PLN/hr
                              </span>
                              <span className="text-xs text-gray-500">
                                {(employee.hourly_rate * 160).toFixed(0)} PLN/month (160h)
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 ml-4">
                      {editingEmployee === employee.email ? (
                        <>
                          <button
                            onClick={() => handleSaveEdit(employee.email)}
                            disabled={updating === employee.email}
                            className="px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white text-sm font-medium rounded-lg transition-colors duration-200 flex items-center space-x-1"
                          >
                            {updating === employee.email ? (
                              <svg className="animate-spin w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="px-3 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 text-sm font-medium rounded-lg transition-colors duration-200"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleEditEmployee(employee)}
                            className="px-3 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 text-sm font-medium rounded-lg transition-colors duration-200 flex items-center space-x-1"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            <span className="hidden sm:inline">Edit</span>
                          </button>
                          <button
                            onClick={() => handleRemoveEmployee(employee.email, employee.name)}
                            disabled={removing === employee.email}
                            className="px-3 py-2 bg-red-100 hover:bg-red-200 disabled:bg-gray-100 text-red-700 disabled:text-gray-400 text-sm font-medium rounded-lg transition-colors duration-200 flex items-center space-x-1"
                          >
                            {removing === employee.email ? (
                              <svg className="animate-spin w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            )}
                            <span className="hidden sm:inline">Remove</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No employees yet</h3>
            <p className="text-gray-600 mb-4">Start building your team by adding your first employee.</p>
          </div>
        )}
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h4 className="font-semibold text-blue-900">How it works</h4>
          </div>
          <ul className="space-y-2 text-sm text-blue-800">
            <li className="flex items-start space-x-2">
              <span className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-2 flex-shrink-0"></span>
              <span>Add employees with their Google email addresses</span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-2 flex-shrink-0"></span>
              <span>They get automatic read-only access to schedules</span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-2 flex-shrink-0"></span>
              <span>Edit names and hourly rates anytime</span>
            </li>
          </ul>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-6 border border-green-200">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h4 className="font-semibold text-green-900">Best Practices</h4>
          </div>
          <ul className="space-y-2 text-sm text-green-800">
            <li className="flex items-start space-x-2">
              <span className="w-1.5 h-1.5 bg-green-600 rounded-full mt-2 flex-shrink-0"></span>
              <span>Use official email addresses for verification</span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="w-1.5 h-1.5 bg-green-600 rounded-full mt-2 flex-shrink-0"></span>
              <span>Update hourly rates regularly for accuracy</span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="w-1.5 h-1.5 bg-green-600 rounded-full mt-2 flex-shrink-0"></span>
              <span>Remove inactive employees to keep data clean</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default EmployeeManagement;