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

// Placeholder MatchingEngine
type MatchingEngine struct {
    db    *sql.DB
    redis *redis.Client
}

func NewMatchingEngine(db *sql.DB, redis *redis.Client) *MatchingEngine {
    return &MatchingEngine{db: db, redis: redis}
}

func (e *MatchingEngine) Start() {
    log.Println("Matching engine started")
}

func (e *MatchingEngine) AddOrder(order Order) ([]string, error) {
    return []string{}, nil
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
    }
}

func (s *Server) handleGetOrders(c *gin.Context) {
    c.JSON(http.StatusOK, []Order{})
}

func (s *Server) handleCreateOrder(c *gin.Context) {
    var req CreateOrderRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }
    
    c.JSON(http.StatusCreated, gin.H{"message": "Order created", "order": req})
}

func (s *Server) handleGetOrderBook(c *gin.Context) {
    c.JSON(http.StatusOK, gin.H{
        "buy_orders":  []Order{},
        "sell_orders": []Order{},
    })
}

func (s *Server) handleGetRates(c *gin.Context) {
    rates := gin.H{
        "BOB_USD":  0.145,
        "USD_BOB":  6.90,
        "USDT_USD": 1.00,
        "USD_USDT": 1.00,
        "BOB_USDT": 0.145,
        "USDT_BOB": 6.90,
    }
    
    c.JSON(http.StatusOK, rates)
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