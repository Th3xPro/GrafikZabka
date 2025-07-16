package main

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
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
	sessions          = make(map[string]Session)
	employerShops     = make(map[string]map[string]Shop) // employer_email -> map[shop_id]Shop
	employeeShops     = make(map[string][]string)        // employee_email -> []shop_ids

	// Mutexes for thread safety
	sessionsMutex      sync.RWMutex
	employerShopsMutex sync.RWMutex
	employeeShopsMutex sync.RWMutex

	// Cache for spreadsheet services to avoid recreating them
	serviceCache      = make(map[string]*SpreadsheetService)
	serviceCacheMutex sync.RWMutex
)

// Data files for persistence
const (
	shopsDataFile     = "shops_data.json"
	employeeShopsFile = "employee_shops_data.json"
	sessionTimeout    = 24 * time.Hour
	requestTimeout    = 30 * time.Second
)

type UserInfo struct {
	ID      string `json:"id"`
	Email   string `json:"email"`
	Name    string `json:"name"`
	Picture string `json:"picture"`
}

type Session struct {
	UserInfo  UserInfo      `json:"user_info"`
	Token     *oauth2.Token `json:"token"`
	Role      string        `json:"role"`
	CreatedAt time.Time     `json:"created_at"`
	LastUsed  time.Time     `json:"last_used"`
}

type UserWithRole struct {
	UserInfo
	Role string `json:"role"`
}

type Employee struct {
	Email      string  `json:"email"`
	Name       string  `json:"name"`
	HourlyRate float64 `json:"hourly_rate"`
}

type Shop struct {
	ID           string              `json:"id"`
	Name         string              `json:"name"`
	Employees    map[string]Employee `json:"employees"`
	Spreadsheets map[int]string      `json:"spreadsheets"` // year -> spreadsheet_id
	CreatedAt    time.Time           `json:"created_at"`
	UpdatedAt    time.Time           `json:"updated_at"`
}

type ShopRequest struct {
	Name string `json:"name"`
}

type EmployeeManagementRequest struct {
	ShopID        string  `json:"shop_id"`
	EmployeeEmail string  `json:"employee_email"`
	EmployeeName  string  `json:"employee_name"`
	HourlyRate    float64 `json:"hourly_rate"`
}

type SpreadsheetService struct {
	sheetsService *sheets.Service
	driveService  *drive.Service
	config        *oauth2.Config
	userEmail     string
	initialized   bool
	mutex         sync.RWMutex
}

type SpreadsheetResponse struct {
	SpreadsheetID  string              `json:"spreadsheet_id"`
	SpreadsheetURL string              `json:"spreadsheet_url"`
	Title          string              `json:"title"`
	ShopID         string              `json:"shop_id"`
	ShopName       string              `json:"shop_name"`
	Year           int                 `json:"year"`
	CurrentMonth   string              `json:"current_month"`
	Sheets         []string            `json:"sheets"`
	Data           [][]interface{}     `json:"data"`
	Employees      map[string]Employee `json:"employees"`
	Created        bool                `json:"created"`
	ReadOnly       bool                `json:"read_only"`
}

type ShopsResponse struct {
	Shops []ShopInfo `json:"shops"`
}

type ShopInfo struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	EmployeeCount int    `json:"employee_count"`
	CreatedAt     string `json:"created_at"`
	UpdatedAt     string `json:"updated_at"`
}

// Enhanced persistence functions with atomic writes
func saveShopsData() error {
	employerShopsMutex.RLock()
	defer employerShopsMutex.RUnlock()

	data, err := json.MarshalIndent(employerShops, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal shops data: %v", err)
	}

	// Atomic write using temporary file
	tempFile := shopsDataFile + ".tmp"
	if err := ioutil.WriteFile(tempFile, data, 0644); err != nil {
		return fmt.Errorf("failed to write temp file: %v", err)
	}

	if err := os.Rename(tempFile, shopsDataFile); err != nil {
		os.Remove(tempFile) // Cleanup on failure
		return fmt.Errorf("failed to rename temp file: %v", err)
	}

	return nil
}

func loadShopsData() error {
	if _, err := os.Stat(shopsDataFile); os.IsNotExist(err) {
		log.Printf("No existing shops data file found, starting with empty data")
		return nil
	}

	data, err := ioutil.ReadFile(shopsDataFile)
	if err != nil {
		return fmt.Errorf("failed to read shops data file: %v", err)
	}

	if len(data) == 0 {
		log.Printf("Empty shops data file, starting with empty data")
		return nil
	}

	employerShopsMutex.Lock()
	defer employerShopsMutex.Unlock()

	return json.Unmarshal(data, &employerShops)
}

func saveEmployeeShopsData() error {
	employeeShopsMutex.RLock()
	defer employeeShopsMutex.RUnlock()

	data, err := json.MarshalIndent(employeeShops, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal employee shops data: %v", err)
	}

	// Atomic write using temporary file
	tempFile := employeeShopsFile + ".tmp"
	if err := ioutil.WriteFile(tempFile, data, 0644); err != nil {
		return fmt.Errorf("failed to write temp file: %v", err)
	}

	if err := os.Rename(tempFile, employeeShopsFile); err != nil {
		os.Remove(tempFile) // Cleanup on failure
		return fmt.Errorf("failed to rename temp file: %v", err)
	}

	return nil
}

func loadEmployeeShopsData() error {
	if _, err := os.Stat(employeeShopsFile); os.IsNotExist(err) {
		log.Printf("No existing employee shops data file found, starting with empty data")
		return nil
	}

	data, err := ioutil.ReadFile(employeeShopsFile)
	if err != nil {
		return fmt.Errorf("failed to read employee shops data file: %v", err)
	}

	if len(data) == 0 {
		log.Printf("Empty employee shops data file, starting with empty data")
		return nil
	}

	employeeShopsMutex.Lock()
	defer employeeShopsMutex.Unlock()

	return json.Unmarshal(data, &employeeShops)
}

func generateRandomString(length int) string {
	bytes := make([]byte, length)
	if _, err := rand.Read(bytes); err != nil {
		panic(fmt.Sprintf("Failed to generate random string: %v", err))
	}
	return base64.URLEncoding.EncodeToString(bytes)[:length]
}

func generateShopID() string {
	return generateRandomString(16)
}

func getEmployerEmails() []string {
	employersEnv := os.Getenv("EMPLOYER_EMAILS")
	if employersEnv == "" {
		return []string{"maciek.moczadlo@gmail.com", "employer1@example.com", "employer2@example.com"}
	}
	return strings.Split(employersEnv, ",")
}

func isEmployer(email string) bool {
	employers := getEmployerEmails()
	emailLower := strings.ToLower(strings.TrimSpace(email))
	for _, employer := range employers {
		if strings.ToLower(strings.TrimSpace(employer)) == emailLower {
			return true
		}
	}
	return false
}

func findEmployersForEmployee(employeeEmail string) []string {
	employerShopsMutex.RLock()
	employeeShopsMutex.RLock()
	defer employerShopsMutex.RUnlock()
	defer employeeShopsMutex.RUnlock()

	var employers []string
	shopIDs := employeeShops[employeeEmail]

	for employer, shops := range employerShops {
		for shopID := range shops {
			for _, empShopID := range shopIDs {
				if shopID == empShopID {
					employers = append(employers, employer)
					break
				}
			}
		}
	}
	return employers
}

