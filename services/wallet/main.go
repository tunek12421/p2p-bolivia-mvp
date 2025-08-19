package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
	"github.com/shopspring/decimal"
	_ "github.com/lib/pq"
)

type Server struct {
	db              *sql.DB
	router          *gin.Engine
	bankIntegration *BankIntegration
}

func main() {
	// Database connection
	dbHost := os.Getenv("DB_HOST")
	dbPort := os.Getenv("DB_PORT")
	dbUser := os.Getenv("DB_USER")
	dbPassword := os.Getenv("DB_PASSWORD")
	dbName := os.Getenv("DB_NAME")

	psqlInfo := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		dbHost, dbPort, dbUser, dbPassword, dbName)

	db, err := sql.Open("postgres", psqlInfo)
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}
	defer db.Close()

	// Test database connection
	if err := db.Ping(); err != nil {
		log.Fatal("Failed to ping database:", err)
	}

	// Redis connection
	redisAddr := os.Getenv("REDIS_ADDR")
	if redisAddr == "" {
		redisAddr = "localhost:6379"
	}
	
	rdb := redis.NewClient(&redis.Options{
		Addr:     redisAddr,
		Password: os.Getenv("REDIS_PASSWORD"),
		DB:       0,
	})

	// Bank listener URL
	listenerURL := os.Getenv("BANK_LISTENER_URL")
	if listenerURL == "" {
		listenerURL = "http://bank-listener:8000"
	}

	// Initialize bank integration
	bankIntegration := NewBankIntegration(db, rdb, listenerURL)

	// Create server
	server := &Server{
		db:              db,
		router:          gin.Default(),
		bankIntegration: bankIntegration,
	}

	// Start bank integration
	bankIntegration.Start()

	// Setup routes
	server.setupRoutes()

	// Start server
	port := os.Getenv("PORT")
	if port == "" {
		port = "3003"
	}

	log.Printf("Wallet service starting on port %s", port)
	if err := server.router.Run(":" + port); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}

func (s *Server) setupRoutes() {
	// Health check
	s.router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "healthy", "service": "wallet"})
	})

	// API routes
	api := s.router.Group("/api/v1")
	{
		// Public routes
		api.GET("/rates", s.handleGetExchangeRates)
		
		// Protected routes
		api.GET("/wallets", s.authMiddleware(), s.handleGetWallets)
		api.GET("/wallets/:currency", s.authMiddleware(), s.handleGetWalletByCurrency)
		api.GET("/transactions", s.authMiddleware(), s.handleGetTransactions)
		api.GET("/transactions/:id", s.authMiddleware(), s.handleGetTransaction)
		
		// Transaction operations
		api.POST("/deposit", s.authMiddleware(), s.handleDeposit)
		api.POST("/withdraw", s.authMiddleware(), s.handleWithdrawal)
		api.POST("/transfer", s.authMiddleware(), s.handleTransfer)
		
		// Bank integration endpoints
		api.GET("/deposit-instructions/:currency", s.authMiddleware(), s.handleGetDepositInstructions)
		api.GET("/pending-deposits", s.authMiddleware(), s.handleGetPendingDeposits)
		
		// Payment integration webhooks
		api.POST("/webhooks/paypal", s.handlePayPalWebhook)
		api.POST("/webhooks/stripe", s.handleStripeWebhook)
		api.POST("/webhooks/bank", s.handleBankWebhook)
	}
}

func (s *Server) handleGetExchangeRates(c *gin.Context) {
	// Simulate real-time exchange rates
	rates := gin.H{
		"USD_BOB": 6.90,
		"BOB_USD": 0.145,
		"USD_USDT": 1.00,
		"USDT_USD": 1.00,
		"BOB_USDT": 0.145,
		"USDT_BOB": 6.90,
		"last_updated": "2024-01-15T10:30:00Z",
	}
	
	c.JSON(200, rates)
}

