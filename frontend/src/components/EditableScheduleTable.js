import React, { useState, useEffect, useCallback } from 'react';

const EditableScheduleTable = ({ 
  data, 
  employees, 
  availableTags, 
  readOnly, 
  onChange, 
  calculateHours 
}) => {
  const [tableData, setTableData] = useState(data);
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [needsRecalculation, setNeedsRecalculation] = useState(false);

  useEffect(() => {
    setTableData(data);
    setNeedsRecalculation(true);
  }, [data]);

  const calculateTotals = useCallback((currentData) => {
    if (!currentData || currentData.length < 3) return currentData;

    const newData = [...currentData];
    const employeeEmails = Object.keys(employees);
    const numEmployees = employeeEmails.length;

    // Find summary rows
    const hoursRowIndex = newData.findIndex(row => row[0] === 'SUMA GODZIN');
    const wagesRowIndex = newData.findIndex(row => row[0] === 'WYPŁATA');

    if (hoursRowIndex === -1 || wagesRowIndex === -1) return newData;

    // Calculate totals for each employee
    for (let empIndex = 0; empIndex < numEmployees; empIndex++) {
      let totalHours = 0;

      // Sum hours from all work days (skip header, empty rows, and summary rows)
      for (let rowIndex = 1; rowIndex < hoursRowIndex; rowIndex++) {
        if (newData[rowIndex] && newData[rowIndex][0] && newData[rowIndex][0] !== '') {
          const schedule = newData[rowIndex][empIndex + 1];
          if (schedule) {
            totalHours += calculateHours(schedule);
          }
        }
      }

      // Update hours row
      newData[hoursRowIndex][empIndex + 1] = totalHours.toFixed(2).replace('.', ',');

      // Calculate wage
      const employeeEmail = employeeEmails[empIndex];
      const employee = employees[employeeEmail];
      const wage = employee ? (totalHours * employee.hourly_rate).toFixed(2) : '0,00';
      
      // Update wages row
      newData[wagesRowIndex][empIndex + 1] = wage.replace('.', ',');
    }

    return newData;
  }, [employees, calculateHours]);

  useEffect(() => {
    if (needsRecalculation && tableData.length > 0) {
      const newData = calculateTotals(tableData);
      setTableData(newData);
      onChange(newData); // Always call onChange with calculated data
      setNeedsRecalculation(false);
    }
  }, [needsRecalculation, tableData, calculateTotals, onChange]);

  const handleCellClick = (rowIndex, cellIndex) => {
    if (readOnly) return;
    
    // Don't allow editing summary rows or day column
    if (cellIndex === 0 || 
        tableData[rowIndex]?.[0] === 'SUMA GODZIN' || 
        tableData[rowIndex]?.[0] === 'WYPŁATA') {
      return;
    }

    setEditingCell({ row: rowIndex, cell: cellIndex });
    setEditValue(tableData[rowIndex]?.[cellIndex] || '');
  };

  const handleCellChange = (e) => {
    setEditValue(e.target.value);
  };

  const handleCellSubmit = () => {
    if (editingCell) {
      const newData = [...tableData];
      if (!newData[editingCell.row]) {
        newData[editingCell.row] = [];
      }
      newData[editingCell.row][editingCell.cell] = editValue;
      
      setTableData(newData);
      
      // Call onChange immediately for user input changes
      onChange(newData);
      
      // Also trigger recalculation for totals
      setNeedsRecalculation(true);
      
      setEditingCell(null);
      setEditValue('');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleCellSubmit();
    } else if (e.key === 'Escape') {
      setEditingCell(null);
      setEditValue('');
    }
  };

  const getEmployeeNames = () => {
    return Object.values(employees).map(emp => emp.name.toUpperCase());
  };

  const renderCell = (rowIndex, cellIndex, cellValue) => {
    const isEditing = editingCell?.row === rowIndex && editingCell?.cell === cellIndex;
    const isFirstColumn = cellIndex === 0;
    const isHeaderRow = rowIndex === 0;
    const isSummaryRow = tableData[rowIndex]?.[0] === 'SUMA GODZIN' || tableData[rowIndex]?.[0] === 'WYPŁATA';
    const isEditable = !readOnly && !isFirstColumn && !isHeaderRow && !isSummaryRow;
    const isTagsColumn = cellIndex === getEmployeeNames().length + 1;

    // Build cell classes with Tailwind
    let cellClasses = "border border-gray-300 p-0 text-center align-middle relative";
    
    if (isFirstColumn) {
      cellClasses += " min-w-[120px] bg-green-50";
    }
    if (isHeaderRow) {
      cellClasses += " bg-gray-100";
    }
    if (isSummaryRow) {
      cellClasses += " bg-blue-50";
    }
    if (isTagsColumn) {
      cellClasses += " min-w-[150px]";
    }
    if (!isFirstColumn && !isHeaderRow) {
      cellClasses += " min-w-[100px]";
    }

    if (isEditing) {
      return (
        <td key={cellIndex} className={cellClasses}>
          <input
            type="text"
            value={editValue}
            onChange={handleCellChange}
            onBlur={handleCellSubmit}
            onKeyDown={handleKeyPress}
            className="w-full border-none p-3 text-sm bg-white outline-none focus:ring-2 focus:ring-green-500 text-center rounded"
            autoFocus
            placeholder={isTagsColumn ? "Add tags (e.g., DOSTAWA, PROMO)" : "Enter schedule"}
          />
        </td>
      );
    }

    let displayValue = cellValue || '';
    let contentClasses = "p-3 min-h-[24px] transition-all duration-200";

    // Add cursor and hover for editable cells
    if (isEditable) {
      contentClasses += " cursor-pointer hover:bg-blue-50 hover:border-green-500 hover:border-dashed hover:-m-px";
    }

    // Style for first column (days)
    if (isFirstColumn) {
      contentClasses += " font-medium bg-gray-50 text-left px-4";
    }

    // Style for header cells
    if (isHeaderRow) {
      contentClasses += " font-semibold bg-gray-200";
    }

    // Style for summary rows
    if (isSummaryRow) {
      contentClasses += " bg-blue-100 font-semibold text-blue-800";
    }

    // Style for different schedule types
    if (!isFirstColumn && !isHeaderRow && !isSummaryRow) {
      if (cellValue === 'DW') {
        contentClasses += " bg-red-100 text-red-800 font-semibold";
      } else if (cellValue && cellValue.match(/\d{1,2}:\d{2}-\d{1,2}:\d{2}/)) {
        contentClasses += " bg-green-100 text-green-800 font-medium";
      }
    }

    // Handle tags display
    if (isTagsColumn && cellValue) {
      displayValue = (
        <div className="flex flex-wrap gap-1 justify-center">
          {cellValue.split(',').map((tag, tagIndex) => {
            const trimmedTag = tag.trim();
            let tagClasses = "inline-block px-2 py-1 rounded-xl text-xs font-semibold uppercase";
            
            // Tag color based on type
            if (trimmedTag.toLowerCase().includes('dostawa')) {
              tagClasses += " bg-yellow-100 text-yellow-800";
            } else if (trimmedTag.toLowerCase().includes('promo')) {
              tagClasses += " bg-purple-100 text-purple-800";
            } else if (trimmedTag.toLowerCase().includes('aktualizacja')) {
              tagClasses += " bg-blue-100 text-blue-800";
            } else {
              tagClasses += " bg-gray-100 text-gray-800";
            }

            return (
              <span key={tagIndex} className={tagClasses}>
                {trimmedTag}
              </span>
            );
          })}
        </div>
      );
    }

    return (
      <td 
        key={cellIndex} 
        className={cellClasses}
        onClick={() => handleCellClick(rowIndex, cellIndex)}
      >
        <div className={contentClasses}>
          {isSummaryRow && cellIndex > 0 && cellIndex <= getEmployeeNames().length ? (
            <strong>{displayValue}</strong>
          ) : (
            displayValue
          )}
        </div>
      </td>
    );
  };

  if (!tableData || tableData.length === 0) {
    return (
      <div className="text-center py-12 text-gray-600">
        <div className="text-4xl mb-4">📅</div>
        <h3 className="text-lg font-medium mb-2">No schedule data available</h3>
        <p className="text-sm text-gray-500">The schedule will appear here once data is loaded.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Table Container */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse bg-white min-w-[800px]">
          <thead className="bg-gray-50">
            <tr>
              <th className="border border-gray-300 p-3 font-semibold text-center sticky top-0 z-10 bg-gray-50 min-w-[120px]">
                DZIEŃ TYGODNIA
              </th>
              {getEmployeeNames().map((name, index) => (
                <th key={index} className="border border-gray-300 p-3 font-semibold text-center sticky top-0 z-10 bg-gray-50 min-w-[100px]">
                  {name}
                </th>
              ))}
              <th className="border border-gray-300 p-3 font-semibold text-center sticky top-0 z-10 bg-gray-50 min-w-[150px]">
                TAGI
              </th>
            </tr>
          </thead>
          <tbody>
            {tableData.map((row, rowIndex) => {
              if (rowIndex === 0) return null; // Skip header row as it's in thead
              
              const isSummaryRow = row[0] === 'SUMA GODZIN' || row[0] === 'WYPŁATA';
              
              return (
                <tr 
                  key={rowIndex} 
                  className={`
                    ${isSummaryRow 
                      ? 'bg-gradient-to-r from-blue-50 to-indigo-50 border-t-2 border-blue-200' 
                      : 'hover:bg-gray-50'
                    }
                  `}
                >
                  {Array.from({ length: Math.max(row.length, getEmployeeNames().length + 2) }, (_, cellIndex) => 
                    renderCell(rowIndex, cellIndex, row[cellIndex])
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Table Legend */}
      {!readOnly && (
        <div className="bg-gray-50 border-t border-gray-200 p-4">
          <div className="flex flex-wrap gap-6 justify-center text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-gradient-to-br from-blue-100 to-green-200 border border-gray-300 rounded"></div>
              <span className="text-gray-700">Click to edit</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-red-100 border-2 border-red-400 rounded"></div>
              <span className="text-gray-700">DW - Day Off</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-100 border-2 border-green-400 rounded"></div>
              <span className="text-gray-700">Work Schedule (HH:MM-HH:MM)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                <div className="w-3 h-3 bg-yellow-100 border border-yellow-400 rounded-full"></div>
                <div className="w-3 h-3 bg-purple-100 border border-purple-400 rounded-full"></div>
                <div className="w-3 h-3 bg-blue-100 border border-blue-400 rounded-full"></div>
              </div>
              <span className="text-gray-700">Tags (DOSTAWA, PROMO, etc.)</span>
            </div>
          </div>
        </div>
      )}

      {/* Instructions for mobile */}
      <div className="md:hidden bg-blue-50 border-t border-blue-200 p-3">
        <p className="text-xs text-blue-800 text-center">
          💡 Tip: Scroll horizontally to view all columns
        </p>
      </div>
    </div>
  );
};

export default EditableScheduleTable;