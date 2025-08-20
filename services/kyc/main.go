// services/kyc/main.go
package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	_ "github.com/lib/pq"
)

type Server struct {
	db          *sql.DB
	redis       *redis.Client
	router      *gin.Engine
	minioClient *minio.Client
	ocrService  *OCRService
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

	// MinIO client for document storage
	minioClient, err := minio.New("minio:9000", &minio.Options{
		Creds:  credentials.NewStaticV4("minioadmin", "minioadmin", ""),
		Secure: false,
	})
	if err != nil {
		log.Printf("Warning: MinIO connection failed: %v", err)
	}

	// Create server
	server := &Server{
		db:          db,
		redis:       redisClient,
		router:      gin.Default(),
		minioClient: minioClient,
		ocrService:  NewOCRService(),
	}

	// Setup routes
	server.setupRoutes()

	// Start server
	port := os.Getenv("PORT")
	if port == "" {
		port = "3005"
	}

	log.Printf("KYC service starting on port %s", port)
	if err := server.router.Run(":" + port); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}

func (s *Server) setupRoutes() {
	// Health check
	s.router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "healthy", "service": "kyc"})
	})

	// KYC routes
	api := s.router.Group("/api/v1")
	{
		// KYC submission
		api.POST("/kyc/submit", s.authMiddleware(), s.handleSubmitKYC)
		api.GET("/kyc/status", s.authMiddleware(), s.handleGetKYCStatus)
		api.POST("/kyc/upload-document", s.authMiddleware(), s.handleUploadDocument)
		api.POST("/kyc/verify-selfie", s.authMiddleware(), s.handleVerifySelfie)
		
		// Admin routes
		api.GET("/kyc/pending", s.adminMiddleware(), s.handleGetPendingKYC)
		api.POST("/kyc/approve/:id", s.adminMiddleware(), s.handleApproveKYC)
		api.POST("/kyc/reject/:id", s.adminMiddleware(), s.handleRejectKYC)
		
		// Verification levels
		api.GET("/kyc/levels", s.handleGetKYCLevels)
		api.GET("/kyc/requirements/:level", s.handleGetRequirements)
	}
}