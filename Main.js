// ============ STORAGE AND DATA MANAGEMENT ============
// Define storage keys for localStorage to maintain consistency across the application
const STORAGE_KEYS = {
    users: 'porter-users',                  // Key for storing all registered users
    reports: "porter-reports",              // Key for storing submitted reports
    savedReports: "porter-saved-reports",  // Key for storing draft reports
    activeUser: "active-porter"            // Key for storing the currently logged-in user
};

// Retrieve data from localStorage with fallback value if not found
function getStoredData(key, fallback) {
    const data = localStorage.getItem(key);
    if (data) {
        return JSON.parse(data);
    } else {
        return fallback;
    }
}

// Save data to localStorage as JSON string
function saveStoredData(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

// Get all registered users from storage
function getUsers() {
    return getStoredData(STORAGE_KEYS.users, []);
}

// Save all users to storage
function saveUsers(users) {
    saveStoredData(STORAGE_KEYS.users, users);
}

// Get all submitted reports from storage
function getReports() {
    return getStoredData(STORAGE_KEYS.reports, []);
}

// Save all submitted reports to storage
function saveReports(reports) {
    saveStoredData(STORAGE_KEYS.reports, reports);
}

// Get all draft reports from storage
function getSavedReports() {
    return getStoredData(STORAGE_KEYS.savedReports, []);
}

// Save all draft reports to storage
function saveSavedReports(savedReports) {
    saveStoredData(STORAGE_KEYS.savedReports, savedReports);
}

// Get the currently logged-in user
function getActiveUser() {
    return getStoredData(STORAGE_KEYS.activeUser, null);
}

// Set the currently logged-in user
function setActiveUser(user) {
    saveStoredData(STORAGE_KEYS.activeUser, user);
}

// Clear the logged-in user (sign-out)
function clearActiveUser() {
    localStorage.removeItem(STORAGE_KEYS.activeUser);
}

// Show a temporary message for errors and successful actions.
function showNotification(message, type = "success", redirectUrl) {
    const notification = document.createElement("div");
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    // Remove the message after its display period and then follow any redirect.
    setTimeout(function() {
        notification.remove();
        if (redirectUrl) {
            window.location.href = redirectUrl;
        }
    }, 2000);
}

// Show a centered confirmation message with explicit Confirm and Cancel actions.
function showConfirmation(message, onConfirm) {
    const notification = document.createElement("div");
    notification.className = "notification notification-confirmation";
    notification.innerHTML = `
        <p>${message}</p>
        <div class="notification-actions">
            <button type="button" class="confirmBtn">Confirm</button>
            <button type="button" class="cancelBtn">Cancel</button>
        </div>
    `;

    document.body.appendChild(notification);
    notification.querySelector(".confirmBtn").addEventListener("click", function() {
        notification.remove();
        onConfirm();
    });
    notification.querySelector(".cancelBtn").addEventListener("click", function() {
        notification.remove();
    });
}

// ============ AUTO-FILL CURRENT DATE/TIME ============
// Auto-populate the pickup time field with the current time when the page loads.
// The field is an HTML5 time input, so its value must be formatted as HH:mm.
function initializePickupTime() {
    const pickupTime = document.getElementById("pickupTime");
    if (pickupTime) {
        const currentDate = new Date();
        const hours = String(currentDate.getHours()).padStart(2, "0");
        const minutes = String(currentDate.getMinutes()).padStart(2, "0");
        pickupTime.value = `${hours}:${minutes}`;
    }
}

// ============ FORM VALIDATION ============
function validateUsername(username) {
    return username.trim().length >= 3;
}

function validatePassword(password) {
    return password.length >= 6;
}

// ============ SIGN-IN LOGIC ============
// Handle sign-in form submission with validation and authentication
function initSignInForm() {
    const signinForm = document.getElementById("signinForm");
    if (signinForm) {
        signinForm.addEventListener("submit", function(e) {
            e.preventDefault();
            
            // Get input values and trim whitespace
            const username = document.getElementById("signinUsername").value.trim();
            const empNum = document.getElementById("signinEmpNum").value.trim();
            const password = document.getElementById("signinPassword").value;
            
            // Validate that all fields are filled
            if (!username) {
                showNotification("[Sign In] Please enter your username.", "error");
                return;
            }
            
            if (!empNum) {
                showNotification("[Sign In] Please enter your employee number.", "error");
                return;
            }
            
            if (!password) {
                showNotification("[Sign In] Please enter your password.", "error");
                return;
            }
            
            // Check if user exists in the system
            const users = getUsers();
            const user = users.find(u => u.username === username && u.empNum === empNum);
            
            if (!user) {
                showNotification("[Sign In] Invalid username or employee number.", "error");
                return;
            }
            
            // Verify password matches
            if (user.password !== password) {
                showNotification("[Sign In] Incorrect password.", "error");
                return;
            }
            
            // Store active user and redirect to report page
            setActiveUser({ username: user.username, empNum: user.empNum });
            showNotification("Signed in successfully.", "success", "Report.html");
        });
    }
}

// ============ REGISTRATION LOGIC ============
// Handle registration form submission with validation and new user creation
function initRegisterForm() {
    const registerForm = document.getElementById("registerForm");
    if (registerForm) {
        registerForm.addEventListener("submit", function(e) {
            e.preventDefault();
            
            // Get input values and trim whitespace
            const username = document.getElementById("registerUsername").value.trim();
            const empNum = document.getElementById("registerEmpNum").value.trim();
            const password = document.getElementById("registerPassword").value;
            const confirmPassword = document.getElementById("registerConfirmPassword").value;
            
            // Validate that all fields are filled with individual alerts
            if (!username) {
                showNotification("[Register] Please enter a username.", "error");
                return;
            }
            
            if (!empNum) {
                showNotification("[Register] Please enter an employee number.", "error");
                return;
            }
            
            if (!password) {
                showNotification("[Register] Please enter a password.", "error");
                return;
            }
            
            if (!confirmPassword) {
                showNotification("[Register] Please confirm your password.", "error");
                return;
            }
            
            // Validate username length
            if (!validateUsername(username)) {
                showNotification("[Register] Username must be at least 3 characters.", "error");
                return;
            }
            
            // Validate password length
            if (!validatePassword(password)) {
                showNotification("[Register] Password must be at least 6 characters.", "error");
                return;
            }
            
            // Check that passwords match
            if (password !== confirmPassword) {
                showNotification("[Register] Passwords do not match.", "error");
                return;
            }
            
            // Check for duplicate users
            const users = getUsers();
            if (users.find(u => u.username === username || u.empNum === empNum)) {
                showNotification("[Register] Username or employee number already exists.", "error");
                return;
            }
            
            // Create new user and save to storage
            const newUser = { username, empNum, password };
            users.push(newUser);
            saveUsers(users);
            
            showNotification("Account created successfully.", "success", "SignIn.html");
        });
    }
}

// ============ REPORT FORM LOGIC ============
// Global variable to track whether user is creating a Patient or Blood report
let currentReportType = "Patient";

// Initialize all report form features including auto-fill, toggles, and buttons
function initReportForm() {
    // Auto-fill pickup time with current date and time
    initializePickupTime();
    
    // Handle report type toggle (Patient vs Blood)
    const toggleButtons = document.querySelectorAll(".toggle-btn");
    toggleButtons.forEach(btn => {
        btn.addEventListener("click", function() {
            // Remove active class from all buttons
            toggleButtons.forEach(b => b.classList.remove("active"));
            // Add active class to clicked button
            this.classList.add("active");
            currentReportType = this.getAttribute("data-type");
            
            // Update the second input label based on report type
            const patientNameInput = document.getElementById("reportPatientName");
            if (patientNameInput && patientNameInput.parentElement.tagName === "LABEL") {
                const label = patientNameInput.parentElement;
                const newText = currentReportType === "Blood" ? " Blood specimen" : " Patient Name";
                label.childNodes[0].textContent = newText;
            }
        });
    });
    
    // Auto-fill porter name field with logged-in user's name
    const activeUser = getActiveUser();
    const porterNameInput = document.getElementById("reportPorterName");
    if (porterNameInput && activeUser) {
        porterNameInput.value = activeUser.username;
        porterNameInput.disabled = true; // Lock the field so it can't be edited
    }
    
    // Handle both form actions through the form submit event.
    const reportForm = document.getElementById("reportForm");
    if (reportForm) {
            reportForm.addEventListener("submit", function(e) {
                e.preventDefault();
                const isDraft = e.submitter && e.submitter.classList.contains("saveReturnBtn");
                if (isDraft) {
                    saveReport(true);
                    return;
                }

                // Require confirmation before submitting a completed report.
                showConfirmation("Submit this report?", function() {
                    saveReport(false);
                });
        });
    }
    
    // Display any previously saved draft reports
    displaySavedReports();
}

function validateReportForm(isDraft = false) {
    // Get all form field values and trim whitespace
    const patientName = document.getElementById("reportPatientName").value.trim();
    const pickupWard = document.getElementById("pickupWard").value.trim();
    const pickupTime = document.getElementById("pickupTime").value.trim();
    const dropoffWard = document.getElementById("dropoffWard").value.trim();
    const dropoffTime = document.getElementById("dropoffTime").value.trim();
    
    // Check patient name / blood specimen is filled
    if (!patientName) {
            showNotification("Please enter patient name or blood specimen.", "error");
        return false;
    }
    
    // Check pickup ward is selected
    if (!pickupWard) {
            showNotification("Please select pickup ward.", "error");
        return false;
    }
    
    // Check pickup time is entered
    if (!pickupTime) {
            showNotification("Please enter pickup time.", "error");
        return false;
    }
    
    // Only validate drop-off fields if submitting as final report (not draft)
    if (!isDraft) {
        if (!dropoffWard) {
                showNotification("Please select drop-off ward.", "error");
            return false;
        }
        
        if (!dropoffTime) {
                showNotification("Please enter drop-off time.", "error");
            return false;
        }
    }
    
    return true;
}

// Save or submit the report based on button clicked (Save as Draft or Submit)
function saveReport(isDraft) {
    // Validate form - different rules for draft vs final submission
    if (!validateReportForm(isDraft)) {
        return;
    }
    
    // Gather all report data from form fields
    const activeUser = getActiveUser();
    const report = {
        id: Date.now(),                                                          // Unique ID using current timestamp
        porter: activeUser.username,                                            // Name of the porter submitting the report
        type: currentReportType,                                               // Report type: "Patient" or "Blood"
        patientName: document.getElementById("reportPatientName").value.trim(),
        pickupWard: document.getElementById("pickupWard").value.trim(),
        pickupTime: document.getElementById("pickupTime").value.trim(),
        dropoffWard: document.getElementById("dropoffWard").value.trim(),
        dropoffTime: document.getElementById("dropoffTime").value.trim(),
        feedback: document.getElementById("reportFeedback").value.trim(),
        isDraft: isDraft,
        createdAt: new Date().toISOString()                                     // Timestamp of when report was created
    };
    
    if (isDraft) {
        const savedReports = getSavedReports();
        savedReports.push(report);
        saveSavedReports(savedReports);
            showNotification("Report saved as draft.", "success");
        displaySavedReports();
        clearReportForm();
    } else {
        const reports = getReports();
        reports.push(report);
        saveReports(reports);
            showNotification("Report submitted successfully.", "success");
        clearReportForm();
        displaySavedReports();
    }
}

// Clear all form fields and reset to default state
// Called after successfully saving or submitting a report
function clearReportForm() {
    document.getElementById("reportForm").reset();
    initializePickupTime();
}

// Display all saved draft reports in the Save & Return sidebar
// Creates list items with load and delete buttons for each draft
// Updates dynamically when reports are saved or deleted
function displaySavedReports() {
    const saveReturnList = document.getElementById("save-return-list");
    if (!saveReturnList) return;
    
    // Get all draft reports from storage
    const savedReports = getSavedReports();
    saveReturnList.innerHTML = "";
    
    // Show message if no drafts exist
    if (savedReports.length === 0) {
        saveReturnList.innerHTML = "<li>No saved reports</li>";
        return;
    }
    
    // Create list item for each draft report
    savedReports.forEach(report => {
        const li = document.createElement("li");
        li.innerHTML = `
            <strong>${report.type} - ${report.patientName}</strong>
            <p>${report.pickupWard} → ${report.dropoffWard}</p>
            <button onclick="loadDraftReport(${report.id})" class="loadDraftBtn">Load</button>
            <button onclick="deleteDraftReport(${report.id})" class="deleteDraftBtn">Delete</button>
        `;
        saveReturnList.appendChild(li);
    });
}

// Load a draft report back into the form for editing and completion
// Populates all form fields with previously saved data
// Restores the report type toggle state as well
function loadDraftReport(reportId) {
    // Find the draft report by ID
    const savedReports = getSavedReports();
    const report = savedReports.find(r => r.id === reportId);
    
    if (report) {
        // Populate all form fields with saved data
        document.getElementById("reportPatientName").value = report.patientName;
        document.getElementById("pickupWard").value = report.pickupWard;
        document.getElementById("pickupTime").value = report.pickupTime;
        document.getElementById("dropoffWard").value = report.dropoffWard;
        document.getElementById("dropoffTime").value = report.dropoffTime;
        document.getElementById("reportFeedback").value = report.feedback;
        
        // Restore the report type toggle state
        const toggleButtons = document.querySelectorAll(".toggle-btn");
        toggleButtons.forEach(btn => {
            btn.classList.remove("active");
            if (btn.getAttribute("data-type") === report.type) {
                btn.classList.add("active");
                currentReportType = report.type;
            }
        });
        
    }
}

// Delete a draft report from the Save & Return list
// Asks for confirmation before permanently deleting
function deleteDraftReport(reportId) {
    // Require confirmation before permanently deleting a saved draft.
    showConfirmation("Delete this draft?", function() {
        // Find and remove the draft from storage
        const savedReports = getSavedReports();
        const updatedReports = savedReports.filter(r => r.id !== reportId);
        saveSavedReports(updatedReports);
        // Refresh the display to show updated list
        displaySavedReports();
    });
}

// ============ FORMAT PORTER NAME ============
// Convert full name to abbreviated format (e.g., "John Wells" becomes "J.Wells")
// Used for displaying porter names in the history table
function formatPorterName(username) {
    // Split full name by whitespace to extract first and last name
    const parts = username.trim().split(/\s+/);
    if (parts.length === 0) return username;
    
    const firstName = parts[0];
    const lastName = parts.length > 1 ? parts[parts.length - 1] : "";
    
    // Format as "Initial.Surname" with proper capitalization (first letter caps, rest lowercase)
    if (lastName) {
        return firstName.charAt(0).toUpperCase() + "." + lastName.charAt(0).toUpperCase() + lastName.slice(1).toLowerCase();
    }
    return firstName.charAt(0).toUpperCase() + "." + firstName.slice(1).toLowerCase();
}

// ============ HISTORY PAGE LOGIC ============
// Retrieve all submitted reports and display them in the history table
// Formats porter names and creates a readable transfer description
function initHistoryTable() {
    const historyTableBody = document.getElementById("historyTableBody");
    if (!historyTableBody) return;
    
    // Get all submitted reports from storage
    const reports = getReports();
    
    // Show message if no reports have been submitted yet
    if (reports.length === 0) {
        historyTableBody.innerHTML = "<tr><td colspan='4' style='text-align: center;'>No reports submitted yet.</td></tr>";
        return;
    }
    
    // Clear table body and create rows for each report
    historyTableBody.innerHTML = "";
    reports.forEach(report => {
        const row = document.createElement("tr");
        // Format time range (e.g., "14:30 - 15:45")
        const timeRange = `${report.pickupTime} - ${report.dropoffTime}`;
        // Format transfer description (e.g., "ICU → Ward A")
        const transfer = `${report.pickupWard} → ${report.dropoffWard}`;
        // Format porter name (e.g., "John Wells" becomes "J.Wells")
        const formattedPorterName = formatPorterName(report.porter);
        
        // Create table row with formatted data
        row.innerHTML = `
            <td>${formattedPorterName}</td>
            <td>${report.type}</td>
            <td>${transfer}</td>
            <td>${timeRange}</td>
        `;
        historyTableBody.appendChild(row);
    });
}

// ============ SIGN-OUT LOGIC ============
// Handle sign-out functionality on all pages
// Clears the active user session and redirects to Sign-In page
function initSignOut() {
    // Find all sign-out links throughout the application
    const signOutLinks = document.querySelectorAll("#SignOutLink");
    signOutLinks.forEach(link => {
        link.addEventListener("click", function(e) {
            e.preventDefault();
            // Confirm sign-out before clearing the active session.
                showConfirmation("Sign out of your account?", function() {
                    clearActiveUser();
                    window.location.href = "SignIn.html";
                });
        });
    });
}

// ============ INITIALIZE ON PAGE LOAD ============
// Main initialization function that runs when page fully loads
// Initializes different components based on which page is loaded
document.addEventListener("DOMContentLoaded", function() {
    // Initialize sign-in form (only present on SignIn.html)
    initSignInForm();
    // Initialize registration form (only present on Register.html)
    initRegisterForm();
    // Initialize report form (only present on Report.html)
    initReportForm();
    // Initialize and display history table (only present on History.html)
    initHistoryTable();
    // Initialize sign-out functionality (present on Report.html and History.html)
    initSignOut();
});