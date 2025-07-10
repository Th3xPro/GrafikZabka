package main

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	"google.golang.org/api/drive/v3"
	"google.golang.org/api/option"
	"google.golang.org/api/sheets/v4"
)

var (
	googleOauthConfig *oauth2.Config
	oauthStateString  string
	sessions          = make(map[string]Session) // Updated to store full session data
)

type UserInfo struct {
	ID      string `json:"id"`
	Email   string `json:"email"`
	Name    string `json:"name"`
	Picture string `json:"picture"`
}

type Session struct {
	UserInfo UserInfo      `json:"user_info"`
	Token    *oauth2.Token `json:"token"`
}

type SpreadsheetService struct {
	sheetsService *sheets.Service
	driveService  *drive.Service
	config        *oauth2.Config
}

type SpreadsheetResponse struct {
	SpreadsheetID  string          `json:"spreadsheet_id"`
	SpreadsheetURL string          `json:"spreadsheet_url"`
	Title          string          `json:"title"`
	Data           [][]interface{} `json:"data"`
	Created        bool            `json:"created"`
}

func generateRandomString(length int) string {
	bytes := make([]byte, length)
	if _, err := rand.Read(bytes); err != nil {
		panic(err)
	}
	return base64.URLEncoding.EncodeToString(bytes)[:length]
}

func init() {
	oauthStateString = generateRandomString(32)
	googleOauthConfig = &oauth2.Config{
		RedirectURL:  "http://localhost:8080/auth/callback",
		ClientID:     os.Getenv("GOOGLE_CLIENT_ID"),
		ClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),
		Scopes: []string{
			"https://www.googleapis.com/auth/userinfo.email",
			"https://www.googleapis.com/auth/userinfo.profile",
			"https://www.googleapis.com/auth/spreadsheets",
			"https://www.googleapis.com/auth/drive.file",
		},
		Endpoint: google.Endpoint,
	}
}

func NewSpreadsheetService() *SpreadsheetService {
	return &SpreadsheetService{
		config: googleOauthConfig,
	}
}

func (s *SpreadsheetService) InitializeServices(ctx context.Context, token *oauth2.Token) error {
	client := s.config.Client(ctx, token)

	sheetsService, err := sheets.NewService(ctx, option.WithHTTPClient(client))
	if err != nil {
		return fmt.Errorf("unable to create sheets service: %v", err)
	}
	s.sheetsService = sheetsService

	driveService, err := drive.NewService(ctx, option.WithHTTPClient(client))
	if err != nil {
		return fmt.Errorf("unable to create drive service: %v", err)
	}
	s.driveService = driveService

	return nil
}

func (s *SpreadsheetService) FindOrCreateSpreadsheet(ctx context.Context, fileName string) (*sheets.Spreadsheet, error) {
	// First, try to find existing spreadsheet
	spreadsheet, err := s.findSpreadsheet(ctx, fileName)
	if err == nil {
		return spreadsheet, nil
	}

	// If not found, create new one
	log.Printf("Spreadsheet '%s' not found, creating new one", fileName)
	return s.createSpreadsheet(ctx, fileName)
}

func (s *SpreadsheetService) findSpreadsheet(ctx context.Context, fileName string) (*sheets.Spreadsheet, error) {
	query := fmt.Sprintf("name='%s' and mimeType='application/vnd.google-apps.spreadsheet'", fileName)

	fileList, err := s.driveService.Files.List().Q(query).Context(ctx).Do()
	if err != nil {
		return nil, fmt.Errorf("unable to search for spreadsheet: %v", err)
	}

	if len(fileList.Files) == 0 {
		return nil, fmt.Errorf("spreadsheet not found")
	}

	// Get the first matching spreadsheet
	spreadsheetID := fileList.Files[0].Id
	spreadsheet, err := s.sheetsService.Spreadsheets.Get(spreadsheetID).Context(ctx).Do()
	if err != nil {
		return nil, fmt.Errorf("unable to get spreadsheet details: %v", err)
	}

	return spreadsheet, nil
}

