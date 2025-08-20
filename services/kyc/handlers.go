// services/kyc/handlers.go
package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"image"
	"image/jpeg"
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"time"
	"log"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/nfnt/resize"
	"github.com/minio/minio-go/v7"
)

type KYCSubmission struct {
	ID              string     `json:"id"`
	UserID          string     `json:"user_id"`
	KYCLevel        int        `json:"kyc_level"`
	FirstName       string     `json:"first_name"`
	LastName        string     `json:"last_name"`
	CINumber        string     `json:"ci_number"`
	CIComplement    string     `json:"ci_complement"`
	DateOfBirth     string     `json:"date_of_birth"`
	Address         string     `json:"address"`
	City            string     `json:"city"`
	Phone           string     `json:"phone"`
	Occupation      string     `json:"occupation"`
	IncomeSource    string     `json:"income_source"`
	ExpectedVolume  float64    `json:"expected_volume"`
	PEPStatus       bool       `json:"pep_status"`
	Status          string     `json:"status"`
	RejectionReason string     `json:"rejection_reason"`
	SubmittedAt     time.Time  `json:"submitted_at"`
	ReviewedAt      *time.Time `json:"reviewed_at"`
	ReviewedBy      *string    `json:"reviewed_by"`
}

type Document struct {
	ID         string    `json:"id"`
	UserID     string    `json:"user_id"`
	Type       string    `json:"type"`
	FileName   string    `json:"file_name"`
	FileURL    string    `json:"file_url"`
	FileHash   string    `json:"file_hash"`
	Verified   bool      `json:"verified"`
	UploadedAt time.Time `json:"uploaded_at"`
}

func (s *Server) handleSubmitKYC(c *gin.Context) {
	userID := c.GetString("user_id")
	log.Printf("DEBUG: Starting KYC submission for user: %s", userID)
	
	var req KYCSubmission
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("ERROR: JSON binding failed for user %s: %v", userID, err)
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	log.Printf("DEBUG: KYC data bound successfully for user: %s", userID)
	
	// Validate CI number format (Bolivia)
	if !s.validateCINumber(req.CINumber) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid CI number format"})
		return
	}
	
	// Check for duplicate submission
	var existingID string
	err := s.db.QueryRow(`
		SELECT id FROM kyc_submissions 
		WHERE user_id = $1 AND status = 'PENDING'
	`, userID).Scan(&existingID)
	
	if err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "KYC submission already pending"})
		return
	}
	
	// Create KYC submission
	submissionID := uuid.New().String()
	_, err = s.db.Exec(`
		INSERT INTO kyc_submissions (
			id, user_id, kyc_level, status, submitted_at,
			verification_data
		) VALUES ($1, $2, $3, $4, $5, $6)
	`, submissionID, userID, req.KYCLevel, "PENDING", time.Now(), 
	   fmt.Sprintf(`{"first_name":"%s","last_name":"%s","ci_number":"%s","ci_complement":"%s","date_of_birth":"%s","address":"%s","city":"%s","phone":"%s","occupation":"%s","income_source":"%s","expected_volume":%f,"pep_status":%t}`,
		req.FirstName, req.LastName, req.CINumber, req.CIComplement, req.DateOfBirth, req.Address, req.City, req.Phone, req.Occupation, req.IncomeSource, req.ExpectedVolume, req.PEPStatus))
	
	if err != nil {
		log.Printf("Error submitting KYC for user %s: %v", userID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to submit KYC"})
		return
	}
	
	// Start automatic verification process
	go s.performAutomaticVerification(submissionID)
	
	c.JSON(http.StatusCreated, gin.H{
		"submission_id": submissionID,
		"status":        "PENDING",
		"message":       "KYC submitted successfully. Please upload required documents.",
	})
}

