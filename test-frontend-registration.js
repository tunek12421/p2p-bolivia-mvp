// Test script for frontend registration
const axios = require('axios');

const API_URL = 'http://localhost:8080';

const testRegistration = async () => {
  console.log('Testing registration endpoint from frontend perspective...');
  
  try {
    const response = await axios.post(`${API_URL}/api/v1/register`, {
      email: `test-${Date.now()}@example.com`,
      password: 'password123',
      firstName: 'Test',
      lastName: 'User',
      phone: '+59177888777'
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:3000',
        'User-Agent': 'Mozilla/5.0 (Frontend Test)'
      },
      timeout: 10000
    });
    
    console.log('✅ Registration successful!');
    console.log('Response:', response.data);
    
    // Test getting user profile
    const token = response.data.access_token;
    const userResponse = await axios.get(`${API_URL}/api/v1/me`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Origin': 'http://localhost:3000'
      }
    });
    
    console.log('✅ User profile retrieved!');
    console.log('User data:', userResponse.data);
    
  } catch (error) {
    console.error('❌ Error during registration:', error.response?.data || error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Headers:', error.response.headers);
    }
  }
};

testRegistration();