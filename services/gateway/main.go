// services/gateway/main.go
package main

import (
    "log"
    "net/http"
    "net/http/httputil"
    "net/url"
    "os"
    "strings"

    "github.com/gin-gonic/gin"
)

type Gateway struct {
    router   *gin.Engine
    services map[string]*url.URL
}

func main() {
    gateway := &Gateway{
        router:   gin.Default(),
        services: make(map[string]*url.URL),
    }

    // Configure service URLs
    gateway.configureServices()

    // Setup routes
    gateway.setupRoutes()

    // Start server
    port := os.Getenv("PORT")
    if port == "" {
        port = "8080"
    }

    log.Printf("API Gateway starting on port %s", port)
    if err := gateway.router.Run(":" + port); err != nil {
        log.Fatal("Failed to start gateway:", err)
    }
}

func (g *Gateway) configureServices() {
    // Auth service
    authURL, _ := url.Parse(os.Getenv("AUTH_SERVICE_URL"))
    if authURL == nil {
        authURL, _ = url.Parse("http://auth:3001")
    }
    g.services["auth"] = authURL

    // P2P service
    p2pURL, _ := url.Parse(os.Getenv("P2P_SERVICE_URL"))
    if p2pURL == nil {
        p2pURL, _ = url.Parse("http://p2p:3002")
    }
    g.services["p2p"] = p2pURL

    // Wallet service
    walletURL, _ := url.Parse(os.Getenv("WALLET_SERVICE_URL"))
    if walletURL == nil {
        walletURL, _ = url.Parse("http://wallet:3003")
    }
    g.services["wallet"] = walletURL

    // KYC service
    kycURL, _ := url.Parse(os.Getenv("KYC_SERVICE_URL"))
    if kycURL == nil {
        kycURL, _ = url.Parse("http://kyc-service:3005")
    }
    g.services["kyc"] = kycURL

    // Dispute service
    disputeURL, _ := url.Parse(os.Getenv("DISPUTE_SERVICE_URL"))
    if disputeURL == nil {
        disputeURL, _ = url.Parse("http://dispute-service:3006")
    }
    g.services["dispute"] = disputeURL

    // Chat service
    chatURL, _ := url.Parse(os.Getenv("CHAT_SERVICE_URL"))
    if chatURL == nil {
        chatURL, _ = url.Parse("http://chat-service:3007")
    }
    g.services["chat"] = chatURL

    // Analytics service
    analyticsURL, _ := url.Parse(os.Getenv("ANALYTICS_SERVICE_URL"))
    if analyticsURL == nil {
        analyticsURL, _ = url.Parse("http://analytics-service:3008")
    }
    g.services["analytics"] = analyticsURL
}