func (s *Server) handleUploadDocument(c *gin.Context) {
	userID := c.GetString("user_id")
	docType := c.PostForm("type")
	
	// Validate document type
	validTypes := []string{"CI", "PASSPORT", "SELFIE", "PROOF_ADDRESS"}
	if !contains(validTypes, docType) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid document type"})
		return
	}
	
	// Get file from request
	file, header, err := c.Request.FormFile("document")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No file uploaded"})
		return
	}
	defer file.Close()
	
	// Validate file size (max 10MB)
	if header.Size > 10*1024*1024 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "File too large (max 10MB)"})
		return
	}
	
	// Validate file type
	allowedTypes := map[string]bool{
		".jpg": true, ".jpeg": true, ".png": true, ".pdf": true,
	}
	ext := strings.ToLower(filepath.Ext(header.Filename))
	if !allowedTypes[ext] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid file type"})
		return
	}
	
	// Process and compress image if needed
	var processedData []byte
	if ext != ".pdf" {
		processedData, err = s.processImage(file)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to process image"})
			return
		}
	} else {
		processedData, err = io.ReadAll(file)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read file"})
			return
		}
	}
	
	// Upload to MinIO
	fileName := fmt.Sprintf("%s/%s_%s%s", userID, docType, uuid.New().String(), ext)
	
	if s.minioClient != nil {
		_, err = s.minioClient.PutObject(
			c.Request.Context(),
			"kyc-documents",
			fileName,
			bytes.NewReader(processedData),
			int64(len(processedData)),
			minio.PutObjectOptions{ContentType: "application/octet-stream"},
		)
		if err != nil {
			log.Printf("Failed to upload to MinIO: %v", err)
		}
	}
	
	// Save document record
	docID := uuid.New().String()
	_, err = s.db.Exec(`
		INSERT INTO kyc_documents (
			id, submission_id, document_type, file_path, file_size, mime_type, created_at
		) VALUES ($1, 
			(SELECT id FROM kyc_submissions WHERE user_id = $2 ORDER BY created_at DESC LIMIT 1),
			$3, $4, $5, $6, $7)
	`, docID, userID, docType, fileName, len(processedData), header.Header.Get("Content-Type"), time.Now())
	
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save document"})
		return
	}
	
	// Perform OCR if it's a CI document
	if docType == "CI" {
		go s.performOCR(docID, processedData)
	}
	
	c.JSON(http.StatusOK, gin.H{
		"document_id": docID,
		"status":      "uploaded",
		"message":     "Document uploaded successfully",
	})
}

func (s *Server) handleGetKYCStatus(c *gin.Context) {
	userID := c.GetString("user_id")
	
	var submission KYCSubmission
	var verificationData sql.NullString
	err := s.db.QueryRow(`
		SELECT id, user_id, kyc_level, status, submitted_at, reviewed_at, reviewed_by, rejection_reason, verification_data
		FROM kyc_submissions 
		WHERE user_id = $1 
		ORDER BY created_at DESC 
		LIMIT 1
	`, userID).Scan(&submission.ID, &submission.UserID, &submission.KYCLevel, 
		&submission.Status, &submission.SubmittedAt, &submission.ReviewedAt, 
		&submission.ReviewedBy, &submission.RejectionReason, &verificationData)
	
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "No KYC submission found"})
		return
	}
	
	if err != nil {
		log.Printf("Error getting KYC status for user %s: %v", userID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get KYC status"})
		return
	}
	
	// Get documents
	rows, err := s.db.Query(`
		SELECT id, document_type, file_path, status, created_at
		FROM kyc_documents 
		WHERE submission_id = $1
	`, submission.ID)
	
	if err == nil {
		defer rows.Close()
		var documents []map[string]interface{}
		for rows.Next() {
			var docID, docType, filePath, status string
			var createdAt time.Time
			if err := rows.Scan(&docID, &docType, &filePath, &status, &createdAt); err == nil {
				documents = append(documents, map[string]interface{}{
					"id":          docID,
					"type":        docType,
					"status":      status,
					"uploaded_at": createdAt,
				})
			}
		}
		
		c.JSON(http.StatusOK, gin.H{
			"submission": submission,
			"documents":  documents,
		})
	} else {
		c.JSON(http.StatusOK, gin.H{
			"submission": submission,
			"documents":  []map[string]interface{}{},
		})
	}
}

