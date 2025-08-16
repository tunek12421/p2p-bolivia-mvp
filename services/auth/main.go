// services/auth/main.go
package main

import (
    "database/sql"
    "fmt"
    "log"
    "os"

    "github.com/gin-gonic/gin"
    "github.com/go-redis/redis/v8"
    _ "github.com/lib/pq"
)

type Server struct {
    db     *sql.DB
    redis  *redis.Client
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

    // Redis connection
    redisClient := redis.NewClient(&redis.Options{
        Addr: fmt.Sprintf("%s:%s", os.Getenv("REDIS_HOST"), os.Getenv("REDIS_PORT")),
    })

    // Create server
    server := &Server{
        db:     db,
        redis:  redisClient,
        router: gin.Default(),
    }

    // Setup routes
    server.setupRoutes()

    // Start server
    port := os.Getenv("PORT")
    if port == "" {
        port = "3001"
    }

    log.Printf("Auth service starting on port %s", port)
    if err := server.router.Run(":" + port); err != nil {
        log.Fatal("Failed to start server:", err)
    }
}

func (s *Server) setupRoutes() {
    // Health check
    s.router.GET("/health", func(c *gin.Context) {
        c.JSON(200, gin.H{"status": "healthy", "service": "auth"})
    })

    // Auth routes
    api := s.router.Group("/api/v1")
    {
        api.POST("/register", s.handleRegister)
        api.POST("/login", s.handleLogin)
        api.POST("/refresh", s.handleRefresh)
        api.POST("/logout", s.handleLogout)
        api.POST("/verify-email", s.handleVerifyEmail)
        api.GET("/me", s.authMiddleware(), s.handleGetProfile)
        api.PUT("/profile", s.authMiddleware(), s.handleUpdateProfile)
    }
}