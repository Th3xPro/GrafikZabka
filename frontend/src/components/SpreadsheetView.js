import React, { useState } from 'react';
import axios from 'axios';

const EmployeeManagement = ({ employees, loading, onEmployeeUpdate }) => {
  const [newEmployeeEmail, setNewEmployeeEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const handleAddEmployee = async (e) => {
    e.preventDefault();
    if (!newEmployeeEmail.trim()) return;

    setAdding(true);
    setError(null);
    setSuccess(null);

    try {
      await axios.post('/api/employees', {
        employee_email: newEmployeeEmail.trim()
      });
      setNewEmployeeEmail('');
      setSuccess(`Employee ${newEmployeeEmail} added successfully!`);
      onEmployeeUpdate();
    } catch (error) {
      console.error('Failed to add employee:', error);
      if (error.response?.status === 409) {
        setError(error.response.data || 'Employee already exists or is assigned to another employer');
      } else {
        setError('Failed to add employee. Please try again.');
      }
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveEmployee = async (employeeEmail) => {
    setRemoving(employeeEmail);
    setError(null);
    setSuccess(null);

    try {
      await axios.delete('/api/employees', {
        data: { employee_email: employeeEmail }
      });
      setSuccess(`Employee ${employeeEmail} removed successfully!`);
      onEmployeeUpdate();
    } catch (error) {
      console.error('Failed to remove employee:', error);
      setError('Failed to remove employee. Please try again.');
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-sm">
      <div className="mb-6">
        <h3 className="text-2xl font-bold text-gray-900 mb-2">Employee Management</h3>
        <p className="text-gray-600">Add or remove employees who can view your schedules</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 mb-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <span className="text-lg">⚠️</span>
          {error}
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 p-4 mb-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
          <span className="text-lg">✅</span>
          {success}
        </div>
      )}

      <div className="mb-8 p-6 bg-gray-50 rounded-lg border">
        <h4 className="text-lg font-semibold text-gray-900 mb-4">Add New Employee</h4>
        <form onSubmit={handleAddEmployee}>
          <div className="flex gap-3">
            <input
              type="email"
              placeholder="Enter employee's Google email"
              value={newEmployeeEmail}
              onChange={(e) => setNewEmployeeEmail(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              required
            />
            <button 
              type="submit" 
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
              disabled={adding || !newEmployeeEmail.trim()}
            >
              {adding ? 'Adding...' : 'Add Employee'}
            </button>
          </div>
        </form>
      </div>

      <div className="mb-8">
        <h4 className="text-lg font-semibold text-gray-900 mb-4">Current Employees ({employees?.length})</h4>
        
        {loading ? (
          <div className="flex items-center justify-center gap-3 py-8 text-gray-600">
            <div className="w-6 h-6 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
            <p>Loading employees...</p>
          </div>
        ) : employees?.length > 0 ? (
          <div className="space-y-3">
            {employees?.map((employeeEmail, index) => (
              <div key={index} className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-xl">👤</span>
                  <span className="text-gray-900 font-medium">{employeeEmail}</span>
                </div>
                <button
                  className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded-md hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                  onClick={() => handleRemoveEmployee(employeeEmail)}
                  disabled={removing === employeeEmail}
                >
                  {removing === employeeEmail ? 'Removing...' : 'Remove'}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
            <p className="text-gray-600 font-medium mb-1">No employees added yet</p>
            <p className="text-sm text-gray-500">Add employees using the form above to give them access to your schedules</p>
          </div>
        )}
      </div>

      <div className="p-6 bg-blue-50 border border-blue-200 rounded-lg">
        <h4 className="text-lg font-semibold text-gray-900 mb-3">How it works:</h4>
        <ul className="space-y-2 text-gray-700">
          <li className="flex items-start gap-2">
            <span className="text-blue-500 mt-1">•</span>
            Add employees using their Google email addresses
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-500 mt-1">•</span>
            Employees will automatically get read-only access to your schedules
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-500 mt-1">•</span>
            They must login with the same Google account to access the schedules
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-500 mt-1">•</span>
            You can remove employees at any time
          </li>
        </ul>
      </div>
    </div>
  );
};

export default EmployeeManagement;