func (s *Server) handleGetPendingKYC(c *gin.Context) {
	rows, err := s.db.Query(`
		SELECT ks.id, ks.user_id, ks.kyc_level, ks.status, ks.submitted_at, 
			   u.email, u.first_name, u.last_name
		FROM kyc_submissions ks
		JOIN users u ON ks.user_id = u.id
		WHERE ks.status = 'PENDING'
		ORDER BY ks.submitted_at ASC
	`)
	
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get pending KYC"})
		return
	}
	defer rows.Close()
	
	var submissions []map[string]interface{}
	for rows.Next() {
		var id, userID, email, firstName, lastName string
		var level int
		var status string
		var submittedAt time.Time
		
		if err := rows.Scan(&id, &userID, &level, &status, &submittedAt, 
			&email, &firstName, &lastName); err == nil {
			submissions = append(submissions, map[string]interface{}{
				"id":           id,
				"user_id":      userID,
				"level":        level,
				"status":       status,
				"submitted_at": submittedAt,
				"user_email":   email,
				"user_name":    firstName + " " + lastName,
			})
		}
	}
	
	c.JSON(http.StatusOK, gin.H{"submissions": submissions})
}

func (s *Server) handleApproveKYC(c *gin.Context) {
	submissionID := c.Param("id")
	adminID := c.GetString("user_id")
	
	// Update submission status
	_, err := s.db.Exec(`
		UPDATE kyc_submissions 
		SET status = 'APPROVED', reviewed_at = $1, reviewed_by = $2
		WHERE id = $3
	`, time.Now(), adminID, submissionID)
	
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to approve KYC"})
		return
	}
	
	// Update user KYC level
	var userID string
	var level int
	err = s.db.QueryRow(`
		SELECT user_id, kyc_level FROM kyc_submissions WHERE id = $1
	`, submissionID).Scan(&userID, &level)
	
	if err == nil {
		s.db.Exec(`
			UPDATE users 
			SET kyc_level = $1, kyc_verified_at = $2
			WHERE id = $3
		`, level, time.Now(), userID)
	}
	
	c.JSON(http.StatusOK, gin.H{"message": "KYC approved successfully"})
}

