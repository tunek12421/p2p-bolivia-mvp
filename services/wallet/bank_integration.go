package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/shopspring/decimal"
)

type BankIntegration struct {
	db          *sql.DB
	redis       *redis.Client
	listenerURL string
	httpClient  *http.Client
}

type BankNotification struct {
	ID                string          `json:"id"`
	TransactionID     string          `json:"transaction_id"`
	BankAccount       string          `json:"bank_account"`
	Amount            decimal.Decimal `json:"amount"`
	Currency          string          `json:"currency"`
	SenderName        string          `json:"sender_name"`
	SenderAccount     string          `json:"sender_account"`
	Reference         string          `json:"reference"`
	TransactionType   string          `json:"transaction_type"` // DEPOSIT, WITHDRAWAL
	Status            string          `json:"status"`           // PENDING, COMPLETED, FAILED
	Timestamp         time.Time       `json:"timestamp"`
	ProcessedAt       *time.Time      `json:"processed_at,omitempty"`
	UserID            *string         `json:"user_id,omitempty"`
	WalletID          *string         `json:"wallet_id,omitempty"`
	MatchOrderID      *string         `json:"match_order_id,omitempty"`
}

type WalletTransaction struct {
	ID           string          `json:"id"`
	UserID       string          `json:"user_id"`
	Type         string          `json:"type"`         // DEPOSIT, WITHDRAWAL, TRANSFER_IN, TRANSFER_OUT, FEE
	Currency     string          `json:"currency"`
	Amount       decimal.Decimal `json:"amount"`
	Status       string          `json:"status"`       // PENDING, COMPLETED, FAILED
	Method       string          `json:"method"`       // BANK, PAYPAL, STRIPE, QR, P2P
	ExternalRef  *string         `json:"external_ref"` // Bank transaction ID
	Metadata     *string         `json:"metadata"`
	CreatedAt    time.Time       `json:"created_at"`
	UpdatedAt    time.Time       `json:"updated_at"`
}