func findShopsForEmployee(employeeEmail string) []ShopInfo {
	employerShopsMutex.RLock()
	employeeShopsMutex.RLock()
	defer employerShopsMutex.RUnlock()
	defer employeeShopsMutex.RUnlock()

	var shops []ShopInfo
	shopIDs := employeeShops[employeeEmail]

	for _, shops_map := range employerShops {
		for shopID, shop := range shops_map {
			for _, empShopID := range shopIDs {
				if shopID == empShopID {
					shops = append(shops, ShopInfo{
						ID:            shop.ID,
						Name:          shop.Name,
						EmployeeCount: len(shop.Employees),
						CreatedAt:     shop.CreatedAt.Format("2006-01-02 15:04:05"),
						UpdatedAt:     shop.UpdatedAt.Format("2006-01-02 15:04:05"),
					})
					break
				}
			}
		}
	}
	return shops
}

func getUserRole(email string) string {
	if isEmployer(email) {
		return "employer"
	}
	if len(findEmployersForEmployee(email)) > 0 {
		return "employee"
	}
	return "unauthorized"
}

func getCurrentMonth() string {
	months := []string{
		"STYCZEŃ", "LUTY", "MARZEC", "KWIECIEŃ", "MAJ", "CZERWIEC",
		"LIPIEC", "SIERPIEŃ", "WRZESIEŃ", "PAŹDZIERNIK", "LISTOPAD", "GRUDZIEŃ",
	}
	return months[time.Now().Month()-1]
}

// Session cleanup routine
func cleanupExpiredSessions() {
	sessionsMutex.Lock()
	defer sessionsMutex.Unlock()

	now := time.Now()
	for sessionID, session := range sessions {
		if now.Sub(session.CreatedAt) > sessionTimeout || now.Sub(session.LastUsed) > 2*time.Hour {
			delete(sessions, sessionID)
			log.Printf("Cleaned up expired session for user: %s", session.UserInfo.Email)
		}
	}
}

// Start periodic cleanup
func startSessionCleanup() {
	ticker := time.NewTicker(30 * time.Minute)
	go func() {
		for {
			select {
			case <-ticker.C:
				cleanupExpiredSessions()
			}
		}
	}()
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

	// Load persistent data
	if err := loadShopsData(); err != nil {
		log.Printf("Error loading shops data: %v", err)
	}
	if err := loadEmployeeShopsData(); err != nil {
		log.Printf("Error loading employee shops data: %v", err)
	}

	// Initialize with default data if no data exists
	if len(employerShops) == 0 {
		log.Printf("Initializing with default shop data")
		defaultShopID := generateShopID()
		now := time.Now()
		employerShops["maciek.moczadlo@gmail.com"] = map[string]Shop{
			defaultShopID: {
				ID:   defaultShopID,
				Name: "Main Store",
				Employees: map[string]Employee{
					"stanczok@gmail.com": {Email: "stanczok@gmail.com", Name: "Sandra", HourlyRate: 30.5},
				},
				Spreadsheets: make(map[int]string),
				CreatedAt:    now,
				UpdatedAt:    now,
			},
		}
		employeeShops["stanczok@gmail.com"] = []string{defaultShopID}
		saveShopsData()
		saveEmployeeShopsData()
	}

	log.Printf("Loaded shops data: %+v", employerShops)
	log.Printf("Loaded employee shops data: %+v", employeeShops)

	// Start session cleanup
	startSessionCleanup()
}

func NewSpreadsheetService(userEmail string) *SpreadsheetService {
	return &SpreadsheetService{
		config:    googleOauthConfig,
		userEmail: userEmail,
	}
}

func getOrCreateSpreadsheetService(userEmail string, token *oauth2.Token) (*SpreadsheetService, error) {
	serviceCacheMutex.RLock()
	if service, exists := serviceCache[userEmail]; exists && service.initialized {
		serviceCacheMutex.RUnlock()
		// Update last used time
		sessionsMutex.Lock()
		for sessionID, session := range sessions {
			if session.UserInfo.Email == userEmail {
				session.LastUsed = time.Now()
				sessions[sessionID] = session
				break
			}
		}
		sessionsMutex.Unlock()
		return service, nil
	}
	serviceCacheMutex.RUnlock()

	serviceCacheMutex.Lock()
	defer serviceCacheMutex.Unlock()

	// Double-check after acquiring write lock
	if service, exists := serviceCache[userEmail]; exists && service.initialized {
		return service, nil
	}

	service := NewSpreadsheetService(userEmail)
	ctx, cancel := context.WithTimeout(context.Background(), requestTimeout)
	defer cancel()

	if err := service.InitializeServices(ctx, token); err != nil {
		return nil, err
	}

	serviceCache[userEmail] = service
	return service, nil
}

func (s *SpreadsheetService) InitializeServices(ctx context.Context, token *oauth2.Token) error {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	if s.initialized {
		return nil
	}

	if token == nil {
		return fmt.Errorf("token is nil")
	}

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
	s.initialized = true

	return nil
}

func (s *SpreadsheetService) FindSpreadsheetByName(ctx context.Context, fileName string) (*sheets.Spreadsheet, error) {
	s.mutex.RLock()
	defer s.mutex.RUnlock()

	query := fmt.Sprintf("name='%s' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false", fileName)

	fileList, err := s.driveService.Files.List().Q(query).Context(ctx).Do()
	if err != nil {
		return nil, fmt.Errorf("unable to search for spreadsheet: %v", err)
	}

	if len(fileList.Files) == 0 {
		return nil, fmt.Errorf("spreadsheet not found")
	}

	spreadsheetID := fileList.Files[0].Id
	log.Printf("Found existing spreadsheet '%s' with ID: %s", fileName, spreadsheetID)

	spreadsheet, err := s.sheetsService.Spreadsheets.Get(spreadsheetID).Context(ctx).Do()
	if err != nil {
		return nil, fmt.Errorf("unable to get spreadsheet details: %v", err)
	}

	return spreadsheet, nil
}

