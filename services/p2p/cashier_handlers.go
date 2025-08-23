package main

import (
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
)

// Cashier handlers

// handleGetPendingOrders returns all orders waiting for cashier acceptance
func (s *Server) handleGetPendingOrders(c *gin.Context) {
	orders, err := s.engine.GetPendingOrders()
	if err != nil {
		log.Printf("Error getting pending orders: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get pending orders"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"orders": orders})
}

// handleAcceptOrder allows a cashier to accept a pending order
func (s *Server) handleAcceptOrder(c *gin.Context) {
	orderID := c.Param("id")
	cashierID := c.GetString("user_id")

	if orderID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Order ID is required"})
		return
	}

	err := s.engine.AcceptOrder(orderID, cashierID)
	if err != nil {
		log.Printf("Error accepting order: %v", err)
		
		// Return appropriate status based on error type
		if err.Error() == "order is not available for acceptance" {
			c.JSON(http.StatusConflict, gin.H{"error": "Order is no longer available"})
			return
		}
		if err.Error() == "insufficient cashier balance" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Insufficient balance to accept this order"})
			return
		}
		
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to accept order"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Order accepted successfully"})
}

// handleConfirmPayment allows cashier to confirm payment received
func (s *Server) handleConfirmPayment(c *gin.Context) {
	orderID := c.Param("id")
	cashierID := c.GetString("user_id")

	if orderID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Order ID is required"})
		return
	}

	err := s.engine.ConfirmPayment(orderID, cashierID)
	if err != nil {
		log.Printf("Error confirming payment: %v", err)
		
		if err.Error() == "order not found or not assigned to this cashier" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Order not assigned to you or not found"})
			return
		}
		
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to confirm payment"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Payment confirmed successfully"})
}

// handleGetCashierOrders returns orders assigned to the current cashier
func (s *Server) handleGetCashierOrders(c *gin.Context) {
	cashierID := c.GetString("user_id")
	status := c.Query("status") // Optional: filter by status

	var query string
	var args []interface{}

	if status != "" {
		query = `
			SELECT o.id, o.user_id, o.cashier_id, o.order_type, o.currency_from, o.currency_to, 
				o.amount, o.remaining_amount, o.rate, COALESCE(o.min_amount, 0), COALESCE(o.max_amount, 0), 
				COALESCE(o.payment_methods, '[]'), o.status, o.accepted_at, o.expires_at, o.created_at
			FROM orders o
			WHERE o.cashier_id = $1 AND o.status = $2
			ORDER BY o.created_at DESC
		`
		args = []interface{}{cashierID, status}
	} else {
		query = `
			SELECT o.id, o.user_id, o.cashier_id, o.order_type, o.currency_from, o.currency_to, 
				o.amount, o.remaining_amount, o.rate, COALESCE(o.min_amount, 0), COALESCE(o.max_amount, 0), 
				COALESCE(o.payment_methods, '[]'), o.status, o.accepted_at, o.expires_at, o.created_at
			FROM orders o
			WHERE o.cashier_id = $1
			ORDER BY o.created_at DESC
		`
		args = []interface{}{cashierID}
	}

	rows, err := s.db.Query(query, args...)
	if err != nil {
		log.Printf("Error getting cashier orders: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get orders"})
		return
	}
	defer rows.Close()

	var orders []Order
	for rows.Next() {
		var order Order
		var paymentMethodsJSON string
		var cashierID *string
		var acceptedAt, expiresAt *time.Time

		err := rows.Scan(&order.ID, &order.UserID, &cashierID, &order.Type, 
			&order.CurrencyFrom, &order.CurrencyTo, &order.Amount, &order.RemainingAmount,
			&order.Rate, &order.MinAmount, &order.MaxAmount, &paymentMethodsJSON, 
			&order.Status, &acceptedAt, &expiresAt, &order.CreatedAt)

		if err != nil {
			continue
		}

		order.CashierID = cashierID
		order.AcceptedAt = acceptedAt
		order.ExpiresAt = expiresAt
		
		// Parse payment methods JSON (simplified)
		if paymentMethodsJSON != "" {
			order.PaymentMethods = []string{} // Would need proper JSON unmarshaling
		}

		orders = append(orders, order)
	}

	c.JSON(http.StatusOK, gin.H{"orders": orders})
}

// handleGetCashierMetrics returns performance metrics for the cashier
func (s *Server) handleGetCashierMetrics(c *gin.Context) {
	cashierID := c.GetString("user_id")
	daysStr := c.DefaultQuery("days", "30")
	
	days, err := strconv.Atoi(daysStr)
	if err != nil || days <= 0 {
		days = 30
	}

	// Get basic metrics for the specified period
	query := `
		SELECT 
			COUNT(*) as total_orders,
			COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed_orders,
			COALESCE(SUM(CASE WHEN status = 'COMPLETED' AND currency_from = 'USD' THEN amount ELSE 0 END), 0) as volume_usd,
			COALESCE(SUM(CASE WHEN status = 'COMPLETED' AND currency_from = 'BOB' THEN amount ELSE 0 END), 0) as volume_bob,
			AVG(CASE WHEN status = 'COMPLETED' AND accepted_at IS NOT NULL 
				THEN EXTRACT(EPOCH FROM (updated_at - accepted_at))/60 END) as avg_completion_minutes
		FROM orders 
		WHERE cashier_id = $1 
		AND created_at >= NOW() - INTERVAL '%d days'
	`

	var metrics struct {
		TotalOrders          int             `json:"total_orders"`
		CompletedOrders      int             `json:"completed_orders"`
		VolumeUSD           decimal.Decimal `json:"volume_usd"`
		VolumeBOB           decimal.Decimal `json:"volume_bob"`
		AvgCompletionMinutes *float64        `json:"avg_completion_minutes"`
		CompletionRate       float64         `json:"completion_rate"`
	}

	err = s.db.QueryRow(fmt.Sprintf(query, days), cashierID).Scan(
		&metrics.TotalOrders, &metrics.CompletedOrders, 
		&metrics.VolumeUSD, &metrics.VolumeBOB, &metrics.AvgCompletionMinutes)

	if err != nil {
		log.Printf("Error getting cashier metrics: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get metrics"})
		return
	}

	// Calculate completion rate
	if metrics.TotalOrders > 0 {
		metrics.CompletionRate = float64(metrics.CompletedOrders) / float64(metrics.TotalOrders) * 100
	}

	c.JSON(http.StatusOK, gin.H{"metrics": metrics})
}