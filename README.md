# SingSync

SingSync is a real-time web application for synchronizing lyrics and chords across multiple devices. It's designed for karaoke, band practices, and sing-alongs, allowing a "leader" to control the scrolling, transpose chords, and manage the current song while all other participants see the synchronized view in real-time.

## Features

- **Real-time Synchronization:** Powered by Socket.IO, ensuring seamless syncing of scroll position, active song, and chord transpositions across all connected devices in a "room" (party).
- **Song Parser:** Easily import lyrics and chords from popular Ukrainian and other song chord websites simply by pasting the URL.
- **Chord Transposition:** Automatically transpose chords up or down on the fly.
- **QR Code Sharing:** Quickly join a room by scanning a dynamically generated QR code.
- **Export & Import:** Backup your entire song database to a JSON file and restore it later.
- **Custom Backend:** Uses an Express custom server alongside Next.js to handle Socket.IO and a local SQLite database simultaneously.

## Tech Stack

- **Frontend:** Next.js 14, React 18, Tailwind CSS
- **Backend:** Express, Node.js
- **Database:** SQLite (`better-sqlite3`)
- **Real-time Communication:** Socket.IO
- **Utilities:** Cheerio (for web scraping lyrics), QRCode (for room sharing)

## Getting Started

### Prerequisites

Make sure you have Node.js (v18+ recommended) installed.

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd singsync
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) with your browser.

## Database

The project uses a local SQLite database (`database.sqlite`). The schema is automatically created and migrated upon starting the server.

## Scripts

- `npm run dev`: Starts the development server with Next.js and custom Express backend.
- `npm run build`: Builds the Next.js application for production.
- `npm run start`: Starts the production server.
- `npm run lint`: Runs ESLint.

## License

This project is licensed under the MIT License.
