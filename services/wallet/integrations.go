package main

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
	"github.com/skip2/go-qrcode"
)

// PayPal Integration
type PayPalAccessTokenResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	ExpiresIn   int    `json:"expires_in"`
}

type PayPalOrderResponse struct {
	ID     string                   `json:"id"`
	Status string                   `json:"status"`
	Links  []PayPalLinkDescription `json:"links"`
}

type PayPalLinkDescription struct {
	Href   string `json:"href"`
	Rel    string `json:"rel"`
	Method string `json:"method"`
}

type PayPalPayoutRequest struct {
	SenderBatchHeader PayPalSenderBatchHeader `json:"sender_batch_header"`
	Items             []PayPalPayoutItem      `json:"items"`
}

type PayPalSenderBatchHeader struct {
	SenderBatchID string `json:"sender_batch_id"`
	EmailSubject  string `json:"email_subject"`
}

type PayPalPayoutItem struct {
	RecipientType string                 `json:"recipient_type"`
	Amount        PayPalAmount           `json:"amount"`
	Receiver      string                 `json:"receiver"`
	Note          string                 `json:"note"`
	SenderItemID  string                 `json:"sender_item_id"`
	RecipientData map[string]interface{} `json:"recipient_data,omitempty"`
}

type PayPalAmount struct {
	Value    string `json:"value"`
	Currency string `json:"currency"`
}

func (s *Server) processPayPalDeposit(tx Transaction) gin.H {
	// Get PayPal access token
	accessToken, err := s.getPayPalAccessToken()
	if err != nil {
		return gin.H{"error": "Failed to connect to PayPal", "details": err.Error()}
	}
	
	// Create PayPal order
	orderData := map[string]interface{}{
		"intent": "CAPTURE",
		"purchase_units": []map[string]interface{}{
			{
				"amount": map[string]interface{}{
					"currency_code": tx.Currency,
					"value":         tx.Amount.String(),
				},
				"description": fmt.Sprintf("Deposit to wallet - Transaction %s", tx.ID),
			},
		},
		"application_context": map[string]interface{}{
			"brand_name": "P2P Bolivia",
			"locale":     "en-US",
			"return_url": fmt.Sprintf("http://localhost:8080/api/v1/paypal/success?tx_id=%s", tx.ID),
			"cancel_url": fmt.Sprintf("http://localhost:8080/api/v1/paypal/cancel?tx_id=%s", tx.ID),
		},
	}
	
	orderJSON, _ := json.Marshal(orderData)
	
	req, err := http.NewRequest("POST", s.getPayPalBaseURL()+"/v2/checkout/orders", bytes.NewBuffer(orderJSON))
	if err != nil {
		return gin.H{"error": "Failed to create PayPal request"}
	}
	
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("PayPal-Request-Id", tx.ID)
	
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return gin.H{"error": "Failed to communicate with PayPal"}
	}
	defer resp.Body.Close()
	
	body, _ := io.ReadAll(resp.Body)
	
	if resp.StatusCode != http.StatusCreated {
		return gin.H{"error": "PayPal order creation failed", "details": string(body)}
	}
	
	var orderResponse PayPalOrderResponse
	json.Unmarshal(body, &orderResponse)
	
	// Update transaction with PayPal order ID
	s.db.Exec("UPDATE transactions SET external_ref = $1 WHERE id = $2", orderResponse.ID, tx.ID)
	
	// Find approval URL
	var approvalURL string
	for _, link := range orderResponse.Links {
		if link.Rel == "approve" {
			approvalURL = link.Href
			break
		}
	}
	
	return gin.H{
		"message":      "PayPal order created successfully",
		"paypal_id":    orderResponse.ID,
		"approval_url": approvalURL,
		"status":       "pending_approval",
	}
}