func (s *SpreadsheetService) CreateWorkScheduleSpreadsheet(ctx context.Context, shopName, employerEmail, shopID string, year int) (*sheets.Spreadsheet, error) {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	// FIXED: Use proper filename format with GrafikZabka prefix
	fileName := fmt.Sprintf("GrafikZabka-%s-%d", shopName, year)
	log.Printf("Creating work schedule spreadsheet: %s for employer: %s, shop: %s", fileName, employerEmail, shopID)

	// First check if spreadsheet already exists by name
	existingSpreadsheet, err := s.findSpreadsheetByNameUnsafe(ctx, fileName)
	if err == nil {
		log.Printf("Found existing spreadsheet by name: %s", existingSpreadsheet.SpreadsheetId)

		employerShopsMutex.Lock()
		if employerShops[employerEmail][shopID].Spreadsheets == nil {
			shop := employerShops[employerEmail][shopID]
			shop.Spreadsheets = make(map[int]string)
			employerShops[employerEmail][shopID] = shop
		}
		shop := employerShops[employerEmail][shopID]
		shop.Spreadsheets[year] = existingSpreadsheet.SpreadsheetId
		employerShops[employerEmail][shopID] = shop
		employerShopsMutex.Unlock()

		go saveShopsData() // Async save for performance
		return existingSpreadsheet, nil
	}

	// Create new spreadsheet if not found
	spreadsheetSheets := []*sheets.Sheet{
		{Properties: &sheets.SheetProperties{Title: "MANAGEMENT"}},
		{Properties: &sheets.SheetProperties{Title: "STYCZEŃ"}},
		{Properties: &sheets.SheetProperties{Title: "LUTY"}},
		{Properties: &sheets.SheetProperties{Title: "MARZEC"}},
		{Properties: &sheets.SheetProperties{Title: "KWIECIEŃ"}},
		{Properties: &sheets.SheetProperties{Title: "MAJ"}},
		{Properties: &sheets.SheetProperties{Title: "CZERWIEC"}},
		{Properties: &sheets.SheetProperties{Title: "LIPIEC"}},
		{Properties: &sheets.SheetProperties{Title: "SIERPIEŃ"}},
		{Properties: &sheets.SheetProperties{Title: "WRZESIEŃ"}},
		{Properties: &sheets.SheetProperties{Title: "PAŹDZIERNIK"}},
		{Properties: &sheets.SheetProperties{Title: "LISTOPAD"}},
		{Properties: &sheets.SheetProperties{Title: "GRUDZIEŃ"}},
	}

	spreadsheet := &sheets.Spreadsheet{
		Properties: &sheets.SpreadsheetProperties{
			Title: fileName,
		},
		Sheets: spreadsheetSheets,
	}

	resp, err := s.sheetsService.Spreadsheets.Create(spreadsheet).Context(ctx).Do()
	if err != nil {
		return nil, fmt.Errorf("unable to create spreadsheet: %v", err)
	}

	// Initialize spreadsheets map if needed
	employerShopsMutex.Lock()
	if employerShops[employerEmail][shopID].Spreadsheets == nil {
		shop := employerShops[employerEmail][shopID]
		shop.Spreadsheets = make(map[int]string)
		employerShops[employerEmail][shopID] = shop
	}
	shop := employerShops[employerEmail][shopID]
	shop.Spreadsheets[year] = resp.SpreadsheetId
	shop.UpdatedAt = time.Now()
	employerShops[employerEmail][shopID] = shop
	employerShopsMutex.Unlock()

	go saveShopsData() // Async save for performance

	log.Printf("Successfully created work schedule spreadsheet: %s", resp.SpreadsheetId)

	// Initialize management sheet
	if err := s.initializeManagementSheetUnsafe(ctx, resp.SpreadsheetId, employerEmail, shopID); err != nil {
		log.Printf("Error initializing management sheet: %v", err)
	}

	return resp, nil
}

// Helper method that doesn't acquire mutex (for internal use when mutex is already held)
func (s *SpreadsheetService) findSpreadsheetByNameUnsafe(ctx context.Context, fileName string) (*sheets.Spreadsheet, error) {
	query := fmt.Sprintf("name='%s' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false", fileName)

	fileList, err := s.driveService.Files.List().Q(query).Context(ctx).Do()
	if err != nil {
		return nil, fmt.Errorf("unable to search for spreadsheet: %v", err)
	}

	if len(fileList.Files) == 0 {
		return nil, fmt.Errorf("spreadsheet not found")
	}

	spreadsheetID := fileList.Files[0].Id
	spreadsheet, err := s.sheetsService.Spreadsheets.Get(spreadsheetID).Context(ctx).Do()
	if err != nil {
		return nil, fmt.Errorf("unable to get spreadsheet details: %v", err)
	}

	return spreadsheet, nil
}

func (s *SpreadsheetService) initializeManagementSheetUnsafe(ctx context.Context, spreadsheetID, employerEmail, shopID string) error {
	employerShopsMutex.RLock()
	shop := employerShops[employerEmail][shopID]
	employerShopsMutex.RUnlock()

	managementData := [][]interface{}{
		{fmt.Sprintf("ZARZĄDZANIE PRACOWNIKAMI - GrafikZabka-%s", shop.Name)},
		{""},
		{"Email", "Imię i Nazwisko", "Stawka godzinowa (PLN)"},
	}

	for _, employee := range shop.Employees {
		managementData = append(managementData, []interface{}{
			employee.Email,
			employee.Name,
			employee.HourlyRate,
		})
	}

	return s.WriteSpreadsheetDataUnsafe(ctx, spreadsheetID, "MANAGEMENT!A1:C20", managementData)
}

func (s *SpreadsheetService) initializeManagementSheet(ctx context.Context, spreadsheetID, employerEmail, shopID string) error {
	s.mutex.Lock()
	defer s.mutex.Unlock()
	return s.initializeManagementSheetUnsafe(ctx, spreadsheetID, employerEmail, shopID)
}

func (s *SpreadsheetService) GetSpreadsheetById(ctx context.Context, spreadsheetID string) (*sheets.Spreadsheet, error) {
	s.mutex.RLock()
	defer s.mutex.RUnlock()

	spreadsheet, err := s.sheetsService.Spreadsheets.Get(spreadsheetID).Context(ctx).Do()
	if err != nil {
		return nil, fmt.Errorf("unable to get spreadsheet: %v", err)
	}
	return spreadsheet, nil
}

func (s *SpreadsheetService) ShareSpreadsheetWithEmployee(ctx context.Context, spreadsheetID, employeeEmail string) error {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	log.Printf("Sharing spreadsheet %s with employee: %s", spreadsheetID, employeeEmail)

	permission := &drive.Permission{
		Role:         "reader",
		Type:         "user",
		EmailAddress: employeeEmail,
	}

	_, err := s.driveService.Permissions.Create(spreadsheetID, permission).Context(ctx).Do()
	if err != nil {
		if strings.Contains(err.Error(), "already exists") || strings.Contains(err.Error(), "already has access") {
			log.Printf("Permission already exists for %s", employeeEmail)
			return nil
		}
		return fmt.Errorf("unable to share spreadsheet: %v", err)
	}

	log.Printf("Successfully shared spreadsheet %s with employee %s", spreadsheetID, employeeEmail)
	return nil
}

func (s *SpreadsheetService) RevokeSpreadsheetAccessFromEmployee(ctx context.Context, spreadsheetID, employeeEmail string) error {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	log.Printf("Revoking spreadsheet %s access from employee: %s", spreadsheetID, employeeEmail)

	// First, list all permissions to find the permission ID for this user
	permissionsList, err := s.driveService.Permissions.List(spreadsheetID).Context(ctx).Do()
	if err != nil {
		return fmt.Errorf("unable to list permissions: %v", err)
	}

	// Find the permission ID for this email
	var permissionID string
	for _, permission := range permissionsList.Permissions {
		if permission.EmailAddress == employeeEmail {
			permissionID = permission.Id
			break
		}
	}

	if permissionID == "" {
		log.Printf("No permission found for employee %s on spreadsheet %s", employeeEmail, spreadsheetID)
		return nil // Already doesn't have access, so we're good
	}

	// Delete the permission
	err = s.driveService.Permissions.Delete(spreadsheetID, permissionID).Context(ctx).Do()
	if err != nil {
		return fmt.Errorf("unable to revoke spreadsheet access: %v", err)
	}

	log.Printf("Successfully revoked spreadsheet %s access from employee %s", spreadsheetID, employeeEmail)
	return nil
}

func (s *SpreadsheetService) ReadSpreadsheetData(ctx context.Context, spreadsheetID, sheetRange string) ([][]interface{}, error) {
	s.mutex.RLock()
	defer s.mutex.RUnlock()

	resp, err := s.sheetsService.Spreadsheets.Values.Get(spreadsheetID, sheetRange).Context(ctx).Do()
	if err != nil {
		return nil, fmt.Errorf("unable to read data: %v", err)
	}
	return resp.Values, nil
}

