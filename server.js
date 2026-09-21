// Minimal backend for registration, sign-in, account recovery, and reports.
const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const DATA_FILE = path.join(__dirname, "data", "users.json");
const REPORTS_FILE = path.join(__dirname, "data", "reports.json");
const recoveryTokens = new Map();
const contentTypes = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

// Keep user records on the server instead of trusting browser localStorage.
function readUsers() {
    if (!fs.existsSync(DATA_FILE)) {
        return [];
    }
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function writeUsers(users) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2));
}

// Read completed reports from the server-side database file.
function readReports() {
    if (!fs.existsSync(REPORTS_FILE)) {
        return [];
    }
    return JSON.parse(fs.readFileSync(REPORTS_FILE, "utf8"));
}

// Keep completed reports persistent between browser sessions and page refreshes.
function writeReports(reports) {
    fs.mkdirSync(path.dirname(REPORTS_FILE), { recursive: true });
    fs.writeFileSync(REPORTS_FILE, JSON.stringify(reports, null, 2));
}

// Passwords are never stored as plain text in the backend data file.
function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
    const hash = crypto.scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${hash}`;
}

function passwordsMatch(password, storedPassword) {
    if (typeof storedPassword !== "string") return false;
    const [salt, storedHash] = storedPassword.split(":");
    if (!salt || !storedHash) return false;
    const hash = crypto.scryptSync(password, salt, 64).toString("hex");
    const expected = Buffer.from(hash, "hex");
    const actual = Buffer.from(storedHash, "hex");
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function securityAnswersMatch(answer, storedAnswer) {
    return passwordsMatch(answer.trim().toLowerCase(), storedAnswer);
}

function sendJson(response, status, body) {
    response.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    response.end(JSON.stringify(body));
}

function getRequestBody(request) {
    return new Promise((resolve, reject) => {
        let body = "";
        request.on("data", chunk => body += chunk);
        request.on("end", () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch {
                reject(new Error("Request body must be valid JSON."));
            }
        });
        request.on("error", reject);
    });
}

function handleServerError(error) {
    if (error.code === "EADDRINUSE") {
        console.error(`Port ${PORT} is already in use. Stop the existing server or use a different PORT.`);
        return;
    }
    console.error("Backend server error:", error);
}

const server = http.createServer(async (request, response) => {
    if (request.method === "OPTIONS") {
        response.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
        });
        return response.end();
    }

    // Serve the existing frontend from the same origin as the API.
    if (request.method === "GET") {
        // Return only the selected calendar day's reports; older records stay in storage.
        if (request.url.startsWith("/api/reports")) {
            const date = new URL(request.url, "http://localhost").searchParams.get("date");
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) {
                return sendJson(response, 400, { error: "A valid report date is required." });
            }
            return sendJson(response, 200, { reports: readReports().filter(report => report.reportDate === date) });
        }

        const requestedPath = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
        const fileName = requestedPath === "/" ? "index.html" : requestedPath.slice(1);
        const filePath = path.resolve(__dirname, fileName);
        if (!filePath.startsWith(path.resolve(__dirname)) || !fs.existsSync(filePath) || !contentTypes[path.extname(filePath)]) {
            return sendJson(response, 404, { error: "Page not found." });
        }
        response.writeHead(200, { "Content-Type": contentTypes[path.extname(filePath)] });
        return response.end(fs.readFileSync(filePath));
    }

    try {
        const body = await getRequestBody(request);
        const users = readUsers();

        if (request.method === "POST" && request.url === "/api/register") {
            const username = String(body.username || "").trim();
            const empNum = String(body.empNum || "").trim();
            const password = String(body.password || "");
            const securityQuestion = String(body.securityQuestion || "").trim();
            const securityAnswer = String(body.securityAnswer || "").trim().toLowerCase();
            if (!username || !empNum || password.length < 6 || !securityQuestion || !securityAnswer) {
                return sendJson(response, 400, { error: "All fields are required, including a security question and answer." });
            }
            if (users.some(user => user.username === username || user.empNum === empNum)) {
                return sendJson(response, 409, { error: "Username or employee number already exists." });
            }
            const newUser = { username, empNum, password: hashPassword(password), securityQuestion, securityAnswer: hashPassword(securityAnswer) };
            users.push(newUser);
            writeUsers(users);
            return sendJson(response, 201, { message: "Account created successfully." });
        }

        if (request.method === "POST" && request.url === "/api/signin") {
            const user = users.find(candidate => candidate.username === body.username && candidate.empNum === body.empNum);
            if (!user || !passwordsMatch(String(body.password || ""), user.password)) {
                return sendJson(response, 401, { error: "Invalid sign-in details." });
            }
            return sendJson(response, 200, { username: user.username, empNum: user.empNum });
        }

        if (request.method === "POST" && request.url === "/api/reports") {
            // Store the submitted report on the backend instead of in browser-only storage.
            const type = String(body.type || "").trim();
            const report = {
                id: String(body.id || crypto.randomUUID()),
                porter: String(body.porter || "").trim(),
                type,
                patientName: String(body.patientName || "").trim(),
                hospitalNumber: String(body.hospitalNumber || "").trim(),
                pickupWard: String(body.pickupWard || "").trim(),
                pickupTime: String(body.pickupTime || "").trim(),
                dropoffWard: String(body.dropoffWard || "").trim(),
                dropoffTime: String(body.dropoffTime || "").trim(),
                feedback: String(body.feedback || "").trim(),
                reportDate: String(body.reportDate || ""),
                createdAt: String(body.createdAt || new Date().toISOString())
            };
            const isPatientReport = type.toLowerCase() === "patient";
            if (!report.porter || !report.type || !report.patientName || !report.reportDate) {
                return sendJson(response, 400, { error: "Required report details are missing." });
            }
            if (isPatientReport && !report.hospitalNumber) {
                return sendJson(response, 400, { error: "Hospital number is required for patient reports." });
            }
            if (!isPatientReport) {
                report.hospitalNumber = "";
            }
            const reports = readReports();
            reports.push(report);
            writeReports(reports);
            return sendJson(response, 201, { report });
        }

        if (request.method === "POST" && request.url === "/api/recover-account") {
            const username = String(body.username || "").trim();
            const empNum = String(body.empNum || "").trim();
            const securityQuestion = String(body.securityQuestion || "").trim();
            const securityAnswer = String(body.securityAnswer || "").trim();
            const user = users.find(candidate => candidate.username === username && candidate.empNum === empNum);
            if (!user || user.securityQuestion !== securityQuestion || !user.securityAnswer || !securityAnswersMatch(securityAnswer, user.securityAnswer)) {
                return sendJson(response, 401, { error: "The username, employee number, question, or answer is incorrect." });
            }
            const recoveryToken = crypto.randomBytes(32).toString("hex");
            recoveryTokens.set(recoveryToken, { username: user.username, empNum: user.empNum, expiresAt: Date.now() + 10 * 60 * 1000 });
            return sendJson(response, 200, { recoveryToken });
        }

        if (request.method === "POST" && request.url === "/api/reset-password") {
            const recoveryToken = String(body.recoveryToken || "");
            const password = String(body.password || "");
            const recovery = recoveryTokens.get(recoveryToken);
            if (!recovery || recovery.expiresAt < Date.now()) {
                return sendJson(response, 400, { error: "Your recovery verification has expired. Please try again." });
            }
            if (password.length < 6) {
                return sendJson(response, 400, { error: "The new password must be at least 6 characters." });
            }
            const user = users.find(candidate => candidate.username === recovery.username && candidate.empNum === recovery.empNum);
            if (!user) return sendJson(response, 404, { error: "Account not found." });
            user.password = hashPassword(password);
            writeUsers(users);
            recoveryTokens.delete(recoveryToken);
            return sendJson(response, 200, { message: "Password reset successfully." });
        }

        sendJson(response, 404, { error: "Route not found." });
    } catch (error) {
        console.error(error);
        sendJson(response, 500, { error: "The server could not complete that request." });
    }
});

server.on("error", handleServerError);
server.listen(PORT, () => console.log(`Porter backend running at http://localhost:${PORT}`));