func (s *Server) processPayPalWithdrawal(tx Transaction) gin.H {
	// Get PayPal access token
	accessToken, err := s.getPayPalAccessToken()
	if err != nil {
		return gin.H{"error": "Failed to connect to PayPal", "details": err.Error()}
	}
	
	// Parse destination from metadata
	var destination map[string]interface{}
	json.Unmarshal([]byte(tx.Metadata), &destination)
	
	email, ok := destination["email"].(string)
	if !ok {
		return gin.H{"error": "PayPal email required for withdrawal"}
	}
	
	// Create payout request
	payoutRequest := PayPalPayoutRequest{
		SenderBatchHeader: PayPalSenderBatchHeader{
			SenderBatchID: tx.ID,
			EmailSubject:  "Your P2P Bolivia withdrawal",
		},
		Items: []PayPalPayoutItem{
			{
				RecipientType: "EMAIL",
				Amount: PayPalAmount{
					Value:    tx.Amount.String(),
					Currency: tx.Currency,
				},
				Receiver:     email,
				Note:         fmt.Sprintf("Withdrawal from P2P Bolivia - Transaction %s", tx.ID),
				SenderItemID: tx.ID,
			},
		},
	}
	
	payoutJSON, _ := json.Marshal(payoutRequest)
	
	req, err := http.NewRequest("POST", s.getPayPalBaseURL()+"/v1/payments/payouts", bytes.NewBuffer(payoutJSON))
	if err != nil {
		return gin.H{"error": "Failed to create PayPal payout request"}
	}
	
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+accessToken)
	
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return gin.H{"error": "Failed to communicate with PayPal"}
	}
	defer resp.Body.Close()
	
	body, _ := io.ReadAll(resp.Body)
	
	if resp.StatusCode == http.StatusCreated {
		// Update transaction status
		s.db.Exec("UPDATE transactions SET status = 'PROCESSING' WHERE id = $1", tx.ID)
		return gin.H{
			"message": "PayPal payout initiated successfully",
			"status":  "processing",
		}
	}
	
	// If failed, unlock the balance
	s.db.Exec(`
		UPDATE wallets SET balance = balance + $1, locked_balance = locked_balance - $1
		WHERE user_id = $2 AND currency = $3
	`, tx.Amount, tx.UserID, tx.Currency)
	
	s.db.Exec("UPDATE transactions SET status = 'FAILED' WHERE id = $1", tx.ID)
	
	return gin.H{"error": "PayPal payout failed", "details": string(body)}
}

// Stripe Integration
type StripePaymentIntentRequest struct {
	Amount             int64                  `json:"amount"`
	Currency           string                 `json:"currency"`
	PaymentMethodTypes []string               `json:"payment_method_types"`
	Metadata           map[string]interface{} `json:"metadata"`
}

type StripePaymentIntentResponse struct {
	ID           string `json:"id"`
	ClientSecret string `json:"client_secret"`
	Status       string `json:"status"`
}

func (s *Server) processStripeDeposit(tx Transaction) gin.H {
	// Convert amount to cents
	amountCents := tx.Amount.Mul(decimal.NewFromInt(100)).IntPart()
	
	requestData := StripePaymentIntentRequest{
		Amount:             amountCents,
		Currency:           strings.ToLower(tx.Currency),
		PaymentMethodTypes: []string{"card"},
		Metadata: map[string]interface{}{
			"transaction_id": tx.ID,
			"user_id":        tx.UserID,
			"type":           "deposit",
		},
	}
	
	requestJSON, _ := json.Marshal(requestData)
	
	req, err := http.NewRequest("POST", "https://api.stripe.com/v1/payment_intents", bytes.NewBuffer(requestJSON))
	if err != nil {
		return gin.H{"error": "Failed to create Stripe request"}
	}
	
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+os.Getenv("STRIPE_SECRET_KEY"))
	
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return gin.H{"error": "Failed to communicate with Stripe"}
	}
	defer resp.Body.Close()
	
	body, _ := io.ReadAll(resp.Body)
	
	if resp.StatusCode != http.StatusOK {
		return gin.H{"error": "Stripe payment intent creation failed", "details": string(body)}
	}
	
	var intentResponse StripePaymentIntentResponse
	json.Unmarshal(body, &intentResponse)
	
	// Update transaction with Stripe payment intent ID
	s.db.Exec("UPDATE transactions SET external_ref = $1 WHERE id = $2", intentResponse.ID, tx.ID)
	
	return gin.H{
		"message":       "Stripe payment intent created successfully",
		"client_secret": intentResponse.ClientSecret,
		"payment_id":    intentResponse.ID,
		"status":        "pending_payment",
	}
}