func (s *SpreadsheetService) WriteSpreadsheetData(ctx context.Context, spreadsheetID, sheetRange string, values [][]interface{}) error {
	s.mutex.Lock()
	defer s.mutex.Unlock()
	return s.WriteSpreadsheetDataUnsafe(ctx, spreadsheetID, sheetRange, values)
}

func (s *SpreadsheetService) WriteSpreadsheetDataUnsafe(ctx context.Context, spreadsheetID, sheetRange string, values [][]interface{}) error {
	valueRange := &sheets.ValueRange{
		Values: values,
	}

	_, err := s.sheetsService.Spreadsheets.Values.Update(spreadsheetID, sheetRange, valueRange).
		ValueInputOption("USER_ENTERED").Context(ctx).Do()
	if err != nil {
		return fmt.Errorf("unable to write data: %v", err)
	}
	return nil
}

// IMPROVED: Better handling of empty employees
func (s *SpreadsheetService) CreateMonthlySchedule(ctx context.Context, spreadsheetID, month string, employees map[string]Employee, year int) error {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	daysInMonth := getDaysInMonth(month, year)

	// Create header row
	header := []interface{}{"DZIEŃ TYGODNIA"}
	employeeEmails := make([]string, 0, len(employees))

	if len(employees) == 0 {
		// If no employees, create placeholder columns
		header = append(header, "PRACOWNIK 1", "PRACOWNIK 2", "PRACOWNIK 3")
	} else {
		for email, employee := range employees {
			header = append(header, strings.ToUpper(employee.Name))
			employeeEmails = append(employeeEmails, email)
		}
	}
	header = append(header, "TAGI")

	scheduleData := [][]interface{}{header}

	// Create rows for each day
	for day := 1; day <= daysInMonth; day++ {
		date := time.Date(year, getMonthNumber(month), day, 0, 0, 0, 0, time.UTC)
		dayName := getPolishDayName(date.Weekday())

		row := []interface{}{fmt.Sprintf("%s %d", dayName, day)}

		// Add empty schedule slots
		if len(employees) == 0 {
			row = append(row, "", "", "") // Three placeholder columns
		} else {
			for range employees {
				row = append(row, "")
			}
		}
		row = append(row, "") // Tags column

		scheduleData = append(scheduleData, row)
	}

	// Add exactly one empty row for spacing
	emptyRow := []interface{}{""}
	if len(employees) == 0 {
		emptyRow = append(emptyRow, "", "", "", "") // Match column count
	} else {
		for range employees {
			emptyRow = append(emptyRow, "")
		}
		emptyRow = append(emptyRow, "") // Tags column
	}
	scheduleData = append(scheduleData, emptyRow)

	// Hours summary row
	hoursRow := []interface{}{"SUMA GODZIN"}
	if len(employees) == 0 {
		hoursRow = append(hoursRow, "0,00", "0,00", "0,00")
	} else {
		for range employees {
			hoursRow = append(hoursRow, "0,00")
		}
	}
	hoursRow = append(hoursRow, "") // Empty tags column
	scheduleData = append(scheduleData, hoursRow)

	// Wages summary row
	wagesRow := []interface{}{"WYPŁATA"}
	if len(employees) == 0 {
		wagesRow = append(wagesRow, "0,00", "0,00", "0,00")
	} else {
		for range employees {
			wagesRow = append(wagesRow, "0,00")
		}
	}
	wagesRow = append(wagesRow, "") // Empty tags column
	scheduleData = append(scheduleData, wagesRow)

	sheetRange := fmt.Sprintf("%s!A1:Z%d", month, len(scheduleData))
	return s.WriteSpreadsheetDataUnsafe(ctx, spreadsheetID, sheetRange, scheduleData)
}

func (s *SpreadsheetService) RegenerateAllMonthlySchedules(ctx context.Context, spreadsheetID string, employees map[string]Employee, year int) error {
	log.Printf("Regenerating all monthly schedules for spreadsheet %s", spreadsheetID)

	months := []string{"STYCZEŃ", "LUTY", "MARZEC", "KWIECIEŃ", "MAJ", "CZERWIEC",
		"LIPIEC", "SIERPIEŃ", "WRZESIEŃ", "PAŹDZIERNIK", "LISTOPAD", "GRUDZIEŃ"}

	for _, month := range months {
		if err := s.CreateMonthlySchedule(ctx, spreadsheetID, month, employees, year); err != nil {
			log.Printf("Error regenerating month %s: %v", month, err)
			return err
		}
	}

	return nil
}

func getDaysInMonth(month string, year int) int {
	monthNum := getMonthNumber(month)
	return time.Date(year, monthNum+1, 0, 0, 0, 0, 0, time.UTC).Day()
}

func getMonthNumber(month string) time.Month {
	months := map[string]time.Month{
		"STYCZEŃ":     time.January,
		"LUTY":        time.February,
		"MARZEC":      time.March,
		"KWIECIEŃ":    time.April,
		"MAJ":         time.May,
		"CZERWIEC":    time.June,
		"LIPIEC":      time.July,
		"SIERPIEŃ":    time.August,
		"WRZESIEŃ":    time.September,
		"PAŹDZIERNIK": time.October,
		"LISTOPAD":    time.November,
		"GRUDZIEŃ":    time.December,
	}
	return months[month]
}

func getPolishDayName(weekday time.Weekday) string {
	days := map[time.Weekday]string{
		time.Monday:    "Poniedziałek",
		time.Tuesday:   "Wtorek",
		time.Wednesday: "Środa",
		time.Thursday:  "Czwartek",
		time.Friday:    "Piątek",
		time.Saturday:  "Sobota",
		time.Sunday:    "Niedziela",
	}
	return days[weekday]
}

func enableCors(w *http.ResponseWriter) {
	(*w).Header().Set("Access-Control-Allow-Origin", "http://localhost:3000")
	(*w).Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
	(*w).Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Authorization")
	(*w).Header().Set("Access-Control-Allow-Credentials", "true")
}

// Middleware to add request timeout
func withTimeout(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
		defer cancel()
		next.ServeHTTP(w, r.WithContext(ctx))
	}
}