func (g *Gateway) setupRoutes() {
    // CORS middleware
    g.router.Use(func(c *gin.Context) {
        c.Header("Access-Control-Allow-Origin", "*")
        c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        c.Header("Access-Control-Allow-Headers", "Origin, Content-Type, Authorization, X-Requested-With")
        
        if c.Request.Method == "OPTIONS" {
            c.AbortWithStatus(204)
            return
        }
        
        c.Next()
    })

    // Health check
    g.router.GET("/health", func(c *gin.Context) {
        c.JSON(200, gin.H{
            "status":  "healthy",
            "service": "gateway",
        })
    })

    // Serve static files (QR images and uploads)
    g.router.Static("/uploads", "/tmp/uploads")
    g.router.Static("/images", "/tmp/images")

    // API routes
    api := g.router.Group("/api/v1")
    {
        // Auth routes
        api.POST("/register", g.proxyToService("auth"))
        api.POST("/login", g.proxyToService("auth"))
        api.POST("/refresh", g.proxyToService("auth"))
        api.POST("/logout", g.proxyToService("auth"))
        api.POST("/verify-email", g.proxyToService("auth"))
        api.GET("/me", g.proxyToService("auth"))
        api.PUT("/profile", g.proxyToService("auth"))

        // P2P routes
        api.GET("/rates", g.proxyToService("p2p"))
        api.GET("/orders", g.proxyToService("p2p"))
        api.POST("/orders", g.proxyToService("p2p"))
        api.GET("/orders/:id", g.proxyToService("p2p"))
        api.PUT("/orders/:id", g.proxyToService("p2p"))
        api.DELETE("/orders/:id", g.proxyToService("p2p"))
        api.POST("/orders/:id/mark-paid", g.proxyToService("p2p"))
        api.GET("/orderbook", g.proxyToService("p2p"))
        api.POST("/trade", g.proxyToService("p2p"))
        api.GET("/users/:id/stats", g.proxyToService("p2p"))
        
        // User-specific P2P routes
        log.Printf("📋 GATEWAY: Registering user-specific routes")
        api.GET("/user/orders", g.proxyToService("p2p"))
        api.GET("/user/stats", g.proxyToService("p2p"))
        log.Printf("📋 GATEWAY: User-specific routes registered")

        // Cashier P2P routes
        log.Printf("🏦 GATEWAY: Registering cashier routes")
        api.GET("/cashier/pending-orders", g.proxyToService("p2p"))
        api.POST("/cashier/orders/:id/accept", g.proxyToService("p2p"))
        api.POST("/cashier/orders/:id/confirm-payment", g.proxyToService("p2p"))
        api.GET("/cashier/my-orders", g.proxyToService("p2p"))
        api.GET("/cashier/metrics", g.proxyToService("p2p"))
        log.Printf("🏦 GATEWAY: Cashier routes registered")

        // Wallet routes
        api.GET("/wallets", g.proxyToService("wallet"))
        api.GET("/wallets/:currency", g.proxyToService("wallet"))
        api.POST("/deposit", g.proxyToService("wallet"))
        api.GET("/deposit-instructions/:currency", g.proxyToService("wallet"))
        api.GET("/deposit-qr/:currency", g.proxyToService("wallet"))
        api.POST("/withdraw", g.proxyToService("wallet"))
        api.POST("/transfer", g.proxyToService("wallet"))
        api.POST("/convert", g.proxyToService("wallet"))
        api.GET("/transactions", g.proxyToService("wallet"))
        api.GET("/transactions/:id", g.proxyToService("wallet"))
        api.POST("/webhooks/paypal", g.proxyToService("wallet"))
        api.POST("/webhooks/stripe", g.proxyToService("wallet"))
        api.POST("/webhooks/bank", g.proxyToService("wallet"))
        
        // Admin routes
        api.GET("/admin/deposit-qr", g.proxyToService("wallet"))
        api.POST("/admin/deposit-qr", g.proxyToService("wallet"))
        api.DELETE("/admin/deposit-qr/:id", g.proxyToService("wallet"))

        // KYC routes
        api.GET("/kyc/status", g.proxyToService("kyc"))
        api.POST("/kyc/submit", g.proxyToService("kyc"))
        api.POST("/kyc/upload-document", g.proxyToService("kyc"))
        api.POST("/kyc/verify-selfie", g.proxyToService("kyc"))
        api.GET("/kyc/levels", g.proxyToService("kyc"))
        api.GET("/kyc/requirements/:level", g.proxyToService("kyc"))
        // Admin KYC routes
        api.GET("/kyc/pending", g.proxyToService("kyc"))
        api.POST("/kyc/approve/:id", g.proxyToService("kyc"))
        api.POST("/kyc/reject/:id", g.proxyToService("kyc"))

        // Dispute routes
        api.POST("/disputes", g.proxyToService("dispute"))
        api.GET("/disputes", g.proxyToService("dispute"))
        api.GET("/disputes/:id", g.proxyToService("dispute"))
        api.POST("/disputes/:id/evidence", g.proxyToService("dispute"))
        api.POST("/disputes/:id/messages", g.proxyToService("dispute"))
        // Admin dispute routes
        api.GET("/disputes/pending", g.proxyToService("dispute"))
        api.POST("/disputes/:id/assign", g.proxyToService("dispute"))
        api.POST("/disputes/:id/resolve", g.proxyToService("dispute"))
        api.GET("/disputes/stats", g.proxyToService("dispute"))

        // Chat routes
        api.GET("/ws", g.proxyToService("chat"))
        api.POST("/rooms", g.proxyToService("chat"))
        api.GET("/rooms", g.proxyToService("chat"))
        api.GET("/rooms/:id/messages", g.proxyToService("chat"))
        api.POST("/rooms/:id/messages", g.proxyToService("chat"))
        api.POST("/rooms/:id/join", g.proxyToService("chat"))

        // Analytics routes
        api.GET("/analytics/overview", g.proxyToService("analytics"))
        api.GET("/analytics/transactions", g.proxyToService("analytics"))
        api.GET("/analytics/users", g.proxyToService("analytics"))
        api.GET("/analytics/revenue", g.proxyToService("analytics"))
        api.GET("/analytics/kyc", g.proxyToService("analytics"))
        api.GET("/analytics/disputes", g.proxyToService("analytics"))
        api.GET("/reports/daily", g.proxyToService("analytics"))
        api.GET("/reports/monthly", g.proxyToService("analytics"))
        api.GET("/reports/regulatory", g.proxyToService("analytics"))
    }
}

func (g *Gateway) proxyToService(serviceName string) gin.HandlerFunc {
    return func(c *gin.Context) {
        log.Printf("🌐 GATEWAY: Incoming request - Method: %s, Path: %s, Service: %s", 
            c.Request.Method, c.Request.URL.Path, serviceName)
        
        serviceURL, exists := g.services[serviceName]
        if !exists {
            log.Printf("❌ GATEWAY: Service '%s' not found", serviceName)
            c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Service unavailable"})
            return
        }

        log.Printf("🎯 GATEWAY: Routing to service URL: %s", serviceURL.String())

        // Create reverse proxy
        proxy := httputil.NewSingleHostReverseProxy(serviceURL)
        
        // Modify the request
        proxy.Director = func(req *http.Request) {
            originalPath := req.URL.Path
            req.URL.Scheme = serviceURL.Scheme
            req.URL.Host = serviceURL.Host
            req.URL.Path = "/api/v1" + strings.TrimPrefix(c.Request.URL.Path, "/api/v1")
            req.Host = serviceURL.Host
            
            log.Printf("🔀 GATEWAY: Path transformation - Original: %s, New: %s", originalPath, req.URL.Path)
            log.Printf("🔀 GATEWAY: Full target URL: %s", req.URL.String())
            
            // Copy headers
            for key, values := range c.Request.Header {
                for _, value := range values {
                    req.Header.Add(key, value)
                }
            }
            
            log.Printf("🔀 GATEWAY: Headers copied, Authorization: %s", req.Header.Get("Authorization"))
        }

        // Handle the request
        log.Printf("📡 GATEWAY: Proxying request to %s service", serviceName)
        proxy.ServeHTTP(c.Writer, c.Request)
        log.Printf("📡 GATEWAY: Request completed for %s", c.Request.URL.Path)
    }
}