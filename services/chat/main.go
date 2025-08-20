// services/chat/main.go
package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	_ "github.com/lib/pq"
)

type Server struct {
	db     *sql.DB
	router *gin.Engine
	hub    *Hub
}

type Hub struct {
	clients    map[string]*Client
	broadcast  chan Message
	register   chan *Client
	unregister chan *Client
	mu         sync.RWMutex
}

type Client struct {
	ID     string
	UserID string
	conn   *websocket.Conn
	send   chan Message
	rooms  map[string]bool
}

type Message struct {
	ID        string    `json:"id"`
	RoomID    string    `json:"room_id"`
	SenderID  string    `json:"sender_id"`
	Type      string    `json:"message_type"`
	Content   string    `json:"content"`
	Timestamp time.Time `json:"created_at"`
}

type ChatRoom struct {
	ID           string    `json:"id"`
	Type         string    `json:"room_type"`
	TransactionID *string   `json:"transaction_id"`
	DisputeID     *string   `json:"dispute_id"`
	Participants []string  `json:"participants"`
	LastMessage  time.Time `json:"last_message_at"`
	CreatedAt    time.Time `json:"created_at"`
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // In production, validate origin
	},
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

	hub := &Hub{
		clients:    make(map[string]*Client),
		broadcast:  make(chan Message),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}

	server := &Server{
		db:     db,
		router: gin.Default(),
		hub:    hub,
	}

	// Start hub
	go server.hub.run()

	server.setupRoutes()

	port := os.Getenv("PORT")
	if port == "" {
		port = "3007"
	}

	log.Printf("Chat service starting on port %s", port)
	if err := server.router.Run(":" + port); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}

func (s *Server) setupRoutes() {
	s.router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "healthy", "service": "chat"})
	})

	api := s.router.Group("/api/v1")
	{
		// WebSocket endpoint
		api.GET("/ws", s.handleWebSocket)
		
		// REST endpoints
		api.POST("/rooms", s.authMiddleware(), s.handleCreateRoom)
		api.GET("/rooms", s.authMiddleware(), s.handleGetRooms)
		api.GET("/rooms/:id/messages", s.authMiddleware(), s.handleGetMessages)
		api.POST("/rooms/:id/messages", s.authMiddleware(), s.handleSendMessage)
		api.POST("/rooms/:id/join", s.authMiddleware(), s.handleJoinRoom)
	}
}

func (h *Hub) run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client.ID] = client
			h.mu.Unlock()
			log.Printf("Client %s connected", client.ID)

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client.ID]; ok {
				delete(h.clients, client.ID)
				close(client.send)
			}
			h.mu.Unlock()
			log.Printf("Client %s disconnected", client.ID)

		case message := <-h.broadcast:
			h.mu.RLock()
			for _, client := range h.clients {
				if client.rooms[message.RoomID] {
					select {
					case client.send <- message:
					default:
						close(client.send)
						delete(h.clients, client.ID)
					}
				}
			}
			h.mu.RUnlock()
		}
	}
}

func (s *Server) handleWebSocket(c *gin.Context) {
	// Get user ID from query params (in production, use JWT from header)
	userID := c.Query("user_id")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID required"})
		return
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}

	client := &Client{
		ID:     fmt.Sprintf("%s-%d", userID, time.Now().Unix()),
		UserID: userID,
		conn:   conn,
		send:   make(chan Message, 256),
		rooms:  make(map[string]bool),
	}

	// Load user's rooms
	s.loadUserRooms(client)

	s.hub.register <- client

	go client.writePump()
	go client.readPump(s.hub, s.db)
}

