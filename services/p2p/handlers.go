package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
)

type OrderResponse struct {
	ID             string                 `json:"id"`
	UserID         string                 `json:"user_id"`
	Type           string                 `json:"type"`
	CurrencyFrom   string                 `json:"currency_from"`
	CurrencyTo     string                 `json:"currency_to"`
	Amount         decimal.Decimal        `json:"amount"`
	RemainingAmount decimal.Decimal       `json:"remaining_amount"`
	Rate           decimal.Decimal        `json:"rate"`
	MinAmount      decimal.Decimal        `json:"min_amount"`
	MaxAmount      decimal.Decimal        `json:"max_amount"`
	PaymentMethods []string               `json:"payment_methods"`
	Status         string                 `json:"status"`
	CreatedAt      time.Time              `json:"created_at"`
	Matches        []string               `json:"matches,omitempty"`
}

func (s *Server) handleGetOrders(c *gin.Context) {
	// Get query parameters
	currencyFrom := c.Query("currency_from")
	currencyTo := c.Query("currency_to")
	orderType := c.Query("type")
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
		SELECT id, user_id, order_type, currency_from, currency_to, amount, remaining_amount,
			rate, min_amount, max_amount, payment_methods, status, created_at
		FROM p2p_orders
		WHERE status IN ('MATCHED', 'PROCESSING')
	`
	
	if currencyFrom != "" {
		conditions = append(conditions, fmt.Sprintf("currency_from = $%d", argIndex))
		args = append(args, currencyFrom)
		argIndex++
	}
	
	if currencyTo != "" {
		conditions = append(conditions, fmt.Sprintf("currency_to = $%d", argIndex))
		args = append(args, currencyTo)
		argIndex++
	}
	
	if orderType != "" {
		conditions = append(conditions, fmt.Sprintf("order_type = $%d", argIndex))
		args = append(args, orderType)
		argIndex++
	}
	
	if status != "" && (status == "MATCHED" || status == "PROCESSING") {
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch orders"})
		return
	}
	defer rows.Close()
	
	var orders []OrderResponse
	for rows.Next() {
		var order OrderResponse
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
	
	c.JSON(http.StatusOK, gin.H{
		"orders": orders,
		"total":  len(orders),
		"limit":  limitInt,
		"offset": offsetInt,
	})
}

func (s *Server) handleCreateOrder(c *gin.Context) {
	var req CreateOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	userID := c.GetString("user_id")
	
	// Convert to decimals
	amount := decimal.NewFromFloat(req.Amount)
	rate := decimal.NewFromFloat(req.Rate)
	minAmount := decimal.NewFromFloat(req.MinAmount)
	maxAmount := decimal.NewFromFloat(req.MaxAmount)
	
	// Validate amounts
	if minAmount.GreaterThan(amount) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "min_amount cannot be greater than amount"})
		return
	}
	
	if maxAmount.LessThan(amount) && !maxAmount.IsZero() {
		c.JSON(http.StatusBadRequest, gin.H{"error": "max_amount cannot be less than amount"})
		return
	}
	
	// Create order
	order := Order{
		ID:              fmt.Sprintf("order_%d", time.Now().UnixNano()),
		UserID:          userID,
		Type:            req.Type,
		CurrencyFrom:    req.CurrencyFrom,
		CurrencyTo:      req.CurrencyTo,
		Amount:          amount,
		RemainingAmount: amount,
		Rate:            rate,
		MinAmount:       minAmount,
		MaxAmount:       maxAmount,
		PaymentMethods:  req.PaymentMethods,
		Status:          "ACTIVE",
		CreatedAt:       time.Now(),
	}
	
	// Set expiration time (24 hours from now)
	expiresAt := time.Now().Add(24 * time.Hour)
	order.ExpiresAt = &expiresAt
	
	// Add to matching engine (no automatic matching)
	orderID, err := s.engine.AddOrder(order)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create order"})
		return
	}
	
	response := OrderResponse{
		ID:              orderID,
		UserID:          order.UserID,
		Type:            order.Type,
		CurrencyFrom:    order.CurrencyFrom,
		CurrencyTo:      order.CurrencyTo,
		Amount:          order.Amount,
		RemainingAmount: order.RemainingAmount,
		Rate:            order.Rate,
		MinAmount:       order.MinAmount,
		MaxAmount:       order.MaxAmount,
		PaymentMethods:  order.PaymentMethods,
		Status:          "PENDING", // Orders start as PENDING, waiting for cashier
		CreatedAt:       order.CreatedAt,
	}
	
	c.JSON(http.StatusCreated, gin.H{
		"message": "Order created successfully - waiting for cashier acceptance",
		"order":   response,
	})
}

func (s *Server) handleGetOrderBook(c *gin.Context) {
	currencyFrom := c.Query("currency_from")
	currencyTo := c.Query("currency_to")
	
	if currencyFrom == "" || currencyTo == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "currency_from and currency_to are required"})
		return
	}
	
	orderBook, err := s.engine.GetOrderBook(currencyFrom, currencyTo)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch order book"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"pair":        fmt.Sprintf("%s_%s", currencyFrom, currencyTo),
		"buy_orders":  orderBook.BuyOrders,
		"sell_orders": orderBook.SellOrders,
		"updated_at":  time.Now(),
	})
}

func (s *Server) handleGetRates(c *gin.Context) {
	// Get real-time rates from order book
	pairs := [][]string{
		{"USD", "BOB"},
		{"BOB", "USD"},
		{"USDT", "BOB"},
		{"BOB", "USDT"},
		{"USD", "USDT"},
		{"USDT", "USD"},
	}
	
	rates := make(map[string]interface{})
	
	for _, pair := range pairs {
		currencyFrom, currencyTo := pair[0], pair[1]
		orderBook, err := s.engine.GetOrderBook(currencyFrom, currencyTo)
		if err != nil {
			continue
		}
		
		pairKey := fmt.Sprintf("%s_%s", currencyFrom, currencyTo)
		
		var bestBuyRate, bestSellRate decimal.Decimal
		
		// Find best rates
		if len(orderBook.BuyOrders) > 0 {
			bestBuyRate = orderBook.BuyOrders[0].Rate
			for _, order := range orderBook.BuyOrders {
				if order.Rate.GreaterThan(bestBuyRate) {
					bestBuyRate = order.Rate
				}
			}
		}
		
		if len(orderBook.SellOrders) > 0 {
			bestSellRate = orderBook.SellOrders[0].Rate
			for _, order := range orderBook.SellOrders {
				if order.Rate.LessThan(bestSellRate) {
					bestSellRate = order.Rate
				}
			}
		}
		
		rateInfo := gin.H{
			"best_buy":    bestBuyRate,
			"best_sell":   bestSellRate,
			"last_update": time.Now(),
		}
		
		// Add spread calculation
		if !bestBuyRate.IsZero() && !bestSellRate.IsZero() {
			spread := bestSellRate.Sub(bestBuyRate).Div(bestSellRate).Mul(decimal.NewFromInt(100))
			rateInfo["spread_percent"] = spread
		}
		
		rates[pairKey] = rateInfo
	}
	
	// Add fallback rates if no orders exist
	if len(rates) == 0 {
		rates = gin.H{
			"BOB_USD":  gin.H{"best_buy": 0.145, "best_sell": 0.146, "spread_percent": 0.68},
			"USD_BOB":  gin.H{"best_buy": 6.84, "best_sell": 6.90, "spread_percent": 0.87},
			"USDT_USD": gin.H{"best_buy": 0.999, "best_sell": 1.001, "spread_percent": 0.20},
			"USD_USDT": gin.H{"best_buy": 0.999, "best_sell": 1.001, "spread_percent": 0.20},
			"BOB_USDT": gin.H{"best_buy": 0.144, "best_sell": 0.146, "spread_percent": 1.37},
			"USDT_BOB": gin.H{"best_buy": 6.84, "best_sell": 6.94, "spread_percent": 1.44},
		}
	}
	
	c.JSON(http.StatusOK, rates)
}

func (s *Server) handleGetUserOrders(c *gin.Context) {
	userID := c.GetString("user_id")
	
	orders, err := s.engine.GetActiveOrders(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch user orders"})
		return
	}
	
	var responses []OrderResponse
	for _, order := range orders {
		response := OrderResponse{
			ID:              order.ID,
			UserID:          order.UserID,
			Type:            order.Type,
			CurrencyFrom:    order.CurrencyFrom,
			CurrencyTo:      order.CurrencyTo,
			Amount:          order.Amount,
			RemainingAmount: order.RemainingAmount,
			Rate:            order.Rate,
			MinAmount:       order.MinAmount,
			MaxAmount:       order.MaxAmount,
			PaymentMethods:  order.PaymentMethods,
			Status:          order.Status,
			CreatedAt:       order.CreatedAt,
		}
		responses = append(responses, response)
	}
	
	c.JSON(http.StatusOK, gin.H{
		"orders": responses,
		"total":  len(responses),
	})
}

func (s *Server) handleCancelOrder(c *gin.Context) {
	orderID := c.Param("id")
	userID := c.GetString("user_id")
	
	err := s.engine.CancelOrder(orderID, userID)
	if err != nil {
		if err.Error() == "unauthorized" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Not authorized to cancel this order"})
			return
		}
		if err.Error() == "order not found" {
			c.JSON(http.StatusNotFound, gin.H{"error": "Order not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to cancel order"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{"message": "Order cancelled successfully"})
}

func (s *Server) handleGetMarketDepth(c *gin.Context) {
	currencyFrom := c.Query("currency_from")
	currencyTo := c.Query("currency_to")
	
	if currencyFrom == "" || currencyTo == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "currency_from and currency_to are required"})
		return
	}
	
	depth, err := s.engine.GetMarketDepth(currencyFrom, currencyTo)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch market depth"})
		return
	}
	
	c.JSON(http.StatusOK, depth)
}

func (s *Server) handleGetMatches(c *gin.Context) {
	userID := c.GetString("user_id")
	limit := c.DefaultQuery("limit", "20")
	offset := c.DefaultQuery("offset", "0")
	
	limitInt, _ := strconv.Atoi(limit)
	offsetInt, _ := strconv.Atoi(offset)
	
	// Get user's matches
	query := `
		SELECT m.id, m.buy_order_id, m.sell_order_id, m.amount, m.rate, m.created_at,
			   bo.user_id as buy_user_id, so.user_id as sell_user_id,
			   bo.currency_from, bo.currency_to
		FROM matches m
		JOIN orders bo ON m.buy_order_id = bo.id
		JOIN orders so ON m.sell_order_id = so.id
		WHERE bo.user_id = $1 OR so.user_id = $1
		ORDER BY m.created_at DESC
		LIMIT $2 OFFSET $3
	`
	
	rows, err := s.db.Query(query, userID, limitInt, offsetInt)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch matches"})
		return
	}
	defer rows.Close()
	
	var matches []gin.H
	for rows.Next() {
		var matchID, buyOrderID, sellOrderID, buyUserID, sellUserID, currencyFrom, currencyTo string
		var amount, rate decimal.Decimal
		var createdAt time.Time
		
		err := rows.Scan(&matchID, &buyOrderID, &sellOrderID, &amount, &rate, &createdAt,
			&buyUserID, &sellUserID, &currencyFrom, &currencyTo)
		
		if err != nil {
			continue
		}
		
		userRole := "buyer"
		if sellUserID == userID {
			userRole = "seller"
		}
		
		match := gin.H{
			"id":             matchID,
			"buy_order_id":   buyOrderID,
			"sell_order_id":  sellOrderID,
			"amount":         amount,
			"rate":           rate,
			"currency_from":  currencyFrom,
			"currency_to":    currencyTo,
			"user_role":      userRole,
			"matched_at":     createdAt,
		}
		
		matches = append(matches, match)
	}
	
	c.JSON(http.StatusOK, gin.H{
		"matches": matches,
		"total":   len(matches),
		"limit":   limitInt,
		"offset":  offsetInt,
	})
}

func (s *Server) handleGetOrderHistory(c *gin.Context) {
	userID := c.GetString("user_id")
	status := c.Query("status") // FILLED, CANCELLED, ALL
	limit := c.DefaultQuery("limit", "50")
	offset := c.DefaultQuery("offset", "0")
	
	limitInt, _ := strconv.Atoi(limit)
	offsetInt, _ := strconv.Atoi(offset)
	
	query := `
		SELECT id, user_id, order_type, currency_from, currency_to, amount, remaining_amount,
			rate, min_amount, max_amount, payment_methods, status, created_at
		FROM p2p_orders
		WHERE user_id = $1
	`
	
	args := []interface{}{userID}
	argIndex := 2
	
	if status != "" && status != "ALL" {
		query += fmt.Sprintf(" AND status = $%d", argIndex)
		args = append(args, status)
		argIndex++
	}
	
	query += fmt.Sprintf(" ORDER BY created_at DESC LIMIT $%d OFFSET $%d", argIndex, argIndex+1)
	args = append(args, limitInt, offsetInt)
	
	rows, err := s.db.Query(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch order history"})
		return
	}
	defer rows.Close()
	
	var orders []OrderResponse
	for rows.Next() {
		var order OrderResponse
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
	
	c.JSON(http.StatusOK, gin.H{
		"orders": orders,
		"total":  len(orders),
		"limit":  limitInt,
		"offset": offsetInt,
	})
}

func (s *Server) handleGetTradingStats(c *gin.Context) {
	userID := c.GetString("user_id")
	
	// Get basic stats
	var totalOrders, activeOrders, filledOrders, cancelledOrders int
	var totalVolume decimal.Decimal
	
	s.db.QueryRow("SELECT COUNT(*) FROM p2p_orders WHERE user_id = $1", userID).Scan(&totalOrders)
	s.db.QueryRow("SELECT COUNT(*) FROM p2p_orders WHERE user_id = $1 AND status = 'ACTIVE'", userID).Scan(&activeOrders)
	s.db.QueryRow("SELECT COUNT(*) FROM p2p_orders WHERE user_id = $1 AND status = 'FILLED'", userID).Scan(&filledOrders)
	s.db.QueryRow("SELECT COUNT(*) FROM p2p_orders WHERE user_id = $1 AND status = 'CANCELLED'", userID).Scan(&cancelledOrders)
	
	s.db.QueryRow(`
		SELECT COALESCE(SUM(amount - remaining_amount), 0) 
		FROM p2p_orders 
		WHERE user_id = $1 AND status IN ('FILLED', 'PARTIAL')
	`, userID).Scan(&totalVolume)
	
	stats := gin.H{
		"total_orders":     totalOrders,
		"active_orders":    activeOrders,
		"filled_orders":    filledOrders,
		"cancelled_orders": cancelledOrders,
		"total_volume":     totalVolume,
		"success_rate":     0.0,
	}
	
	if totalOrders > 0 {
		successRate := float64(filledOrders) / float64(totalOrders) * 100
		stats["success_rate"] = successRate
	}
	
	c.JSON(http.StatusOK, stats)
}