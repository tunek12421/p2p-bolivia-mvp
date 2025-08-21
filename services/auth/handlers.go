// services/auth/handlers.go
package main

import (
    "context"
    "database/sql"
    "log"
    "net/http"
    "os"
    "strings"
    "time"

    "github.com/gin-gonic/gin"
    "github.com/golang-jwt/jwt/v5"
    "github.com/google/uuid"
    "golang.org/x/crypto/bcrypt"
)

type RegisterRequest struct {
    Email     string `json:"email" binding:"required,email"`
    Phone     string `json:"phone"`
    Password  string `json:"password" binding:"required,min=6"`
    FirstName string `json:"firstName"`
    LastName  string `json:"lastName"`
}

type LoginRequest struct {
    Email    string `json:"email" binding:"required,email"` // Changed from username to email for consistency
    Password string `json:"password" binding:"required"`
}

type AuthResponse struct {
    UserID       string `json:"user_id"`
    AccessToken  string `json:"access_token"`
    RefreshToken string `json:"refresh_token"`
    ExpiresIn    int    `json:"expires_in"`
}

type User struct {
    ID           string    `json:"id"`
    Email        string    `json:"email"`
    Phone        string    `json:"phone"`
    PasswordHash string    `json:"-"`
    FirstName    string    `json:"firstName"`
    LastName     string    `json:"lastName"`
    IsVerified   bool      `json:"isVerified"`
    KYCLevel     int       `json:"kyc_level"`
    CreatedAt    time.Time `json:"createdAt"`
}

// Register handler
func (s *Server) handleRegister(c *gin.Context) {
    log.Printf("🔐 AUTH: Registration request received from %s", c.ClientIP())
    log.Printf("🔐 AUTH: Request headers: %v", c.Request.Header)
    
    var req RegisterRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        log.Printf("❌ AUTH: Failed to bind JSON: %v", err)
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }

    log.Printf("🔐 AUTH: Registration data received - Email: %s, FirstName: %s, LastName: %s, Phone: %s", 
        req.Email, req.FirstName, req.LastName, req.Phone)

    // Hash password
    log.Printf("🔐 AUTH: Hashing password")
    hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
    if err != nil {
        log.Printf("❌ AUTH: Failed to hash password: %v", err)
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
        return
    }

    // Create user
    userID := uuid.New().String()
    log.Printf("🔐 AUTH: Generated user ID: %s", userID)
    
    // Handle empty phone to avoid unique constraint violation
    var phone interface{}
    if req.Phone != "" {
        phone = req.Phone
    } else {
        phone = nil
    }
    
    log.Printf("🔐 AUTH: Creating user in database")
    _, err = s.db.Exec(`
        INSERT INTO users (id, email, phone, password_hash)
        VALUES ($1, $2, $3, $4)
    `, userID, req.Email, phone, string(hashedPassword))

    if err != nil {
        log.Printf("❌ AUTH: Database error during user creation: %v", err)
        if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "UNIQUE constraint") {
            c.JSON(http.StatusConflict, gin.H{"error": "Email or phone already exists"})
            return
        }
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create user"})
        return
    }
    
    log.Printf("✅ AUTH: User created successfully in database")

    // Create user profile if firstName or lastName provided
    if req.FirstName != "" || req.LastName != "" {
        log.Printf("🔐 AUTH: Creating user profile")
        _, err = s.db.Exec(`
            INSERT INTO user_profiles (user_id, first_name, last_name)
            VALUES ($1, $2, $3)
        `, userID, req.FirstName, req.LastName)
        if err != nil {
            log.Printf("❌ AUTH: Failed to create user profile: %v", err)
        } else {
            log.Printf("✅ AUTH: User profile created successfully")
        }
    }

    // Create wallets for default currencies
    log.Printf("🔐 AUTH: Creating default wallets")
    currencies := []string{"BOB", "USD", "USDT"}
    for _, currency := range currencies {
        _, err = s.db.Exec(`
            INSERT INTO wallets (user_id, currency, balance, locked_balance)
            VALUES ($1, $2, 0, 0)
        `, userID, currency)
        if err != nil {
            log.Printf("❌ AUTH: Failed to create wallet for currency %s: %v", currency, err)
        } else {
            log.Printf("✅ AUTH: Created wallet for %s", currency)
        }
    }

    // Generate tokens
    log.Printf("🔐 AUTH: Generating access token")
    accessToken, err := s.generateAccessToken(userID)
    if err != nil {
        log.Printf("❌ AUTH: Failed to generate access token: %v", err)
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
        return
    }

    log.Printf("🔐 AUTH: Generating refresh token")
    refreshToken, err := s.generateRefreshToken(userID)
    if err != nil {
        log.Printf("❌ AUTH: Failed to generate refresh token: %v", err)
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate refresh token"})
        return
    }

    log.Printf("✅ AUTH: Registration completed successfully for user %s", userID)
    response := AuthResponse{
        UserID:       userID,
        AccessToken:  accessToken,
        RefreshToken: refreshToken,
        ExpiresIn:    900, // 15 minutes
    }
    
    log.Printf("📤 AUTH: Sending registration response")
    c.JSON(http.StatusCreated, response)
}

