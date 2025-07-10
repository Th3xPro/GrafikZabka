import React, { useState } from 'react';
import EditableTable from './EditableTable';

const SpreadsheetView = ({ spreadsheetData, onDataUpdate, onRefresh }) => {
  const [activeTab, setActiveTab] = useState('data');

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="spreadsheet-container">
      {spreadsheetData.created && (
        <div className="creation-notice">
          <span className="success-icon">✅</span>
          <p>
            New spreadsheet "<strong>{spreadsheetData.title}</strong>" was created for you!
          </p>
        </div>
      )}

      <div className="spreadsheet-header">
        <h2>{spreadsheetData.title}</h2>
        <a 
          href={spreadsheetData.spreadsheet_url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="btn btn-link"
        >
          Open in Google Sheets ↗
        </a>
      </div>

      <div className="tab-navigation">
        <button 
          className={`tab ${activeTab === 'data' ? 'active' : ''}`}
          onClick={() => setActiveTab('data')}
        >
          Schedule Data
        </button>
        <button 
          className={`tab ${activeTab === 'info' ? 'active' : ''}`}
          onClick={() => setActiveTab('info')}
        >
          File Info
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'data' && (
          <div className="data-tab">
            {spreadsheetData.data && spreadsheetData.data.length > 0 ? (
              <EditableTable 
                data={spreadsheetData.data}
                spreadsheetId={spreadsheetData.spreadsheet_id}
                onDataUpdate={onDataUpdate}
                onRefresh={onRefresh}
              />
            ) : (
              <div className="no-data">
                <p>No data found in your spreadsheet.</p>
                <button className="btn btn-primary" onClick={onRefresh}>
                  Refresh
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'info' && (
          <div className="info-tab">
            <div className="info-card">
              <h3>Spreadsheet Information</h3>
              <div className="info-item">
                <label>Name:</label>
                <span>{spreadsheetData.title}</span>
              </div>
              <div className="info-item">
                <label>ID:</label>
                <span className="mono">{spreadsheetData.spreadsheet_id}</span>
              </div>
              <div className="info-item">
                <label>URL:</label>
                <a 
                  href={spreadsheetData.spreadsheet_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="link"
                >
                  {spreadsheetData.spreadsheet_url}
                </a>
              </div>
              <div className="info-item">
                <label>Status:</label>
                <span className={spreadsheetData.created ? 'status-new' : 'status-existing'}>
                  {spreadsheetData.created ? 'Newly Created' : 'Existing File'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SpreadsheetView;