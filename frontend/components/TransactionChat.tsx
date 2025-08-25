import React, { useState, useEffect, useRef } from 'react';
import styles from '../styles/TransactionChat.module.css';

interface Message {
  id: string;
  sender_id: string;
  content: string;
  message_type: string;
  created_at: string;
}

interface ChatRoom {
  id: string;
  room_type: string;
  transaction_id: string;
  participants: string[];
}

interface TransactionChatProps {
  orderId: string;
  userType: 'user' | 'cashier';
  onClose: () => void;
}

const TransactionChat: React.FC<TransactionChatProps> = ({ orderId, userType, onClose }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [chatRoom, setChatRoom] = useState<ChatRoom | null>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Get current user ID from localStorage
  const getCurrentUserId = () => {
    if (typeof window === 'undefined') return null;
    const token = localStorage.getItem('token');
    if (!token) return null;
    
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.user_id;
    } catch (error) {
      console.error('Error parsing token:', error);
      return null;
    }
  };
  
  const currentUserId = getCurrentUserId();

  // Scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Find or create chat room for this transaction
  useEffect(() => {
    const findChatRoom = async () => {
      try {
        const token = localStorage.getItem('token');
        console.log('🔑 Access token:', token ? 'Found' : 'Not found');
        
        if (!token) {
          console.error('❌ No access token found in localStorage');
          return;
        }
        
        const response = await fetch(`http://localhost:8080/api/v1/rooms?transaction_id=${orderId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.rooms && data.rooms.length > 0) {
            setChatRoom(data.rooms[0]);
            loadMessages(data.rooms[0].id);
          }
        }
      } catch (error) {
        console.error('Error finding chat room:', error);
      }
    };

    if (orderId) {
      findChatRoom();
    }
  }, [orderId]);

  // Load messages for the chat room
  const loadMessages = async (roomId: string) => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`http://localhost:8080/api/v1/rooms/${roomId}/messages`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
      }
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  // Connect to WebSocket
  useEffect(() => {
    if (chatRoom && currentUserId) {
      const token = localStorage.getItem('access_token');
      const wsUrl = `ws://localhost:8080/api/v1/ws?token=${token}&user_id=${currentUserId}`;
      
      console.log('🔄 Connecting to WebSocket:', wsUrl);
      
      const websocket = new WebSocket(wsUrl);

      websocket.onopen = () => {
        console.log('✅ WebSocket connected');
        setIsConnected(true);
        
        // Join the chat room
        websocket.send(JSON.stringify({
          type: 'join_room',
          room_id: chatRoom.id,
        }));
      };

      websocket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('📨 Received message:', message);
          
          if (message.room_id === chatRoom.id) {
            setMessages(prev => [...prev, message]);
          }
        } catch (error) {
          console.error('Error parsing message:', error);
        }
      };

      websocket.onclose = () => {
        console.log('🔌 WebSocket disconnected');
        setIsConnected(false);
      };

      websocket.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        setIsConnected(false);
      };

      setWs(websocket);

      return () => {
        websocket.close();
      };
    }
  }, [chatRoom, currentUserId]);

  // Send message
  const sendMessage = async () => {
    if (!newMessage.trim() || !chatRoom || !ws) return;

    const messageData = {
      type: 'send_message',
      room_id: chatRoom.id,
      content: newMessage.trim(),
      message_type: 'TEXT'
    };

    try {
      // Send via WebSocket for real-time
      if (ws && isConnected) {
        ws.send(JSON.stringify(messageData));
      }

      // Also send via REST API for persistence
      const token = localStorage.getItem('access_token');
      await fetch(`http://localhost:8080/api/v1/rooms/${chatRoom.id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          content: newMessage.trim(),
          message_type: 'TEXT'
        }),
      });

      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  // Handle Enter key press
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Format timestamp
  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Check if message is from current user
  const isOwnMessage = (senderId: string) => senderId === currentUserId;

  if (!chatRoom) {
    return (
      <div className={styles.chatContainer}>
        <div className={styles.chatHeader}>
          <h3>💬 Chat de Transacción</h3>
          <button onClick={onClose} className={styles.closeButton}>✕</button>
        </div>
        <div className={styles.loadingContainer}>
          <p>Cargando chat...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.chatContainer}>
      <div className={styles.chatHeader}>
        <h3>💬 Chat de Transacción</h3>
        <div className={styles.connectionStatus}>
          {isConnected ? '🟢 Conectado' : '🔴 Desconectado'}
        </div>
        <button onClick={onClose} className={styles.closeButton}>✕</button>
      </div>

      <div className={styles.messagesContainer}>
        {messages.map((message) => (
          <div
            key={message.id}
            className={`${styles.message} ${
              isOwnMessage(message.sender_id) ? styles.ownMessage : styles.otherMessage
            }`}
          >
            <div className={styles.messageContent}>
              <p>{message.content}</p>
              <span className={styles.messageTime}>
                {formatTime(message.created_at)}
              </span>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className={styles.messageInput}>
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Escribe un mensaje..."
          disabled={!isConnected}
        />
        <button 
          onClick={sendMessage} 
          disabled={!newMessage.trim() || !isConnected}
          className={styles.sendButton}
        >
          📤
        </button>
      </div>
    </div>
  );
};

export default TransactionChat;