func (s *Server) processStripeWithdrawal(tx Transaction) gin.H {
	// This would typically integrate with Stripe Connect for payouts
	// For now, we'll simulate the process
	
	var destination map[string]interface{}
	json.Unmarshal([]byte(tx.Metadata), &destination)
	
	bankAccount, ok := destination["bank_account"].(map[string]interface{})
	if !ok {
		return gin.H{"error": "Bank account details required for Stripe withdrawal"}
	}
	
	// Simulate processing time
	go func() {
		time.Sleep(5 * time.Second)
		
		// Simulate successful payout (90% success rate)
		if time.Now().UnixNano()%10 < 9 {
			s.db.Exec(`
				UPDATE transactions SET status = 'COMPLETED' WHERE id = $1;
				UPDATE wallets SET locked_balance = locked_balance - $2 WHERE user_id = $3 AND currency = $4;
			`, tx.ID, tx.Amount, tx.UserID, tx.Currency)
		} else {
			// Simulate failure - unlock balance
			s.db.Exec(`
				UPDATE transactions SET status = 'FAILED' WHERE id = $1;
				UPDATE wallets SET balance = balance + $2, locked_balance = locked_balance - $2 
				WHERE user_id = $3 AND currency = $4;
			`, tx.ID, tx.Amount, tx.UserID, tx.Currency)
		}
	}()
	
	return gin.H{
		"message":     "Stripe withdrawal initiated",
		"status":      "processing",
		"bank_last4":  bankAccount["last4"],
		"bank_name":   bankAccount["bank_name"],
	}
}

// QR Code Generation
func (s *Server) processQRDeposit(tx Transaction) gin.H {
	// Generate QR code for crypto deposit
	depositAddress := s.generateCryptoAddress(tx.Currency, tx.UserID)
	
	qrData := map[string]interface{}{
		"address":    depositAddress,
		"amount":     tx.Amount.String(),
		"currency":   tx.Currency,
		"tx_id":      tx.ID,
		"expires_at": time.Now().Add(24 * time.Hour).Unix(),
	}
	
	qrDataJSON, _ := json.Marshal(qrData)
	
	// Generate QR code image
	qrCode, err := qrcode.Encode(string(qrDataJSON), qrcode.Medium, 256)
	if err != nil {
		return gin.H{"error": "Failed to generate QR code"}
	}
	
	// Save QR code to file
	qrFileName := fmt.Sprintf("qr_%s.png", tx.ID)
	qrFilePath := filepath.Join("public", "qr", qrFileName)
	
	os.MkdirAll(filepath.Dir(qrFilePath), 0755)
	err = os.WriteFile(qrFilePath, qrCode, 0644)
	if err != nil {
		return gin.H{"error": "Failed to save QR code"}
	}
	
	// Update transaction with deposit address
	s.db.Exec("UPDATE transactions SET external_ref = $1 WHERE id = $2", depositAddress, tx.ID)
	
	return gin.H{
		"message":         "QR code generated successfully",
		"deposit_address": depositAddress,
		"qr_code_url":     fmt.Sprintf("/public/qr/%s", qrFileName),
		"qr_code_base64":  base64.StdEncoding.EncodeToString(qrCode),
		"expires_at":      time.Now().Add(24 * time.Hour),
		"status":          "pending_deposit",
	}
}

// Bank Transfer
func (s *Server) processBankDeposit(tx Transaction) gin.H {
	// Generate bank deposit reference
	bankRef := s.generateBankReference(tx.ID)
	
	// Update transaction with bank reference
	s.db.Exec("UPDATE transactions SET external_ref = $1 WHERE id = $2", bankRef, tx.ID)
	
	// Get bank details based on currency
	bankDetails := s.getBankDetails(tx.Currency)
	
	return gin.H{
		"message":       "Bank deposit initiated",
		"reference":     bankRef,
		"bank_details":  bankDetails,
		"amount":        tx.Amount,
		"currency":      tx.Currency,
		"status":        "pending_bank_transfer",
		"instructions":  fmt.Sprintf("Transfer %s %s to the provided bank account using reference: %s", tx.Amount.String(), tx.Currency, bankRef),
	}
}

