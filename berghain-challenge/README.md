# Berghain Challenge API

A Node.js API that simulates the Berghain Challenge - you're a bouncer at a nightclub trying to fill the venue with 1000 people while meeting specific constraints.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

Or for development with auto-restart:
```bash
npm run dev
```

The server will run on `http://localhost:3000`

## API Endpoints

### 1. Create a New Game
**POST** `/new-game`

Creates a new game session and returns a unique game ID.

Response:
```json
{
  "success": true,
  "gameId": "uuid-string",
  "status": {
    "gameId": "uuid-string",
    "acceptedCount": 0,
    "rejectedCount": 0,
    "personIndex": 0,
    "currentCounts": { "young": 0, "well_dressed": 0 },
    "deficits": { "young": 600, "well_dressed": 600 },
    "isComplete": false,
    "success": false,
    "remainingSlots": 1000
  }
}
```

### 2. Get Next Person and Make Decision
**GET** `/decide-and-next?gameId=uuid&personIndex=0&accept=true`

- `gameId`: The game ID from creating a new game
- `personIndex`: The current person index (starts at 0)
- `accept`: `true` to accept the person, `false` to reject (optional for first person)

Response:
```json
{
  "success": true,
  "person": {
    "young": true,
    "well_dressed": false
  },
  "personIndex": 1,
  "decision": {
    "decision": "accept",
    "reason": "one_fer"
  },
  "status": {
    "gameId": "uuid-string",
    "acceptedCount": 1,
    "rejectedCount": 0,
    "personIndex": 1,
    "currentCounts": { "young": 1, "well_dressed": 0 },
    "deficits": { "young": 599, "well_dressed": 600 },
    "isComplete": false,
    "success": false,
    "remainingSlots": 999
  }
}
```

### 3. Get Game Status
**GET** `/game-status/:gameId`

Returns the current status of a game.

### 4. Health Check
**GET** `/health`

Returns server health status.

## Game Rules

- **Goal**: Fill the venue with 1000 people
- **Constraints**: 
  - At least 600 young people
  - At least 600 well-dressed people
- **Limits**: Maximum 20,000 rejections
- **Attributes**: Each person has binary attributes (young/not young, well-dressed/not well-dressed)

## Decision Logic

The API provides decision recommendations based on the original algorithm:

- **Two-fer**: Accept people who satisfy both unmet constraints (young AND well-dressed)
- **One-fer**: Accept people who satisfy exactly one unmet constraint
- **Zero-fer**: Accept people who don't help with constraints only if there are enough remaining slots
- **Reject**: When you must save slots for people who can satisfy multiple constraints

## Example Usage

```bash
# Create a new game
curl -X POST http://localhost:3000/new-game

# Get first person (without making a decision)
curl "http://localhost:3000/decide-and-next?gameId=YOUR_GAME_ID&personIndex=0"

# Accept the first person
curl "http://localhost:3000/decide-and-next?gameId=YOUR_GAME_ID&personIndex=0&accept=true"

# Get next person and reject them
curl "http://localhost:3000/decide-and-next?gameId=YOUR_GAME_ID&personIndex=1&accept=false"
```

## Game Completion

The game ends when either:
1. You've accepted 1000 people (success!)
2. You've rejected 20,000 people (failure)

The API will return `gameComplete: true` when the game ends.
