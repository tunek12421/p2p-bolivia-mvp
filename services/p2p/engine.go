package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"sort"
	"strings"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

type MatchingEngine struct {
	db    *sql.DB
	redis *redis.Client
}

type Match struct {
	BuyOrder  Order           `json:"buy_order"`
	SellOrder Order           `json:"sell_order"`
	CashierID string          `json:"cashier_id"`
	Amount    decimal.Decimal `json:"amount"`
	Rate      decimal.Decimal `json:"rate"`
	Status    string          `json:"status"`
	MatchedAt time.Time       `json:"matched_at"`
}

type OrderBook struct {
	BuyOrders  []Order `json:"buy_orders"`
	SellOrders []Order `json:"sell_orders"`
}

func NewMatchingEngine(db *sql.DB, redis *redis.Client) *MatchingEngine {
	return &MatchingEngine{
		db:    db,
		redis: redis,
	}
}

func (e *MatchingEngine) Start() {
	log.Println("🚀 Matching engine started - monitoring for pending orders")
	
	// Start order book cache refresh
	go e.refreshOrderBookCache()
	
	// Note: Removed automatic matching loop - cashiers now accept orders manually
}

func (e *MatchingEngine) AddOrder(order Order) (string, error) {
	ctx := context.Background()
	log.Println("🔧 ENGINE: AddOrder iniciado")
	
	// Set order status to PENDING - cashiers will accept manually
	order.Status = "PENDING"
	log.Printf("📝 ENGINE: Status establecido a: %s", order.Status)
	
	// Insert order into database (both tables for consistency)
	query := `
		INSERT INTO orders (user_id, order_type, currency_from, currency_to, amount, 
			remaining_amount, rate, min_amount, max_amount, payment_methods, status, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		RETURNING id
	`
	
	paymentMethodsJSON, _ := json.Marshal(order.PaymentMethods)
	log.Printf("🗃️ ENGINE: PaymentMethods JSON: %s", string(paymentMethodsJSON))
	
	// Convert JSON array to PostgreSQL array format for p2p_orders table
	pgArray := convertJSONArrayToPGArray(order.PaymentMethods)
	log.Printf("🗃️ ENGINE: PaymentMethods PostgreSQL: %s", pgArray)
	log.Printf("📊 ENGINE: Query SQL: %s", query)
	log.Printf("📋 ENGINE: Parámetros:")
	log.Printf("  $1 user_id: %s", order.UserID)
	log.Printf("  $2 order_type: %s", order.Type)
	log.Printf("  $3 currency_from: %s", order.CurrencyFrom)
	log.Printf("  $4 currency_to: %s", order.CurrencyTo)
	log.Printf("  $5 amount: %s", order.Amount.String())
	log.Printf("  $6 remaining_amount: %s", order.RemainingAmount.String())
	log.Printf("  $7 rate: %s", order.Rate.String())
	log.Printf("  $8 min_amount: %s", order.MinAmount.String())
	log.Printf("  $9 max_amount: %s", order.MaxAmount.String())
	log.Printf("  $10 payment_methods: %s", string(paymentMethodsJSON))
	log.Printf("  $11 status: %s", order.Status)
	log.Printf("  $12 created_at: %s", order.CreatedAt.Format(time.RFC3339))
	
	log.Println("💾 ENGINE: Ejecutando QueryRow...")
	err := e.db.QueryRow(query,
		order.UserID, order.Type, order.CurrencyFrom, order.CurrencyTo,
		order.Amount, order.RemainingAmount, order.Rate, order.MinAmount, order.MaxAmount,
		string(paymentMethodsJSON), order.Status, order.CreatedAt,
	).Scan(&order.ID)
	
	if err != nil {
		log.Printf("❌ ENGINE: Error en QueryRow: %v", err)
		return "", fmt.Errorf("failed to insert into orders table: %v", err)
	}
	
	log.Printf("✅ ENGINE: Orden insertada exitosamente con ID: %s", order.ID)

	// Also insert into p2p_orders for backward compatibility
	p2pQuery := `
		INSERT INTO p2p_orders (id, user_id, order_type, currency_from, currency_to, amount, 
			remaining_amount, rate, min_amount, max_amount, payment_methods, status, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
		ON CONFLICT (id) DO NOTHING
	`
	
	_, err = e.db.Exec(p2pQuery,
		order.ID, order.UserID, order.Type, order.CurrencyFrom, order.CurrencyTo,
		order.Amount, order.RemainingAmount, order.Rate, order.MinAmount, order.MaxAmount,
		pgArray, order.Status, order.CreatedAt,
	)
	
	if err != nil {
		log.Printf("Warning: failed to insert into p2p_orders table: %v", err)
	}
	
	// Add to Redis cache for cashiers to see pending orders
	e.cachePendingOrder(ctx, order)
	
	// Notify available cashiers (in real implementation, this would send notifications)
	log.Printf("📝 New %s order created: %s (%s %s -> %s) - waiting for cashier acceptance", 
		order.Type, order.ID, order.Amount.String(), order.CurrencyFrom, order.CurrencyTo)
	
	return order.ID, nil
}