func (s *SpreadsheetService) createSpreadsheet(ctx context.Context, fileName string) (*sheets.Spreadsheet, error) {
	spreadsheet := &sheets.Spreadsheet{
		Properties: &sheets.SpreadsheetProperties{
			Title: fileName,
		},
		Sheets: []*sheets.Sheet{
			{
				Properties: &sheets.SheetProperties{
					Title: "Sheet1",
				},
			},
		},
	}

	resp, err := s.sheetsService.Spreadsheets.Create(spreadsheet).Context(ctx).Do()
	if err != nil {
		return nil, fmt.Errorf("unable to create spreadsheet: %v", err)
	}

	log.Printf("Created new spreadsheet: %s (ID: %s)", fileName, resp.SpreadsheetId)
	return resp, nil
}

func (s *SpreadsheetService) ReadSpreadsheetData(ctx context.Context, spreadsheetID, sheetRange string) ([][]interface{}, error) {
	resp, err := s.sheetsService.Spreadsheets.Values.Get(spreadsheetID, sheetRange).Context(ctx).Do()
	if err != nil {
		return nil, fmt.Errorf("unable to read data from spreadsheet: %v", err)
	}

	return resp.Values, nil
}

func (s *SpreadsheetService) WriteSpreadsheetData(ctx context.Context, spreadsheetID, sheetRange string, values [][]interface{}) error {
	valueRange := &sheets.ValueRange{
		Values: values,
	}

	_, err := s.sheetsService.Spreadsheets.Values.Update(spreadsheetID, sheetRange, valueRange).
		ValueInputOption("USER_ENTERED").Context(ctx).Do()
	if err != nil {
		return fmt.Errorf("unable to write data to spreadsheet: %v", err)
	}

	return nil
}

func (s *SpreadsheetService) getUserToken(r *http.Request) (*oauth2.Token, error) {
	cookie, err := r.Cookie("session_id")
	if err != nil {
		return nil, fmt.Errorf("no session cookie")
	}

	session, exists := sessions[cookie.Value]
	if !exists {
		return nil, fmt.Errorf("invalid session")
	}

	return session.Token, nil
}

func enableCors(w *http.ResponseWriter) {
	(*w).Header().Set("Access-Control-Allow-Origin", "http://localhost:3000")
	(*w).Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
	(*w).Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Authorization")
	(*w).Header().Set("Access-Control-Allow-Credentials", "true")
}

func handleGoogleLogin(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)
	if r.Method == "OPTIONS" {
		return
	}

	// Generate a new state for each login attempt
	newState := generateRandomString(32)
	oauthStateString = newState

	url := googleOauthConfig.AuthCodeURL(oauthStateString,
		oauth2.AccessTypeOffline,                                 // Request refresh token
		oauth2.SetAuthURLParam("prompt", "select_account"),       // Force consent and account selection
		oauth2.SetAuthURLParam("include_granted_scopes", "true"), // Include previously granted scopes
	)
	http.Redirect(w, r, url, http.StatusTemporaryRedirect)
}

func handleGoogleCallback(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)

	state := r.FormValue("state")
	if state != oauthStateString {
		http.Error(w, "Invalid state parameter", http.StatusBadRequest)
		return
	}

	code := r.FormValue("code")
	token, err := googleOauthConfig.Exchange(context.Background(), code)
	if err != nil {
		http.Error(w, "Code exchange failed", http.StatusInternalServerError)
		return
	}

	response, err := http.Get("https://www.googleapis.com/oauth2/v2/userinfo?access_token=" + token.AccessToken)
	if err != nil {
		http.Error(w, "Failed to get user info", http.StatusInternalServerError)
		return
	}
	defer response.Body.Close()

	var userInfo UserInfo
	if err := json.NewDecoder(response.Body).Decode(&userInfo); err != nil {
		http.Error(w, "Failed to decode user info", http.StatusInternalServerError)
		return
	}

	// Create session with both user info and OAuth token
	sessionID := generateRandomString(32)
	sessions[sessionID] = Session{
		UserInfo: userInfo,
		Token:    token,
	}

	// Set cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "session_id",
		Value:    sessionID,
		Path:     "/",
		HttpOnly: true,
		Secure:   false, // Set to true in production
		SameSite: http.SameSiteLaxMode,
		Expires:  time.Now().Add(24 * time.Hour),
	})

	// Redirect to frontend
	http.Redirect(w, r, "http://localhost:3000", http.StatusTemporaryRedirect)
}

