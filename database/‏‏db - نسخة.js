const fs = require('fs');

const APPS_FILE = './database/applications.json';
const PERSONNEL_FILE = './database/personnel.json';
const CONTENT_FILE = './database/content.json';
const SETTINGS_FILE = './database/settings.json';
const NOTIFICATIONS_FILE = './database/notifications.json';
const QUESTIONS_FILE = './database/questions.json'; // الأسئلة الديناميكية
const ARCHIVE_FILE = './database/archive.json'; // أرشيف التقديمات
const CUSTODY_FILE = './database/custody.json';
const CERTS_FILE = './database/certs.json';


if (!fs.existsSync(CERTS_FILE)) {
    fs.writeFileSync(CERTS_FILE, JSON.stringify({
        settings: {
            motorcycle: { open: false, questions: [] },
            operations: { open: false, questions: [] },
            aviation: { open: false, questions: [] },
            driving: { open: false, questions: [] },
            marksman: { open: false, questions: [] },
            train_motorcycle: { open: false, questions: [] },
            train_operations: { open: false, questions: [] },
            train_aviation: { open: false, questions: [] },
            train_driving: { open: false, questions: [] },
            train_marksman: { open: false, questions: [] }
        },
        apps: {}
    }, null, 2));
}

if (!fs.existsSync(CUSTODY_FILE)) fs.writeFileSync(CUSTODY_FILE, JSON.stringify({ weaponTypes: [], weaponLogs: [], vehicleLogs: [] }));
// إنشاء الملفات إذا لم تكن موجودة
if (!fs.existsSync(APPS_FILE)) fs.writeFileSync(APPS_FILE, JSON.stringify({}));
if (!fs.existsSync(PERSONNEL_FILE)) fs.writeFileSync(PERSONNEL_FILE, JSON.stringify({}));
if (!fs.existsSync(CONTENT_FILE)) fs.writeFileSync(CONTENT_FILE, JSON.stringify({ publicRules: [], policeRules: [], armory: [] }));
if (!fs.existsSync(SETTINGS_FILE)) fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ appsOpen: false }));
if (!fs.existsSync(NOTIFICATIONS_FILE)) fs.writeFileSync(NOTIFICATIONS_FILE, JSON.stringify({}));
if (!fs.existsSync(QUESTIONS_FILE)) fs.writeFileSync(QUESTIONS_FILE, JSON.stringify([])); // مصفوفة فارغة
if (!fs.existsSync(ARCHIVE_FILE)) fs.writeFileSync(ARCHIVE_FILE, JSON.stringify({}));

module.exports = {
    getApps: () => JSON.parse(fs.readFileSync(APPS_FILE, 'utf8')),
    saveApps: (data) => fs.writeFileSync(APPS_FILE, JSON.stringify(data, null, 2)),
    getPersonnel: () => JSON.parse(fs.readFileSync(PERSONNEL_FILE, 'utf8')),
    savePersonnel: (data) => fs.writeFileSync(PERSONNEL_FILE, JSON.stringify(data, null, 2)),
    getContent: () => JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8')),
    saveContent: (data) => fs.writeFileSync(CONTENT_FILE, JSON.stringify(data, null, 2)),
    getSettings: () => JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')),
    saveSettings: (data) => fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2)),
    getNotifications: () => JSON.parse(fs.readFileSync(NOTIFICATIONS_FILE, 'utf8')),
    saveNotifications: (data) => fs.writeFileSync(NOTIFICATIONS_FILE, JSON.stringify(data, null, 2)),
    addNotification: function(userId, message, type = 'info') {
        const notifs = this.getNotifications();
        if (!notifs[userId]) notifs[userId] = [];
        notifs[userId].push({ message, type });
        this.saveNotifications(notifs);
    },
    clearNotifications: function(userId) {
        const notifs = this.getNotifications();
        if (notifs[userId]) { delete notifs[userId]; this.saveNotifications(notifs); }
    },
    getQuestions: () => JSON.parse(fs.readFileSync(QUESTIONS_FILE, 'utf8')),
    saveQuestions: (data) => fs.writeFileSync(QUESTIONS_FILE, JSON.stringify(data, null, 2)),
    getArchive: () => JSON.parse(fs.readFileSync(ARCHIVE_FILE, 'utf8')),
    saveArchive: (data) => fs.writeFileSync(ARCHIVE_FILE, JSON.stringify(data, null, 2)),
    getCustody: () => JSON.parse(fs.readFileSync(CUSTODY_FILE, 'utf8')),
    saveCustody: (data) => fs.writeFileSync(CUSTODY_FILE, JSON.stringify(data, null, 2)),
    getCerts: () => JSON.parse(fs.readFileSync(CERTS_FILE, 'utf8')),
    saveCerts: (data) => fs.writeFileSync(CERTS_FILE, JSON.stringify(data, null, 2))
};