// services/bank-listener/main.go
package main

import (
    "log"
    "os"

    "github.com/gin-gonic/gin"
)

func main() {
    router := gin.Default()

    // Health check
    router.GET("/health", func(c *gin.Context) {
        c.JSON(200, gin.H{"status": "healthy", "service": "bank-listener"})
    })

    // Placeholder webhook endpoint
    router.POST("/webhook", func(c *gin.Context) {
        c.JSON(200, gin.H{"message": "Bank webhook received - processing coming soon"})
    })

    port := os.Getenv("PORT")
    if port == "" {
        port = "3004"
    }

    log.Printf("Bank Listener service starting on port %s", port)
    if err := router.Run(":" + port); err != nil {
        log.Fatal("Failed to start server:", err)
    }
}