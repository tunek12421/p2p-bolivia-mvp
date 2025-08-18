package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"sort"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/shopspring/decimal"
)

type MatchingEngine struct {
	db    *sql.DB
	redis *redis.Client
}

type Match struct {
	BuyOrder  Order           `json:"buy_order"`
	SellOrder Order           `json:"sell_order"`
	Amount    decimal.Decimal `json:"amount"`
	Rate      decimal.Decimal `json:"rate"`
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
	log.Println("🚀 Matching engine started - monitoring for new orders")
	
	// Start order book cache refresh
	go e.refreshOrderBookCache()
	
	// Start matching loop
	go e.matchingLoop()
}

func (e *MatchingEngine) AddOrder(order Order) ([]string, error) {
	ctx := context.Background()
	
	// Insert order into database
	query := `
		INSERT INTO orders (id, user_id, order_type, currency_from, currency_to, amount, 
			remaining_amount, rate, min_amount, max_amount, payment_methods, status, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
	`
	
	paymentMethodsJSON, _ := json.Marshal(order.PaymentMethods)
	
	_, err := e.db.Exec(query,
		order.ID, order.UserID, order.Type, order.CurrencyFrom, order.CurrencyTo,
		order.Amount, order.RemainingAmount, order.Rate, order.MinAmount, order.MaxAmount,
		string(paymentMethodsJSON), order.Status, order.CreatedAt,
	)
	
	if err != nil {
		return nil, fmt.Errorf("failed to insert order: %v", err)
	}
	
	// Add to Redis for fast matching
	e.cacheOrder(ctx, order)
	
	// Try to match immediately
	matches := e.findMatches(order)
	var matchIDs []string
	
	for _, match := range matches {
		matchID, err := e.executeMatch(match)
		if err != nil {
			log.Printf("Error executing match: %v", err)
			continue
		}
		matchIDs = append(matchIDs, matchID)
	}
	
	return matchIDs, nil
}

func (e *MatchingEngine) cacheOrder(ctx context.Context, order Order) {
	orderJSON, _ := json.Marshal(order)
	
	// Cache by currency pair and type
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

func (e *MatchingEngine) matchingLoop() {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	
	for range ticker.C {
		e.processActiveOrders()
	}
}

func (e *MatchingEngine) processActiveOrders() {
	query := `
		SELECT id, user_id, order_type, currency_from, currency_to, amount, remaining_amount,
			rate, min_amount, max_amount, payment_methods, status, created_at
		FROM p2p_orders 
		WHERE status = 'ACTIVE' 
		ORDER BY created_at ASC
	`
	
	rows, err := e.db.Query(query)
	if err != nil {
		log.Printf("Error querying active orders: %v", err)
		return
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
	
	// Process matches for each order
	for _, order := range orders {
		matches := e.findMatches(order)
		for _, match := range matches {
			_, err := e.executeMatch(match)
			if err != nil {
				log.Printf("Error executing match: %v", err)
			}
		}
	}
}

func (e *MatchingEngine) GetActiveOrders(userID string) ([]Order, error) {
	query := `
		SELECT id, user_id, order_type, currency_from, currency_to, amount, remaining_amount,
			rate, min_amount, max_amount, payment_methods, status, created_at
		FROM p2p_orders 
		WHERE user_id = $1 AND status IN ('ACTIVE', 'PARTIAL')
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