func NewBankIntegration(db *sql.DB, redis *redis.Client, listenerURL string) *BankIntegration {
	return &BankIntegration{
		db:          db,
		redis:       redis,
		listenerURL: listenerURL,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (bi *BankIntegration) Start() {
	log.Println("🏦 Bank integration started - monitoring for notifications")
	
	// Start polling for bank notifications every 10 seconds
	go bi.pollBankNotifications()
	
	// Start processing pending transactions
	go bi.processPendingTransactions()
	
	// Start escrow release monitoring for P2P matches
	go bi.monitorEscrowReleases()
}

func (bi *BankIntegration) pollBankNotifications() {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	
	for range ticker.C {
		notifications, err := bi.fetchBankNotifications()
		if err != nil {
			log.Printf("❌ Error fetching bank notifications: %v", err)
			continue
		}
		
		for _, notification := range notifications {
			err := bi.processBankNotification(notification)
			if err != nil {
				log.Printf("❌ Error processing notification %s: %v", notification.ID, err)
				continue
			}
		}
	}
}

func (bi *BankIntegration) fetchBankNotifications() ([]BankNotification, error) {
	resp, err := bi.httpClient.Get(bi.listenerURL + "/api/notifications")
	if err != nil {
		return nil, fmt.Errorf("failed to fetch notifications: %v", err)
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}
	
	var response struct {
		Notifications []struct {
			ID            string `json:"id"`
			TransactionID string `json:"transaction_id"`
			Amount        string `json:"amount"`  // Comes as string from bank-listener
			Currency      string `json:"currency"`
			SenderName    string `json:"sender_name"`
			SenderAccount string `json:"sender_account"`
			BankName      string `json:"bank_name"`
			Reference     string `json:"reference"`
			Timestamp     string `json:"timestamp"`
			Status        string `json:"status"`
			Processed     bool   `json:"processed"`
		} `json:"notifications"`
		Status string `json:"status"`
		Count  int    `json:"count"`
	}
	
	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		return nil, fmt.Errorf("failed to decode response: %v", err)
	}
	
	// Convert to internal format
	var notifications []BankNotification
	for _, notif := range response.Notifications {
		// Parse amount
		amount, err := decimal.NewFromString(notif.Amount)
		if err != nil {
			log.Printf("❌ Invalid amount in notification %s: %s", notif.ID, notif.Amount)
			continue
		}
		
		// Parse timestamp
		timestamp, err := time.Parse(time.RFC3339, notif.Timestamp)
		if err != nil {
			timestamp = time.Now() // Fallback to current time
		}
		
		bankNotification := BankNotification{
			ID:                notif.ID,
			TransactionID:     notif.TransactionID,
			BankAccount:       "", // We'll use sender account
			Amount:            amount,
			Currency:          notif.Currency,
			SenderName:        notif.SenderName,
			SenderAccount:     notif.SenderAccount,
			Reference:         notif.Reference,
			TransactionType:   "DEPOSIT", // Default for incoming notifications
			Status:            notif.Status,
			Timestamp:         timestamp,
		}
		
		notifications = append(notifications, bankNotification)
	}
	
	return notifications, nil
}

func (bi *BankIntegration) processBankNotification(notification BankNotification) error {
	ctx := context.Background()
	
	// Check if notification already processed
	cacheKey := fmt.Sprintf("processed_notification:%s", notification.ID)
	exists, err := bi.redis.Exists(ctx, cacheKey).Result()
	if err == nil && exists > 0 {
		return nil // Already processed
	}
	
	log.Printf("🏦 Processing bank notification: %s (Amount: %s %s, Reference: %s)",
		notification.ID, notification.Amount.String(), notification.Currency, notification.Reference)
	
	// Start database transaction
	tx, err := bi.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	
	// Determine user and action based on reference and bank account
	userID, actionType, matchOrderID, err := bi.parseNotificationReference(notification)
	if err != nil {
		log.Printf("⚠️ Could not parse notification reference: %v", err)
		// Mark as processed even if we can't parse it to avoid reprocessing
		bi.redis.Set(ctx, cacheKey, "unparseable", 24*time.Hour)
		return nil
	}
	
	// Create wallet transaction record
	walletTx := WalletTransaction{
		ID:          fmt.Sprintf("wtx_%d", time.Now().UnixNano()),
		UserID:      userID,
		Type:        actionType,
		Currency:    notification.Currency,
		Amount:      notification.Amount,
		Status:      "PENDING",
		Method:      "BANK",
		ExternalRef: &notification.TransactionID,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}
	
	// Add metadata if it's a P2P match
	if matchOrderID != "" {
		metadata := map[string]string{
			"match_order_id": matchOrderID,
			"sender_name":    notification.SenderName,
			"sender_account": notification.SenderAccount,
		}
		metadataJSON, _ := json.Marshal(metadata)
		metadataStr := string(metadataJSON)
		walletTx.Metadata = &metadataStr
	}
	
	// Insert wallet transaction
	_, err = tx.Exec(`
		INSERT INTO wallet_transactions (id, user_id, transaction_type, currency, amount, status, method, external_ref, metadata, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
	`, walletTx.ID, walletTx.UserID, walletTx.Type, walletTx.Currency, walletTx.Amount,
		walletTx.Status, walletTx.Method, walletTx.ExternalRef, walletTx.Metadata,
		walletTx.CreatedAt, walletTx.UpdatedAt)
	
	if err != nil {
		return err
	}
	
	// Process the transaction based on type
	switch actionType {
	case "DEPOSIT":
		err = bi.processDeposit(tx, userID, notification)
	case "P2P_PAYMENT":
		err = bi.processP2PPayment(tx, userID, matchOrderID, notification)
	default:
		log.Printf("⚠️ Unknown action type: %s", actionType)
	}
	
	if err != nil {
		return err
	}
	
	// Update transaction status to completed
	_, err = tx.Exec(`
		UPDATE wallet_transactions 
		SET status = 'COMPLETED', updated_at = NOW() 
		WHERE id = $1
	`, walletTx.ID)
	
	if err != nil {
		return err
	}
	
	// Commit transaction
	if err = tx.Commit(); err != nil {
		return err
	}
	
	// Mark notification as processed
	bi.redis.Set(ctx, cacheKey, "processed", 24*time.Hour)
	
	// Acknowledge to bank listener
	bi.acknowledgeNotification(notification.ID)
	
	log.Printf("✅ Bank notification processed successfully: %s", notification.ID)
	
	return nil
}

func (bi *BankIntegration) parseNotificationReference(notification BankNotification) (userID, actionType, matchOrderID string, err error) {
	ref := strings.ToUpper(strings.TrimSpace(notification.Reference))
	
	// P2P payment reference format: "P2P-{MATCH_ID}-{USER_ID}"
	if strings.HasPrefix(ref, "P2P-") {
		parts := strings.Split(ref, "-")
		if len(parts) >= 3 {
			return parts[2], "P2P_PAYMENT", parts[1], nil
		}
	}
	
	// Regular deposit reference format: "DEPOSIT-{USER_ID}"
	if strings.HasPrefix(ref, "DEPOSIT-") {
		parts := strings.Split(ref, "-")
		if len(parts) >= 2 {
			return parts[1], "DEPOSIT", "", nil
		}
	}
	
	// Try to find user by bank account mapping
	var mappedUserID string
	err = bi.db.QueryRow(`
		SELECT user_id FROM user_bank_accounts 
		WHERE account_number = $1 AND is_active = true
	`, notification.BankAccount).Scan(&mappedUserID)
	
	if err == nil {
		// Default to deposit if we can map the account
		return mappedUserID, "DEPOSIT", "", nil
	}
	
	return "", "", "", fmt.Errorf("cannot parse reference: %s", notification.Reference)
}

func (bi *BankIntegration) processDeposit(tx *sql.Tx, userID string, notification BankNotification) error {
	// Check if user exists
	var exists bool
	err := tx.QueryRow("SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)", userID).Scan(&exists)
	if err != nil || !exists {
		return fmt.Errorf("user not found: %s", userID)
	}
	
	// Update user wallet balance
	_, err = tx.Exec(`
		INSERT INTO wallets (user_id, currency, balance, locked_balance, created_at, updated_at)
		VALUES ($1, $2, $3, 0, NOW(), NOW())
		ON CONFLICT (user_id, currency) 
		DO UPDATE SET 
			balance = wallets.balance + $3,
			updated_at = NOW()
	`, userID, notification.Currency, notification.Amount)
	
	if err != nil {
		return err
	}
	
	log.Printf("💰 Deposit processed: %s %s credited to user %s",
		notification.Amount.String(), notification.Currency, userID)
	
	return nil
}

func (bi *BankIntegration) processP2PPayment(tx *sql.Tx, userID, matchOrderID string, notification BankNotification) error {
	// Verify the P2P match exists and get details
	var buyOrderID, sellOrderID string
	var matchAmount decimal.Decimal
	var buyerID, sellerID string
	
	err := tx.QueryRow(`
		SELECT m.buy_order_id, m.sell_order_id, m.amount,
			bo.user_id as buyer_id, so.user_id as seller_id
		FROM p2p_matches m
		JOIN orders bo ON m.buy_order_id = bo.id
		JOIN orders so ON m.sell_order_id = so.id
		WHERE m.id = $1
	`, matchOrderID).Scan(&buyOrderID, &sellOrderID, &matchAmount, &buyerID, &sellerID)
	
	if err != nil {
		return fmt.Errorf("P2P match not found: %s", matchOrderID)
	}
	
	// Verify the payment is from the correct buyer
	if userID != buyerID {
		return fmt.Errorf("payment not from expected buyer")
	}
	
	// Release escrow: credit seller and complete the match
	err = bi.releaseP2PEscrow(tx, matchOrderID, buyerID, sellerID, notification.Currency, matchAmount)
	if err != nil {
		return err
	}
	
	log.Printf("🤝 P2P payment processed: Match %s completed, %s %s transferred from %s to %s",
		matchOrderID, notification.Amount.String(), notification.Currency, buyerID, sellerID)
	
	return nil
}

func (bi *BankIntegration) releaseP2PEscrow(tx *sql.Tx, matchID, buyerID, sellerID, currency string, amount decimal.Decimal) error {
	// Credit the seller
	_, err := tx.Exec(`
		INSERT INTO wallets (user_id, currency, balance, locked_balance, created_at, updated_at)
		VALUES ($1, $2, $3, 0, NOW(), NOW())
		ON CONFLICT (user_id, currency) 
		DO UPDATE SET 
			balance = wallets.balance + $3,
			updated_at = NOW()
	`, sellerID, currency, amount)
	
	if err != nil {
		return err
	}
	
	// Release locked balance from seller (if any)
	_, err = tx.Exec(`
		UPDATE wallets 
		SET locked_balance = GREATEST(0, locked_balance - $1),
			updated_at = NOW()
		WHERE user_id = $2 AND currency = $3
	`, amount, sellerID, currency)
	
	if err != nil {
		return err
	}
	
	// Update match status to completed
	_, err = tx.Exec(`
		UPDATE p2p_matches 
		SET status = 'COMPLETED', completed_at = NOW() 
		WHERE id = $1
	`, matchID)
	
	if err != nil {
		return err
	}
	
	// Create transaction records for both parties
	buyerTxID := fmt.Sprintf("p2p_buy_%d", time.Now().UnixNano())
	sellerTxID := fmt.Sprintf("p2p_sell_%d", time.Now().UnixNano())
	
	// Buyer transaction (outgoing)
	_, err = tx.Exec(`
		INSERT INTO wallet_transactions (id, user_id, transaction_type, currency, amount, status, method, external_ref, created_at, updated_at)
		VALUES ($1, $2, 'P2P_BUY', $3, $4, 'COMPLETED', 'P2P', $5, NOW(), NOW())
	`, buyerTxID, buyerID, currency, amount.Neg(), matchID)
	
	if err != nil {
		return err
	}
	
	// Seller transaction (incoming)
	_, err = tx.Exec(`
		INSERT INTO wallet_transactions (id, user_id, transaction_type, currency, amount, status, method, external_ref, created_at, updated_at)
		VALUES ($1, $2, 'P2P_SELL', $3, $4, 'COMPLETED', 'P2P', $5, NOW(), NOW())
	`, sellerTxID, sellerID, currency, amount, matchID)
	
	return err
}

func (bi *BankIntegration) processPendingTransactions() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	
	for range ticker.C {
		bi.checkPendingTransactions()
	}
}