// Login handler
func (s *Server) handleLogin(c *gin.Context) {
    log.Printf("🔑 LOGIN: Starting login process")
    log.Printf("🌐 LOGIN: Request method: %s, path: %s", c.Request.Method, c.Request.URL.Path)
    log.Printf("📋 LOGIN: Request headers: Content-Type: %s", c.GetHeader("Content-Type"))
    
    var req LoginRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        log.Printf("❌ LOGIN: Invalid request format: %v", err)
        log.Printf("❌ LOGIN: Request body binding failed, raw body may be malformed")
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }

    log.Printf("📧 LOGIN: Attempting login for email: %s", req.Email)
    log.Printf("🔐 LOGIN: Password provided: %t (length: %d)", req.Password != "", len(req.Password))

    // Find user by email or phone
    var user User
    err := s.db.QueryRow(`
        SELECT id, email, COALESCE(phone, '') as phone, password_hash, is_verified, kyc_level
        FROM users
        WHERE email = $1 OR COALESCE(phone, '') = $1
    `, req.Email).Scan(&user.ID, &user.Email, &user.Phone, &user.PasswordHash, &user.IsVerified, &user.KYCLevel)

    if err != nil {
        log.Printf("❌ LOGIN: User not found for email '%s': %v", req.Email, err)
        c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
        return
    }

    log.Printf("👤 LOGIN: Found user %s, verifying password", user.ID)

    // Verify password
    if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
        log.Printf("❌ LOGIN: Password verification failed for user %s: %v", user.ID, err)
        c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
        return
    }

    log.Printf("✅ LOGIN: Password verification successful for user %s", user.ID)

    // Generate tokens
    log.Printf("🔑 LOGIN: Generating access token for user %s", user.ID)
    accessToken, err := s.generateAccessToken(user.ID)
    if err != nil {
        log.Printf("❌ LOGIN: Failed to generate access token: %v", err)
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
        return
    }

    log.Printf("🔄 LOGIN: Generating refresh token for user %s", user.ID)
    refreshToken, err := s.generateRefreshToken(user.ID)
    if err != nil {
        log.Printf("❌ LOGIN: Failed to generate refresh token: %v", err)
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate refresh token"})
        return
    }

    response := AuthResponse{
        UserID:       user.ID,
        AccessToken:  accessToken,
        RefreshToken: refreshToken,
        ExpiresIn:    900,
    }
    
    log.Printf("✅ LOGIN: Login successful for user %s, sending response", user.ID)
    log.Printf("📤 LOGIN: Response data - UserID: %s, TokenLength: %d, ExpiresIn: %d", 
        response.UserID, len(response.AccessToken), response.ExpiresIn)
    
    c.JSON(http.StatusOK, response)
}

// Refresh token handler
func (s *Server) handleRefresh(c *gin.Context) {
    var req struct {
        RefreshToken string `json:"refresh_token" binding:"required"`
    }

    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }

    // Verify refresh token in database
    var userID string
    var expiresAt time.Time
    err := s.db.QueryRow(`
        SELECT user_id, expires_at FROM refresh_tokens
        WHERE token = $1
    `, req.RefreshToken).Scan(&userID, &expiresAt)

    if err != nil {
        c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid refresh token"})
        return
    }

    // Check if token is expired
    if time.Now().After(expiresAt) {
        c.JSON(http.StatusUnauthorized, gin.H{"error": "Refresh token expired"})
        return
    }

    // Generate new access token
    accessToken, err := s.generateAccessToken(userID)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
        return
    }

    c.JSON(http.StatusOK, gin.H{
        "access_token": accessToken,
        "expires_in":   900,
    })
}

