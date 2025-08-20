// services/dispute/handlers.go
package main

import (
	"database/sql"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type Dispute struct {
	ID              string     `json:"id"`
	TransactionID   string     `json:"transaction_id"`
	InitiatorID     string     `json:"initiator_id"`
	RespondentID    string     `json:"respondent_id"`
	Type            string     `json:"dispute_type"`
	Status          string     `json:"status"`
	Title           string     `json:"title"`
	Description     string     `json:"description"`
	Evidence        []Evidence `json:"evidence"`
	MediatorID      *string    `json:"mediator_id"`
	Resolution      *string    `json:"resolution_notes"`
	ResolutionType  *string    `json:"resolution_type"`
	ResolutionAmount *float64  `json:"resolution_amount"`
	CreatedAt       time.Time  `json:"created_at"`
	ResolvedAt      *time.Time `json:"resolved_at"`
}

type Evidence struct {
	ID          string    `json:"id"`
	DisputeID   string    `json:"dispute_id"`
	SubmittedBy string    `json:"submitted_by"`
	Type        string    `json:"evidence_type"`
	Description string    `json:"description"`
	FilePath    string    `json:"file_path"`
	SubmittedAt time.Time `json:"created_at"`
}

type DisputeMessage struct {
	ID        string    `json:"id"`
	DisputeID string    `json:"dispute_id"`
	SenderID  string    `json:"sender_id"`
	Message   string    `json:"content"`
	SentAt    time.Time `json:"created_at"`
}

func (s *Server) handleCreateDispute(c *gin.Context) {
	userID := c.GetString("user_id")
	
	var req struct {
		TransactionID string `json:"transaction_id" binding:"required"`
		Type          string `json:"dispute_type" binding:"required"`
		Title         string `json:"title" binding:"required"`
		Description   string `json:"description" binding:"required"`
	}
	
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	// Validate dispute type
	validTypes := []string{"PAYMENT_NOT_RECEIVED", "PAYMENT_NOT_SENT", "WRONG_AMOUNT", "FRAUD", "OTHER"}
	if !contains(validTypes, req.Type) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid dispute type"})
		return
	}
	
	// Get transaction details
	var transactionUserFrom, transactionUserTo string
	var transactionStatus string
	err := s.db.QueryRow(`
		SELECT from_user_id, to_user_id, status
		FROM transactions
		WHERE id = $1
	`, req.TransactionID).Scan(&transactionUserFrom, &transactionUserTo, &transactionStatus)
	
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Transaction not found"})
		return
	}
	
	// Check if user is part of the transaction
	if userID != transactionUserFrom && userID != transactionUserTo {
		c.JSON(http.StatusForbidden, gin.H{"error": "You are not part of this transaction"})
		return
	}
	
	// Check if dispute already exists
	var existingID string
	err = s.db.QueryRow(`
		SELECT id FROM disputes
		WHERE transaction_id = $1 AND status NOT IN ('RESOLVED', 'CLOSED')
	`, req.TransactionID).Scan(&existingID)
	
	if err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "Dispute already exists for this transaction"})
		return
	}
	
	// Determine respondent
	respondentID := transactionUserFrom
	if userID == transactionUserFrom {
		respondentID = transactionUserTo
	}
	
	// Create dispute
	disputeID := uuid.New().String()
	_, err = s.db.Exec(`
		INSERT INTO disputes (
			id, transaction_id, initiator_id, respondent_id,
			dispute_type, status, title, description, created_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`, disputeID, req.TransactionID, userID, respondentID,
	   req.Type, "OPEN", req.Title, req.Description, time.Now())
	
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create dispute"})
		return
	}
	
	// Update transaction status to disputed
	_, err = s.db.Exec(`
		UPDATE transactions
		SET status = 'DISPUTED'
		WHERE id = $1
	`, req.TransactionID)
	
	// Notify respondent
	go s.notifyDisputeCreated(respondentID, disputeID)
	
	c.JSON(http.StatusCreated, gin.H{
		"dispute_id": disputeID,
		"status":     "OPEN",
		"message":    "Dispute created successfully",
	})
}

