package main

import (
    "database/sql"
    "fmt"
    "log"
    "net/http"
    "os"
    "strings"
    "time"

    "github.com/gin-gonic/gin"
    "github.com/go-redis/redis/v8"
    "github.com/golang-jwt/jwt/v5"
    "github.com/shopspring/decimal"
    _ "github.com/lib/pq"
    "github.com/streadway/amqp"
)

type Server struct {
    db       *sql.DB
    redis    *redis.Client
    rabbit   *amqp.Connection
    router   *gin.Engine
    engine   *MatchingEngine
}

type Order struct {
    ID             string          `json:"id"`
    UserID         string          `json:"user_id"`
    CashierID      *string         `json:"cashier_id,omitempty"` // Cashier who accepted the order
    Type           string          `json:"type"` // BUY or SELL
    CurrencyFrom   string          `json:"currency_from"`
    CurrencyTo     string          `json:"currency_to"`
    Amount         decimal.Decimal `json:"amount"`
    RemainingAmount decimal.Decimal `json:"remaining_amount"`
    Rate           decimal.Decimal `json:"rate"`
    MinAmount      decimal.Decimal `json:"min_amount"`
    MaxAmount      decimal.Decimal `json:"max_amount"`
    PaymentMethods []string        `json:"payment_methods"`
    Status         string          `json:"status"`
    AcceptedAt     *time.Time      `json:"accepted_at,omitempty"`
    ExpiresAt      *time.Time      `json:"expires_at,omitempty"`
    CreatedAt      time.Time       `json:"created_at"`
}

type CreateOrderRequest struct {
    Type           string   `json:"type" binding:"required,oneof=BUY SELL"`
    CurrencyFrom   string   `json:"currency_from" binding:"required"`
    CurrencyTo     string   `json:"currency_to" binding:"required"`
    Amount         float64  `json:"amount" binding:"required,gt=0"`
    Rate           float64  `json:"rate" binding:"required,gt=0"`
    MinAmount      float64  `json:"min_amount"`
    MaxAmount      float64  `json:"max_amount"`
    PaymentMethods []string `json:"payment_methods" binding:"required,min=1"`
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

    // Redis connection
    redisClient := redis.NewClient(&redis.Options{
        Addr: fmt.Sprintf("%s:%s", os.Getenv("REDIS_HOST"), os.Getenv("REDIS_PORT")),
    })

    // RabbitMQ connection
    rabbitURL := os.Getenv("RABBITMQ_URL")
    if rabbitURL == "" {
        rabbitURL = "amqp://admin:admin@rabbitmq:5672"
    }
    
    rabbitConn, err := amqp.Dial(rabbitURL)
    if err != nil {
        log.Printf("Warning: RabbitMQ connection failed: %v", err)
    }

    // Create server
    server := &Server{
        db:     db,
        redis:  redisClient,
        rabbit: rabbitConn,
        router: gin.Default(),
    }

    // Initialize matching engine
    server.engine = NewMatchingEngine(db, redisClient)
    go server.engine.Start()

    // Setup routes
    server.setupRoutes()

    // Start server
    port := os.Getenv("PORT")
    if port == "" {
        port = "3002"
    }

    log.Printf("P2P service starting on port %s", port)
    if err := server.router.Run(":" + port); err != nil {
        log.Fatal("Failed to start server:", err)
    }
}

func (s *Server) setupRoutes() {
    // Health check
    s.router.GET("/health", func(c *gin.Context) {
        c.JSON(200, gin.H{"status": "healthy", "service": "p2p"})
    })

    // P2P routes
    api := s.router.Group("/api/v1")
    {
        // Order management
        api.GET("/orders", s.handleGetOrders)
        api.POST("/orders", s.authMiddleware(), s.handleCreateOrder)
        api.GET("/orderbook", s.handleGetOrderBook)
        api.GET("/rates", s.handleGetRates)
        
        // User-specific routes (protected)
        api.GET("/user/orders", s.authMiddleware(), s.handleGetUserOrders)
        api.DELETE("/orders/:id", s.authMiddleware(), s.handleCancelOrder)
        api.GET("/orders/:id", s.authMiddleware(), s.handleGetOrderDetails)
        api.POST("/orders/:id/mark-paid", s.authMiddleware(), s.handleMarkAsPaid)
        api.GET("/user/matches", s.authMiddleware(), s.handleGetMatches)
        api.GET("/user/history", s.authMiddleware(), s.handleGetOrderHistory)
        api.GET("/user/stats", s.authMiddleware(), s.handleGetTradingStats)
        
        // Market data
        api.GET("/market/depth", s.handleGetMarketDepth)
    }

    // Cashier routes
    cashier := api.Group("/cashier").Use(s.authMiddleware(), s.cashierMiddleware())
    {
        cashier.GET("/pending-orders", s.handleGetPendingOrders)
        cashier.POST("/orders/:id/accept", s.handleAcceptOrder)
        cashier.POST("/orders/:id/confirm-payment", s.handleConfirmPayment)
        cashier.GET("/my-orders", s.handleGetCashierOrders)
        cashier.GET("/metrics", s.handleGetCashierMetrics)
    }
}


func (s *Server) authMiddleware() gin.HandlerFunc {
    return func(c *gin.Context) {
        authHeader := c.GetHeader("Authorization")
        if authHeader == "" {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization required"})
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
        }
    }
}

func (s *Server) cashierMiddleware() gin.HandlerFunc {
    return func(c *gin.Context) {
        userID := c.GetString("user_id")
        if userID == "" {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
            c.Abort()
            return
        }
        
        // Check if user is a verified cashier
        var isCashier bool
        err := s.db.QueryRow("SELECT is_cashier FROM users WHERE id = $1", userID).Scan(&isCashier)
        if err != nil || !isCashier {
            c.JSON(http.StatusForbidden, gin.H{"error": "Only verified cashiers can access this endpoint"})
            c.Abort()
            return
        }
        
        c.Next()
    }
}