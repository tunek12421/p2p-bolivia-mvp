// services/bank-listener/main.go
package main

import (
    "database/sql"
    "fmt"
    "log"
    "os"
    "strings"
    "time"

    "github.com/gin-gonic/gin"
    "github.com/shopspring/decimal"
    _ "github.com/lib/pq"
)

type BankNotification struct {
    ID            string          `json:"id"`
    TransactionID string          `json:"transaction_id"`
    Amount        decimal.Decimal `json:"amount"`
    Currency      string          `json:"currency"`
    SenderName    string          `json:"sender_name"`
    SenderAccount string          `json:"sender_account"`
    BankName      string          `json:"bank_name"`
    Reference     string          `json:"reference"`
    Timestamp     time.Time       `json:"timestamp"`
    Status        string          `json:"status"`
    Processed     bool            `json:"processed"`
}

type Server struct {
    db            *sql.DB
    notifications []BankNotification
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

    // Test database connection
    if err := db.Ping(); err != nil {
        log.Fatal("Failed to ping database:", err)
    }

    server := &Server{
        db:            db,
        notifications: make([]BankNotification, 0),
    }

    router := gin.Default()

    // Health check
    router.GET("/health", func(c *gin.Context) {
        c.JSON(200, gin.H{"status": "healthy", "service": "bank-listener"})
    })

    // Android notification endpoint
    router.POST("/api/notification", server.handleAndroidNotification)
    
    // Get notifications for wallet service
    router.GET("/api/notifications", server.getNotifications)
    
    // Acknowledge processed notification
    router.POST("/api/acknowledge", server.acknowledgeNotification)

    port := os.Getenv("PORT")
    if port == "" {
        port = "8000"
    }

    log.Printf("🏦 Bank Listener service starting on port %s", port)
    if err := router.Run(":" + port); err != nil {
        log.Fatal("Failed to start server:", err)
    }
}

func (s *Server) handleAndroidNotification(c *gin.Context) {
    var payload struct {
        Title   string `json:"title"`
        Content string `json:"content"`
        Package string `json:"package"`
        Time    int64  `json:"time"`
    }

    if err := c.ShouldBindJSON(&payload); err != nil {
        log.Printf("❌ Error parsing Android notification: %v", err)
        c.JSON(400, gin.H{"error": "Invalid payload"})
        return
    }

    log.Printf("📱 Received Android notification: %s - %s", payload.Title, payload.Content)

    // Parse bank notification from Android content
    notification, err := s.parseBankNotification(payload)
    if err != nil {
        log.Printf("⚠️ Could not parse bank notification: %v", err)
        c.JSON(200, gin.H{"status": "ignored", "reason": "not a bank notification"})
        return
    }

    // Store notification
    err = s.storeNotification(notification)
    if err != nil {
        log.Printf("❌ Error storing notification: %v", err)
        c.JSON(500, gin.H{"error": "Failed to store notification"})
        return
    }

    // Add to in-memory queue for immediate processing
    s.notifications = append(s.notifications, notification)

    log.Printf("✅ Bank notification processed: %s %s from %s", 
        notification.Amount.String(), notification.Currency, notification.SenderName)

    c.JSON(200, gin.H{
        "status": "success",
        "notification_id": notification.ID,
        "amount": notification.Amount,
        "currency": notification.Currency,
    })
}

func (s *Server) parseBankNotification(payload struct {
    Title   string `json:"title"`
    Content string `json:"content"`
    Package string `json:"package"`
    Time    int64  `json:"time"`
}) (BankNotification, error) {
    content := strings.ToLower(payload.Content)
    title := strings.ToLower(payload.Title)
    
    // Check if it's a bank notification
    bankKeywords := []string{"banco", "transferencia", "deposito", "pago", "bcp", "bnb", "mercantil"}
    isBankNotification := false
    bankName := "Unknown Bank"
    
    for _, keyword := range bankKeywords {
        if strings.Contains(content, keyword) || strings.Contains(title, keyword) {
            isBankNotification = true
            if strings.Contains(content, "bcp") || strings.Contains(title, "bcp") {
                bankName = "Banco de Crédito de Bolivia"
            } else if strings.Contains(content, "bnb") || strings.Contains(title, "bnb") {
                bankName = "Banco Nacional de Bolivia"
            } else if strings.Contains(content, "mercantil") || strings.Contains(title, "mercantil") {
                bankName = "Banco Mercantil Santa Cruz"
            }
            break
        }
    }
    
    if !isBankNotification {
        return BankNotification{}, fmt.Errorf("not a bank notification")
    }

    // Extract amount
    amount, currency := s.extractAmount(content)
    if amount.IsZero() {
        return BankNotification{}, fmt.Errorf("could not extract amount")
    }

    // Extract sender name
    senderName := s.extractSenderName(content)
    
    // Extract reference if any
    reference := s.extractReference(content)

    // Generate unique ID
    notificationID := fmt.Sprintf("bn_%d", time.Now().UnixNano())
    transactionID := fmt.Sprintf("tx_%d", time.Now().UnixNano())

    notification := BankNotification{
        ID:            notificationID,
        TransactionID: transactionID,
        Amount:        amount,
        Currency:      currency,
        SenderName:    senderName,
        SenderAccount: "unknown",
        BankName:      bankName,
        Reference:     reference,
        Timestamp:     time.Unix(payload.Time/1000, 0),
        Status:        "COMPLETED",
        Processed:     false,
    }

    return notification, nil
}