func (s *Server) handleGetMyDisputes(c *gin.Context) {
	userID := c.GetString("user_id")
	
	rows, err := s.db.Query(`
		SELECT id, transaction_id, dispute_type, status, title, description, created_at
		FROM disputes
		WHERE initiator_id = $1 OR respondent_id = $1
		ORDER BY created_at DESC
	`, userID)
	
	if err != nil {
		log.Printf("Error fetching disputes for user %s: %v", userID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch disputes"})
		return
	}
	defer rows.Close()
	
	var disputes []Dispute
	for rows.Next() {
		var d Dispute
		err := rows.Scan(
			&d.ID, &d.TransactionID, &d.Type,
			&d.Status, &d.Title, &d.Description, &d.CreatedAt,
		)
		if err != nil {
			continue
		}
		disputes = append(disputes, d)
	}
	
	c.JSON(http.StatusOK, gin.H{"disputes": disputes})
}

func (s *Server) handleGetDispute(c *gin.Context) {
	disputeID := c.Param("id")
	userID := c.GetString("user_id")
	
	var dispute Dispute
	err := s.db.QueryRow(`
		SELECT id, transaction_id, initiator_id, respondent_id,
		       dispute_type, status, title, description, mediator_id,
		       resolution_notes, resolution_type, resolution_amount, created_at, resolved_at
		FROM disputes
		WHERE id = $1
	`, disputeID).Scan(
		&dispute.ID, &dispute.TransactionID, &dispute.InitiatorID,
		&dispute.RespondentID, &dispute.Type, &dispute.Status,
		&dispute.Title, &dispute.Description, &dispute.MediatorID,
		&dispute.Resolution, &dispute.ResolutionType, &dispute.ResolutionAmount,
		&dispute.CreatedAt, &dispute.ResolvedAt,
	)
	
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Dispute not found"})
		return
	}
	
	// Check if user is authorized to view this dispute
	if userID != dispute.InitiatorID && userID != dispute.RespondentID {
		// Check if user is mediator
		if dispute.MediatorID == nil || *dispute.MediatorID != userID {
			c.JSON(http.StatusForbidden, gin.H{"error": "Not authorized"})
			return
		}
	}
	
	// Get evidence
	evidenceRows, err := s.db.Query(`
		SELECT id, dispute_id, submitted_by, evidence_type, description, file_path, created_at
		FROM dispute_evidence
		WHERE dispute_id = $1
		ORDER BY created_at ASC
	`, disputeID)
	
	if err == nil {
		defer evidenceRows.Close()
		var evidence []Evidence
		for evidenceRows.Next() {
			var e Evidence
			if err := evidenceRows.Scan(&e.ID, &e.DisputeID, &e.SubmittedBy,
				&e.Type, &e.Description, &e.FilePath, &e.SubmittedAt); err == nil {
				evidence = append(evidence, e)
			}
		}
		dispute.Evidence = evidence
	}
	
	c.JSON(http.StatusOK, gin.H{"dispute": dispute})
}

