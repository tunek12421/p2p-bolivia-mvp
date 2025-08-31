// Test script to debug frontend login issues
// Run this in browser console at http://localhost:3000

async function testLoginFlow() {
  console.log('🧪 Testing frontend login flow...')
  
  try {
    // Test direct fetch
    console.log('📡 Testing direct fetch...')
    const directResponse = await fetch('http://localhost:8080/api/v1/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'user@test.com',
        password: 'password123'
      })
    })
    
    console.log('📡 Direct fetch response:', directResponse.status)
    const directData = await directResponse.json()
    console.log('📡 Direct fetch data:', directData)
    
    // Test with axios (same as frontend uses)
    console.log('📡 Testing axios...')
    const axiosResponse = await axios.post('http://localhost:8080/api/v1/login', {
      email: 'user@test.com', 
      password: 'password123'
    })
    
    console.log('📡 Axios response:', axiosResponse.status)
    console.log('📡 Axios data:', axiosResponse.data)
    
  } catch (error) {
    console.error('❌ Login test failed:', error)
    console.error('❌ Error details:', {
      message: error.message,
      response: error.response,
      request: error.request
    })
  }
}

// Copy and paste this in browser console
testLoginFlow();