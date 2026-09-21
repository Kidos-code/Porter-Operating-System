# Porter Tracking System

## Run the application

1. Install dependencies with `npm install`.
2. Start the backend with `npm start`.
3. Open `http://localhost:3000/SignIn.html` in a browser.

The backend stores registered users in `data/users.json` and hashes their passwords.

## Account recovery

The backend uses security questions for account recovery. Recovery restores access and allows the user to set a new password.

## Frontend and backend connection

For local use, start the backend with `npm start` and open `http://localhost:3000/SignIn.html`. Data is stored in JSON files under `data/`.