func handleGoogleLogin(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)
	if r.Method == "OPTIONS" {
		return
	}

	newState := generateRandomString(32)
	oauthStateString = newState

	url := googleOauthConfig.AuthCodeURL(oauthStateString,
		oauth2.AccessTypeOffline,
		oauth2.SetAuthURLParam("prompt", "consent"),
		oauth2.SetAuthURLParam("include_granted_scopes", "true"),
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
	token, err := googleOauthConfig.Exchange(r.Context(), code)
	if err != nil {
		log.Printf("Code exchange failed: %v", err)
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

	role := getUserRole(userInfo.Email)
	log.Printf("User %s attempting login with role: %s", userInfo.Email, role)

	if role == "unauthorized" {
		log.Printf("Unauthorized login attempt from: %s", userInfo.Email)
		http.Error(w, "Unauthorized: You are not registered as an employer or employee", http.StatusForbidden)
		return
	}

	sessionID := generateRandomString(32)
	now := time.Now()

	sessionsMutex.Lock()
	sessions[sessionID] = Session{
		UserInfo:  userInfo,
		Token:     token,
		Role:      role,
		CreatedAt: now,
		LastUsed:  now,
	}
	sessionsMutex.Unlock()

	log.Printf("User %s logged in successfully with role: %s", userInfo.Email, role)

	http.SetCookie(w, &http.Cookie{
		Name:     "session_id",
		Value:    sessionID,
		Path:     "/",
		HttpOnly: true,
		Secure:   false,
		SameSite: http.SameSiteLaxMode,
		Expires:  now.Add(sessionTimeout),
	})

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

	sessionsMutex.RLock()
	session, exists := sessions[cookie.Value]
	sessionsMutex.RUnlock()

	if !exists {
		http.Error(w, "Invalid session", http.StatusUnauthorized)
		return
	}

	// Update last used time
	sessionsMutex.Lock()
	session.LastUsed = time.Now()
	sessions[cookie.Value] = session
	sessionsMutex.Unlock()

	userWithRole := UserWithRole{
		UserInfo: session.UserInfo,
		Role:     session.Role,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(userWithRole)
}

func handleLogout(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)
	if r.Method == "OPTIONS" {
		return
	}

	cookie, err := r.Cookie("session_id")
	if err == nil {
		sessionsMutex.Lock()
		if session, exists := sessions[cookie.Value]; exists {
			// Clear service cache for this user
			serviceCacheMutex.Lock()
			delete(serviceCache, session.UserInfo.Email)
			serviceCacheMutex.Unlock()
		}
		delete(sessions, cookie.Value)
		sessionsMutex.Unlock()
	}

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

func handleShops(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)
	if r.Method == "OPTIONS" {
		return
	}

	cookie, err := r.Cookie("session_id")
	if err != nil {
		http.Error(w, "Not authenticated", http.StatusUnauthorized)
		return
	}

	sessionsMutex.RLock()
	session, exists := sessions[cookie.Value]
	sessionsMutex.RUnlock()

	if !exists {
		http.Error(w, "Invalid session", http.StatusUnauthorized)
		return
	}

	// Update last used time
	sessionsMutex.Lock()
	session.LastUsed = time.Now()
	sessions[cookie.Value] = session
	sessionsMutex.Unlock()

	switch r.Method {
	case http.MethodGet:
		var shops []ShopInfo

		if session.Role == "employer" {
			employerShopsMutex.RLock()
			if employerShops[session.UserInfo.Email] != nil {
				for _, shop := range employerShops[session.UserInfo.Email] {
					shops = append(shops, ShopInfo{
						ID:            shop.ID,
						Name:          shop.Name,
						EmployeeCount: len(shop.Employees),
						CreatedAt:     shop.CreatedAt.Format("2006-01-02 15:04:05"),
						UpdatedAt:     shop.UpdatedAt.Format("2006-01-02 15:04:05"),
					})
				}
			}
			employerShopsMutex.RUnlock()
		} else if session.Role == "employee" {
			shops = findShopsForEmployee(session.UserInfo.Email)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(ShopsResponse{Shops: shops})

	case http.MethodPost:
		if session.Role != "employer" {
			http.Error(w, "Only employers can create shops", http.StatusForbidden)
			return
		}

		var req ShopRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		if strings.TrimSpace(req.Name) == "" {
			http.Error(w, "Shop name is required", http.StatusBadRequest)
			return
		}

		shopID := generateShopID()
		now := time.Now()
		newShop := Shop{
			ID:           shopID,
			Name:         strings.TrimSpace(req.Name),
			Employees:    make(map[string]Employee),
			Spreadsheets: make(map[int]string),
			CreatedAt:    now,
			UpdatedAt:    now,
		}

		employerShopsMutex.Lock()
		if employerShops[session.UserInfo.Email] == nil {
			employerShops[session.UserInfo.Email] = make(map[string]Shop)
		}
		employerShops[session.UserInfo.Email][shopID] = newShop
		employerShopsMutex.Unlock()

		go saveShopsData() // Async save for performance

		log.Printf("Created new shop %s for employer %s", req.Name, session.UserInfo.Email)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"message": "Shop created successfully",
			"shop_id": shopID,
		})

	case http.MethodDelete:
		var req EmployeeManagementRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		if req.ShopID == "" || req.EmployeeEmail == "" {
			http.Error(w, "Shop ID and employee email are required", http.StatusBadRequest)
			return
		}

		// Get shop data before removing employee (to access spreadsheets)
		employerShopsMutex.RLock()
		var shop Shop
		var shopExists bool
		if employerShops[session.UserInfo.Email] != nil {
			shop, shopExists = employerShops[session.UserInfo.Email][req.ShopID]
		}
		employerShopsMutex.RUnlock()

		if !shopExists {
			http.Error(w, "Shop not found", http.StatusNotFound)
			return
		}

		// Revoke access from all spreadsheets for this shop before removing employee
		if shop.Spreadsheets != nil && len(shop.Spreadsheets) > 0 {
			spreadsheetService, err := getOrCreateSpreadsheetService(session.UserInfo.Email, session.Token)
			if err == nil {
				for year, spreadsheetID := range shop.Spreadsheets {
					if err := spreadsheetService.RevokeSpreadsheetAccessFromEmployee(r.Context(), spreadsheetID, req.EmployeeEmail); err != nil {
						log.Printf("Error revoking spreadsheet access for year %d: %v", year, err)
					} else {
						log.Printf("Revoked spreadsheet access for shop %s, year %d from employee %s", req.ShopID, year, req.EmployeeEmail)
					}
				}
			} else {
				log.Printf("Error getting spreadsheet service for revoking access: %v", err)
			}
		}

		// Remove employee from shop
		employerShopsMutex.Lock()
		if employerShops[session.UserInfo.Email] != nil {
			if shop, exists := employerShops[session.UserInfo.Email][req.ShopID]; exists {
				delete(shop.Employees, req.EmployeeEmail)
				shop.UpdatedAt = time.Now()
				employerShops[session.UserInfo.Email][req.ShopID] = shop
			}
		}
		employerShopsMutex.Unlock()

		// Remove shop from employee's shop list
		employeeShopsMutex.Lock()
		if empShops := employeeShops[req.EmployeeEmail]; empShops != nil {
			for i, shopID := range empShops {
				if shopID == req.ShopID {
					employeeShops[req.EmployeeEmail] = append(empShops[:i], empShops[i+1:]...)
					break
				}
			}
		}
		employeeShopsMutex.Unlock()

		// Save to files asynchronously
		go func() {
			saveShopsData()
			saveEmployeeShopsData()
		}()

		log.Printf("Removed employee %s from shop %s for employer %s and revoked spreadsheet access", req.EmployeeEmail, req.ShopID, session.UserInfo.Email)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "Employee removed successfully and spreadsheet access revoked"})
	}
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

	cookie, err := r.Cookie("session_id")
	if err != nil {
		http.Error(w, "Not authenticated", http.StatusUnauthorized)
		return
	}

	sessionsMutex.RLock()
	session, exists := sessions[cookie.Value]
	sessionsMutex.RUnlock()

	if !exists {
		http.Error(w, "Invalid session", http.StatusUnauthorized)
		return
	}

	// Update last used time
	sessionsMutex.Lock()
	session.LastUsed = time.Now()
	sessions[cookie.Value] = session
	sessionsMutex.Unlock()

	// Get parameters
	shopID := r.URL.Query().Get("shop_id")
	if shopID == "" {
		http.Error(w, "Shop ID is required", http.StatusBadRequest)
		return
	}

	yearParam := r.URL.Query().Get("year")
	year := time.Now().Year()
	if yearParam != "" {
		if parsedYear, err := strconv.Atoi(yearParam); err == nil {
			year = parsedYear
		}
	}

	log.Printf("Processing spreadsheet request for user: %s (role: %s) for shop: %s, year: %d", session.UserInfo.Email, session.Role, shopID, year)

	var targetEmployerEmail string
	var shop Shop
	var readOnly bool

	if session.Role == "employer" {
		targetEmployerEmail = session.UserInfo.Email
		employerShopsMutex.RLock()
		if employerShops[targetEmployerEmail] == nil || employerShops[targetEmployerEmail][shopID].ID == "" {
			employerShopsMutex.RUnlock()
			http.Error(w, "Shop not found", http.StatusNotFound)
			return
		}
		shop = employerShops[targetEmployerEmail][shopID]
		employerShopsMutex.RUnlock()
		readOnly = false
	} else if session.Role == "employee" {
		// Find which employer owns this shop and verify employee has access
		found := false
		employerShopsMutex.RLock()
		for employer, shops := range employerShops {
			if shopData, exists := shops[shopID]; exists {
				if _, hasAccess := shopData.Employees[session.UserInfo.Email]; hasAccess {
					targetEmployerEmail = employer
					shop = shopData
					readOnly = true
					found = true
					break
				}
			}
		}
		employerShopsMutex.RUnlock()

		if !found {
			log.Printf("Employee %s trying to access shop %s without permission", session.UserInfo.Email, shopID)
			http.Error(w, "You don't have access to this shop", http.StatusForbidden)
			return
		}
		log.Printf("Employee %s accessing shop %s (employer: %s) for year %d", session.UserInfo.Email, shopID, targetEmployerEmail, year)
	} else {
		http.Error(w, "Unauthorized", http.StatusForbidden)
		return
	}

	spreadsheetService, err := getOrCreateSpreadsheetService(session.UserInfo.Email, session.Token)
	if err != nil {
		log.Printf("Failed to get spreadsheet service: %v", err)
		http.Error(w, "Failed to initialize Google services", http.StatusInternalServerError)
		return
	}

	var spreadsheet *sheets.Spreadsheet
	var created bool

	// Check if shop already has a spreadsheet for this year
	if shop.Spreadsheets != nil {
		if spreadsheetID, exists := shop.Spreadsheets[year]; exists {
			log.Printf("Found stored spreadsheet ID for shop %s, year %d: %s", shopID, year, spreadsheetID)
			spreadsheet, err = spreadsheetService.GetSpreadsheetById(r.Context(), spreadsheetID)
			if err != nil {
				log.Printf("Stored spreadsheet %s not accessible, will create/find new one: %v", spreadsheetID, err)
				employerShopsMutex.Lock()
				delete(shop.Spreadsheets, year)
				employerShops[targetEmployerEmail][shopID] = shop
				employerShopsMutex.Unlock()
				go saveShopsData()
				spreadsheet = nil
			}
		}
	}

	// Create/find spreadsheet if needed
	if spreadsheet == nil {
		if session.Role != "employer" {
			log.Printf("Employee trying to access non-existent spreadsheet for shop %s, year %d", shopID, year)
			http.Error(w, "Spreadsheet not found for this year. Contact your employer to create one.", http.StatusNotFound)
			return
		}

		spreadsheet, err = spreadsheetService.CreateWorkScheduleSpreadsheet(r.Context(), shop.Name, targetEmployerEmail, shopID, year)
		if err != nil {
			log.Printf("Error creating/finding spreadsheet: %v", err)
			http.Error(w, "Failed to create spreadsheet", http.StatusInternalServerError)
			return
		}
		created = true

		// IMPROVED: Initialize monthly schedules for new spreadsheets even without employees
		months := []string{"STYCZEŃ", "LUTY", "MARZEC", "KWIECIEŃ", "MAJ", "CZERWIEC",
			"LIPIEC", "SIERPIEŃ", "WRZESIEŃ", "PAŹDZIERNIK", "LISTOPAD", "GRUDZIEŃ"}

		for _, month := range months {
			err = spreadsheetService.CreateMonthlySchedule(r.Context(), spreadsheet.SpreadsheetId, month, shop.Employees, year)
			if err != nil {
				log.Printf("Error initializing month %s: %v", month, err)
			}
		}

		// Share with employees only if they exist
		if len(shop.Employees) > 0 {
			for email := range shop.Employees {
				err = spreadsheetService.ShareSpreadsheetWithEmployee(r.Context(), spreadsheet.SpreadsheetId, email)
				if err != nil {
					log.Printf("Error sharing with employee %s: %v", email, err)
				}
			}
		}
	}

	// Get sheet names
	sheetNames := make([]string, len(spreadsheet.Sheets))
	for i, sheet := range spreadsheet.Sheets {
		sheetNames[i] = sheet.Properties.Title
	}

	// Read management data
	data, err := spreadsheetService.ReadSpreadsheetData(r.Context(), spreadsheet.SpreadsheetId, "MANAGEMENT!A1:C20")
	if err != nil {
		log.Printf("Error reading management data: %v", err)
		data = [][]interface{}{}
	}

	response := SpreadsheetResponse{
		SpreadsheetID:  spreadsheet.SpreadsheetId,
		SpreadsheetURL: fmt.Sprintf("https://docs.google.com/spreadsheets/d/%s", spreadsheet.SpreadsheetId),
		Title:          spreadsheet.Properties.Title,
		ShopID:         shopID,
		ShopName:       shop.Name,
		Year:           year,
		CurrentMonth:   getCurrentMonth(),
		Sheets:         sheetNames,
		Data:           data,
		Employees:      shop.Employees,
		Created:        created,
		ReadOnly:       readOnly,
	}

	log.Printf("Returning spreadsheet response for %s: ID=%s, Shop=%s, Year=%d, ReadOnly=%v", session.UserInfo.Email, response.SpreadsheetID, response.ShopName, response.Year, response.ReadOnly)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func handleEmployees(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)
	if r.Method == "OPTIONS" {
		return
	}

	cookie, err := r.Cookie("session_id")
	if err != nil {
		http.Error(w, "Not authenticated", http.StatusUnauthorized)
		return
	}

	sessionsMutex.RLock()
	session, exists := sessions[cookie.Value]
	sessionsMutex.RUnlock()

	if !exists {
		http.Error(w, "Invalid session", http.StatusUnauthorized)
		return
	}

	if session.Role != "employer" {
		http.Error(w, "Only employers can manage employees", http.StatusForbidden)
		return
	}

	// Update last used time
	sessionsMutex.Lock()
	session.LastUsed = time.Now()
	sessions[cookie.Value] = session
	sessionsMutex.Unlock()

	switch r.Method {
	case http.MethodGet:
		shopID := r.URL.Query().Get("shop_id")
		if shopID == "" {
			http.Error(w, "Shop ID is required", http.StatusBadRequest)
			return
		}

		employees := make([]Employee, 0)
		employerShopsMutex.RLock()
		if employerShops[session.UserInfo.Email] != nil {
			if shop, exists := employerShops[session.UserInfo.Email][shopID]; exists {
				for _, employee := range shop.Employees {
					employees = append(employees, employee)
				}
			}
		}
		employerShopsMutex.RUnlock()

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string][]Employee{"employees": employees})

	case http.MethodPost:
		var req EmployeeManagementRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		if req.ShopID == "" || strings.TrimSpace(req.EmployeeEmail) == "" || strings.TrimSpace(req.EmployeeName) == "" {
			http.Error(w, "Shop ID, employee email and name are required", http.StatusBadRequest)
			return
		}

		if req.HourlyRate <= 0 {
			req.HourlyRate = 30.0 // Default rate
		}

		// Check if shop exists
		employerShopsMutex.RLock()
		shopExists := employerShops[session.UserInfo.Email] != nil && employerShops[session.UserInfo.Email][req.ShopID].ID != ""
		employerShopsMutex.RUnlock()

		if !shopExists {
			http.Error(w, "Shop not found", http.StatusNotFound)
			return
		}

		// Add employee to shop
		employerShopsMutex.Lock()
		shop := employerShops[session.UserInfo.Email][req.ShopID]
		shop.Employees[req.EmployeeEmail] = Employee{
			Email:      strings.TrimSpace(req.EmployeeEmail),
			Name:       strings.TrimSpace(req.EmployeeName),
			HourlyRate: req.HourlyRate,
		}
		shop.UpdatedAt = time.Now()
		employerShops[session.UserInfo.Email][req.ShopID] = shop
		employerShopsMutex.Unlock()

		// Add shop to employee's shop list
		employeeShopsMutex.Lock()
		if employeeShops[req.EmployeeEmail] == nil {
			employeeShops[req.EmployeeEmail] = []string{}
		}

		// Check if employee is already in this shop
		found := false
		for _, shopID := range employeeShops[req.EmployeeEmail] {
			if shopID == req.ShopID {
				found = true
				break
			}
		}
		if !found {
			employeeShops[req.EmployeeEmail] = append(employeeShops[req.EmployeeEmail], req.ShopID)
		}
		employeeShopsMutex.Unlock()

		// Save to files asynchronously
		go func() {
			saveShopsData()
			saveEmployeeShopsData()
		}()

		// Share existing spreadsheets with new employee (all years for this shop)
		if shop.Spreadsheets != nil {
			spreadsheetService, err := getOrCreateSpreadsheetService(session.UserInfo.Email, session.Token)
			if err == nil {
				for year, spreadsheetID := range shop.Spreadsheets {
					if err := spreadsheetService.ShareSpreadsheetWithEmployee(r.Context(), spreadsheetID, req.EmployeeEmail); err != nil {
						log.Printf("Error sharing spreadsheet for year %d: %v", year, err)
					} else {
						log.Printf("Shared spreadsheet for shop %s, year %d with employee %s", req.ShopID, year, req.EmployeeEmail)
					}

					// Regenerate schedules with new employee structure
					if err := spreadsheetService.RegenerateAllMonthlySchedules(r.Context(), spreadsheetID, shop.Employees, year); err != nil {
						log.Printf("Error regenerating schedules for year %d: %v", year, err)
					} else {
						log.Printf("Regenerated schedules for shop %s, year %d after adding employee %s", req.ShopID, year, req.EmployeeEmail)
					}

					// Update management sheet
					if err := spreadsheetService.initializeManagementSheet(r.Context(), spreadsheetID, session.UserInfo.Email, req.ShopID); err != nil {
						log.Printf("Error updating management sheet for year %d: %v", year, err)
					}
				}
			}
		}

		log.Printf("Added employee %s to shop %s for employer %s", req.EmployeeEmail, req.ShopID, session.UserInfo.Email)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "Employee added successfully"})

	case http.MethodDelete:
		var req EmployeeManagementRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		if req.ShopID == "" || req.EmployeeEmail == "" {
			http.Error(w, "Shop ID and employee email are required", http.StatusBadRequest)
			return
		}

		// Get shop data before removing employee (to access spreadsheets)
		employerShopsMutex.RLock()
		var shop Shop
		var shopExists bool
		if employerShops[session.UserInfo.Email] != nil {
			shop, shopExists = employerShops[session.UserInfo.Email][req.ShopID]
		}
		employerShopsMutex.RUnlock()

		if !shopExists {
			http.Error(w, "Shop not found", http.StatusNotFound)
			return
		}

		// Remove employee from shop first
		employerShopsMutex.Lock()
		if employerShops[session.UserInfo.Email] != nil {
			if shopData, exists := employerShops[session.UserInfo.Email][req.ShopID]; exists {
				delete(shopData.Employees, req.EmployeeEmail)
				shopData.UpdatedAt = time.Now()
				employerShops[session.UserInfo.Email][req.ShopID] = shopData
				shop = shopData // Update our local copy with new employee list
			}
		}
		employerShopsMutex.Unlock()

		// Revoke access and regenerate spreadsheets with updated employee structure
		if shop.Spreadsheets != nil && len(shop.Spreadsheets) > 0 {
			spreadsheetService, err := getOrCreateSpreadsheetService(session.UserInfo.Email, session.Token)
			if err == nil {
				for year, spreadsheetID := range shop.Spreadsheets {
					// Revoke access from the removed employee
					if err := spreadsheetService.RevokeSpreadsheetAccessFromEmployee(r.Context(), spreadsheetID, req.EmployeeEmail); err != nil {
						log.Printf("Error revoking spreadsheet access for year %d: %v", year, err)
					} else {
						log.Printf("Revoked spreadsheet access for shop %s, year %d from employee %s", req.ShopID, year, req.EmployeeEmail)
					}

					// Regenerate all monthly schedules with updated employee structure
					if err := spreadsheetService.RegenerateAllMonthlySchedules(r.Context(), spreadsheetID, shop.Employees, year); err != nil {
						log.Printf("Error regenerating schedules for year %d: %v", year, err)
					} else {
						log.Printf("Regenerated schedules for shop %s, year %d after removing employee %s", req.ShopID, year, req.EmployeeEmail)
					}

					// Update management sheet
					if err := spreadsheetService.initializeManagementSheet(r.Context(), spreadsheetID, session.UserInfo.Email, req.ShopID); err != nil {
						log.Printf("Error updating management sheet for year %d: %v", year, err)
					}
				}
			} else {
				log.Printf("Error getting spreadsheet service for revoking access: %v", err)
			}
		}

		// Remove shop from employee's shop list
		employeeShopsMutex.Lock()
		if empShops := employeeShops[req.EmployeeEmail]; empShops != nil {
			for i, shopID := range empShops {
				if shopID == req.ShopID {
					employeeShops[req.EmployeeEmail] = append(empShops[:i], empShops[i+1:]...)
					break
				}
			}
		}
		employeeShopsMutex.Unlock()

		// Save to files asynchronously
		go func() {
			saveShopsData()
			saveEmployeeShopsData()
		}()

		log.Printf("Removed employee %s from shop %s for employer %s and regenerated spreadsheets", req.EmployeeEmail, req.ShopID, session.UserInfo.Email)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "Employee removed successfully, spreadsheet access revoked, and schedules updated"})
	}
}

