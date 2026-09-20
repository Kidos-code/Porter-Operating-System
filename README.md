# Porter Tracking System

## Run the application

1. Install dependencies with `npm install`.
2. Start the backend with `npm start`.
3. Open `http://localhost:3000/SignIn.html` in a browser.

The backend stores registered users in `data/users.json` and hashes their passwords.

## Email reset configuration

Set these environment variables before starting the backend to send real reset emails:

- `SMTP_HOST`
- `SMTP_PORT` (usually `587`)
- `SMTP_USER`
- `SMTP_PASSWORD`
- `EMAIL_FROM` (optional)

Without SMTP settings, the backend returns a development reset code so the workflow can be tested locally.