func (s *Server) handleRejectKYC(c *gin.Context) {
	submissionID := c.Param("id")
	adminID := c.GetString("user_id")
	
	var req struct {
		Reason string `json:"reason" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	// Update submission status
	_, err := s.db.Exec(`
		UPDATE kyc_submissions 
		SET status = 'REJECTED', reviewed_at = $1, reviewed_by = $2, rejection_reason = $3
		WHERE id = $4
	`, time.Now(), adminID, req.Reason, submissionID)
	
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to reject KYC"})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{"message": "KYC rejected successfully"})
}

func (s *Server) handleGetKYCLevels(c *gin.Context) {
	levels := []map[string]interface{}{
		{
			"level":       1,
			"name":        "Básico",
			"description": "Verificación básica con CI",
			"limits": map[string]interface{}{
				"monthly_volume": 10000.0,
				"daily_volume":   1000.0,
				"transaction":    500.0,
			},
			"requirements": []string{"CI válido", "Información personal"},
		},
		{
			"level":       2,
			"name":        "Intermedio",
			"description": "Verificación avanzada con selfie",
			"limits": map[string]interface{}{
				"monthly_volume": 50000.0,
				"daily_volume":   5000.0,
				"transaction":    2000.0,
			},
			"requirements": []string{"CI válido", "Selfie con CI", "Comprobante de domicilio"},
		},
		{
			"level":       3,
			"name":        "Completo",
			"description": "Verificación completa con ingresos",
			"limits": map[string]interface{}{
				"monthly_volume": -1, // Sin límite
				"daily_volume":   20000.0,
				"transaction":    10000.0,
			},
			"requirements": []string{"CI válido", "Selfie con CI", "Comprobante de domicilio", "Comprobante de ingresos"},
		},
	}
	
	c.JSON(http.StatusOK, gin.H{"levels": levels})
}

func (s *Server) handleGetRequirements(c *gin.Context) {
	level := c.Param("level")
	
	var requirements map[string]interface{}
	switch level {
	case "1":
		requirements = map[string]interface{}{
			"level":        1,
			"documents":    []string{"CI"},
			"information":  []string{"first_name", "last_name", "ci_number", "date_of_birth"},
			"optional":     []string{"phone", "address"},
		}
	case "2":
		requirements = map[string]interface{}{
			"level":        2,
			"documents":    []string{"CI", "SELFIE", "PROOF_ADDRESS"},
			"information":  []string{"first_name", "last_name", "ci_number", "date_of_birth", "address", "city", "phone"},
			"optional":     []string{"occupation"},
		}
	case "3":
		requirements = map[string]interface{}{
			"level":        3,
			"documents":    []string{"CI", "SELFIE", "PROOF_ADDRESS"},
			"information":  []string{"first_name", "last_name", "ci_number", "date_of_birth", "address", "city", "phone", "occupation", "income_source"},
			"optional":     []string{"expected_volume", "pep_status"},
		}
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid KYC level"})
		return
	}
	
	c.JSON(http.StatusOK, requirements)
}

func (s *Server) handleVerifySelfie(c *gin.Context) {
	userID := c.GetString("user_id")
	
	// Get selfie from request
	file, _, err := c.Request.FormFile("selfie")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No selfie uploaded"})
		return
	}
	defer file.Close()
	
	// Process selfie
	processedData, err := s.processImage(file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to process selfie"})
		return
	}
	
	// Save selfie
	fileName := fmt.Sprintf("%s/selfie_%s.jpg", userID, uuid.New().String())
	if s.minioClient != nil {
		s.minioClient.PutObject(
			c.Request.Context(),
			"kyc-documents",
			fileName,
			bytes.NewReader(processedData),
			int64(len(processedData)),
			minio.PutObjectOptions{ContentType: "image/jpeg"},
		)
	}
	
	// Perform face verification (simulated)
	verified := s.performFaceVerification(userID, processedData)
	
	c.JSON(http.StatusOK, gin.H{
		"verified": verified,
		"message":  "Selfie verification completed",
	})
}

// Helper functions
func (s *Server) validateCINumber(ci string) bool {
	// Basic CI validation for Bolivia
	if len(ci) < 6 || len(ci) > 10 {
		return false
	}
	
	// Check if all characters are digits
	for _, char := range ci {
		if char < '0' || char > '9' {
			return false
		}
	}
	
	return true
}

func (s *Server) processImage(file io.Reader) ([]byte, error) {
	img, _, err := image.Decode(file)
	if err != nil {
		return nil, err
	}
	
	// Resize if too large
	bounds := img.Bounds()
	if bounds.Max.X > 1024 || bounds.Max.Y > 1024 {
		img = resize.Resize(1024, 0, img, resize.Lanczos3)
	}
	
	// Compress as JPEG
	var buf bytes.Buffer
	err = jpeg.Encode(&buf, img, &jpeg.Options{Quality: 80})
	if err != nil {
		return nil, err
	}
	
	return buf.Bytes(), nil
}

func (s *Server) performAutomaticVerification(submissionID string) {
	// Simulate automatic verification process
	time.Sleep(2 * time.Second)
	
	// Update status to under review
	s.db.Exec(`
		UPDATE kyc_submissions 
		SET status = 'UNDER_REVIEW' 
		WHERE id = $1
	`, submissionID)
}

func (s *Server) performOCR(docID string, imageData []byte) {
	// Simulate OCR processing
	ocrResults := map[string]string{
		"full_name": "JUAN CARLOS PEREZ GONZALEZ",
		"ci_number": "12345678",
		"birth_date": "15/03/1990",
	}
	
	ocrJSON, _ := json.Marshal(ocrResults)
	
	s.db.Exec(`
		UPDATE kyc_documents 
		SET status = 'VERIFIED', ocr_data = $1
		WHERE id = $2
	`, string(ocrJSON), docID)
}

func (s *Server) performFaceVerification(userID string, selfieData []byte) bool {
	// Simulate face verification
	// In production, this would use a face recognition service
	return true
}

func contains(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}