func (bi *BankIntegration) checkPendingTransactions() {
	query := `
		SELECT id, user_id, transaction_type, currency, amount, external_ref, created_at
		FROM wallet_transactions 
		WHERE status = 'PENDING' AND method = 'BANK'
		AND created_at < NOW() - INTERVAL '5 minutes'
		ORDER BY created_at ASC
		LIMIT 50
	`
	
	rows, err := bi.db.Query(query)
	if err != nil {
		log.Printf("Error querying pending transactions: %v", err)
		return
	}
	defer rows.Close()
	
	for rows.Next() {
		var txID, userID, txType, currency, externalRef string
		var amount decimal.Decimal
		var createdAt time.Time
		
		err := rows.Scan(&txID, &userID, &txType, &currency, &amount, &externalRef, &createdAt)
		if err != nil {
			continue
		}
		
		// Check if transaction is older than 1 hour - mark as failed
		if time.Since(createdAt) > time.Hour {
			bi.db.Exec("UPDATE wallet_transactions SET status = 'FAILED', updated_at = NOW() WHERE id = $1", txID)
			log.Printf("⏰ Transaction marked as failed due to timeout: %s", txID)
		}
	}
}

func (bi *BankIntegration) monitorEscrowReleases() {
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()
	
	for range ticker.C {
		bi.checkEscrowReleases()
	}
}

