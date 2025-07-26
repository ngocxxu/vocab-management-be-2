# Server-Sent Events (SSE) Module

This module provides real-time notification delivery using Server-Sent Events (SSE) in NestJS.

## Features

- **Real-time Notifications**: Deliver notifications to connected clients instantly
- **User-specific Events**: Send events to specific users or broadcast to all
- **Connection Management**: Automatic cleanup of dead connections
- **Authentication**: Secure SSE connections with JWT authentication
- **Keep-alive**: Automatic keep-alive messages to maintain connections

## API Endpoints

### SSE Connection
```
GET /api/v1/sse/notifications
```

**Headers Required:**
- `Authorization: Bearer <jwt_token>`

**Response:**
- Content-Type: `text/event-stream`
- Connection: `keep-alive`

## Event Types

### 1. Connection Event
```json
{
  "type": "connection",
  "message": "SSE connection established",
  "userId": "clxxx1",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### 2. Notification Event
```json
{
  "type": "notification",
  "notificationId": "clxxx1",
  "notificationType": "VOCAB_TRAINER",
  "action": "CREATE",
  "priority": "LOW",
  "data": { "message": "New vocab trainer available" },
  "timestamp": "2024-01-01T00:00:00.000Z",
  "userId": "clxxx1"
}
```

### 3. System Event
```json
{
  "type": "system",
  "eventType": "maintenance",
  "data": { "message": "System maintenance scheduled" },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### 4. Custom Event
```json
{
  "type": "custom",
  "eventType": "user_activity",
  "data": { "action": "login" },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Usage

### Client-side JavaScript Example

```javascript
const eventSource = new EventSource('/api/v1/sse/notifications', {
  headers: {
    'Authorization': 'Bearer your-jwt-token'
  }
});

eventSource.onmessage = function(event) {
  const data = JSON.parse(event.data);
  
  switch(data.type) {
    case 'connection':
      console.log('SSE connection established');
      break;
    case 'notification':
      console.log('New notification:', data);
      // Handle notification display
      break;
    case 'system':
      console.log('System event:', data);
      break;
    case 'custom':
      console.log('Custom event:', data);
      break;
  }
};

eventSource.onerror = function(error) {
  console.error('SSE connection error:', error);
  // Implement reconnection logic
};
```

### Server-side Publishing

```typescript
// Publish notification event
this.ssePublisher.publishNotification(
  notificationId,
  notificationType,
  action,
  priority,
  data,
  recipientUserIds
);

// Publish system event
this.ssePublisher.publishSystemEvent('maintenance', { message: 'System maintenance' });

// Publish custom event
this.ssePublisher.publishCustomEvent('user_activity', { action: 'login' }, userIds);
```

## Integration with NotificationProcessor

The SSE module is automatically integrated with the NotificationProcessor. When a notification is created through the processor, it will:

1. Create the notification in the database
2. Publish the notification event to all connected recipients
3. Log the delivery status

## Connection Management

- **Automatic Cleanup**: Dead connections are automatically removed
- **Keep-alive**: 30-second keep-alive messages to maintain connections
- **User Limits**: One connection per user (new connections replace old ones)
- **Error Handling**: Failed connections are automatically removed

## Security

- **Authentication Required**: All SSE connections require valid JWT tokens
- **User Isolation**: Users can only receive their own notifications
- **Connection Validation**: Invalid connections are immediately closed

## Performance

- **In-Memory Storage**: Connections are stored in memory for fast access
- **Efficient Broadcasting**: Events are sent only to relevant users
- **Connection Limits**: Built-in protection against memory leaks 