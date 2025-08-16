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
}

func (g *Gateway) setupRoutes() {
    // Health check
    g.router.GET("/health", func(c *gin.Context) {
        c.JSON(200, gin.H{
            "status":  "healthy",
            "service": "gateway",
        })
    })

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
        api.GET("/orders", g.proxyToService("p2p"))
        api.POST("/orders", g.proxyToService("p2p"))
        api.GET("/orders/:id", g.proxyToService("p2p"))
        api.PUT("/orders/:id", g.proxyToService("p2p"))
        api.DELETE("/orders/:id", g.proxyToService("p2p"))
        api.GET("/orderbook", g.proxyToService("p2p"))
        api.POST("/trade", g.proxyToService("p2p"))

        // Wallet routes
        api.GET("/wallets", g.proxyToService("wallet"))
        api.GET("/wallets/:currency", g.proxyToService("wallet"))
        api.POST("/wallets/deposit", g.proxyToService("wallet"))
        api.POST("/wallets/withdraw", g.proxyToService("wallet"))
        api.GET("/transactions", g.proxyToService("wallet"))
        api.GET("/transactions/:id", g.proxyToService("wallet"))
    }
}

func (g *Gateway) proxyToService(serviceName string) gin.HandlerFunc {
    return func(c *gin.Context) {
        serviceURL, exists := g.services[serviceName]
        if !exists {
            c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Service unavailable"})
            return
        }

        // Create reverse proxy
        proxy := httputil.NewSingleHostReverseProxy(serviceURL)
        
        // Modify the request
        proxy.Director = func(req *http.Request) {
            req.URL.Scheme = serviceURL.Scheme
            req.URL.Host = serviceURL.Host
            req.URL.Path = "/api/v1" + strings.TrimPrefix(c.Request.URL.Path, "/api/v1")
            req.Host = serviceURL.Host
            
            // Copy headers
            for key, values := range c.Request.Header {
                for _, value := range values {
                    req.Header.Add(key, value)
                }
            }
        }

        // Handle the request
        proxy.ServeHTTP(c.Writer, c.Request)
    }
}