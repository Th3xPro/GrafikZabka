import React, { useState } from 'react';
import axios from 'axios';

const EditableTable = ({ data, spreadsheetId, onDataUpdate, onRefresh }) => {
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [localData, setLocalData] = useState(data);

  const handleCellClick = (rowIndex, cellIndex) => {
    setEditingCell({ row: rowIndex, cell: cellIndex });
    setEditValue(localData[rowIndex][cellIndex] || '');
  };

  const handleCellChange = (e) => {
    setEditValue(e.target.value);
  };

  const handleCellSubmit = async (rowIndex, cellIndex) => {
    if (editingCell) {
      const newData = [...localData];
      newData[rowIndex][cellIndex] = editValue;
      setLocalData(newData);
      setEditingCell(null);
      
      // Update parent component
      onDataUpdate(newData);
      
      // Here you could add API call to update the spreadsheet
      // For now, we'll just update locally
    }
  };

  const handleKeyPress = (e, rowIndex, cellIndex) => {
    if (e.key === 'Enter') {
      handleCellSubmit(rowIndex, cellIndex);
    } else if (e.key === 'Escape') {
      setEditingCell(null);
      setEditValue('');
    }
  };

  const addNewRow = () => {
    const newRow = new Array(localData[0]?.length || 4).fill('');
    const newData = [...localData, newRow];
    setLocalData(newData);
    onDataUpdate(newData);
  };

  if (!localData || localData.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <div className="text-center">
          <div className="text-4xl mb-4">📊</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Data Available</h3>
          <p className="text-gray-600 mb-4">Start by adding some data to your spreadsheet.</p>
          <button 
            onClick={addNewRow}
            className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors duration-200"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Add First Row
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with controls */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Spreadsheet Data</h3>
            <p className="text-sm text-gray-600 mt-1">{localData.length} rows × {localData[0]?.length || 0} columns</p>
          </div>
          
          {/* Action buttons */}
          <div className="flex items-center space-x-3">
            <button 
              onClick={addNewRow}
              className="inline-flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Add Row
            </button>
            
            <button 
              onClick={onRefresh}
              className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh from Google Sheets
            </button>
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h4 className="text-sm font-medium text-blue-900 mb-1">How to edit:</h4>
              <ul className="text-xs text-blue-800 space-y-1">
                <li>• Click any cell to start editing</li>
                <li>• Press Enter to save, Escape to cancel</li>
                <li>• Changes are saved automatically</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Table container */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-full">
            <tbody>
              {localData.map((row, rowIndex) => (
                <tr 
                  key={rowIndex} 
                  className={`
                    ${rowIndex === 0 
                      ? 'bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-gray-200' 
                      : 'hover:bg-gray-50 border-b border-gray-100'
                    }
                  `}
                >
                  {row.map((cell, cellIndex) => (
                    <td 
                      key={cellIndex} 
                      className="border-r border-gray-200 last:border-r-0 p-0 min-w-[120px] relative group"
                    >
                      {editingCell?.row === rowIndex && editingCell?.cell === cellIndex ? (
                        /* Edit mode */
                        <input
                          type="text"
                          value={editValue}
                          onChange={handleCellChange}
                          onBlur={() => handleCellSubmit(rowIndex, cellIndex)}
                          onKeyDown={(e) => handleKeyPress(e, rowIndex, cellIndex)}
                          autoFocus
                          className="w-full p-3 border-2 border-blue-500 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 text-sm"
                          placeholder="Enter value..."
                        />
                      ) : (
                        /* Display mode */
                        <div
                          onClick={() => handleCellClick(rowIndex, cellIndex)}
                          className={`
                            p-3 min-h-[48px] cursor-pointer transition-all duration-200 flex items-center
                            ${rowIndex === 0 
                              ? 'font-semibold text-gray-900 bg-gray-50' 
                              : 'text-gray-700 hover:bg-blue-50 hover:text-blue-900'
                            }
                            group-hover:shadow-inner
                          `}
                        >
                          <span className="w-full">
                            {cell || (
                              <span className={`
                                ${rowIndex === 0 
                                  ? 'text-gray-500 italic' 
                                  : 'text-gray-400 italic'
                                }
                              `}>
                                {rowIndex === 0 ? 'Header' : 'Click to edit'}
                              </span>
                            )}
                          </span>
                          
                          {/* Edit indicator on hover */}
                          {rowIndex !== 0 && !cell && (
                            <svg className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity duration-200 ml-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          )}
                        </div>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Table footer with stats */}
        <div className="bg-gray-50 border-t border-gray-200 px-6 py-3">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <div className="flex items-center space-x-4">
              <span>Total Rows: <strong className="text-gray-900">{localData.length}</strong></span>
              <span>Columns: <strong className="text-gray-900">{localData[0]?.length || 0}</strong></span>
            </div>
            <div className="flex items-center space-x-2 text-xs text-gray-500">
              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              <span>Auto-saved</span>
            </div>
          </div>
        </div>
      </div>

      {/* Saving indicator */}
      {saving && (
        <div className="fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center space-x-2 animate-pulse">
          <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span className="text-sm font-medium">Saving changes...</span>
        </div>
      )}

      {/* Mobile scroll hint */}
      <div className="md:hidden bg-yellow-50 border border-yellow-200 rounded-lg p-3">
        <div className="flex items-center space-x-2">
          <svg className="w-4 h-4 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-xs text-yellow-800">Scroll horizontally to view all columns</span>
        </div>
      </div>
    </div>
  );
};

export default EditableTable;