func (e *MatchingEngine) cachePendingOrder(ctx context.Context, order Order) {
	orderJSON, _ := json.Marshal(order)
	
	// Cache pending orders for cashiers to see
	key := "orders:pending"
	e.redis.LPush(ctx, key, orderJSON)
	e.redis.Expire(ctx, key, 24*time.Hour)
	
	// Cache by currency pair for faster filtering
	pairKey := fmt.Sprintf("orders:pending:%s_%s", order.CurrencyFrom, order.CurrencyTo)
	e.redis.LPush(ctx, pairKey, orderJSON)
	e.redis.Expire(ctx, pairKey, 24*time.Hour)
}

func (e *MatchingEngine) cacheOrder(ctx context.Context, order Order) {
	orderJSON, _ := json.Marshal(order)
	
	// Cache by currency pair and type for orderbook display
	key := fmt.Sprintf("orders:%s_%s:%s", order.CurrencyFrom, order.CurrencyTo, order.Type)
	e.redis.LPush(ctx, key, orderJSON)
	e.redis.Expire(ctx, key, 24*time.Hour)
	
	// Cache in general order book
	e.redis.LPush(ctx, "orders:all", orderJSON)
	e.redis.Expire(ctx, "orders:all", 24*time.Hour)
}

func (e *MatchingEngine) findMatches(newOrder Order) []Match {
	ctx := context.Background()
	var matches []Match
	
	// Get opposing orders (BUY matches with SELL and vice versa)
	oppositeType := "SELL"
	if newOrder.Type == "SELL" {
		oppositeType = "BUY"
	}
	
	// Get cached orders of opposite type for the same currency pair
	key := fmt.Sprintf("orders:%s_%s:%s", newOrder.CurrencyFrom, newOrder.CurrencyTo, oppositeType)
	orders, err := e.redis.LRange(ctx, key, 0, -1).Result()
	if err != nil {
		log.Printf("Error getting cached orders: %v", err)
		return matches
	}
	
	var candidateOrders []Order
	for _, orderJSON := range orders {
		var order Order
		if err := json.Unmarshal([]byte(orderJSON), &order); err != nil {
			continue
		}
		
		// Skip if order is not active or belongs to same user
		if order.Status != "ACTIVE" || order.UserID == newOrder.UserID {
			continue
		}
		
		candidateOrders = append(candidateOrders, order)
	}
	
	// Sort orders for optimal matching
	if newOrder.Type == "BUY" {
		// For buy orders, match with sell orders starting from lowest rate
		sort.Slice(candidateOrders, func(i, j int) bool {
			return candidateOrders[i].Rate.LessThan(candidateOrders[j].Rate)
		})
	} else {
		// For sell orders, match with buy orders starting from highest rate
		sort.Slice(candidateOrders, func(i, j int) bool {
			return candidateOrders[i].Rate.GreaterThan(candidateOrders[j].Rate)
		})
	}
	
	// Find compatible matches
	for _, candidateOrder := range candidateOrders {
		if e.canMatch(newOrder, candidateOrder) {
			match := e.createMatch(newOrder, candidateOrder)
			matches = append(matches, match)
			
			// Update remaining amount
			matchAmount := match.Amount
			newOrder.RemainingAmount = newOrder.RemainingAmount.Sub(matchAmount)
			
			// If order is fully filled, stop matching
			if newOrder.RemainingAmount.IsZero() {
				break
			}
		}
	}
	
	return matches
}

