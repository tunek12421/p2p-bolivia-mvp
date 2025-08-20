# P2P Bolivia Mobile App

React Native mobile application for the P2P Bolivia peer-to-peer cryptocurrency exchange platform.

## Features

- ✅ User Authentication (Login/Register)
- ✅ Dashboard with Balance and Overview
- ✅ P2P Market for Creating and Viewing Orders
- ✅ Wallet Integration
- ✅ KYC Verification Flow
- ✅ Real-time Chat System
- ✅ Profile Management

## Getting Started

### Prerequisites

- Node.js 16 or later
- Expo CLI
- iOS Simulator (for iOS development) or Android Emulator
- React Native development environment

### Installation

```bash
# Install dependencies
npm install

# Start the development server
npm start

# Run on iOS
npm run ios

# Run on Android
npm run android
```

### Configuration

Update the API base URL in `src/services/api.ts`:

```typescript
const API_BASE_URL = 'http://your-api-server:3000';
```

## Project Structure

```
mobile-app/
├── src/
│   ├── screens/          # Application screens
│   │   ├── LoginScreen.tsx
│   │   ├── RegisterScreen.tsx
│   │   ├── DashboardScreen.tsx
│   │   ├── P2PMarketScreen.tsx
│   │   ├── WalletScreen.tsx
│   │   ├── ProfileScreen.tsx
│   │   ├── KYCScreen.tsx
│   │   └── ChatScreen.tsx
│   ├── services/         # API services
│   │   └── api.ts
│   ├── components/       # Reusable components
│   └── utils/           # Utility functions
├── App.tsx              # Main app component
├── package.json
└── app.json            # Expo configuration
```

## Key Services

### Authentication Service
- Login/Register functionality
- JWT token management
- Profile management

### P2P Service
- View market orders
- Create buy/sell orders
- Execute trades

### Wallet Service
- Balance management
- Transaction history
- Deposit/Withdraw operations

### KYC Service
- Identity verification
- Document upload
- Verification status tracking

### Chat Service
- Real-time messaging
- Room management
- Transaction-related communication

## Development Notes

- Built with Expo for easy development and deployment
- Uses React Navigation for screen navigation
- Implements AsyncStorage for local data persistence
- Integrates with backend APIs for all functionality
- Responsive design for various screen sizes

## Deployment

### Building for Production

```bash
# Build for iOS
eas build --platform ios

# Build for Android
eas build --platform android
```

### Publishing Updates

```bash
# Publish OTA update
eas update
```

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is part of the P2P Bolivia platform.