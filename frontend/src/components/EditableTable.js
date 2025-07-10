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

  return (
    <div className="editable-table-container">
      <div className="table-controls">
        <button className="btn btn-small" onClick={addNewRow}>
          Add Row
        </button>
        <button className="btn btn-small" onClick={onRefresh}>
          Refresh from Google Sheets
        </button>
      </div>

      <div className="table-wrapper">
        <table className="editable-table">
          <tbody>
            {localData.map((row, rowIndex) => (
              <tr key={rowIndex} className={rowIndex === 0 ? 'header-row' : ''}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="editable-cell">
                    {editingCell?.row === rowIndex && editingCell?.cell === cellIndex ? (
                      <input
                        type="text"
                        value={editValue}
                        onChange={handleCellChange}
                        onBlur={() => handleCellSubmit(rowIndex, cellIndex)}
                        onKeyDown={(e) => handleKeyPress(e, rowIndex, cellIndex)}
                        autoFocus
                        className="cell-input"
                      />
                    ) : (
                      <div
                        onClick={() => handleCellClick(rowIndex, cellIndex)}
                        className="cell-content"
                      >
                        {cell || (rowIndex === 0 ? 'Header' : 'Click to edit')}
                      </div>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {saving && (
        <div className="saving-indicator">
          Saving changes...
        </div>
      )}
    </div>
  );
};

export default EditableTable;