func (s *Server) handlePayPalWebhook(c *gin.Context) {
	// Handle PayPal webhooks for payment confirmations
	var webhook map[string]interface{}
	if err := c.ShouldBindJSON(&webhook); err != nil {
		c.JSON(400, gin.H{"error": "Invalid webhook data"})
		return
	}
	
	eventType, ok := webhook["event_type"].(string)
	if !ok {
		c.JSON(400, gin.H{"error": "Missing event type"})
		return
	}
	
	switch eventType {
	case "CHECKOUT.ORDER.APPROVED":
		s.handlePayPalOrderApproved(webhook)
	case "PAYMENT.PAYOUTS-ITEM.SUCCEEDED":
		s.handlePayPalPayoutSuccess(webhook)
	case "PAYMENT.PAYOUTS-ITEM.FAILED":
		s.handlePayPalPayoutFailed(webhook)
	}
	
	c.JSON(200, gin.H{"status": "received"})
}

func (s *Server) handleStripeWebhook(c *gin.Context) {
	// Handle Stripe webhooks
	var webhook map[string]interface{}
	if err := c.ShouldBindJSON(&webhook); err != nil {
		c.JSON(400, gin.H{"error": "Invalid webhook data"})
		return
	}
	
	eventType, ok := webhook["type"].(string)
	if !ok {
		c.JSON(400, gin.H{"error": "Missing event type"})
		return
	}
	
	switch eventType {
	case "payment_intent.succeeded":
		s.handleStripePaymentSuccess(webhook)
	case "payment_intent.payment_failed":
		s.handleStripePaymentFailed(webhook)
	}
	
	c.JSON(200, gin.H{"status": "received"})
}

func (s *Server) handleBankWebhook(c *gin.Context) {
	// Handle bank transfer confirmations
	var webhook map[string]interface{}
	if err := c.ShouldBindJSON(&webhook); err != nil {
		c.JSON(400, gin.H{"error": "Invalid webhook data"})
		return
	}
	
	// Process bank confirmation
	reference, ok := webhook["reference"].(string)
	if !ok {
		c.JSON(400, gin.H{"error": "Missing reference"})
		return
	}
	
	status, ok := webhook["status"].(string)
	if !ok {
		c.JSON(400, gin.H{"error": "Missing status"})
		return
	}
	
	s.handleBankTransferUpdate(reference, status)
	
	c.JSON(200, gin.H{"status": "received"})
}

func (s *Server) handlePayPalOrderApproved(webhook map[string]interface{}) {
	// Extract transaction ID and update status
	if resource, ok := webhook["resource"].(map[string]interface{}); ok {
		if orderID, ok := resource["id"].(string); ok {
			s.db.Exec(`
				UPDATE transactions SET status = 'COMPLETED' 
				WHERE external_ref = $1 AND status = 'PENDING'
			`, orderID)
			
			// Credit the wallet
			s.creditWalletFromTransaction(orderID)
		}
	}
}

func (s *Server) handlePayPalPayoutSuccess(webhook map[string]interface{}) {
	// Handle successful payout
	if resource, ok := webhook["resource"].(map[string]interface{}); ok {
		if senderItemID, ok := resource["sender_item_id"].(string); ok {
			s.db.Exec(`
				UPDATE transactions SET status = 'COMPLETED' WHERE id = $1;
				UPDATE wallets SET locked_balance = locked_balance - (
					SELECT amount FROM transactions WHERE id = $1
				) WHERE user_id = (
					SELECT user_id FROM transactions WHERE id = $1
				);
			`, senderItemID)
		}
	}
}

func (s *Server) handlePayPalPayoutFailed(webhook map[string]interface{}) {
	// Handle failed payout - unlock balance
	if resource, ok := webhook["resource"].(map[string]interface{}); ok {
		if senderItemID, ok := resource["sender_item_id"].(string); ok {
			s.db.Exec(`
				UPDATE transactions SET status = 'FAILED' WHERE id = $1;
				UPDATE wallets SET 
					balance = balance + (SELECT amount FROM transactions WHERE id = $1),
					locked_balance = locked_balance - (SELECT amount FROM transactions WHERE id = $1)
				WHERE user_id = (SELECT user_id FROM transactions WHERE id = $1);
			`, senderItemID)
		}
	}
}