func (c *Client) readPump(hub *Hub, db *sql.DB) {
	defer func() {
		hub.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		var msg Message
		err := c.conn.ReadJSON(&msg)
		if err != nil {
			log.Printf("WebSocket read error: %v", err)
			break
		}

		// Set message metadata
		msg.ID = uuid.New().String()
		msg.SenderID = c.UserID
		msg.Timestamp = time.Now()

		// Save message to database
		_, err = db.Exec(`
			INSERT INTO chat_messages (id, room_id, sender_id, message_type, content, created_at)
			VALUES ($1, $2, $3, $4, $5, $6)
		`, msg.ID, msg.RoomID, msg.SenderID, msg.Type, msg.Content, msg.Timestamp)

		if err != nil {
			log.Printf("Failed to save message: %v", err)
			continue
		}

		// Update room's last message time
		db.Exec(`
			UPDATE chat_rooms 
			SET last_message_at = $1 
			WHERE id = $2
		`, msg.Timestamp, msg.RoomID)

		// Broadcast message
		hub.broadcast <- msg

		c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(54 * time.Second)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			if err := c.conn.WriteJSON(message); err != nil {
				log.Printf("WebSocket write error: %v", err)
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (s *Server) loadUserRooms(client *Client) {
	rows, err := s.db.Query(`
		SELECT cr.id 
		FROM chat_rooms cr
		WHERE cr.participants::jsonb ? $1
	`, client.UserID)

	if err != nil {
		log.Printf("Failed to load user rooms: %v", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var roomID string
		if err := rows.Scan(&roomID); err == nil {
			client.rooms[roomID] = true
		}
	}
}

func (s *Server) handleCreateRoom(c *gin.Context) {
	userID := c.GetString("user_id")
	
	var req struct {
		Type          string    `json:"room_type" binding:"required"`
		TransactionID *string   `json:"transaction_id"`
		DisputeID     *string   `json:"dispute_id"`
		Participants  []string  `json:"participants" binding:"required"`
	}
	
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	// Validate room type
	validTypes := []string{"TRANSACTION", "DISPUTE", "DIRECT"}
	if !contains(validTypes, req.Type) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room type"})
		return
	}
	
	// Add the creator to participants if not already included
	if !contains(req.Participants, userID) {
		req.Participants = append(req.Participants, userID)
	}
	
	// Create room
	roomID := uuid.New().String()
	participantsJSON, _ := json.Marshal(req.Participants)
	
	_, err := s.db.Exec(`
		INSERT INTO chat_rooms (id, room_type, transaction_id, dispute_id, participants, created_at, last_message_at)
		VALUES ($1, $2, $3, $4, $5, $6, $6)
	`, roomID, req.Type, req.TransactionID, req.DisputeID, string(participantsJSON), time.Now())
	
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create room"})
		return
	}
	
	c.JSON(http.StatusCreated, gin.H{
		"room_id": roomID,
		"message": "Room created successfully",
	})
}

func (s *Server) handleGetRooms(c *gin.Context) {
	userID := c.GetString("user_id")
	
	rows, err := s.db.Query(`
		SELECT id, room_type, transaction_id, dispute_id, participants, last_message_at, created_at
		FROM chat_rooms
		WHERE participants::jsonb ? $1
		ORDER BY last_message_at DESC
	`, userID)
	
	if err != nil {
		log.Printf("Error fetching rooms for user %s: %v", userID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch rooms"})
		return
	}
	defer rows.Close()
	
	var rooms []ChatRoom
	for rows.Next() {
		var room ChatRoom
		var participantsJSON string
		
		err := rows.Scan(&room.ID, &room.Type, &room.TransactionID, &room.DisputeID,
			&participantsJSON, &room.LastMessage, &room.CreatedAt)
		if err != nil {
			continue
		}
		
		json.Unmarshal([]byte(participantsJSON), &room.Participants)
		rooms = append(rooms, room)
	}
	
	c.JSON(http.StatusOK, gin.H{"rooms": rooms})
}

func (s *Server) handleGetMessages(c *gin.Context) {
	roomID := c.Param("id")
	userID := c.GetString("user_id")
	
	// Check if user is participant
	var participantsJSON string
	err := s.db.QueryRow(`
		SELECT participants FROM chat_rooms WHERE id = $1
	`, roomID).Scan(&participantsJSON)
	
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}
	
	var participants []string
	json.Unmarshal([]byte(participantsJSON), &participants)
	
	if !contains(participants, userID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not authorized"})
		return
	}
	
	// Get messages
	rows, err := s.db.Query(`
		SELECT id, room_id, sender_id, message_type, content, created_at
		FROM chat_messages
		WHERE room_id = $1
		ORDER BY created_at ASC
		LIMIT 100
	`, roomID)
	
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch messages"})
		return
	}
	defer rows.Close()
	
	var messages []Message
	for rows.Next() {
		var msg Message
		err := rows.Scan(&msg.ID, &msg.RoomID, &msg.SenderID, &msg.Type, &msg.Content, &msg.Timestamp)
		if err != nil {
			continue
		}
		messages = append(messages, msg)
	}
	
	c.JSON(http.StatusOK, gin.H{"messages": messages})
}

func (s *Server) handleSendMessage(c *gin.Context) {
	roomID := c.Param("id")
	userID := c.GetString("user_id")
	
	var req struct {
		Type    string `json:"message_type"`
		Content string `json:"content" binding:"required"`
	}
	
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	
	if req.Type == "" {
		req.Type = "TEXT"
	}
	
	// Check if user is participant
	var participantsJSON string
	err := s.db.QueryRow(`
		SELECT participants FROM chat_rooms WHERE id = $1
	`, roomID).Scan(&participantsJSON)
	
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}
	
	var participants []string
	json.Unmarshal([]byte(participantsJSON), &participants)
	
	if !contains(participants, userID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not authorized"})
		return
	}
	
	// Create message
	msg := Message{
		ID:        uuid.New().String(),
		RoomID:    roomID,
		SenderID:  userID,
		Type:      req.Type,
		Content:   req.Content,
		Timestamp: time.Now(),
	}
	
	// Save message
	_, err = s.db.Exec(`
		INSERT INTO chat_messages (id, room_id, sender_id, message_type, content, created_at)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, msg.ID, msg.RoomID, msg.SenderID, msg.Type, msg.Content, msg.Timestamp)
	
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to send message"})
		return
	}
	
	// Update room's last message time
	s.db.Exec(`
		UPDATE chat_rooms 
		SET last_message_at = $1 
		WHERE id = $2
	`, msg.Timestamp, roomID)
	
	// Broadcast message
	s.hub.broadcast <- msg
	
	c.JSON(http.StatusCreated, gin.H{
		"message_id": msg.ID,
		"message":    "Message sent successfully",
	})
}

func (s *Server) handleJoinRoom(c *gin.Context) {
	roomID := c.Param("id")
	userID := c.GetString("user_id")
	
	// Get current participants
	var participantsJSON string
	err := s.db.QueryRow(`
		SELECT participants FROM chat_rooms WHERE id = $1
	`, roomID).Scan(&participantsJSON)
	
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}
	
	var participants []string
	json.Unmarshal([]byte(participantsJSON), &participants)
	
	// Add user if not already participant
	if !contains(participants, userID) {
		participants = append(participants, userID)
		newParticipantsJSON, _ := json.Marshal(participants)
		
		_, err = s.db.Exec(`
			UPDATE chat_rooms 
			SET participants = $1 
			WHERE id = $2
		`, string(newParticipantsJSON), roomID)
		
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to join room"})
			return
		}
	}
	
	c.JSON(http.StatusOK, gin.H{"message": "Joined room successfully"})
}

func contains(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}