func handleUser(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)
	if r.Method == "OPTIONS" {
		return
	}

	cookie, err := r.Cookie("session_id")
	if err != nil {
		http.Error(w, "Not authenticated", http.StatusUnauthorized)
		return
	}

	session, exists := sessions[cookie.Value]
	if !exists {
		http.Error(w, "Invalid session", http.StatusUnauthorized)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(session.UserInfo)
}

func handleLogout(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)
	if r.Method == "OPTIONS" {
		return
	}

	cookie, err := r.Cookie("session_id")
	if err == nil {
		delete(sessions, cookie.Value)
	}

	// Clear cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "session_id",
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Expires:  time.Unix(0, 0),
	})

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Logged out"})
}

func handleSpreadsheet(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)
	if r.Method == "OPTIONS" {
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Initialize spreadsheet service
	spreadsheetService := NewSpreadsheetService()

	// Get user token from session
	token, err := spreadsheetService.getUserToken(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	ctx := r.Context()
	err = spreadsheetService.InitializeServices(ctx, token)
	if err != nil {
		log.Printf("Failed to initialize Google services: %v", err)
		http.Error(w, "Failed to initialize Google services", http.StatusInternalServerError)
		return
	}

	fileName := "GrafikZabka-MaciejMoczadlo"

	// Find or create spreadsheet
	spreadsheet, err := spreadsheetService.FindOrCreateSpreadsheet(ctx, fileName)
	if err != nil {
		log.Printf("Error handling spreadsheet: %v", err)
		http.Error(w, "Failed to handle spreadsheet", http.StatusInternalServerError)
		return
	}

	// Read existing data
	data, err := spreadsheetService.ReadSpreadsheetData(ctx, spreadsheet.SpreadsheetId, "Sheet1!A1:Z1000")
	if err != nil {
		log.Printf("Error reading spreadsheet data: %v", err)
		// Continue anyway, might be empty sheet
		data = [][]interface{}{}
	}

	// If it's a new spreadsheet or empty, add some initial data
	created := len(data) == 0
	if created {
		initialData := [][]interface{}{
			{"Date", "Task", "Status", "Notes"},
			{"2025-07-10", "Sample Task", "Pending", "Initial entry"},
		}
		err = spreadsheetService.WriteSpreadsheetData(ctx, spreadsheet.SpreadsheetId, "Sheet1!A1:D2", initialData)
		if err != nil {
			log.Printf("Error writing initial data: %v", err)
		} else {
			data = initialData
		}
	}

	response := SpreadsheetResponse{
		SpreadsheetID:  spreadsheet.SpreadsheetId,
		SpreadsheetURL: fmt.Sprintf("https://docs.google.com/spreadsheets/d/%s", spreadsheet.SpreadsheetId),
		Title:          spreadsheet.Properties.Title,
		Data:           data,
		Created:        created,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func main() {
	http.HandleFunc("/auth/google", handleGoogleLogin)
	http.HandleFunc("/auth/callback", handleGoogleCallback)
	http.HandleFunc("/user", handleUser)
	http.HandleFunc("/logout", handleLogout)
	http.HandleFunc("/api/spreadsheet", handleSpreadsheet)

	fmt.Println("Server starting on :8080...")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