func (e *MatchingEngine) canMatch(order1, order2 Order) bool {
	// Check currency pair compatibility
	if order1.CurrencyFrom != order2.CurrencyTo || order1.CurrencyTo != order2.CurrencyFrom {
		return false
	}
	
	// Check rate compatibility
	if order1.Type == "BUY" && order2.Type == "SELL" {
		// Buy order rate must be >= sell order rate
		return order1.Rate.GreaterThanOrEqual(order2.Rate)
	} else if order1.Type == "SELL" && order2.Type == "BUY" {
		// Sell order rate must be <= buy order rate  
		return order1.Rate.LessThanOrEqual(order2.Rate)
	}
	
	return false
}

func (e *MatchingEngine) createMatch(order1, order2 Order) Match {
	// Determine match amount (minimum of remaining amounts)
	matchAmount := order1.RemainingAmount
	if order2.RemainingAmount.LessThan(matchAmount) {
		matchAmount = order2.RemainingAmount
	}
	
	// Determine match rate (maker's rate takes priority)
	var matchRate decimal.Decimal
	var buyOrder, sellOrder Order
	
	if order1.Type == "BUY" {
		buyOrder = order1
		sellOrder = order2
		matchRate = order2.Rate // Sell order (maker) rate
	} else {
		buyOrder = order2
		sellOrder = order1
		matchRate = order1.Rate // Sell order (maker) rate
	}
	
	return Match{
		BuyOrder:  buyOrder,
		SellOrder: sellOrder,
		Amount:    matchAmount,
		Rate:      matchRate,
		MatchedAt: time.Now(),
	}
}

