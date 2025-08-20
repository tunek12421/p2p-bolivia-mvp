// services/dispute/middleware.go
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
		
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header required"})
			c.Abort()
			return
		}

		// Extract token
		if !strings.HasPrefix(authHeader, "Bearer ") {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid authorization format"})
			c.Abort()
			return
		}
		tokenString := strings.TrimPrefix(authHeader, "Bearer ")

		// Check if token is blacklisted
		if s.redis != nil {
			ctx := context.Background()
			blacklisted, _ := s.redis.Get(ctx, "blacklist:"+tokenString).Result()
			if blacklisted == "true" {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "Token has been revoked"})
				c.Abort()
				return
			}
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
			
			c.Set("user_id", userID)
			c.Next()
		} else {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token claims"})
			c.Abort()
			return
		}
	}
}

func (s *Server) adminMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// First run auth middleware
		s.authMiddleware()(c)
		
		if c.IsAborted() {
			return
		}
		
		userID := c.GetString("user_id")
		
		// Check if user is admin/mediator
		var isAdmin, isMediator bool
		err := s.db.QueryRow(`
			SELECT 
				CASE WHEN role = 'admin' THEN true ELSE false END,
				COALESCE(is_mediator, false)
			FROM users 
			WHERE id = $1
		`, userID).Scan(&isAdmin, &isMediator)
		
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to verify admin status"})
			c.Abort()
			return
		}
		
		if !isAdmin && !isMediator {
			c.JSON(http.StatusForbidden, gin.H{"error": "Admin or mediator access required"})
			c.Abort()
			return
		}
		
		c.Next()
	}
}