func (s *Server) handleSubmitEvidence(c *gin.Context) {
	disputeID := c.Param("id")
	userID := c.GetString("user_id")
	
	var req struct {
		Type        string `json:"evidence_type" binding:"required"`
		Description string `json:"description" binding:"required"`
		FilePath    string `json:"file_path"`
	}
	
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	// Validate evidence type
	validTypes := []string{"SCREENSHOT", "DOCUMENT", "TRANSACTION_PROOF", "OTHER"}
	if !contains(validTypes, req.Type) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid evidence type"})
		return
	}
	
	// Check if user is part of the dispute
	var initiatorID, respondentID string
	err := s.db.QueryRow(`
		SELECT initiator_id, respondent_id
		FROM disputes
		WHERE id = $1
	`, disputeID).Scan(&initiatorID, &respondentID)
	
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Dispute not found"})
		return
	}
	
	if userID != initiatorID && userID != respondentID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not authorized"})
		return
	}
	
	// Create evidence record
	evidenceID := uuid.New().String()
	_, err = s.db.Exec(`
		INSERT INTO dispute_evidence (
			id, dispute_id, submitted_by, evidence_type, description, file_path, created_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, evidenceID, disputeID, userID, req.Type, req.Description, req.FilePath, time.Now())
	
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to submit evidence"})
		return
	}
	
	c.JSON(http.StatusCreated, gin.H{
		"evidence_id": evidenceID,
		"message":     "Evidence submitted successfully",
	})
}

func (s *Server) handleSendMessage(c *gin.Context) {
	disputeID := c.Param("id")
	userID := c.GetString("user_id")
	
	var req struct {
		Message string `json:"message" binding:"required"`
	}
	
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	// Check if user is authorized
	var initiatorID, respondentID string
	var mediatorID sql.NullString
	err := s.db.QueryRow(`
		SELECT initiator_id, respondent_id, mediator_id
		FROM disputes
		WHERE id = $1
	`, disputeID).Scan(&initiatorID, &respondentID, &mediatorID)
	
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Dispute not found"})
		return
	}
	
	authorized := userID == initiatorID || userID == respondentID
	if mediatorID.Valid && userID == mediatorID.String {
		authorized = true
	}
	
	if !authorized {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not authorized"})
		return
	}
	
	// Create message (this would typically be handled by the chat service)
	messageID := uuid.New().String()
	// For simplicity, we'll store it in a messages table or integrate with chat service
	
	c.JSON(http.StatusCreated, gin.H{
		"message_id": messageID,
		"message":    "Message sent successfully",
	})
}

func (s *Server) handleGetPendingDisputes(c *gin.Context) {
	rows, err := s.db.Query(`
		SELECT d.id, d.transaction_id, d.initiator_id, d.respondent_id,
		       d.dispute_type, d.status, d.title, d.created_at,
		       u1.email as initiator_email, u2.email as respondent_email
		FROM disputes d
		JOIN users u1 ON d.initiator_id = u1.id
		JOIN users u2 ON d.respondent_id = u2.id
		WHERE d.status = 'OPEN'
		ORDER BY d.created_at ASC
	`)
	
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch pending disputes"})
		return
	}
	defer rows.Close()
	
	var disputes []map[string]interface{}
	for rows.Next() {
		var id, transactionID, initiatorID, respondentID, disputeType, status, title string
		var createdAt time.Time
		var initiatorEmail, respondentEmail string
		
		if err := rows.Scan(&id, &transactionID, &initiatorID, &respondentID,
			&disputeType, &status, &title, &createdAt,
			&initiatorEmail, &respondentEmail); err == nil {
			disputes = append(disputes, map[string]interface{}{
				"id":               id,
				"transaction_id":   transactionID,
				"initiator_id":     initiatorID,
				"respondent_id":    respondentID,
				"dispute_type":     disputeType,
				"status":           status,
				"title":            title,
				"created_at":       createdAt,
				"initiator_email":  initiatorEmail,
				"respondent_email": respondentEmail,
			})
		}
	}
	
	c.JSON(http.StatusOK, gin.H{"disputes": disputes})
}

func (s *Server) handleAssignMediator(c *gin.Context) {
	disputeID := c.Param("id")
	
	var req struct {
		MediatorID string `json:"mediator_id" binding:"required"`
	}
	
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	// Verify mediator exists and is authorized
	var isMediator bool
	err := s.db.QueryRow(`
		SELECT COALESCE(is_mediator, false)
		FROM users
		WHERE id = $1
	`, req.MediatorID).Scan(&isMediator)
	
	if err != nil || !isMediator {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid mediator"})
		return
	}
	
	// Assign mediator
	_, err = s.db.Exec(`
		UPDATE disputes
		SET mediator_id = $1, status = 'IN_PROGRESS'
		WHERE id = $2
	`, req.MediatorID, disputeID)
	
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to assign mediator"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{"message": "Mediator assigned successfully"})
}

func (s *Server) handleResolveDispute(c *gin.Context) {
	disputeID := c.Param("id")
	
	var req struct {
		ResolutionType   string  `json:"resolution_type" binding:"required"`
		ResolutionAmount *float64 `json:"resolution_amount"`
		ResolutionNotes  string   `json:"resolution_notes" binding:"required"`
	}
	
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	// Validate resolution type
	validTypes := []string{"REFUND_FULL", "REFUND_PARTIAL", "NO_REFUND", "CUSTOM"}
	if !contains(validTypes, req.ResolutionType) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid resolution type"})
		return
	}
	
	// Resolve dispute
	_, err := s.db.Exec(`
		UPDATE disputes
		SET status = 'RESOLVED', resolution_type = $1, resolution_amount = $2,
		    resolution_notes = $3, resolved_at = $4
		WHERE id = $5
	`, req.ResolutionType, req.ResolutionAmount, req.ResolutionNotes, time.Now(), disputeID)
	
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to resolve dispute"})
		return
	}
	
	// Update transaction status based on resolution
	if req.ResolutionType == "REFUND_FULL" || req.ResolutionType == "REFUND_PARTIAL" {
		s.db.Exec(`
			UPDATE transactions
			SET status = 'REFUNDED'
			WHERE id = (SELECT transaction_id FROM disputes WHERE id = $1)
		`, disputeID)
	} else {
		s.db.Exec(`
			UPDATE transactions
			SET status = 'COMPLETED'
			WHERE id = (SELECT transaction_id FROM disputes WHERE id = $1)
		`, disputeID)
	}
	
	c.JSON(http.StatusOK, gin.H{"message": "Dispute resolved successfully"})
}

func (s *Server) handleGetStats(c *gin.Context) {
	stats := make(map[string]interface{})
	
	// Total disputes
	var totalDisputes int
	s.db.QueryRow("SELECT COUNT(*) FROM disputes").Scan(&totalDisputes)
	stats["total_disputes"] = totalDisputes
	
	// Disputes by status
	statusRows, err := s.db.Query(`
		SELECT status, COUNT(*) as count
		FROM disputes
		GROUP BY status
	`)
	if err == nil {
		defer statusRows.Close()
		statusStats := make(map[string]int)
		for statusRows.Next() {
			var status string
			var count int
			if err := statusRows.Scan(&status, &count); err == nil {
				statusStats[status] = count
			}
		}
		stats["by_status"] = statusStats
	}
	
	// Recent disputes (last 30 days)
	var recentDisputes int
	s.db.QueryRow(`
		SELECT COUNT(*) FROM disputes 
		WHERE created_at > NOW() - INTERVAL '30 days'
	`).Scan(&recentDisputes)
	stats["recent_disputes"] = recentDisputes
	
	// Average resolution time
	var avgResolutionHours float64
	s.db.QueryRow(`
		SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600)
		FROM disputes
		WHERE status = 'RESOLVED'
	`).Scan(&avgResolutionHours)
	stats["avg_resolution_hours"] = avgResolutionHours
	
	c.JSON(http.StatusOK, stats)
}

// Helper functions
func (s *Server) notifyDisputeCreated(userID, disputeID string) {
	log.Printf("Notifying user %s of new dispute %s", userID, disputeID)
	// Send email/SMS/push notification
}

func contains(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}