func (bi *BankIntegration) checkEscrowReleases() {
	// Check for P2P matches that need escrow release
	query := `
		SELECT m.id, m.amount, m.rate, bo.currency_from, so.user_id as seller_id
		FROM p2p_matches m
		JOIN orders bo ON m.buy_order_id = bo.id
		JOIN orders so ON m.sell_order_id = so.id
		WHERE m.status = 'PENDING' 
		AND m.created_at < NOW() - INTERVAL '24 hours'
	`
	
	rows, err := bi.db.Query(query)
	if err != nil {
		return
	}
	defer rows.Close()
	
	for rows.Next() {
		var matchID, currency, sellerID string
		var amount, rate decimal.Decimal
		
		err := rows.Scan(&matchID, &amount, &rate, &currency, &sellerID)
		if err != nil {
			continue
		}
		
		// Auto-release escrow after 24 hours (safety mechanism)
		log.Printf("⏰ Auto-releasing escrow for match %s after timeout", matchID)
		
		tx, err := bi.db.Begin()
		if err != nil {
			continue
		}
		
		err = bi.releaseP2PEscrow(tx, matchID, "", sellerID, currency, amount)
		if err != nil {
			tx.Rollback()
			continue
		}
		
		tx.Commit()
	}
}

func (bi *BankIntegration) acknowledgeNotification(notificationID string) {
	payload := map[string]string{"notification_id": notificationID}
	payloadJSON, _ := json.Marshal(payload)
	
	resp, err := bi.httpClient.Post(
		bi.listenerURL+"/api/acknowledge",
		"application/json",
		strings.NewReader(string(payloadJSON)),
	)
	
	if err != nil {
		log.Printf("Failed to acknowledge notification %s: %v", notificationID, err)
		return
	}
	defer resp.Body.Close()
	
	if resp.StatusCode == http.StatusOK {
		log.Printf("✅ Acknowledged bank notification: %s", notificationID)
	}
}