func (s *Server) processBankWithdrawal(tx Transaction) gin.H {
	var destination map[string]interface{}
	json.Unmarshal([]byte(tx.Metadata), &destination)
	
	bankDetails, ok := destination["bank_details"].(map[string]interface{})
	if !ok {
		return gin.H{"error": "Bank details required for withdrawal"}
	}
	
	// Generate withdrawal reference
	withdrawalRef := s.generateBankReference(tx.ID)
	
	// Simulate bank processing
	go func() {
		time.Sleep(10 * time.Second)
		
		// Simulate successful bank transfer (95% success rate)
		if time.Now().UnixNano()%20 < 19 {
			s.db.Exec(`
				UPDATE transactions SET status = 'COMPLETED', external_ref = $1 WHERE id = $2;
				UPDATE wallets SET locked_balance = locked_balance - $3 WHERE user_id = $4 AND currency = $5;
			`, withdrawalRef, tx.ID, tx.Amount, tx.UserID, tx.Currency)
		} else {
			// Simulate failure
			s.db.Exec(`
				UPDATE transactions SET status = 'FAILED' WHERE id = $1;
				UPDATE wallets SET balance = balance + $2, locked_balance = locked_balance - $2 
				WHERE user_id = $3 AND currency = $4;
			`, tx.ID, tx.Amount, tx.UserID, tx.Currency)
		}
	}()
	
	return gin.H{
		"message":         "Bank withdrawal initiated",
		"reference":       withdrawalRef,
		"status":          "processing",
		"account_number":  bankDetails["account_number"],
		"bank_name":       bankDetails["bank_name"],
		"estimated_time":  "1-3 business days",
	}
}

// Helper functions
func (s *Server) getPayPalAccessToken() (string, error) {
	clientID := os.Getenv("PAYPAL_CLIENT_ID")
	clientSecret := os.Getenv("PAYPAL_CLIENT_SECRET")
	
	if clientID == "" || clientSecret == "" {
		return "", fmt.Errorf("PayPal credentials not configured")
	}
	
	auth := base64.StdEncoding.EncodeToString([]byte(clientID + ":" + clientSecret))
	
	req, err := http.NewRequest("POST", s.getPayPalBaseURL()+"/v1/oauth2/token", 
		bytes.NewBufferString("grant_type=client_credentials"))
	if err != nil {
		return "", err
	}
	
	req.Header.Set("Authorization", "Basic "+auth)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	
	var tokenResponse PayPalAccessTokenResponse
	err = json.Unmarshal(body, &tokenResponse)
	if err != nil {
		return "", err
	}
	
	return tokenResponse.AccessToken, nil
}

func (s *Server) getPayPalBaseURL() string {
	if os.Getenv("PAYPAL_MODE") == "live" {
		return "https://api.paypal.com"
	}
	return "https://api.sandbox.paypal.com"
}

func (s *Server) generateCryptoAddress(currency, userID string) string {
	// Generate a simulated crypto address
	hash := sha256.Sum256([]byte(fmt.Sprintf("%s_%s_%d", currency, userID, time.Now().Unix())))
	
	switch currency {
	case "USDT":
		return "0x" + hex.EncodeToString(hash[:20]) // ETH-style address
	case "BTC":
		return "bc1" + hex.EncodeToString(hash[:32])[:39] // Bech32-style
	default:
		return hex.EncodeToString(hash[:32])
	}
}

func (s *Server) generateBankReference(txID string) string {
	// Generate a bank reference code
	randomBytes := make([]byte, 4)
	rand.Read(randomBytes)
	return fmt.Sprintf("P2PB%s%X", txID[3:8], randomBytes)
}

func getBaseURL() string {
	baseURL := os.Getenv("BASE_URL")
	fmt.Printf("DEBUG: BASE_URL env var = '%s'\n", baseURL)
	if baseURL == "" {
		fmt.Println("DEBUG: Using fallback URL")
		return "http://localhost:8080"
	}
	fmt.Printf("DEBUG: Using BASE_URL = '%s'\n", baseURL)
	return baseURL
}

func (s *Server) getBankDetails(currency string) map[string]interface{} {
	bankDetails := map[string]map[string]interface{}{
		"BOB": {
			"bank_name":      "Banco Nacional de Bolivia",
			"account_number": "1234567890",
			"account_name":   "P2P Bolivia S.R.L.",
			"swift_code":     "BNBOBOPZ",
			"currency":       "BOB",
		},
		"USD": {
			"bank_name":      "Bank of America",
			"account_number": "9876543210",
			"account_name":   "P2P Bolivia LLC",
			"swift_code":     "BOFAUS3N",
			"routing_number": "021000322",
			"currency":       "USD",
		},
	}
	
	if details, exists := bankDetails[currency]; exists {
		return details
	}
	
	return map[string]interface{}{
		"error": "Bank details not available for this currency",
	}
}