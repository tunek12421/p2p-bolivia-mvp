// services/dispute/main.go
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

	server := &Server{
		db:     db,
		redis:  redisClient,
		router: gin.Default(),
	}

	server.setupRoutes()

	port := os.Getenv("PORT")
	if port == "" {
		port = "3006"
	}

	log.Printf("Dispute service starting on port %s", port)
	if err := server.router.Run(":" + port); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}

func (s *Server) setupRoutes() {
	s.router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "healthy", "service": "dispute"})
	})

	api := s.router.Group("/api/v1")
	{
		// User routes
		api.POST("/disputes", s.authMiddleware(), s.handleCreateDispute)
		api.GET("/disputes", s.authMiddleware(), s.handleGetMyDisputes)
		api.GET("/disputes/:id", s.authMiddleware(), s.handleGetDispute)
		api.POST("/disputes/:id/evidence", s.authMiddleware(), s.handleSubmitEvidence)
		api.POST("/disputes/:id/messages", s.authMiddleware(), s.handleSendMessage)
		
		// Admin routes
		api.GET("/disputes/pending", s.adminMiddleware(), s.handleGetPendingDisputes)
		api.POST("/disputes/:id/assign", s.adminMiddleware(), s.handleAssignMediator)
		api.POST("/disputes/:id/resolve", s.adminMiddleware(), s.handleResolveDispute)
		api.GET("/disputes/stats", s.adminMiddleware(), s.handleGetStats)
	}
}