func (bi *BankIntegration) GetPendingDeposits(userID string) ([]WalletTransaction, error) {
	query := `
		SELECT id, user_id, transaction_type, currency, amount, status, method, external_ref, created_at, updated_at
		FROM wallet_transactions 
		WHERE user_id = $1 AND transaction_type = 'DEPOSIT' AND status = 'PENDING'
		ORDER BY created_at DESC
	`
	
	rows, err := bi.db.Query(query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var transactions []WalletTransaction
	for rows.Next() {
		var tx WalletTransaction
		err := rows.Scan(&tx.ID, &tx.UserID, &tx.Type, &tx.Currency, &tx.Amount,
			&tx.Status, &tx.Method, &tx.ExternalRef, &tx.CreatedAt, &tx.UpdatedAt)
		if err != nil {
			continue
		}
		transactions = append(transactions, tx)
	}
	
	return transactions, nil
}

func (bi *BankIntegration) GetDepositInstructions(userID, currency string, amount decimal.Decimal) (map[string]interface{}, error) {
	// Generate unique reference for this deposit
	reference := fmt.Sprintf("DEPOSIT-%s-%d", userID, time.Now().Unix())
	
	// Get bank account for deposits
	var bankAccount, bankName, accountHolder string
	err := bi.db.QueryRow(`
		SELECT account_number, bank_name, account_holder 
		FROM deposit_accounts 
		WHERE currency = $1 AND is_active = true 
		LIMIT 1
	`, currency).Scan(&bankAccount, &bankName, &accountHolder)
	
	if err != nil {
		return nil, fmt.Errorf("no deposit account available for %s", currency)
	}
	
	return map[string]interface{}{
		"bank_name":      bankName,
		"account_number": bankAccount,
		"account_holder": accountHolder,
		"amount":         amount,
		"currency":       currency,
		"reference":      reference,
		"instructions": fmt.Sprintf(
			"Transfiere exactamente %s %s a la cuenta %s con referencia: %s",
			amount.String(), currency, bankAccount, reference,
		),
		"expires_at": time.Now().Add(24 * time.Hour),
	}, nil
}