# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ClawLog is a claw machine gaming record tracking web application built with vanilla JavaScript, HTML, and Tailwind CSS. The app allows users to track their claw machine gaming sessions, calculate profit/loss, and sync data via Firebase.

## Architecture

### Frontend Structure
- **index.html**: Main HTML file with Tailwind CSS styling and Firebase SDK imports
- **script.js**: Core application logic handling CRUD operations, Firebase integration, and UI interactions
- Pure client-side application - no build process required

### Data Model
Records contain:
- `date`: Gaming session date
- `store`: Store/location name  
- `spent`: Money spent
- `points`: Points earned
- `value`: Value of prizes won
- `profit`: Calculated as `points × pointCost - spent + value`

### Firebase Integration
- **Authentication**: Google OAuth login required
- **Firestore**: User data stored under `/users/{uid}/records/` collection
- **Settings**: Point cost stored in user document (`pointCost` field)

## Development Commands

### Local Development
```bash
# Serve locally (recommended)
python3 -m http.server 8000
# Then visit http://localhost:8000

# Alternative: Open index.html directly in browser
open index.html
```

### Firebase Configuration
- Replace `firebaseConfig` object in `index.html` lines 77-85 with your Firebase project credentials
- Enable Google Authentication and Firestore in Firebase Console

## Key Functions

### Core Logic (script.js)
- `calculateProfit()`: Profit calculation formula
- `loadRecords()`: Fetch records from Firestore
- `addRecord()`, `updateRecord()`, `removeRecord()`: CRUD operations
- `renderRecords()`: Update DOM with current records
- `savePointCost()`: Persist point cost setting

### CSV Import/Export
- `exportBtn` listener: Generate CSV download
- `importInput` listener: Parse CSV file and import records

## Application Flow

1. User authentication via Google OAuth
2. Load user settings (point cost) and records from Firestore
3. Real-time profit calculation when point cost changes
4. All data operations sync to Firebase automatically
5. CSV import/export for data portability

## State Management

- `records[]`: In-memory array of all records
- `pointCost`: Global setting for profit calculations
- `editingId`: Track currently editing record
- `currentUser`: Firebase auth user object