// Logout handler
func (s *Server) handleLogout(c *gin.Context) {
    userID := c.GetString("user_id")
    
    // Delete refresh tokens
    _, err := s.db.Exec(`
        DELETE FROM refresh_tokens WHERE user_id = $1
    `, userID)

    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to logout"})
        return
    }

    // Add access token to blacklist in Redis
    token := c.GetHeader("Authorization")
    if token != "" {
        token = strings.TrimPrefix(token, "Bearer ")
        ctx := context.Background()
        s.redis.Set(ctx, "blacklist:"+token, "true", 15*time.Minute)
    }

    c.JSON(http.StatusOK, gin.H{"message": "Logged out successfully"})
}

// Verify email handler
func (s *Server) handleVerifyEmail(c *gin.Context) {
    var req struct {
        Token string `json:"token" binding:"required"`
    }

    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }

    // TODO: Implement email verification logic
    c.JSON(http.StatusOK, gin.H{"message": "Email verified successfully"})
}

// Get profile handler
func (s *Server) handleGetProfile(c *gin.Context) {
    userID := c.GetString("user_id")
    log.Printf("DEBUG: Received user_id from context: '%s'", userID)

    if userID == "" {
        log.Printf("DEBUG: user_id is empty")
        c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
        return
    }

    var user User
    var firstName, lastName sql.NullString
    
    err := s.db.QueryRow(`
        SELECT u.id, u.email, COALESCE(u.phone, '') as phone, u.is_verified, u.kyc_level, u.created_at,
               p.first_name, p.last_name
        FROM users u
        LEFT JOIN user_profiles p ON u.id = p.user_id
        WHERE u.id = $1
    `, userID).Scan(&user.ID, &user.Email, &user.Phone, &user.IsVerified, &user.KYCLevel, &user.CreatedAt, &firstName, &lastName)

    if err != nil {
        log.Printf("DEBUG: Database query error for user_id '%s': %v", userID, err)
        c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
        return
    }

    // Set optional profile fields
    if firstName.Valid {
        user.FirstName = firstName.String
    }
    if lastName.Valid {
        user.LastName = lastName.String
    }

    c.JSON(http.StatusOK, user)
}

// Update profile handler
func (s *Server) handleUpdateProfile(c *gin.Context) {
    userID := c.GetString("user_id")

    var req struct {
        FirstName   string `json:"first_name"`
        LastName    string `json:"last_name"`
        DateOfBirth string `json:"date_of_birth"`
        Address     string `json:"address"`
        City        string `json:"city"`
    }

    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }

    // Check if profile exists
    var profileID string
    err := s.db.QueryRow(`
        SELECT id FROM user_profiles WHERE user_id = $1
    `, userID).Scan(&profileID)

    if err == sql.ErrNoRows {
        // Create new profile
        _, err = s.db.Exec(`
            INSERT INTO user_profiles (user_id, first_name, last_name, date_of_birth, address, city)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, userID, req.FirstName, req.LastName, req.DateOfBirth, req.Address, req.City)
    } else {
        // Update existing profile
        _, err = s.db.Exec(`
            UPDATE user_profiles
            SET first_name = $2, last_name = $3, date_of_birth = $4, address = $5, city = $6
            WHERE user_id = $1
        `, userID, req.FirstName, req.LastName, req.DateOfBirth, req.Address, req.City)
    }

    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update profile"})
        return
    }

    c.JSON(http.StatusOK, gin.H{"message": "Profile updated successfully"})
}

// JWT generation helpers
func (s *Server) generateAccessToken(userID string) (string, error) {
    token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
        "user_id": userID,
        "exp":     time.Now().Add(15 * time.Minute).Unix(),
        "iat":     time.Now().Unix(),
    })

    tokenString, err := token.SignedString([]byte(os.Getenv("JWT_SECRET")))
    if err != nil {
        return "", err
    }

    return tokenString, nil
}

func (s *Server) generateRefreshToken(userID string) (string, error) {
    refreshToken := uuid.New().String()
    expiresAt := time.Now().Add(7 * 24 * time.Hour)

    _, err := s.db.Exec(`
        INSERT INTO refresh_tokens (user_id, token, expires_at)
        VALUES ($1, $2, $3)
    `, userID, refreshToken, expiresAt)

    if err != nil {
        return "", err
    }

    return refreshToken, nil
}