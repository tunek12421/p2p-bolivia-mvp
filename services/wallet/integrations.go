package main

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/skip2/go-qrcode"
)

// QR Code Generation for Bolivia
func (s *Server) processQRDeposit(tx Transaction) gin.H {
	// For Bolivia, we can use QR Simple or crypto QR
	var qrData map[string]interface{}
	
	if tx.Currency == "BOB" {
		// QR Simple boliviano
		qrData = map[string]interface{}{
			"type":       "QR_SIMPLE",
			"amount":     tx.Amount.String(),
			"currency":   "BOB",
			"reference":  fmt.Sprintf("DEP-%s", tx.ID[:8]),
			"tx_id":      tx.ID,
			"expires_at": time.Now().Add(24 * time.Hour).Unix(),
		}
	} else {
		// Crypto QR for USD/USDT
		depositAddress := s.generateCryptoAddress(tx.Currency, tx.UserID)
		qrData = map[string]interface{}{
			"type":       "CRYPTO",
			"address":    depositAddress,
			"amount":     tx.Amount.String(),
			"currency":   tx.Currency,
			"tx_id":      tx.ID,
			"expires_at": time.Now().Add(24 * time.Hour).Unix(),
		}
	}
	
	qrDataJSON, _ := json.Marshal(qrData)
	
	// Generate QR code image
	qrCode, err := qrcode.Encode(string(qrDataJSON), qrcode.Medium, 256)
	if err != nil {
		return gin.H{"error": "Failed to generate QR code"}
	}
	
	// Save QR code to file
	qrFileName := fmt.Sprintf("qr_%s.png", tx.ID)
	qrFilePath := filepath.Join("public", "qr", qrFileName)
	
	os.MkdirAll(filepath.Dir(qrFilePath), 0755)
	err = os.WriteFile(qrFilePath, qrCode, 0644)
	if err != nil {
		return gin.H{"error": "Failed to save QR code"}
	}
	
	// Update transaction with reference
	reference := ""
	if tx.Currency == "BOB" {
		reference = fmt.Sprintf("DEP-%s", tx.ID[:8])
	} else {
		reference = s.generateCryptoAddress(tx.Currency, tx.UserID)
	}
	
	s.db.Exec("UPDATE transactions SET external_ref = $1 WHERE id = $2", reference, tx.ID)
	
	return gin.H{
		"message":         "QR code generated successfully",
		"qr_data":         qrData,
		"qr_code_url":     fmt.Sprintf("/public/qr/%s", qrFileName),
		"qr_code_base64":  base64.StdEncoding.EncodeToString(qrCode),
		"expires_at":      time.Now().Add(24 * time.Hour),
		"status":          "pending_payment",
	}
}

// Bank Transfer for Bolivia
func (s *Server) processBankDeposit(tx Transaction) gin.H {
	// Get deposit instructions from bank integration
	instructions, err := s.bankIntegration.GetDepositInstructions(tx.UserID, tx.Currency, tx.Amount)
	if err != nil {
		return gin.H{"error": "Failed to get deposit instructions"}
	}
	
	return gin.H{
		"message":      "Bank deposit initiated",
		"instructions": instructions,
		"status":       "pending_bank_transfer",
	}
}

func (s *Server) processBankWithdrawal(tx Transaction) gin.H {
	// Bank withdrawal for Bolivia
	// In a real implementation, this would integrate with local banking APIs
	
	// For now, we'll create a withdrawal request that needs manual processing
	withdrawalRef := s.generateBankReference(tx.ID)
	
	// Update transaction with withdrawal reference
	s.db.Exec(`
		UPDATE transactions 
		SET external_ref = $1, status = 'PROCESSING' 
		WHERE id = $2
	`, withdrawalRef, tx.ID)
	
	return gin.H{
		"message":         "Bank withdrawal initiated",
		"reference":       withdrawalRef,
		"status":          "processing",
		"estimated_time":  "1-2 business days",
	}
}

// Helper functions
func (s *Server) generateCryptoAddress(currency, userID string) string {
	// Generate a deterministic address based on user and currency
	data := fmt.Sprintf("%s-%s-%d", userID, currency, time.Now().Unix())
	hash := sha256.Sum256([]byte(data))
	
	switch currency {
	case "USDT":
		return "0x" + hex.EncodeToString(hash[:20]) // Ethereum-like address
	case "BTC":
		return "bc1q" + hex.EncodeToString(hash[:20]) // Bech32-like address
	default:
		return hex.EncodeToString(hash[:32])
	}
}

func (s *Server) generateBankReference(txID string) string {
	// Generate unique reference for bank transfers
	randomBytes := make([]byte, 4)
	rand.Read(randomBytes)
	return fmt.Sprintf("P2P-%s-%s", txID[:8], hex.EncodeToString(randomBytes))
}