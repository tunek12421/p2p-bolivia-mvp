import React, { useState, useEffect, useRef } from 'react';
import { chatAPI, ChatRoom, ChatMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import styles from '../styles/TransactionChat.module.css';

interface Message extends ChatMessage {}

interface TransactionChatProps {
  orderId: string;
  userType: 'user' | 'cashier';
  onClose: () => void;
}

const TransactionChat: React.FC<TransactionChatProps> = ({ orderId, userType, onClose }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [chatRoom, setChatRoom] = useState<ChatRoom | null>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Use auth context for consistent token and user management
  const { user, token } = useAuth();
  const currentUserId = user?.id;

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
      if (!token || !orderId) {
        console.log('🔑 Missing token or orderId');
        setIsLoading(false);
        return;
      }
      
      try {
        console.log('🔍 Looking for chat room for transaction:', orderId);
        setIsLoading(true);
        
        const response = await chatAPI.getRooms({ transaction_id: orderId });
        console.log('🏠 Chat rooms response:', response.data);
        
        if (response.data.rooms && response.data.rooms.length > 0) {
          const room = response.data.rooms[0];
          setChatRoom(room);
          console.log('✅ Found existing chat room:', room.id);
          await loadMessages(room.id);
        } else {
          console.log('🆕 No existing room found, creating new one');
          // Create new room if none exists
          const createResponse = await chatAPI.createRoom({
            room_type: 'TRANSACTION',
            transaction_id: orderId,
            participants: [] // Backend will add current user automatically
          });
          
          const newRoom = createResponse.data.room_id 
            ? { id: createResponse.data.room_id, room_type: 'TRANSACTION', transaction_id: orderId, participants: [], last_message_at: new Date().toISOString(), created_at: new Date().toISOString() } as ChatRoom
            : null;
            
          if (newRoom) {
            setChatRoom(newRoom);
            console.log('✅ Created new chat room:', newRoom.id);
          }
        }
      } catch (error) {
        console.error('❌ Error finding/creating chat room:', error);
      } finally {
        setIsLoading(false);
      }
    };

    findChatRoom();
  }, [orderId, token]);

  // Load messages for the chat room
  const loadMessages = async (roomId: string) => {
    if (!token) return;
    
    try {
      console.log('📨 Loading messages for room:', roomId);
      
      const response = await chatAPI.getRoomMessages(roomId);
      console.log('📨 Messages response:', response.data);
      
      const loadedMessages = (response.data.messages || [])
        .filter((msg: ChatMessage) => msg.content && msg.content.trim()) // Filter out empty messages
        .filter((msg: ChatMessage, index: number, arr: ChatMessage[]) => 
          // Remove duplicates based on ID
          arr.findIndex(m => m.id === msg.id) === index
        );
      
      setMessages(loadedMessages);
      console.log('✅ Loaded and filtered messages:', loadedMessages.length);
    } catch (error) {
      console.error('❌ Error loading messages:', error);
    }
  };

  // Connect to WebSocket
  useEffect(() => {
    if (chatRoom && currentUserId && token) {
      // Ensure token is not null
      const wsToken = token || '';
      const wsUrl = `ws://localhost:8080/api/v1/ws?token=${wsToken}&user_id=${currentUserId}`;
      
      console.log('🔄 Connecting to WebSocket:', wsUrl.replace(wsToken, 'TOKEN_HIDDEN'));
      
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
          console.log('📨 Received WebSocket message:', message);
          
          if (message.room_id === chatRoom.id) {
            // Check if message already exists to avoid duplicates
            const messageExists = messages.some(m => m.id === message.id);
            
            if (!messageExists && message.content && message.content.trim()) {
              setMessages(prev => [...prev, message]);
              console.log('✅ Added new message via WebSocket');
            } else {
              console.log('⚠️ Skipped duplicate/empty message:', message.id);
            }
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
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
  }, [chatRoom, currentUserId, token]);

  // Send message - SIMPLIFIED VERSION
  const sendMessage = async () => {
    if (!newMessage.trim() || !chatRoom || !token) return;

    const messageContent = newMessage.trim();
    setNewMessage('');

    try {
      console.log('📤 Sending message via REST API only');
      
      // Send via REST API - let the backend handle WebSocket broadcasting
      await chatAPI.sendMessage(chatRoom.id, {
        content: messageContent,
        message_type: 'text'
      });
      
      console.log('✅ Message sent successfully');
      
      // Optionally refresh messages to get the latest state
      // The WebSocket should handle real-time updates anyway
      
    } catch (error) {
      console.error('❌ Error sending message:', error);
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

  if (isLoading) {
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

  if (!chatRoom) {
    return (
      <div className={styles.chatContainer}>
        <div className={styles.chatHeader}>
          <h3>💬 Chat de Transacción</h3>
          <button onClick={onClose} className={styles.closeButton}>✕</button>
        </div>
        <div className={styles.loadingContainer}>
          <p>No se pudo cargar el chat. Intenta de nuevo.</p>
          <button 
            onClick={() => window.location.reload()} 
            className={styles.retryButton}
          >
            🔄 Reintentar
          </button>
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
              <p>{message.content || '(mensaje vacío)'}</p>
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