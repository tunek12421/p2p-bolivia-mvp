// services/analytics/main.go
package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	_ "github.com/lib/pq"
)

type Server struct {
	db     *sql.DB
	router *gin.Engine
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

	server := &Server{
		db:     db,
		router: gin.Default(),
	}

	server.setupRoutes()

	port := os.Getenv("PORT")
	if port == "" {
		port = "3008"
	}

	log.Printf("Analytics service starting on port %s", port)
	if err := server.router.Run(":" + port); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}

func (s *Server) setupRoutes() {
	s.router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "healthy", "service": "analytics"})
	})

	api := s.router.Group("/api/v1")
	{
		// Dashboard endpoints
		api.GET("/analytics/overview", s.adminMiddleware(), s.handleGetOverview)
		api.GET("/analytics/transactions", s.adminMiddleware(), s.handleGetTransactionStats)
		api.GET("/analytics/users", s.adminMiddleware(), s.handleGetUserStats)
		api.GET("/analytics/revenue", s.adminMiddleware(), s.handleGetRevenueStats)
		api.GET("/analytics/kyc", s.adminMiddleware(), s.handleGetKYCStats)
		api.GET("/analytics/disputes", s.adminMiddleware(), s.handleGetDisputeStats)
		
		// Reports
		api.GET("/reports/daily", s.adminMiddleware(), s.handleDailyReport)
		api.GET("/reports/monthly", s.adminMiddleware(), s.handleMonthlyReport)
		api.GET("/reports/regulatory", s.adminMiddleware(), s.handleRegulatoryReport)
	}
}

func (s *Server) handleGetOverview(c *gin.Context) {
	overview := make(map[string]interface{})
	
	// Total users
	var totalUsers int
	s.db.QueryRow("SELECT COUNT(*) FROM users").Scan(&totalUsers)
	overview["total_users"] = totalUsers
	
	// Active users (last 30 days)
	var activeUsers int
	s.db.QueryRow(`
		SELECT COUNT(DISTINCT from_user_id) 
		FROM transactions 
		WHERE created_at > NOW() - INTERVAL '30 days'
	`).Scan(&activeUsers)
	overview["active_users"] = activeUsers
	
	// Total volume (last 30 days)
	var totalVolume float64
	s.db.QueryRow(`
		SELECT COALESCE(SUM(amount), 0)
		FROM transactions
		WHERE status = 'COMPLETED'
		AND created_at > NOW() - INTERVAL '30 days'
	`).Scan(&totalVolume)
	overview["total_volume_30d"] = totalVolume
	
	// Total transactions
	var totalTransactions int
	s.db.QueryRow(`
		SELECT COUNT(*) FROM transactions
		WHERE status = 'COMPLETED'
	`).Scan(&totalTransactions)
	overview["total_transactions"] = totalTransactions
	
	// Average transaction size
	var avgTransactionSize float64
	s.db.QueryRow(`
		SELECT COALESCE(AVG(amount), 0)
		FROM transactions
		WHERE status = 'COMPLETED'
	`).Scan(&avgTransactionSize)
	overview["avg_transaction_size"] = avgTransactionSize
	
	// P2P orders
	var activeOrders int
	s.db.QueryRow(`
		SELECT COUNT(*) FROM p2p_orders
		WHERE status IN ('ACTIVE', 'PARTIALLY_FILLED')
	`).Scan(&activeOrders)
	overview["active_orders"] = activeOrders
	
	c.JSON(200, overview)
}

func (s *Server) handleGetTransactionStats(c *gin.Context) {
	period := c.DefaultQuery("period", "7d")
	
	var interval string
	switch period {
	case "24h":
		interval = "hour"
	case "7d":
		interval = "day"
	case "30d":
		interval = "day"
	case "1y":
		interval = "month"
	default:
		interval = "day"
	}
	
	rows, err := s.db.Query(`
		SELECT 
			date_trunc($1, created_at) as period,
			COUNT(*) as count,
			SUM(amount) as volume,
			AVG(amount) as avg_amount
		FROM transactions
		WHERE status = 'COMPLETED'
		AND created_at > NOW() - INTERVAL '` + period + `'
		GROUP BY date_trunc($1, created_at)
		ORDER BY period ASC
	`, interval)
	
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to fetch transaction stats"})
		return
	}
	defer rows.Close()
	
	var stats []map[string]interface{}
	for rows.Next() {
		var period time.Time
		var count int
		var volume, avgAmount float64
		
		if err := rows.Scan(&period, &count, &volume, &avgAmount); err == nil {
			stats = append(stats, map[string]interface{}{
				"period":     period,
				"count":      count,
				"volume":     volume,
				"avg_amount": avgAmount,
			})
		}
	}
	
	c.JSON(200, gin.H{"transaction_stats": stats})
}

