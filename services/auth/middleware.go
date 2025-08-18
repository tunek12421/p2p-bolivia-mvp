// services/auth/middleware.go
package main

import (
    "context"
    "log"
    "net/http"
    "os"
    "strings"

    "github.com/gin-gonic/gin"
    "github.com/golang-jwt/jwt/v5"
)

func (s *Server) authMiddleware() gin.HandlerFunc {
    return func(c *gin.Context) {
        log.Printf("DEBUG: Auth middleware called for %s", c.Request.URL.Path)
        
        // Get token from header
        authHeader := c.GetHeader("Authorization")
        log.Printf("DEBUG: Authorization header: '%s'", authHeader)
        
        if authHeader == "" {
            log.Printf("DEBUG: No authorization header")
            c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header required"})
            c.Abort()
            return
        }

        // Extract token
        tokenString := strings.TrimPrefix(authHeader, "Bearer ")
        if tokenString == authHeader {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid authorization format"})
            c.Abort()
            return
        }

        // Check if token is blacklisted
        ctx := context.Background()
        blacklisted, _ := s.redis.Get(ctx, "blacklist:"+tokenString).Result()
        if blacklisted == "true" {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "Token has been revoked"})
            c.Abort()
            return
        }

        // Parse and validate token
        token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
            return []byte(os.Getenv("JWT_SECRET")), nil
        })

        if err != nil || !token.Valid {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
            c.Abort()
            return
        }

        // Extract claims
        if claims, ok := token.Claims.(jwt.MapClaims); ok {
            userIDClaim, exists := claims["user_id"]
            if !exists {
                c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in token"})
                c.Abort()
                return
            }
            
            userID, ok := userIDClaim.(string)
            if !ok {
                c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid user ID format in token"})
                c.Abort()
                return
            }
            
            log.Printf("DEBUG: Successfully extracted user_id: '%s'", userID)
            c.Set("user_id", userID)
            c.Next()
        } else {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token claims"})
            c.Abort()
            return
        }
    }
}