func (s *Server) extractAmount(content string) (decimal.Decimal, string) {
    // Look for patterns like "Bs. 100.50" or "USD 50.25" or "$us 75.00"
    patterns := []struct {
        currency string
        prefixes []string
    }{
        {"BOB", []string{"bs.", "bs ", "bolivianos"}},
        {"USD", []string{"$us", "usd", "dolares", "dólares"}},
        {"USDT", []string{"usdt", "tether"}},
    }

    for _, pattern := range patterns {
        for _, prefix := range pattern.prefixes {
            if strings.Contains(content, prefix) {
                // Find number after prefix
                index := strings.Index(content, prefix)
                if index != -1 {
                    remaining := content[index+len(prefix):]
                    // Extract first number found
                    var numStr string
                    for i, char := range remaining {
                        if (char >= '0' && char <= '9') || char == '.' || char == ',' {
                            numStr += string(char)
                        } else if len(numStr) > 0 {
                            break
                        } else if i > 20 { // Don't search too far
                            break
                        }
                    }
                    
                    // Clean and parse
                    numStr = strings.ReplaceAll(numStr, ",", "")
                    if amount, err := decimal.NewFromString(numStr); err == nil && !amount.IsZero() {
                        return amount, pattern.currency
                    }
                }
            }
        }
    }

    return decimal.Zero, ""
}

func (s *Server) extractSenderName(content string) string {
    // Look for patterns like "de: Juan Perez" or "remitente: Maria Lopez"
    patterns := []string{"de:", "remitente:", "desde:", "enviado por:"}
    
    for _, pattern := range patterns {
        if strings.Contains(content, pattern) {
            index := strings.Index(content, pattern)
            if index != -1 {
                start := index + len(pattern)
                remaining := content[start:]
                
                // Extract name (until next common word or punctuation)
                stopWords := []string{"a:", "para:", "cuenta:", "monto:", "fecha:", "referencia:"}
                var name string
                words := strings.Fields(remaining)
                
                for i, word := range words {
                    if i > 5 { // Don't take too many words
                        break
                    }
                    
                    isStopWord := false
                    for _, stopWord := range stopWords {
                        if strings.Contains(strings.ToLower(word), stopWord) {
                            isStopWord = true
                            break
                        }
                    }
                    
                    if isStopWord {
                        break
                    }
                    
                    if name != "" {
                        name += " "
                    }
                    name += strings.TrimSpace(word)
                }
                
                if len(name) > 2 && len(name) < 50 {
                    return strings.Title(strings.ToLower(name))
                }
            }
        }
    }
    
    return "Desconocido"
}

func (s *Server) extractReference(content string) string {
    // Look for patterns like "ref:", "referencia:", "concepto:"
    patterns := []string{"ref:", "referencia:", "concepto:", "motivo:"}
    
    for _, pattern := range patterns {
        if strings.Contains(content, pattern) {
            index := strings.Index(content, pattern)
            if index != -1 {
                start := index + len(pattern)
                remaining := content[start:]
                
                // Extract reference (until next line or 50 chars)
                words := strings.Fields(remaining)
                var reference string
                
                for i, word := range words {
                    if i > 10 { // Don't take too many words
                        break
                    }
                    
                    if reference != "" {
                        reference += " "
                    }
                    reference += strings.TrimSpace(word)
                    
                    if len(reference) > 50 {
                        break
                    }
                }
                
                if len(reference) > 2 {
                    return strings.TrimSpace(reference)
                }
            }
        }
    }
    
    return ""
}

func (s *Server) storeNotification(notification BankNotification) error {
    _, err := s.db.Exec(`
        INSERT INTO bank_notifications (id, transaction_id, amount, currency, sender_name, 
            sender_account, bank_name, reference, timestamp, status, processed, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
    `, notification.ID, notification.TransactionID, notification.Amount, notification.Currency,
        notification.SenderName, notification.SenderAccount, notification.BankName,
        notification.Reference, notification.Timestamp, notification.Status, notification.Processed)
    
    return err
}

func (s *Server) getNotifications(c *gin.Context) {
    // Get unprocessed notifications
    query := `
        SELECT id, transaction_id, amount, currency, sender_name, sender_account, 
            bank_name, reference, timestamp, status, processed
        FROM bank_notifications 
        WHERE processed = false 
        ORDER BY timestamp DESC
        LIMIT 100
    `
    
    rows, err := s.db.Query(query)
    if err != nil {
        log.Printf("❌ Error querying notifications: %v", err)
        c.JSON(500, gin.H{"error": "Database error"})
        return
    }
    defer rows.Close()
    
    var notifications []BankNotification
    for rows.Next() {
        var notif BankNotification
        err := rows.Scan(&notif.ID, &notif.TransactionID, &notif.Amount, &notif.Currency,
            &notif.SenderName, &notif.SenderAccount, &notif.BankName, &notif.Reference,
            &notif.Timestamp, &notif.Status, &notif.Processed)
        if err != nil {
            continue
        }
        notifications = append(notifications, notif)
    }
    
    c.JSON(200, gin.H{
        "status":        "success",
        "notifications": notifications,
        "count":         len(notifications),
    })
}

func (s *Server) acknowledgeNotification(c *gin.Context) {
    var payload struct {
        NotificationID string `json:"notification_id"`
    }
    
    if err := c.ShouldBindJSON(&payload); err != nil {
        c.JSON(400, gin.H{"error": "Invalid payload"})
        return
    }
    
    // Mark notification as processed
    _, err := s.db.Exec(`
        UPDATE bank_notifications 
        SET processed = true, updated_at = NOW() 
        WHERE id = $1
    `, payload.NotificationID)
    
    if err != nil {
        log.Printf("❌ Error acknowledging notification: %v", err)
        c.JSON(500, gin.H{"error": "Database error"})
        return
    }
    
    log.Printf("✅ Acknowledged notification: %s", payload.NotificationID)
    c.JSON(200, gin.H{"status": "acknowledged"})
}