func (s *Server) handleGetUserStats(c *gin.Context) {
	stats := make(map[string]interface{})
	
	// User growth
	rows, err := s.db.Query(`
		SELECT 
			date_trunc('day', created_at) as day,
			COUNT(*) as new_users
		FROM users
		WHERE created_at > NOW() - INTERVAL '30 days'
		GROUP BY day
		ORDER BY day ASC
	`)
	
	if err == nil {
		defer rows.Close()
		var growth []map[string]interface{}
		for rows.Next() {
			var day time.Time
			var count int
			if err := rows.Scan(&day, &count); err == nil {
				growth = append(growth, map[string]interface{}{
					"date":      day,
					"new_users": count,
				})
			}
		}
		stats["user_growth"] = growth
	}
	
	// KYC levels distribution
	rows, err = s.db.Query(`
		SELECT COALESCE(kyc_level, 0), COUNT(*) as count
		FROM users
		GROUP BY kyc_level
		ORDER BY kyc_level
	`)
	
	if err == nil {
		defer rows.Close()
		var kycDist []map[string]interface{}
		for rows.Next() {
			var level, count int
			if err := rows.Scan(&level, &count); err == nil {
				kycDist = append(kycDist, map[string]interface{}{
					"level": level,
					"count": count,
				})
			}
		}
		stats["kyc_distribution"] = kycDist
	}
	
	c.JSON(200, stats)
}

func (s *Server) handleGetRevenueStats(c *gin.Context) {
	revenue := make(map[string]interface{})
	
	// Total fees collected
	var totalFees float64
	s.db.QueryRow(`
		SELECT COALESCE(SUM(fee), 0)
		FROM transactions
		WHERE status = 'COMPLETED'
	`).Scan(&totalFees)
	revenue["total_fees"] = totalFees
	
	// Monthly revenue
	rows, err := s.db.Query(`
		SELECT 
			date_trunc('month', created_at) as month,
			SUM(COALESCE(fee, 0)) as revenue
		FROM transactions
		WHERE status = 'COMPLETED'
		AND created_at > NOW() - INTERVAL '12 months'
		GROUP BY month
		ORDER BY month ASC
	`)
	
	if err == nil {
		defer rows.Close()
		var monthly []map[string]interface{}
		for rows.Next() {
			var month time.Time
			var amount float64
			if err := rows.Scan(&month, &amount); err == nil {
				monthly = append(monthly, map[string]interface{}{
					"month":   month,
					"revenue": amount,
				})
			}
		}
		revenue["monthly_revenue"] = monthly
	}
	
	c.JSON(200, revenue)
}

func (s *Server) handleGetKYCStats(c *gin.Context) {
	stats := make(map[string]interface{})
	
	// KYC submissions by status
	rows, err := s.db.Query(`
		SELECT status, COUNT(*) as count
		FROM kyc_submissions
		GROUP BY status
	`)
	
	if err == nil {
		defer rows.Close()
		statusDist := make(map[string]int)
		for rows.Next() {
			var status string
			var count int
			if err := rows.Scan(&status, &count); err == nil {
				statusDist[status] = count
			}
		}
		stats["status_distribution"] = statusDist
	}
	
	// Average processing time
	var avgProcessingTime float64
	s.db.QueryRow(`
		SELECT AVG(EXTRACT(EPOCH FROM (reviewed_at - submitted_at))/3600)
		FROM kyc_submissions
		WHERE status IN ('APPROVED', 'REJECTED')
	`).Scan(&avgProcessingTime)
	stats["avg_processing_hours"] = avgProcessingTime
	
	// Approval rate
	var totalSubmissions, approvedSubmissions int
	s.db.QueryRow(`
		SELECT 
			COUNT(*) as total,
			COUNT(CASE WHEN status = 'APPROVED' THEN 1 END) as approved
		FROM kyc_submissions
		WHERE status IN ('APPROVED', 'REJECTED')
	`).Scan(&totalSubmissions, &approvedSubmissions)
	
	if totalSubmissions > 0 {
		stats["approval_rate"] = float64(approvedSubmissions) / float64(totalSubmissions) * 100
	}
	
	c.JSON(200, stats)
}

