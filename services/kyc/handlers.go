// services/kyc/handlers.go
package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"image"
	"image/jpeg"
	_ "image/png"  // Import PNG decoder
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
	
	// Check for existing submission
	var existingID string
	err := s.db.QueryRow(`
		SELECT id FROM kyc_submissions 
		WHERE user_id = $1 AND status IN ('UNDER_REVIEW', 'PENDING')
	`, userID).Scan(&existingID)
	
	var submissionID string
	if err == sql.ErrNoRows {
		// Create new KYC submission
		submissionID = uuid.New().String()
		_, err = s.db.Exec(`
			INSERT INTO kyc_submissions (
				id, user_id, kyc_level, status, submitted_at,
				verification_data
			) VALUES ($1, $2, $3, $4, $5, $6)
		`, submissionID, userID, req.KYCLevel, "PENDING", time.Now(), 
		   fmt.Sprintf(`{"first_name":"%s","last_name":"%s","ci_number":"%s","ci_complement":"%s","date_of_birth":"%s","address":"%s","city":"%s","phone":"%s","occupation":"%s","income_source":"%s","expected_volume":%f,"pep_status":%t}`,
			req.FirstName, req.LastName, req.CINumber, req.CIComplement, req.DateOfBirth, req.Address, req.City, req.Phone, req.Occupation, req.IncomeSource, req.ExpectedVolume, req.PEPStatus))
		
		if err != nil {
			log.Printf("Error creating KYC submission for user %s: %v", userID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to submit KYC"})
			return
		}
	} else if err != nil {
		log.Printf("Error querying existing KYC submission for user %s: %v", userID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check existing KYC"})
		return
	} else {
		// Update existing submission
		submissionID = existingID
		_, err = s.db.Exec(`
			UPDATE kyc_submissions 
			SET kyc_level = $1, status = 'PENDING', submitted_at = $2,
				verification_data = $3
			WHERE id = $4
		`, req.KYCLevel, time.Now(), 
		   fmt.Sprintf(`{"first_name":"%s","last_name":"%s","ci_number":"%s","ci_complement":"%s","date_of_birth":"%s","address":"%s","city":"%s","phone":"%s","occupation":"%s","income_source":"%s","expected_volume":%f,"pep_status":%t}`,
			req.FirstName, req.LastName, req.CINumber, req.CIComplement, req.DateOfBirth, req.Address, req.City, req.Phone, req.Occupation, req.IncomeSource, req.ExpectedVolume, req.PEPStatus),
		   submissionID)
		
		if err != nil {
			log.Printf("Error updating KYC submission for user %s: %v", userID, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update KYC"})
			return
		}
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
	log.Printf("📤 KYC_UPLOAD: Starting document upload handler")
	
	userID := c.GetString("user_id")
	log.Printf("📤 KYC_UPLOAD: User ID: %s", userID)
	
	docType := c.PostForm("type")
	log.Printf("📤 KYC_UPLOAD: Document type: '%s'", docType)
	
	// Log all form fields
	if c.Request.ParseForm() == nil {
		log.Printf("📤 KYC_UPLOAD: Form fields:")
		for key, values := range c.Request.PostForm {
			log.Printf("  %s: %v", key, values)
		}
	}
	
	// Validate document type
	validTypes := []string{"CI", "PASSPORT", "SELFIE", "PROOF_ADDRESS"}
	log.Printf("📤 KYC_UPLOAD: Valid types: %v", validTypes)
	if !contains(validTypes, docType) {
		log.Printf("❌ KYC_UPLOAD: Invalid document type '%s'", docType)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid document type"})
		return
	}
	log.Printf("✅ KYC_UPLOAD: Document type validation passed")
	
	// Get file from request
	log.Printf("📤 KYC_UPLOAD: Attempting to get file from form data")
	file, header, err := c.Request.FormFile("document")
	if err != nil {
		log.Printf("❌ KYC_UPLOAD: Failed to get file from request: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "No file uploaded"})
		return
	}
	defer file.Close()
	log.Printf("✅ KYC_UPLOAD: File received - Name: %s, Size: %d bytes", header.Filename, header.Size)
	
	// Validate file size (max 10MB)
	log.Printf("📤 KYC_UPLOAD: Validating file size (current: %d bytes, max: 10MB)", header.Size)
	if header.Size > 10*1024*1024 {
		log.Printf("❌ KYC_UPLOAD: File too large - %d bytes exceeds 10MB limit", header.Size)
		c.JSON(http.StatusBadRequest, gin.H{"error": "File too large (max 10MB)"})
		return
	}
	log.Printf("✅ KYC_UPLOAD: File size validation passed")
	
	// Validate file type
	allowedTypes := map[string]bool{
		".jpg": true, ".jpeg": true, ".png": true, ".pdf": true,
	}
	ext := strings.ToLower(filepath.Ext(header.Filename))
	log.Printf("📤 KYC_UPLOAD: Validating file type - extension: '%s'", ext)
	log.Printf("📤 KYC_UPLOAD: Allowed types: %v", allowedTypes)
	if !allowedTypes[ext] {
		log.Printf("❌ KYC_UPLOAD: Invalid file type '%s' not in allowed types", ext)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid file type"})
		return
	}
	log.Printf("✅ KYC_UPLOAD: File type validation passed")
	
	// Process and compress image if needed
	var processedData []byte
	log.Printf("📤 KYC_UPLOAD: Starting file processing for extension: %s", ext)
	if ext != ".pdf" {
		log.Printf("📤 KYC_UPLOAD: Processing as image - calling processImage()")
		processedData, err = s.processImage(file)
		if err != nil {
			log.Printf("❌ KYC_UPLOAD: Image processing failed: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to process image"})
			return
		}
		log.Printf("✅ KYC_UPLOAD: Image processed successfully - size after processing: %d bytes", len(processedData))
	} else {
		log.Printf("📤 KYC_UPLOAD: Processing as PDF - reading raw file data")
		processedData, err = io.ReadAll(file)
		if err != nil {
			log.Printf("❌ KYC_UPLOAD: PDF reading failed: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read file"})
			return
		}
		log.Printf("✅ KYC_UPLOAD: PDF read successfully - size: %d bytes", len(processedData))
	}
	
	// Upload to MinIO
	fileName := fmt.Sprintf("%s/%s_%s%s", userID, docType, uuid.New().String(), ext)
	log.Printf("📤 KYC_UPLOAD: Starting MinIO upload - fileName: %s", fileName)
	
	if s.minioClient != nil {
		log.Printf("📤 KYC_UPLOAD: MinIO client available, uploading to bucket 'kyc-documents'")
		_, err = s.minioClient.PutObject(
			c.Request.Context(),
			"kyc-documents",
			fileName,
			bytes.NewReader(processedData),
			int64(len(processedData)),
			minio.PutObjectOptions{ContentType: "application/octet-stream"},
		)
		if err != nil {
			log.Printf("❌ KYC_UPLOAD: MinIO upload failed: %v", err)
		} else {
			log.Printf("✅ KYC_UPLOAD: MinIO upload successful")
		}
	} else {
		log.Printf("⚠️ KYC_UPLOAD: MinIO client is nil - skipping file upload to storage")
	}
	
	// Ensure user has a KYC submission - create one if it doesn't exist
	var submissionID string
	err = s.db.QueryRow(`
		SELECT id FROM kyc_submissions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1
	`, userID).Scan(&submissionID)
	
	if err == sql.ErrNoRows {
		log.Printf("📤 KYC_UPLOAD: No KYC submission found, creating automatic submission")
		submissionID = uuid.New().String()
		_, err = s.db.Exec(`
			INSERT INTO kyc_submissions (
				id, user_id, kyc_level, status, submitted_at, verification_data
			) VALUES ($1, $2, $3, $4, $5, $6)
		`, submissionID, userID, 1, "UNDER_REVIEW", time.Now(), "{}")
		
		if err != nil {
			log.Printf("❌ KYC_UPLOAD: Failed to create automatic submission: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create KYC submission"})
			return
		}
		log.Printf("✅ KYC_UPLOAD: Automatic submission created with ID: %s", submissionID)
	} else if err != nil {
		log.Printf("❌ KYC_UPLOAD: Failed to query existing submission: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to process KYC submission"})
		return
	} else {
		log.Printf("✅ KYC_UPLOAD: Using existing submission ID: %s", submissionID)
	}
	
	// Save document record
	docID := uuid.New().String()
	log.Printf("📤 KYC_UPLOAD: Saving document record to database - docID: %s", docID)
	log.Printf("📤 KYC_UPLOAD: Document details - userID: %s, docType: %s, fileName: %s, size: %d", 
		userID, docType, fileName, len(processedData))
	
	_, err = s.db.Exec(`
		INSERT INTO kyc_documents (
			id, submission_id, document_type, file_path, file_size, mime_type, created_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, docID, submissionID, docType, fileName, len(processedData), header.Header.Get("Content-Type"), time.Now())
	
	if err != nil {
		log.Printf("❌ KYC_UPLOAD: Database save failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save document"})
		return
	}
	log.Printf("✅ KYC_UPLOAD: Document record saved successfully in database")
	
	// Perform OCR if it's a CI document
	if docType == "CI" {
		log.Printf("📤 KYC_UPLOAD: Document type is CI - starting OCR process in background")
		go s.performOCR(docID, processedData)
	} else {
		log.Printf("📤 KYC_UPLOAD: Document type is %s - skipping OCR", docType)
	}
	
	log.Printf("📤 KYC_UPLOAD: Upload process completed successfully - returning response")
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
	var rejectionReason sql.NullString
	err := s.db.QueryRow(`
		SELECT id, user_id, kyc_level, status, submitted_at, reviewed_at, reviewed_by, rejection_reason, verification_data
		FROM kyc_submissions 
		WHERE user_id = $1 
		ORDER BY created_at DESC 
		LIMIT 1
	`, userID).Scan(&submission.ID, &submission.UserID, &submission.KYCLevel, 
		&submission.Status, &submission.SubmittedAt, &submission.ReviewedAt, 
		&submission.ReviewedBy, &rejectionReason, &verificationData)
	
	// Handle nullable rejection_reason
	if rejectionReason.Valid {
		submission.RejectionReason = rejectionReason.String
	}
	
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
	log.Printf("🖼️ KYC_IMAGE_PROCESS: Starting image processing")
	
	img, format, err := image.Decode(file)
	if err != nil {
		log.Printf("❌ KYC_IMAGE_PROCESS: Image decode failed: %v", err)
		return nil, err
	}
	log.Printf("✅ KYC_IMAGE_PROCESS: Image decoded successfully - format: %s", format)
	
	// Resize if too large
	bounds := img.Bounds()
	originalWidth := bounds.Max.X
	originalHeight := bounds.Max.Y
	log.Printf("🖼️ KYC_IMAGE_PROCESS: Original dimensions: %dx%d", originalWidth, originalHeight)
	
	if bounds.Max.X > 1024 || bounds.Max.Y > 1024 {
		log.Printf("🖼️ KYC_IMAGE_PROCESS: Image too large, resizing to max 1024px")
		img = resize.Resize(1024, 0, img, resize.Lanczos3)
		newBounds := img.Bounds()
		log.Printf("✅ KYC_IMAGE_PROCESS: Image resized to: %dx%d", newBounds.Max.X, newBounds.Max.Y)
	} else {
		log.Printf("✅ KYC_IMAGE_PROCESS: Image size acceptable, no resizing needed")
	}
	
	// Compress as JPEG
	log.Printf("🖼️ KYC_IMAGE_PROCESS: Compressing as JPEG with quality 80")
	var buf bytes.Buffer
	err = jpeg.Encode(&buf, img, &jpeg.Options{Quality: 80})
	if err != nil {
		log.Printf("❌ KYC_IMAGE_PROCESS: JPEG encoding failed: %v", err)
		return nil, err
	}
	
	finalSize := buf.Len()
	log.Printf("✅ KYC_IMAGE_PROCESS: Image processing completed - final size: %d bytes", finalSize)
	
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
	log.Printf("🔍 KYC_OCR: Starting OCR process for document ID: %s", docID)
	log.Printf("🔍 KYC_OCR: Image data size: %d bytes", len(imageData))
	
	// Simulate OCR processing
	log.Printf("🔍 KYC_OCR: Simulating OCR processing (in production this would use real OCR service)")
	ocrResults := map[string]string{
		"full_name": "JUAN CARLOS PEREZ GONZALEZ",
		"ci_number": "12345678",
		"birth_date": "15/03/1990",
	}
	
	ocrJSON, err := json.Marshal(ocrResults)
	if err != nil {
		log.Printf("❌ KYC_OCR: Failed to marshal OCR results: %v", err)
		return
	}
	log.Printf("✅ KYC_OCR: OCR processing completed - results: %s", string(ocrJSON))
	
	log.Printf("🔍 KYC_OCR: Updating document status in database")
	result, err := s.db.Exec(`
		UPDATE kyc_documents 
		SET status = 'VERIFIED', ocr_data = $1
		WHERE id = $2
	`, string(ocrJSON), docID)
	
	if err != nil {
		log.Printf("❌ KYC_OCR: Failed to update document status: %v", err)
		return
	}
	
	rowsAffected, _ := result.RowsAffected()
	log.Printf("✅ KYC_OCR: Document status updated successfully - rows affected: %d", rowsAffected)
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