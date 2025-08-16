// services/wallet/main.go
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
        c.JSON(200, gin.H{"status": "healthy", "service": "wallet"})
    })

    // Placeholder routes
    api := router.Group("/api/v1")
    {
        api.GET("/wallets", func(c *gin.Context) {
            c.JSON(200, gin.H{"message": "Wallets endpoint - coming soon"})
        })
        api.GET("/wallets/:currency", func(c *gin.Context) {
            c.JSON(200, gin.H{"message": "Wallet by currency - coming soon"})
        })
        api.GET("/transactions", func(c *gin.Context) {
            c.JSON(200, gin.H{"message": "Transactions endpoint - coming soon"})
        })
    }

    port := os.Getenv("PORT")
    if port == "" {
        port = "3003"
    }

    log.Printf("Wallet service starting on port %s", port)
    if err := router.Run(":" + port); err != nil {
        log.Fatal("Failed to start server:", err)
    }
}