func (s *Server) handleGetDisputeStats(c *gin.Context) {
	stats := make(map[string]interface{})
	
	// Disputes by status
	rows, err := s.db.Query(`
		SELECT status, COUNT(*) as count
		FROM disputes
		GROUP BY status
	`)
	
	if err == nil {
		defer rows.Close()
		statusDist := make(map[string]int)
		for rows.Next() {
			var status string
			var count int
			if err := rows.Scan(&status, &count); err == nil {
				statusDist[status] = count
			}
		}
		stats["status_distribution"] = statusDist
	}
	
	// Average resolution time
	var avgResolutionTime float64
	s.db.QueryRow(`
		SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600)
		FROM disputes
		WHERE status = 'RESOLVED'
	`).Scan(&avgResolutionTime)
	stats["avg_resolution_hours"] = avgResolutionTime
	
	// Resolution rate
	var totalDisputes, resolvedDisputes int
	s.db.QueryRow(`
		SELECT 
			COUNT(*) as total,
			COUNT(CASE WHEN status = 'RESOLVED' THEN 1 END) as resolved
		FROM disputes
	`).Scan(&totalDisputes, &resolvedDisputes)
	
	if totalDisputes > 0 {
		stats["resolution_rate"] = float64(resolvedDisputes) / float64(totalDisputes) * 100
	}
	
	c.JSON(200, stats)
}

func (s *Server) handleDailyReport(c *gin.Context) {
	date := c.DefaultQuery("date", time.Now().Format("2006-01-02"))
	
	report := make(map[string]interface{})
	report["date"] = date
	
	// Daily transactions
	var dailyTransactions int
	var dailyVolume float64
	s.db.QueryRow(`
		SELECT COUNT(*), COALESCE(SUM(amount), 0)
		FROM transactions
		WHERE DATE(created_at) = $1 AND status = 'COMPLETED'
	`, date).Scan(&dailyTransactions, &dailyVolume)
	
	report["transactions"] = dailyTransactions
	report["volume"] = dailyVolume
	
	// Daily registrations
	var dailyRegistrations int
	s.db.QueryRow(`
		SELECT COUNT(*) FROM users WHERE DATE(created_at) = $1
	`, date).Scan(&dailyRegistrations)
	report["new_users"] = dailyRegistrations
	
	c.JSON(200, report)
}

func (s *Server) handleMonthlyReport(c *gin.Context) {
	month := c.DefaultQuery("month", time.Now().Format("2006-01"))
	
	report := make(map[string]interface{})
	report["month"] = month
	
	// Monthly stats
	var monthlyTransactions int
	var monthlyVolume, monthlyFees float64
	s.db.QueryRow(`
		SELECT COUNT(*), COALESCE(SUM(amount), 0), COALESCE(SUM(fee), 0)
		FROM transactions
		WHERE DATE_TRUNC('month', created_at) = $1 || '-01'
		AND status = 'COMPLETED'
	`, month).Scan(&monthlyTransactions, &monthlyVolume, &monthlyFees)
	
	report["transactions"] = monthlyTransactions
	report["volume"] = monthlyVolume
	report["fees_collected"] = monthlyFees
	
	c.JSON(200, report)
}

func (s *Server) handleRegulatoryReport(c *gin.Context) {
	// This would generate reports required by ASFI/UIF in Bolivia
	report := make(map[string]interface{})
	
	// High value transactions (>10,000 BOB)
	var highValueTransactions int
	s.db.QueryRow(`
		SELECT COUNT(*) FROM transactions
		WHERE amount > 10000 AND status = 'COMPLETED'
		AND created_at > NOW() - INTERVAL '30 days'
	`).Scan(&highValueTransactions)
	report["high_value_transactions"] = highValueTransactions
	
	// Suspicious activity indicators
	var suspiciousActivity int
	s.db.QueryRow(`
		SELECT COUNT(DISTINCT from_user_id) FROM transactions
		WHERE amount > 50000 AND status = 'COMPLETED'
		AND created_at > NOW() - INTERVAL '7 days'
	`).Scan(&suspiciousActivity)
	report["suspicious_activity_users"] = suspiciousActivity
	
	// KYC compliance
	var kycCompliant, totalUsers int
	s.db.QueryRow(`
		SELECT 
			COUNT(CASE WHEN kyc_level >= 1 THEN 1 END),
			COUNT(*)
		FROM users
	`).Scan(&kycCompliant, &totalUsers)
	
	if totalUsers > 0 {
		report["kyc_compliance_rate"] = float64(kycCompliant) / float64(totalUsers) * 100
	}
	
	c.JSON(200, report)
}