func (e *MatchingEngine) executeMatch(match Match) (string, error) {
	// Start database transaction
	tx, err := e.db.Begin()
	if err != nil {
		return "", err
	}
	defer tx.Rollback()
	
	// Insert match record
	matchID := fmt.Sprintf("match_%d", time.Now().UnixNano())
	_, err = tx.Exec(`
		INSERT INTO matches (id, buy_order_id, sell_order_id, amount, rate, created_at)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, matchID, match.BuyOrder.ID, match.SellOrder.ID, match.Amount, match.Rate, match.MatchedAt)
	
	if err != nil {
		return "", err
	}
	
	// Update order remaining amounts
	_, err = tx.Exec(`
		UPDATE orders SET remaining_amount = remaining_amount - $1,
			status = CASE WHEN remaining_amount - $1 <= 0 THEN 'FILLED' ELSE 'ACTIVE' END
		WHERE id = $2
	`, match.Amount, match.BuyOrder.ID)
	
	if err != nil {
		return "", err
	}
	
	_, err = tx.Exec(`
		UPDATE orders SET remaining_amount = remaining_amount - $1,
			status = CASE WHEN remaining_amount - $1 <= 0 THEN 'FILLED' ELSE 'ACTIVE' END
		WHERE id = $2
	`, match.Amount, match.SellOrder.ID)
	
	if err != nil {
		return "", err
	}
	
	// Commit transaction
	if err = tx.Commit(); err != nil {
		return "", err
	}
	
	// Update Redis cache
	e.removeOrderFromCache(match.BuyOrder.ID)
	e.removeOrderFromCache(match.SellOrder.ID)
	
	log.Printf("✅ Match executed: %s (Amount: %s, Rate: %s)", 
		matchID, match.Amount.String(), match.Rate.String())
	
	return matchID, nil
}

func (e *MatchingEngine) removeOrderFromCache(orderID string) {
	ctx := context.Background()
	
	// Remove from all cached order lists
	keys, err := e.redis.Keys(ctx, "orders:*").Result()
	if err != nil {
		return
	}
	
	for _, key := range keys {
		orders, err := e.redis.LRange(ctx, key, 0, -1).Result()
		if err != nil {
			continue
		}
		
		for _, orderJSON := range orders {
			var order Order
			if err := json.Unmarshal([]byte(orderJSON), &order); err != nil {
				continue
			}
			
			if order.ID == orderID {
				e.redis.LRem(ctx, key, 1, orderJSON)
				break
			}
		}
	}
}

func (e *MatchingEngine) GetOrderBook(currencyFrom, currencyTo string) (OrderBook, error) {
	ctx := context.Background()
	
	// Try cache first
	cacheKey := fmt.Sprintf("orderbook:%s_%s", currencyFrom, currencyTo)
	cached, err := e.redis.Get(ctx, cacheKey).Result()
	if err == nil {
		var orderBook OrderBook
		json.Unmarshal([]byte(cached), &orderBook)
		return orderBook, nil
	}
	
	// Get from database
	query := `
		SELECT id, user_id, order_type, currency_from, currency_to, amount, remaining_amount,
			rate, min_amount, max_amount, payment_methods, status, created_at
		FROM p2p_orders 
		WHERE currency_from = $1 AND currency_to = $2 AND status = 'ACTIVE'
		ORDER BY rate ASC, created_at ASC
	`
	
	rows, err := e.db.Query(query, currencyFrom, currencyTo)
	if err != nil {
		return OrderBook{}, err
	}
	defer rows.Close()
	
	var buyOrders, sellOrders []Order
	
	for rows.Next() {
		var order Order
		var paymentMethodsJSON string
		
		err := rows.Scan(&order.ID, &order.UserID, &order.Type, &order.CurrencyFrom,
			&order.CurrencyTo, &order.Amount, &order.RemainingAmount, &order.Rate,
			&order.MinAmount, &order.MaxAmount, &paymentMethodsJSON, &order.Status, &order.CreatedAt)
		
		if err != nil {
			continue
		}
		
		json.Unmarshal([]byte(paymentMethodsJSON), &order.PaymentMethods)
		
		if order.Type == "BUY" {
			buyOrders = append(buyOrders, order)
		} else {
			sellOrders = append(sellOrders, order)
		}
	}
	
	orderBook := OrderBook{
		BuyOrders:  buyOrders,
		SellOrders: sellOrders,
	}
	
	// Cache for 30 seconds
	orderBookJSON, _ := json.Marshal(orderBook)
	e.redis.Set(ctx, cacheKey, orderBookJSON, 30*time.Second)
	
	return orderBook, nil
}

func (e *MatchingEngine) refreshOrderBookCache() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	
	for range ticker.C {
		// Refresh cache for popular currency pairs
		pairs := [][]string{
			{"USD", "BOB"},
			{"BOB", "USD"},
			{"USDT", "BOB"},
			{"BOB", "USDT"},
			{"USD", "USDT"},
			{"USDT", "USD"},
		}
		
		for _, pair := range pairs {
			e.GetOrderBook(pair[0], pair[1])
		}
	}
}

// Cashier system methods

// GetPendingOrders returns all orders waiting for cashier acceptance
func (e *MatchingEngine) GetPendingOrders() ([]Order, error) {
	query := `
		SELECT id, user_id, order_type, currency_from, currency_to, amount, remaining_amount,
			rate, COALESCE(min_amount, 0), COALESCE(max_amount, 0), COALESCE(payment_methods, '[]'), status, created_at
		FROM orders 
		WHERE status = 'PENDING' AND (expires_at IS NULL OR expires_at > NOW())
		ORDER BY created_at ASC
	`
	
	rows, err := e.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var orders []Order
	for rows.Next() {
		var order Order
		var paymentMethodsJSON string
		
		err := rows.Scan(&order.ID, &order.UserID, &order.Type, &order.CurrencyFrom,
			&order.CurrencyTo, &order.Amount, &order.RemainingAmount, &order.Rate,
			&order.MinAmount, &order.MaxAmount, &paymentMethodsJSON, &order.Status, &order.CreatedAt)
		
		if err != nil {
			continue
		}
		
		json.Unmarshal([]byte(paymentMethodsJSON), &order.PaymentMethods)
		orders = append(orders, order)
	}
	
	return orders, nil
}

// AcceptOrder allows a cashier to accept a pending order
func (e *MatchingEngine) AcceptOrder(orderID, cashierID string) error {
	tx, err := e.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	
	// Get order details and verify it's pending
	var order Order
	err = tx.QueryRow(`
		SELECT id, user_id, order_type, currency_from, currency_to, amount, 
			remaining_amount, rate, status
		FROM orders WHERE id = $1 FOR UPDATE
	`, orderID).Scan(&order.ID, &order.UserID, &order.Type, &order.CurrencyFrom, 
		&order.CurrencyTo, &order.Amount, &order.RemainingAmount, &order.Rate, &order.Status)
	
	if err != nil {
		return fmt.Errorf("order not found: %v", err)
	}
	
	if order.Status != "PENDING" {
		return fmt.Errorf("order is not available for acceptance")
	}
	
	// Verify cashier has sufficient balance for BUY orders
	if order.Type == "BUY" {
		var cashierBalance decimal.Decimal
		err = tx.QueryRow(`
			SELECT COALESCE(cashier_balance_usd, 0) FROM users WHERE id = $1 AND is_cashier = true
		`, cashierID).Scan(&cashierBalance)
		
		if err != nil {
			return fmt.Errorf("cashier not found or not verified")
		}
		
		if cashierBalance.LessThan(order.Amount) {
			return fmt.Errorf("insufficient cashier balance")
		}
		
		// Lock cashier funds
		_, err = tx.Exec(`
			UPDATE users SET 
				cashier_balance_usd = cashier_balance_usd - $1,
				cashier_locked_usd = cashier_locked_usd + $1
			WHERE id = $2
		`, order.Amount, cashierID)
		
		if err != nil {
			return fmt.Errorf("failed to lock cashier funds: %v", err)
		}
	}
	
	// Update order with cashier assignment in both tables
	_, err = tx.Exec(`
		UPDATE orders SET 
			cashier_id = $1,
			status = 'MATCHED',
			accepted_at = NOW(),
			updated_at = NOW()
		WHERE id = $2
	`, cashierID, orderID)
	
	if err != nil {
		return fmt.Errorf("failed to update order: %v", err)
	}

	// Also update p2p_orders table for consistency
	_, err = tx.Exec(`
		UPDATE p2p_orders SET 
			cashier_id = $1,
			status = 'MATCHED',
			accepted_at = NOW(),
			updated_at = NOW()
		WHERE id = $2
	`, cashierID, orderID)
	
	if err != nil {
		// Log error but don't fail the transaction
		log.Printf("Warning: failed to update p2p_orders table: %v", err)
	}
	
	// Create cashier assignment record
	_, err = tx.Exec(`
		INSERT INTO cashier_order_assignments (cashier_id, order_id, status)
		VALUES ($1, $2, 'ACTIVE')
	`, cashierID, orderID)
	
	if err != nil {
		return fmt.Errorf("failed to create assignment: %v", err)
	}
	
	// Commit transaction
	if err = tx.Commit(); err != nil {
		return err
	}
	
	// Create chat room for this transaction
	go e.createTransactionChatRoom(orderID, order.UserID, cashierID)
	
	// Remove from pending cache and update order cache
	e.removePendingOrderFromCache(orderID)
	order.Status = "MATCHED"
	e.cacheOrder(context.Background(), order)
	
	log.Printf("✅ Order accepted by cashier: Order %s accepted by cashier %s", orderID, cashierID)
	
	return nil
}

// ConfirmPayment allows cashier to confirm payment received for an order
func (e *MatchingEngine) ConfirmPayment(orderID, cashierID string) error {
	tx, err := e.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	
	// Verify order ownership by cashier
	var order Order
	err = tx.QueryRow(`
		SELECT id, user_id, order_type, currency_from, currency_to, amount, status
		FROM orders WHERE id = $1 AND cashier_id = $2 AND status IN ('MATCHED', 'PROCESSING') FOR UPDATE
	`, orderID, cashierID).Scan(&order.ID, &order.UserID, &order.Type, 
		&order.CurrencyFrom, &order.CurrencyTo, &order.Amount, &order.Status)
	
	if err != nil {
		return fmt.Errorf("order not found or not assigned to this cashier")
	}
	
	// Update order to completed in both tables
	_, err = tx.Exec(`
		UPDATE orders SET status = 'COMPLETED', updated_at = NOW() WHERE id = $1
	`, orderID)
	
	if err != nil {
		return fmt.Errorf("failed to complete order: %v", err)
	}

	// Also update p2p_orders table for consistency
	_, err = tx.Exec(`
		UPDATE p2p_orders SET status = 'COMPLETED', updated_at = NOW() WHERE id = $1
	`, orderID)
	
	if err != nil {
		// Log error but don't fail the transaction
		log.Printf("Warning: failed to update p2p_orders table: %v", err)
	}
	
	// Release locked funds and transfer to buyer for BUY orders
	if order.Type == "BUY" {
		// Release cashier locked funds (they've been paid)
		_, err = tx.Exec(`
			UPDATE users SET cashier_locked_usd = cashier_locked_usd - $1 WHERE id = $2
		`, order.Amount, cashierID)
		
		if err != nil {
			return fmt.Errorf("failed to release cashier funds: %v", err)
		}
		
		// Add USD to buyer's wallet
		_, err = tx.Exec(`
			INSERT INTO wallets (user_id, currency, balance) 
			VALUES ($1, 'USD', $2)
			ON CONFLICT (user_id, currency) 
			DO UPDATE SET balance = wallets.balance + $2
		`, order.UserID, order.Amount)
		
		if err != nil {
			return fmt.Errorf("failed to credit buyer: %v", err)
		}
	}
	
	// Update assignment status
	_, err = tx.Exec(`
		UPDATE cashier_order_assignments 
		SET status = 'COMPLETED', completed_at = NOW()
		WHERE cashier_id = $1 AND order_id = $2
	`, cashierID, orderID)
	
	if err != nil {
		return fmt.Errorf("failed to update assignment: %v", err)
	}
	
	// Commit transaction
	if err = tx.Commit(); err != nil {
		return err
	}
	
	log.Printf("✅ Payment confirmed: Order %s completed by cashier %s", orderID, cashierID)
	
	return nil
}

// removePendingOrderFromCache removes order from pending caches
func (e *MatchingEngine) removePendingOrderFromCache(orderID string) {
	ctx := context.Background()
	
	// Remove from pending orders cache
	keys := []string{"orders:pending"}
	
	// Also check currency pair specific caches
	pairs := []string{"USD_BOB", "BOB_USD", "USDT_BOB", "BOB_USDT"}
	for _, pair := range pairs {
		keys = append(keys, fmt.Sprintf("orders:pending:%s", pair))
	}
	
	for _, key := range keys {
		orders, err := e.redis.LRange(ctx, key, 0, -1).Result()
		if err != nil {
			continue
		}
		
		for _, orderJSON := range orders {
			var order Order
			if err := json.Unmarshal([]byte(orderJSON), &order); err != nil {
				continue
			}
			
			if order.ID == orderID {
				e.redis.LRem(ctx, key, 1, orderJSON)
				break
			}
		}
	}
}

func (e *MatchingEngine) GetActiveOrders(userID string) ([]Order, error) {
	query := `
		SELECT id, user_id, order_type, currency_from, currency_to, amount, remaining_amount,
			rate, min_amount, max_amount, payment_methods, status, created_at
		FROM orders 
		WHERE user_id = $1 AND status IN ('ACTIVE', 'PARTIAL', 'PENDING', 'MATCHED', 'PROCESSING', 'COMPLETED')
		ORDER BY created_at DESC
	`
	
	rows, err := e.db.Query(query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var orders []Order
	for rows.Next() {
		var order Order
		var paymentMethodsJSON string
		
		err := rows.Scan(&order.ID, &order.UserID, &order.Type, &order.CurrencyFrom,
			&order.CurrencyTo, &order.Amount, &order.RemainingAmount, &order.Rate,
			&order.MinAmount, &order.MaxAmount, &paymentMethodsJSON, &order.Status, &order.CreatedAt)
		
		if err != nil {
			continue
		}
		
		json.Unmarshal([]byte(paymentMethodsJSON), &order.PaymentMethods)
		orders = append(orders, order)
	}
	
	return orders, nil
}

func (e *MatchingEngine) CancelOrder(orderID, userID string) error {
	// Start transaction for atomicity
	tx, err := e.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	
	// Verify ownership and get order details
	var ownerID, status string
	var remainingAmount decimal.Decimal
	err = tx.QueryRow("SELECT user_id, status, remaining_amount FROM orders WHERE id = $1", orderID).Scan(&ownerID, &status, &remainingAmount)
	if err != nil {
		return fmt.Errorf("order not found")
	}
	
	if ownerID != userID {
		return fmt.Errorf("unauthorized")
	}
	
	if status != "ACTIVE" && status != "PARTIAL" {
		return fmt.Errorf("cannot cancel order with status: %s", status)
	}
	
	// Update order status
	_, err = tx.Exec("UPDATE orders SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1", orderID)
	if err != nil {
		return err
	}
	
	// Commit transaction
	if err = tx.Commit(); err != nil {
		return err
	}
	
	// Remove from cache
	e.removeOrderFromCache(orderID)
	
	log.Printf("✅ Order cancelled: %s (Remaining: %s)", orderID, remainingAmount.String())
	
	return nil
}

func (e *MatchingEngine) GetMarketDepth(currencyFrom, currencyTo string) (map[string]interface{}, error) {
	orderBook, err := e.GetOrderBook(currencyFrom, currencyTo)
	if err != nil {
		return nil, err
	}
	
	// Aggregate by rate levels
	buyLevels := make(map[string]decimal.Decimal)
	sellLevels := make(map[string]decimal.Decimal)
	
	for _, order := range orderBook.BuyOrders {
		rate := order.Rate.String()
		buyLevels[rate] = buyLevels[rate].Add(order.RemainingAmount)
	}
	
	for _, order := range orderBook.SellOrders {
		rate := order.Rate.String()
		sellLevels[rate] = sellLevels[rate].Add(order.RemainingAmount)
	}
	
	return map[string]interface{}{
		"buy_levels":  buyLevels,
		"sell_levels": sellLevels,
		"pair":        fmt.Sprintf("%s_%s", currencyFrom, currencyTo),
	}, nil
}

// createTransactionChatRoom creates a chat room for a P2P transaction
func (e *MatchingEngine) createTransactionChatRoom(orderID, userID, cashierID string) {
	log.Printf("🔄 Creating chat room for transaction %s between user %s and cashier %s", orderID, userID, cashierID)
	
	// Create participants JSON array
	participants, err := json.Marshal([]string{userID, cashierID})
	if err != nil {
		log.Printf("❌ Error marshaling participants: %v", err)
		return
	}
	
	// Create chat room directly in database
	roomID := uuid.New().String()
	_, err = e.db.Exec(`
		INSERT INTO chat_rooms (id, room_type, transaction_id, participants, created_at, last_message_at)
		VALUES ($1, $2, $3, $4, NOW(), NOW())
	`, roomID, "TRANSACTION", orderID, string(participants))
	
	if err != nil {
		log.Printf("❌ Error creating chat room in database: %v", err)
		return
	}
	
	log.Printf("✅ Chat room created successfully for transaction %s", orderID)
}

// convertJSONArrayToPGArray converts a JSON array to PostgreSQL array format
// ["qr", "bank_transfer"] -> {"qr","bank_transfer"}
func convertJSONArrayToPGArray(methods []string) string {
	if len(methods) == 0 {
		return "{}"
	}
	
	pgArray := "{"
	for i, method := range methods {
		if i > 0 {
			pgArray += ","
		}
		pgArray += method
	}
	pgArray += "}"
	
	return pgArray
}

// convertPGArrayToSlice converts PostgreSQL array format to Go slice
// {qr,bank_transfer} -> ["qr", "bank_transfer"]
func convertPGArrayToSlice(pgArray string) []string {
	// Remove braces and split by comma
	if pgArray == "{}" || pgArray == "" {
		return []string{}
	}
	
	// Remove { and }
	content := strings.Trim(pgArray, "{}")
	if content == "" {
		return []string{}
	}
	
	// Split by comma and trim spaces
	parts := strings.Split(content, ",")
	var result []string
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed != "" {
			result = append(result, trimmed)
		}
	}
	
	return result
}