func handleScheduleData(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)
	if r.Method == "OPTIONS" {
		return
	}

	cookie, err := r.Cookie("session_id")
	if err != nil {
		http.Error(w, "Not authenticated", http.StatusUnauthorized)
		return
	}

	sessionsMutex.RLock()
	session, exists := sessions[cookie.Value]
	sessionsMutex.RUnlock()

	if !exists {
		http.Error(w, "Invalid session", http.StatusUnauthorized)
		return
	}

	// Update last used time
	sessionsMutex.Lock()
	session.LastUsed = time.Now()
	sessions[cookie.Value] = session
	sessionsMutex.Unlock()

	month := r.URL.Query().Get("month")
	shopID := r.URL.Query().Get("shop_id")
	yearParam := r.URL.Query().Get("year")

	if month == "" || shopID == "" {
		http.Error(w, "Month and shop ID parameters are required", http.StatusBadRequest)
		return
	}

	year := time.Now().Year()
	if yearParam != "" {
		if parsedYear, err := strconv.Atoi(yearParam); err == nil {
			year = parsedYear
		}
	}

	var targetEmployerEmail string
	var shop Shop

	if session.Role == "employer" {
		targetEmployerEmail = session.UserInfo.Email
		employerShopsMutex.RLock()
		if employerShops[targetEmployerEmail] == nil || employerShops[targetEmployerEmail][shopID].ID == "" {
			employerShopsMutex.RUnlock()
			http.Error(w, "Shop not found", http.StatusNotFound)
			return
		}
		shop = employerShops[targetEmployerEmail][shopID]
		employerShopsMutex.RUnlock()
	} else {
		// Find employer for this shop and verify access
		found := false
		employerShopsMutex.RLock()
		for employer, shops := range employerShops {
			if shopData, exists := shops[shopID]; exists {
				if _, hasAccess := shopData.Employees[session.UserInfo.Email]; hasAccess {
					targetEmployerEmail = employer
					shop = shopData
					found = true
					break
				}
			}
		}
		employerShopsMutex.RUnlock()

		if !found {
			http.Error(w, "You don't have access to this shop", http.StatusForbidden)
			return
		}
	}

	if shop.Spreadsheets == nil {
		http.Error(w, "No spreadsheets found for this shop", http.StatusNotFound)
		return
	}

	spreadsheetID, exists := shop.Spreadsheets[year]
	if !exists {
		http.Error(w, fmt.Sprintf("No spreadsheet found for year %d", year), http.StatusNotFound)
		return
	}

	spreadsheetService, err := getOrCreateSpreadsheetService(session.UserInfo.Email, session.Token)
	if err != nil {
		http.Error(w, "Failed to initialize services", http.StatusInternalServerError)
		return
	}

	sheetRange := fmt.Sprintf("%s!A1:Z50", month)
	data, err := spreadsheetService.ReadSpreadsheetData(r.Context(), spreadsheetID, sheetRange)
	if err != nil {
		log.Printf("Error reading schedule data: %v", err)
		http.Error(w, "Failed to read schedule data", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":      data,
		"employees": shop.Employees,
	})
}

