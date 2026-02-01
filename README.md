# BSS Bridge Server

Bridge server for BSS mobile automation system. Manages command queue between Lua script and Android app.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy environment variables:
```bash
cp .env.example .env
```

3. Configure `.env` with your settings

## Development

Run local development server:
```bash
npm run dev
```

Server will be available at `http://localhost:3000`

## Testing

Run tests:
```bash
npm test
```

## Deployment

Deploy to Vercel:
```bash
vercel
```

Set environment variables in Vercel dashboard:
- `API_KEY` - Your secret API key
- `MAX_QUEUE_SIZE` - Maximum queue size (default: 50)
- `COMMAND_EXPIRATION_MS` - Command expiration time (default: 300000)
- `DUPLICATE_COOLDOWN_MS` - Duplicate prevention cooldown (default: 60000)

## API Endpoints

- `POST /api/command` - Submit command from Lua script
- `GET /api/poll` - Poll for next command (Android app)
- `POST /api/complete` - Mark command as complete
- `GET /api/status` - Server status and queue info

## Project Structure

```
bss-bridge-server/
├── api/              # Vercel serverless functions
│   ├── command.js    # POST /api/command
│   ├── poll.js       # GET /api/poll
│   ├── complete.js   # POST /api/complete
│   └── status.js     # GET /api/status
├── lib/              # Shared libraries
│   ├── queue.js      # Command queue management
│   ├── auth.js       # API key validation
│   └── cleanup.js    # Expired command cleanup
├── package.json
├── vercel.json
└── .env.example
```