func (s *Server) handleStripePaymentSuccess(webhook map[string]interface{}) {
	if data, ok := webhook["data"].(map[string]interface{}); ok {
		if object, ok := data["object"].(map[string]interface{}); ok {
			if paymentIntentID, ok := object["id"].(string); ok {
				s.db.Exec(`
					UPDATE transactions SET status = 'COMPLETED' 
					WHERE external_ref = $1 AND status = 'PENDING'
				`, paymentIntentID)
				
				s.creditWalletFromTransaction(paymentIntentID)
			}
		}
	}
}

func (s *Server) handleStripePaymentFailed(webhook map[string]interface{}) {
	if data, ok := webhook["data"].(map[string]interface{}); ok {
		if object, ok := data["object"].(map[string]interface{}); ok {
			if paymentIntentID, ok := object["id"].(string); ok {
				s.db.Exec(`
					UPDATE transactions SET status = 'FAILED' 
					WHERE external_ref = $1 AND status = 'PENDING'
				`, paymentIntentID)
			}
		}
	}
}

func (s *Server) handleBankTransferUpdate(reference, status string) {
	if status == "completed" {
		s.db.Exec(`
			UPDATE transactions SET status = 'COMPLETED' 
			WHERE external_ref = $1 AND status = 'PENDING'
		`, reference)
		
		s.creditWalletFromTransaction(reference)
	} else if status == "failed" {
		s.db.Exec(`
			UPDATE transactions SET status = 'FAILED' 
			WHERE external_ref = $1 AND status = 'PENDING'
		`, reference)
	}
}

func (s *Server) creditWalletFromTransaction(externalRef string) {
	// Get transaction details
	var userID, currency string
	var amount decimal.Decimal
	
	err := s.db.QueryRow(`
		SELECT user_id, currency, amount 
		FROM transactions 
		WHERE external_ref = $1 AND type = 'DEPOSIT' AND status = 'COMPLETED'
	`, externalRef).Scan(&userID, &currency, &amount)
	
	if err != nil {
		log.Printf("Failed to get transaction details for %s: %v", externalRef, err)
		return
	}
	
	// Credit the wallet
	_, err = s.db.Exec(`
		INSERT INTO wallets (user_id, currency, balance, locked_balance, created_at, updated_at)
		VALUES ($1, $2, $3, 0, NOW(), NOW())
		ON CONFLICT (user_id, currency) 
		DO UPDATE SET balance = wallets.balance + $3, updated_at = NOW()
	`, userID, currency, amount)
	
	if err != nil {
		log.Printf("Failed to credit wallet for %s: %v", externalRef, err)
	}
}

func (s *Server) handleGetDepositInstructions(c *gin.Context) {
	userID := c.GetString("user_id")
	currency := c.Param("currency")
	
	// Get amount from query params (optional)
	amountStr := c.Query("amount")
	amount := decimal.NewFromFloat(100.0) // Default amount
	if amountStr != "" {
		if parsedAmount, err := decimal.NewFromString(amountStr); err == nil {
			amount = parsedAmount
		}
	}
	
	instructions, err := s.bankIntegration.GetDepositInstructions(userID, currency, amount)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	
	c.JSON(200, gin.H{
		"status": "success",
		"data":   instructions,
	})
}

func (s *Server) handleGetPendingDeposits(c *gin.Context) {
	userID := c.GetString("user_id")
	
	deposits, err := s.bankIntegration.GetPendingDeposits(userID)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	
	c.JSON(200, gin.H{
		"status":           "success",
		"pending_deposits": deposits,
	})
}

