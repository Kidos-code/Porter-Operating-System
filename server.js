// Minimal backend for registration, sign-in, and password resets.
// Configure SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASSWORD to send real email.
const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const sql = require("mssql");
const nodemailer = require("nodemailer");

const PORT = Number(process.env.PORT || 3000);
const DATA_FILE = path.join(__dirname, "data", "users.json");
const REPORTS_FILE = path.join(__dirname, "data", "reports.json");
const resetCodes = new Map();
const contentTypes = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

const sqlConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER || "localhost",
    database: process.env.DB_NAME || "PorterTrackingDB",
    port: Number(process.env.DB_PORT || 1433),
    options: {
        encrypt: process.env.DB_ENCRYPT === "true",
        trustServerCertificate: true,
        enableArithAbort: true
    },
    pool: {
        max: 5,
        min: 0,
        idleTimeoutMillis: 30000
    }
};
let sqlPool;

async function getSqlPool() {
    if (!sqlPool) {
        sqlPool = await sql.connect(sqlConfig);
    }
    return sqlPool;
}

function mapReportToSqlRow(report) {
    const normalizedType = String(report.type || "").trim().toLowerCase();
    const patientNumber = normalizedType === "patient" ? String(report.hospitalNumber || "").trim() : "";
    const specimen = normalizedType === "blood" ? String(report.patientName || "").trim() : "";
    const patientName = normalizedType === "patient" ? String(report.patientName || "").trim() : "";

    return {
        Porter: String(report.porter || "").trim(),
        ReportType: String(report.type || "").trim(),
        PatientName: patientName,
        PatientNumber: patientNumber,
        Specimen: specimen,
        PickupWard: String(report.pickupWard || "").trim(),
        PickupTime: String(report.pickupTime || "").trim(),
        DropoffWard: String(report.dropoffWard || "").trim(),
        DropoffTime: String(report.dropoffTime || "").trim(),
        Feedback: String(report.feedback || "").trim(),
        ReportDate: String(report.reportDate || new Date().toISOString().slice(0, 10)),
        CreatedAt: String(report.createdAt || new Date().toISOString())
    };
}

async function saveReportToSql(report) {
    if (!process.env.DB_SERVER && !process.env.DB_NAME) {
        return false;
    }

    try {
        const pool = await getSqlPool();
        const row = mapReportToSqlRow(report);
        await pool.request()
            .input("Porter", sql.NVarChar(200), row.Porter)
            .input("ReportType", sql.NVarChar(50), row.ReportType)
            .input("PatientName", sql.NVarChar(200), row.PatientName)
            .input("PatientNumber", sql.NVarChar(100), row.PatientNumber)
            .input("Specimen", sql.NVarChar(200), row.Specimen)
            .input("PickupWard", sql.NVarChar(200), row.PickupWard)
            .input("PickupTime", sql.NVarChar(50), row.PickupTime)
            .input("DropoffWard", sql.NVarChar(200), row.DropoffWard)
            .input("DropoffTime", sql.NVarChar(50), row.DropoffTime)
            .input("Feedback", sql.NVarChar(sql.MAX), row.Feedback)
            .input("ReportDate", sql.Date, new Date(row.ReportDate))
            .input("CreatedAt", sql.DateTime2, new Date(row.CreatedAt))
            .query(`
                INSERT INTO Reports (
                    Porter,
                    ReportType,
                    PatientName,
                    PatientNumber,
                    Specimen,
                    PickupWard,
                    PickupTime,
                    DropoffWard,
                    DropoffTime,
                    Feedback,
                    ReportDate,
                    CreatedAt
                ) VALUES (
                    @Porter,
                    @ReportType,
                    @PatientName,
                    @PatientNumber,
                    @Specimen,
                    @PickupWard,
                    @PickupTime,
                    @DropoffWard,
                    @DropoffTime,
                    @Feedback,
                    @ReportDate,
                    @CreatedAt
                )
            `);
        return true;
    } catch (error) {
        console.error("SQL report insert failed:", error.message);
        return false;
    }
}

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
    const [salt, storedHash] = storedPassword.split(":");
    const hash = crypto.scryptSync(password, salt, 64).toString("hex");
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(storedHash, "hex"));
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

async function sendResetEmail(email, code) {
    // Without SMTP settings, return a development-only code for local testing.
    if (!process.env.SMTP_HOST) {
        return false;
    }

    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === "true",
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
    });
    await transporter.sendMail({
        from: process.env.EMAIL_FROM || process.env.SMTP_USER,
        to: email,
        subject: "Porter Tracking System password reset code",
        text: `Your password reset code is ${code}. It expires in 10 minutes.`
    });
    return true;
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
        const fileName = requestedPath === "/" ? "Index.html" : requestedPath.slice(1);
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
            const email = String(body.email || "").trim().toLowerCase();
            const password = String(body.password || "");
            if (!username || !empNum || !email || password.length < 6) {
                return sendJson(response, 400, { error: "All fields are required and the password must be at least 6 characters." });
            }
            if (users.some(user => user.username === username || user.empNum === empNum || user.email === email)) {
                return sendJson(response, 409, { error: "Username, employee number, or email already exists." });
            }
            users.push({ username, empNum, email, password: hashPassword(password) });
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

        if (request.method === "POST" && request.url === "/api/forgot-password") {
            const email = String(body.email || "").trim().toLowerCase();
            const user = users.find(candidate => candidate.email === email);
            if (!user) {
                return sendJson(response, 404, { error: "No account was found for that email address." });
            }
            const code = String(crypto.randomInt(100000, 1000000));
            resetCodes.set(email, { code, expiresAt: Date.now() + 10 * 60 * 1000 });
            const emailSent = await sendResetEmail(email, code);
            return sendJson(response, 200, {
                message: emailSent ? "A reset code was sent to your email." : "Development mode: use the reset code shown below.",
                developmentCode: emailSent ? undefined : code
            });
        }

        if (request.method === "POST" && request.url === "/api/reset-password") {
            const email = String(body.email || "").trim().toLowerCase();
            const password = String(body.password || "");
            const reset = resetCodes.get(email);
            if (!reset || reset.expiresAt < Date.now() || reset.code !== String(body.code || "")) {
                return sendJson(response, 400, { error: "The reset code is invalid or has expired." });
            }
            if (password.length < 6) {
                return sendJson(response, 400, { error: "The new password must be at least 6 characters." });
            }
            const user = users.find(candidate => candidate.email === email);
            user.password = hashPassword(password);
            writeUsers(users);
            resetCodes.delete(email);
            return sendJson(response, 200, { message: "Password reset successfully." });
        }

        sendJson(response, 404, { error: "Route not found." });
    } catch (error) {
        console.error(error);
        sendJson(response, 500, { error: "The server could not complete that request." });
    }
});

server.listen(PORT, () => console.log(`Porter backend running at http://localhost:${PORT}`));
