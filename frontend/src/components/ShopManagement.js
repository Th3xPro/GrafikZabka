import React, { useState } from 'react';
import axios from 'axios';

const API_BASE_URL = 'http://localhost:8080';

const ShopManagement = ({ shops, selectedShop, onShopCreated, onShopDeleted, onShopSelect }) => {
  const [newShopName, setNewShopName] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const handleCreateShop = async (e) => {
    e.preventDefault();
    if (!newShopName.trim()) return;

    setCreating(true);
    setError(null);
    setSuccess(null);

    try {
      await axios.post(`${API_BASE_URL}/api/shops`, {
        name: newShopName.trim()
      });

      setNewShopName('');
      setSuccess(`Shop "${newShopName}" created successfully!`);
      onShopCreated();
    } catch (error) {
      console.error('Failed to create shop:', error);
      setError('Failed to create shop: ' + (error.response?.data || error.message));
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteShop = async (shopId, shopName) => {
    if (!window.confirm(`Are you sure you want to delete "${shopName}"? This will remove all employees and schedules for this shop.`)) {
      return;
    }

    setDeleting(shopId);
    setError(null);
    setSuccess(null);

    try {
      await axios.delete(`${API_BASE_URL}/api/shops?shop_id=${shopId}`);
      setSuccess(`Shop "${shopName}" deleted successfully!`);
      onShopDeleted();
    } catch (error) {
      console.error('Failed to delete shop:', error);
      setError('Failed to delete shop: ' + (error.response?.data || error.message));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-sm">
      <div className="mb-6">
        <h3 className="text-2xl font-bold text-gray-900 mb-2">Shop Management</h3>
        <p className="text-gray-600">Create and manage your shops</p>
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
        <h4 className="text-lg font-semibold text-gray-900 mb-4">Create New Shop</h4>
        <form onSubmit={handleCreateShop}>
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Enter shop name (e.g., Downtown) - will create GrafikZabka-Downtown-YEAR"
              value={newShopName}
              onChange={(e) => setNewShopName(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              required
            />
            <button
              type="submit"
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
              disabled={creating || !newShopName.trim()}
            >
              {creating ? 'Creating...' : 'Create Shop'}
            </button>
          </div>
        </form>
      </div>

      <div className="mb-8">
        <h4 className="text-lg font-semibold text-gray-900 mb-4">Your Shops ({shops.length})</h4>
        
        {shops.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
            {shops.map((shop) => (
              <div 
                key={shop.id} 
                className={`p-4 border rounded-lg transition-all ${
                  selectedShop?.id === shop.id 
                    ? 'border-blue-500 bg-blue-50 shadow-md' 
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h5 className="text-lg font-semibold text-gray-900 mb-1">{shop.name}</h5>
                    <p className="text-gray-600">{shop.employee_count} employees</p>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <button
                      className={`px-3 py-1 text-sm rounded-md font-medium transition-colors ${
                        selectedShop?.id === shop.id
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                      onClick={() => onShopSelect(shop)}
                    >
                      {selectedShop?.id === shop.id ? 'Selected' : 'Select'}
                    </button>
                    <button
                      className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded-md hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                      onClick={() => handleDeleteShop(shop.id, shop.name)}
                      disabled={deleting === shop.id}
                    >
                      {deleting === shop.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
                
                {selectedShop?.id === shop.id && (
                  <div className="mt-3 pt-3 border-t border-blue-200">
                    <div className="flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium w-fit">
                      <span>✓</span>
                      Currently Selected
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
            <div className="max-w-sm mx-auto">
              <h4 className="text-lg font-semibold text-gray-900 mb-2">No shops created yet</h4>
              <p className="text-gray-600">Create your first shop to start managing employee schedules</p>
            </div>
          </div>
        )}
      </div>

      <div className="p-6 bg-blue-50 border border-blue-200 rounded-lg">
        <h4 className="text-lg font-semibold text-gray-900 mb-3">About Shops</h4>
        <ul className="space-y-2 text-gray-700">
          <li className="flex items-start gap-2">
            <span className="text-blue-500 mt-1">•</span>
            Each shop has its own set of employees and schedules
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-500 mt-1">•</span>
            Employees can be assigned to multiple shops
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-500 mt-1">•</span>
            Each shop generates separate Google Sheets files
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-500 mt-1">•</span>
            You can switch between shops using the shop selector
          </li>
        </ul>
      </div>
    </div>
  );
};

export default ShopManagement;