func handleUpdateSchedule(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)
	if r.Method == "OPTIONS" {
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	cookie, err := r.Cookie("session_id")
	if err != nil {
		http.Error(w, "Not authenticated", http.StatusUnauthorized)
		return
	}

	sessionsMutex.RLock()
	session, exists := sessions[cookie.Value]
	sessionsMutex.RUnlock()

	if !exists {
		http.Error(w, "Invalid session", http.StatusUnauthorized)
		return
	}

	if session.Role != "employer" {
		http.Error(w, "Only employers can update schedules", http.StatusForbidden)
		return
	}

	// Update last used time
	sessionsMutex.Lock()
	session.LastUsed = time.Now()
	sessions[cookie.Value] = session
	sessionsMutex.Unlock()

	var updateReq struct {
		Month  string          `json:"month"`
		Year   int             `json:"year"`
		ShopID string          `json:"shop_id"`
		Data   [][]interface{} `json:"data"`
	}

	if err := json.NewDecoder(r.Body).Decode(&updateReq); err != nil {
		log.Printf("Error decoding update request: %v", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if updateReq.Year == 0 {
		updateReq.Year = time.Now().Year()
	}

	if updateReq.ShopID == "" {
		http.Error(w, "Shop ID is required", http.StatusBadRequest)
		return
	}

	log.Printf("Received update request for month %s, year %d, shop %s with %d rows", updateReq.Month, updateReq.Year, updateReq.ShopID, len(updateReq.Data))

	employerShopsMutex.RLock()
	shopExists := employerShops[session.UserInfo.Email] != nil && employerShops[session.UserInfo.Email][updateReq.ShopID].ID != ""
	var shop Shop
	if shopExists {
		shop = employerShops[session.UserInfo.Email][updateReq.ShopID]
	}
	employerShopsMutex.RUnlock()

	if !shopExists {
		http.Error(w, "Shop not found", http.StatusNotFound)
		return
	}

	if shop.Spreadsheets == nil {
		http.Error(w, "No spreadsheets found for this shop", http.StatusNotFound)
		return
	}

	spreadsheetID, exists := shop.Spreadsheets[updateReq.Year]
	if !exists {
		http.Error(w, fmt.Sprintf("No spreadsheet found for year %d", updateReq.Year), http.StatusNotFound)
		return
	}

	spreadsheetService, err := getOrCreateSpreadsheetService(session.UserInfo.Email, session.Token)
	if err != nil {
		log.Printf("Error getting spreadsheet service: %v", err)
		http.Error(w, "Failed to initialize services", http.StatusInternalServerError)
		return
	}

	// Calculate the range based on data size
	if len(updateReq.Data) == 0 || len(updateReq.Data[0]) == 0 {
		http.Error(w, "No data to update", http.StatusBadRequest)
		return
	}

	endColumn := string(rune('A' + len(updateReq.Data[0]) - 1))
	if len(updateReq.Data[0]) > 26 {
		endColumn = "Z"
	}
	sheetRange := fmt.Sprintf("%s!A1:%s%d", updateReq.Month, endColumn, len(updateReq.Data))

	log.Printf("Writing to range: %s", sheetRange)

	err = spreadsheetService.WriteSpreadsheetData(r.Context(), spreadsheetID, sheetRange, updateReq.Data)
	if err != nil {
		log.Printf("Error updating schedule: %v", err)
		http.Error(w, fmt.Sprintf("Failed to update schedule: %v", err), http.StatusInternalServerError)
		return
	}

	log.Printf("Successfully updated schedule for month %s, year %d, shop %s", updateReq.Month, updateReq.Year, updateReq.ShopID)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Schedule updated successfully"})
}

func main() {
	if os.Getenv("GOOGLE_CLIENT_ID") == "" {
		log.Fatal("GOOGLE_CLIENT_ID environment variable is required")
	}
	if os.Getenv("GOOGLE_CLIENT_SECRET") == "" {
		log.Fatal("GOOGLE_CLIENT_SECRET environment variable is required")
	}

	// Apply timeout middleware to all handlers
	http.HandleFunc("/auth/google", withTimeout(handleGoogleLogin))
	http.HandleFunc("/auth/callback", handleGoogleCallback) // No timeout for callback
	http.HandleFunc("/user", withTimeout(handleUser))
	http.HandleFunc("/logout", withTimeout(handleLogout))
	http.HandleFunc("/api/shops", withTimeout(handleShops))
	http.HandleFunc("/api/spreadsheet", withTimeout(handleSpreadsheet))
	http.HandleFunc("/api/employees", withTimeout(handleEmployees))
	http.HandleFunc("/api/schedule", withTimeout(handleScheduleData))
	http.HandleFunc("/api/schedule/update", withTimeout(handleUpdateSchedule))

	fmt.Println("Server starting on :8080...")
	fmt.Printf("Configured employer emails: %v\n", getEmployerEmails())
	fmt.Printf("Current shops data: %+v\n", employerShops)
	fmt.Printf("Current employee shops data: %+v\n", employeeShops)
	log.Fatal(http.ListenAndServe(":8080", nil))
}
