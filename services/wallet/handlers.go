package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/shopspring/decimal"
)

type WalletBalance struct {
	Currency      string          `json:"currency"`
	Balance       decimal.Decimal `json:"balance"`
	LockedBalance decimal.Decimal `json:"locked_balance"`
	LastUpdated   time.Time       `json:"last_updated"`
}

type Transaction struct {
	ID          string          `json:"id"`
	UserID      string          `json:"user_id"`
	Type        string          `json:"type"` // DEPOSIT, WITHDRAWAL, TRANSFER, FEE
	Currency    string          `json:"currency"`
	Amount      decimal.Decimal `json:"amount"`
	Status      string          `json:"status"` // PENDING, COMPLETED, FAILED, CANCELLED
	Method      string          `json:"method"` // BANK, PAYPAL, STRIPE, QR, P2P
	ExternalRef string          `json:"external_ref,omitempty"`
	Metadata    string          `json:"metadata,omitempty"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
}

type DepositRequest struct {
	Currency string  `json:"currency" binding:"required"`
	Amount   float64 `json:"amount" binding:"required,gt=0"`
	Method   string  `json:"method" binding:"required,oneof=BANK PAYPAL STRIPE QR"`
}

type WithdrawalRequest struct {
	Currency    string                 `json:"currency" binding:"required"`
	Amount      float64                `json:"amount" binding:"required,gt=0"`
	Method      string                 `json:"method" binding:"required,oneof=BANK PAYPAL STRIPE"`
	Destination map[string]interface{} `json:"destination" binding:"required"`
}

type TransferRequest struct {
	FromCurrency string  `json:"from_currency" binding:"required"`
	ToCurrency   string  `json:"to_currency" binding:"required"`
	Amount       float64 `json:"amount" binding:"required,gt=0"`
	RecipientID  string  `json:"recipient_id" binding:"required"`
}

func (s *Server) handleGetWallets(c *gin.Context) {
	userID := c.GetString("user_id")
	
	query := `
		SELECT currency, balance, locked_balance, updated_at
		FROM wallets 
		WHERE user_id = $1
		ORDER BY currency
	`
	
	rows, err := s.db.Query(query, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch wallets"})
		return
	}
	defer rows.Close()
	
	var wallets []WalletBalance
	for rows.Next() {
		var wallet WalletBalance
		err := rows.Scan(&wallet.Currency, &wallet.Balance, &wallet.LockedBalance, &wallet.LastUpdated)
		if err != nil {
			continue
		}
		wallets = append(wallets, wallet)
	}
	
	// If no wallets exist, create default ones
	if len(wallets) == 0 {
		s.createDefaultWallets(userID)
		// Retry query
		rows, _ = s.db.Query(query, userID)
		defer rows.Close()
		for rows.Next() {
			var wallet WalletBalance
			rows.Scan(&wallet.Currency, &wallet.Balance, &wallet.LockedBalance, &wallet.LastUpdated)
			wallets = append(wallets, wallet)
		}
	}
	
	c.JSON(http.StatusOK, gin.H{
		"wallets": wallets,
		"total":   len(wallets),
	})
}

func (s *Server) handleGetWalletByCurrency(c *gin.Context) {
	userID := c.GetString("user_id")
	currency := strings.ToUpper(c.Param("currency"))
	
	var wallet WalletBalance
	err := s.db.QueryRow(`
		SELECT currency, balance, locked_balance, updated_at
		FROM wallets 
		WHERE user_id = $1 AND currency = $2
	`, userID, currency).Scan(&wallet.Currency, &wallet.Balance, &wallet.LockedBalance, &wallet.LastUpdated)
	
	if err == sql.ErrNoRows {
		// Create wallet if it doesn't exist
		_, err = s.db.Exec(`
			INSERT INTO wallets (user_id, currency, balance, locked_balance, created_at, updated_at)
			VALUES ($1, $2, 0, 0, NOW(), NOW())
		`, userID, currency)
		
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create wallet"})
			return
		}
		
		wallet = WalletBalance{
			Currency:      currency,
			Balance:       decimal.Zero,
			LockedBalance: decimal.Zero,
			LastUpdated:   time.Now(),
		}
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch wallet"})
		return
	}
	
	c.JSON(http.StatusOK, wallet)
}

func (s *Server) handleGetTransactions(c *gin.Context) {
	userID := c.GetString("user_id")
	currency := c.Query("currency")
	txType := c.Query("type")
	status := c.Query("status")
	limit := c.DefaultQuery("limit", "50")
	offset := c.DefaultQuery("offset", "0")
	
	limitInt, _ := strconv.Atoi(limit)
	offsetInt, _ := strconv.Atoi(offset)
	
	// Build query
	var conditions []string
	var args []interface{}
	argIndex := 1
	
	baseQuery := `
		SELECT id, user_id, type, currency, amount, status, method, external_ref, metadata, created_at, updated_at
		FROM transactions
		WHERE user_id = $1
	`
	args = append(args, userID)
	argIndex++
	
	if currency != "" {
		conditions = append(conditions, fmt.Sprintf("currency = $%d", argIndex))
		args = append(args, strings.ToUpper(currency))
		argIndex++
	}
	
	if txType != "" {
		conditions = append(conditions, fmt.Sprintf("type = $%d", argIndex))
		args = append(args, txType)
		argIndex++
	}
	
	if status != "" {
		conditions = append(conditions, fmt.Sprintf("status = $%d", argIndex))
		args = append(args, status)
		argIndex++
	}
	
	if len(conditions) > 0 {
		baseQuery += " AND " + strings.Join(conditions, " AND ")
	}
	
	baseQuery += fmt.Sprintf(" ORDER BY created_at DESC LIMIT $%d OFFSET $%d", argIndex, argIndex+1)
	args = append(args, limitInt, offsetInt)
	
	rows, err := s.db.Query(baseQuery, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch transactions"})
		return
	}
	defer rows.Close()
	
	var transactions []Transaction
	for rows.Next() {
		var tx Transaction
		var metadata sql.NullString
		var externalRef sql.NullString
		
		err := rows.Scan(&tx.ID, &tx.UserID, &tx.Type, &tx.Currency, &tx.Amount,
			&tx.Status, &tx.Method, &externalRef, &metadata, &tx.CreatedAt, &tx.UpdatedAt)
		
		if err != nil {
			continue
		}
		
		if externalRef.Valid {
			tx.ExternalRef = externalRef.String
		}
		if metadata.Valid {
			tx.Metadata = metadata.String
		}
		
		transactions = append(transactions, tx)
	}
	
	c.JSON(http.StatusOK, gin.H{
		"transactions": transactions,
		"total":        len(transactions),
		"limit":        limitInt,
		"offset":       offsetInt,
	})
}

func (s *Server) handleDeposit(c *gin.Context) {
	var req DepositRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	userID := c.GetString("user_id")
	amount := decimal.NewFromFloat(req.Amount)
	currency := strings.ToUpper(req.Currency)
	
	// Create transaction record
	txID := s.generateTxID()
	tx := Transaction{
		ID:        txID,
		UserID:    userID,
		Type:      "DEPOSIT",
		Currency:  currency,
		Amount:    amount,
		Status:    "PENDING",
		Method:    req.Method,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	
	// Insert transaction
	_, err := s.db.Exec(`
		INSERT INTO transactions (id, from_user_id, transaction_type, currency, amount, status, payment_method, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`, tx.ID, tx.UserID, tx.Type, tx.Currency, tx.Amount, tx.Status, tx.Method, tx.CreatedAt, tx.UpdatedAt)
	
	if err != nil {
		fmt.Printf("Error creating deposit transaction: %v\n", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create deposit", "details": err.Error()})
		return
	}
	
	// Process based on method
	var response gin.H
	switch req.Method {
	case "PAYPAL":
		response = s.processPayPalDeposit(tx)
	case "STRIPE":
		response = s.processStripeDeposit(tx)
	case "QR":
		response = s.processQRDeposit(tx)
	case "BANK":
		response = s.processBankDeposit(tx)
	default:
		response = gin.H{"error": "Unsupported deposit method"}
	}
	
	response["transaction_id"] = txID
	c.JSON(http.StatusOK, response)
}

func (s *Server) handleWithdrawal(c *gin.Context) {
	var req WithdrawalRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	userID := c.GetString("user_id")
	amount := decimal.NewFromFloat(req.Amount)
	currency := strings.ToUpper(req.Currency)
	
	// Check balance
	var balance decimal.Decimal
	err := s.db.QueryRow(`
		SELECT balance FROM wallets WHERE user_id = $1 AND currency = $2
	`, userID, currency).Scan(&balance)
	
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Wallet not found"})
		return
	}
	
	if balance.LessThan(amount) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Insufficient balance"})
		return
	}
	
	// Create transaction
	txID := s.generateTxID()
	metadataJSON, _ := json.Marshal(req.Destination)
	
	tx := Transaction{
		ID:        txID,
		UserID:    userID,
		Type:      "WITHDRAWAL",
		Currency:  currency,
		Amount:    amount,
		Status:    "PENDING",
		Method:    req.Method,
		Metadata:  string(metadataJSON),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	
	// Start database transaction
	dbTx, err := s.db.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to start transaction"})
		return
	}
	defer dbTx.Rollback()
	
	// Insert transaction
	_, err = dbTx.Exec(`
		INSERT INTO transactions (id, from_user_id, transaction_type, currency, amount, status, payment_method, metadata, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`, tx.ID, tx.UserID, tx.Type, tx.Currency, tx.Amount, tx.Status, tx.Method, tx.Metadata, tx.CreatedAt, tx.UpdatedAt)
	
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create withdrawal"})
		return
	}
	
	// Lock balance
	_, err = dbTx.Exec(`
		UPDATE wallets SET balance = balance - $1, locked_balance = locked_balance + $1
		WHERE user_id = $2 AND currency = $3
	`, amount, userID, currency)
	
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to lock balance"})
		return
	}
	
	// Commit transaction
	if err = dbTx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to commit transaction"})
		return
	}
	
	// Process withdrawal
	var response gin.H
	switch req.Method {
	case "PAYPAL":
		response = s.processPayPalWithdrawal(tx)
	case "STRIPE":
		response = s.processStripeWithdrawal(tx)
	case "BANK":
		response = s.processBankWithdrawal(tx)
	default:
		response = gin.H{"error": "Unsupported withdrawal method"}
	}
	
	response["transaction_id"] = txID
	c.JSON(http.StatusOK, response)
}

func (s *Server) handleTransfer(c *gin.Context) {
	var req TransferRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	userID := c.GetString("user_id")
	amount := decimal.NewFromFloat(req.Amount)
	fromCurrency := strings.ToUpper(req.FromCurrency)
	toCurrency := strings.ToUpper(req.ToCurrency)
	
	// Check if recipient exists
	var recipientExists bool
	err := s.db.QueryRow("SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)", req.RecipientID).Scan(&recipientExists)
	if err != nil || !recipientExists {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Recipient not found"})
		return
	}
	
	// Check sender balance
	var balance decimal.Decimal
	err = s.db.QueryRow(`
		SELECT balance FROM wallets WHERE user_id = $1 AND currency = $2
	`, userID, fromCurrency).Scan(&balance)
	
	if err != nil || balance.LessThan(amount) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Insufficient balance"})
		return
	}
	
	// Start database transaction
	dbTx, err := s.db.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to start transfer"})
		return
	}
	defer dbTx.Rollback()
	
	// Create outgoing transaction
	outTxID := s.generateTxID()
	_, err = dbTx.Exec(`
		INSERT INTO transactions (id, from_user_id, transaction_type, currency, amount, status, payment_method, payment_reference, created_at, updated_at)
		VALUES ($1, $2, 'TRANSFER_OUT', $3, $4, 'COMPLETED', 'P2P', $5, NOW(), NOW())
	`, outTxID, userID, fromCurrency, amount, req.RecipientID)
	
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create outgoing transfer"})
		return
	}
	
	// Create incoming transaction
	inTxID := s.generateTxID()
	_, err = dbTx.Exec(`
		INSERT INTO transactions (id, to_user_id, transaction_type, currency, amount, status, payment_method, payment_reference, created_at, updated_at)
		VALUES ($1, $2, 'TRANSFER_IN', $3, $4, 'COMPLETED', 'P2P', $5, NOW(), NOW())
	`, inTxID, req.RecipientID, toCurrency, amount, userID)
	
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create incoming transfer"})
		return
	}
	
	// Update sender wallet
	_, err = dbTx.Exec(`
		UPDATE wallets SET balance = balance - $1, updated_at = NOW()
		WHERE user_id = $2 AND currency = $3
	`, amount, userID, fromCurrency)
	
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update sender wallet"})
		return
	}
	
	// Update or create recipient wallet
	_, err = dbTx.Exec(`
		INSERT INTO wallets (user_id, currency, balance, locked_balance, created_at, updated_at)
		VALUES ($1, $2, $3, 0, NOW(), NOW())
		ON CONFLICT (user_id, currency) 
		DO UPDATE SET balance = wallets.balance + $3, updated_at = NOW()
	`, req.RecipientID, toCurrency, amount)
	
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update recipient wallet"})
		return
	}
	
	// Commit transaction
	if err = dbTx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to commit transfer"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"message":               "Transfer completed successfully",
		"outgoing_transaction":  outTxID,
		"incoming_transaction":  inTxID,
		"amount_transferred":    amount,
		"from_currency":         fromCurrency,
		"to_currency":           toCurrency,
	})
}

func (s *Server) handleGetTransaction(c *gin.Context) {
	userID := c.GetString("user_id")
	txID := c.Param("id")
	
	var tx Transaction
	var metadata, externalRef sql.NullString
	
	err := s.db.QueryRow(`
		SELECT id, user_id, type, currency, amount, status, method, external_ref, metadata, created_at, updated_at
		FROM transactions
		WHERE id = $1 AND user_id = $2
	`, txID, userID).Scan(&tx.ID, &tx.UserID, &tx.Type, &tx.Currency, &tx.Amount,
		&tx.Status, &tx.Method, &externalRef, &metadata, &tx.CreatedAt, &tx.UpdatedAt)
	
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "Transaction not found"})
		return
	}
	
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch transaction"})
		return
	}
	
	if externalRef.Valid {
		tx.ExternalRef = externalRef.String
	}
	if metadata.Valid {
		tx.Metadata = metadata.String
	}
	
	c.JSON(http.StatusOK, tx)
}

func (s *Server) createDefaultWallets(userID string) error {
	currencies := []string{"USD", "BOB", "USDT"}
	
	for _, currency := range currencies {
		_, err := s.db.Exec(`
			INSERT INTO wallets (user_id, currency, balance, locked_balance, created_at, updated_at)
			VALUES ($1, $2, 0, 0, NOW(), NOW())
			ON CONFLICT (user_id, currency) DO NOTHING
		`, userID, currency)
		
		if err != nil {
			return err
		}
	}
	
	return nil
}

func (s *Server) generateTxID() string {
	var txID string
	err := s.db.QueryRow("SELECT uuid_generate_v4()").Scan(&txID)
	if err != nil {
		// Fallback to manual UUID generation if needed
		return fmt.Sprintf("%08x-%04x-%04x-%04x-%12x",
			time.Now().UnixNano()&0xffffffff,
			time.Now().UnixNano()>>32&0xffff,
			0x4000|(time.Now().UnixNano()>>16&0x0fff),
			0x8000|(time.Now().UnixNano()>>8&0x3fff),
			time.Now().UnixNano()&0xffffffffffff)
	}
	return txID
}

func (s *Server) authMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization required"})
			c.Abort()
			return
		}
		
		if !strings.HasPrefix(authHeader, "Bearer ") {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid authorization format"})
			c.Abort()
			return
		}
		tokenString := strings.TrimPrefix(authHeader, "Bearer ")
		
		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			return []byte(os.Getenv("JWT_SECRET")), nil
		})
		
		if err != nil || !token.Valid {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
			c.Abort()
			return
		}
		
		if claims, ok := token.Claims.(jwt.MapClaims); ok {
			userID := claims["user_id"].(string)
			c.Set("user_id", userID)
			c.Next()
		} else {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token claims"})
			c.Abort()
		}
	}
}