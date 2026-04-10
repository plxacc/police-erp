require('dotenv').config();
const express = require('express');
const axios = require('axios');
const session = require('express-session');
const db = require('./database/db'); 
const { Client, GatewayIntentBits, EmbedBuilder, Events } = require('discord.js');

const app = express();
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'police_erp_final_v3', resave: false, saveUninitialized: true }));

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
client.login(process.env.BOT_TOKEN);
client.once(Events.ClientReady, async c => {
    console.log(`✅ النظام العسكري مفعل: ${c.user.tag}`);
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    if(guild) await guild.members.fetch().catch(console.error); 
});

// تم إضافة رتبة "مستجد" في بداية السلم العسكري
const RANKS_LADDER = ["مستجد", "جندي", "جندي أول", "عريف", "وكيل رقيب", "رقيب", "رقيب أول", "رئيس رقباء", "ملازم", "ملازم أول", "نقيب", "رائد", "مقدم", "عقيد", "عميد", "لواء", "فريق", "فريق أول"];

const CERT_TYPES = {
    "motorcycle": { name: "شهادة دباب", minRank: "جندي", type: "enlisted" },
    "operations": { name: "شهادة عمليات", minRank: "جندي", type: "enlisted" },
    "aviation": { name: "شهادة طيران", minRank: "جندي أول", type: "enlisted" },
    "driving": { name: "شهادة قيادة احترافية", minRank: "عريف", type: "enlisted" },
    "marksman": { name: "شهادة تصويب ممتاز", minRank: "عريف", type: "enlisted" },
    "train_motorcycle": { name: "شهادة تدريب دباب", minRank: "وكيل رقيب", type: "nco" },
    "train_operations": { name: "شهادة تدريب عمليات", minRank: "وكيل رقيب", type: "nco" },
    "train_aviation": { name: "شهادة تدريب طيران", minRank: "رقيب", type: "nco" },
    "train_driving": { name: "شهادة تدريب قيادة احترافية", minRank: "رقيب أول", type: "nco" },
    "train_marksman": { name: "شهادة تدريب تصويب ممتاز", minRank: "رقيب أول", type: "nco" }
};

function safeArchivePush(archiveDB, userId, logData) {
    if (!archiveDB[userId]) archiveDB[userId] = [];
    else if (!Array.isArray(archiveDB[userId])) archiveDB[userId] = [archiveDB[userId]];
    logData.timestamp = Date.now(); archiveDB[userId].push(logData);
    try {
        const channel = client.channels.cache.get(process.env.LOG_CHANNEL_ID);
        if (channel) {
            let color = 0x808080; let title = "📄 سجل القطاع العسكري";
            if (logData.type === 'enlist') { color = 0x2ECC71; title = "🎖️ تجنيد جديد"; }
            else if (logData.type === 'fail_training' || logData.type === 'reject') { color = 0xE74C3C; title = "❌ رفض / عدم اجتياز"; }
            else if (logData.type === 'fire') { color = 0x992D22; title = "⚠️ فصل وطي قيد"; }
            else if (logData.type === 'promotion') { color = 0xF1C40F; title = "📈 ترقية / تعديل رتبة"; }
            else if (logData.type === 'cert_granted') { color = 0x9B59B6; title = "📜 منح شهادة عسكرية"; }
            else if (logData.type === 'cert_revoked') { color = 0xE74C3C; title = "❌ سحب شهادة عسكرية"; }
            const embed = new EmbedBuilder().setTitle(title).setColor(color).addFields({ name: "العسكري / المتقدم", value: `${logData.username} (<@${userId}>)`, inline: true }, { name: "المسؤول", value: logData.actionBy, inline: true }, { name: "التفاصيل", value: logData.details, inline: false }).setTimestamp();
            channel.send({ embeds: [embed] }).catch(()=>{});
        }
    } catch (err) {}
}

app.use(async (req, res, next) => {
    if (req.session.user) {
        const notifsDB = db.getNotifications(); res.locals.notifications = notifsDB[req.session.user.id] || [];
        if (res.locals.notifications.length > 0) db.clearNotifications(req.session.user.id);
        req.session.user.perms = { isActivated: false, isEnlisted: false, isNCO: false, isOfficer: false, isPolice: false };
        try {
            const guild = client.guilds.cache.get(process.env.GUILD_ID);
            if(guild) {
                const member = guild.members.cache.get(req.session.user.id);
                if(member) {
                    req.session.user.perms.isActivated = member.roles.cache.has(process.env.REQUIRED_ROLE_ID);
                    req.session.user.perms.isEnlisted = member.roles.cache.has(process.env.ENLISTED_ROLE_ID);
                    req.session.user.perms.isNCO = member.roles.cache.has(process.env.NCO_ROLE_ID);
                    req.session.user.perms.isOfficer = member.roles.cache.has(process.env.OFFICERS_ROLE_ID);
                    req.session.user.perms.isPolice = req.session.user.perms.isEnlisted || req.session.user.perms.isNCO || req.session.user.perms.isOfficer;
                }
            }
            const personnelDB = db.getPersonnel();
            if (req.session.user.perms.isPolice) {
                // تعديل الرتبة الافتراضية إلى مستجد
                if (!personnelDB[req.session.user.id]) { personnelDB[req.session.user.id] = { rank: "مستجد", certs: [] }; db.savePersonnel(personnelDB); }
                req.session.user.customRank = personnelDB[req.session.user.id].rank;
            }
        } catch(e) {}
    } else { res.locals.notifications = []; }
    next();
});

app.get('/', (req, res) => res.render('index', { user: req.session.user }));
app.get('/public-rules', (req, res) => { res.render('content', { user: req.session.user, section: 'publicRules', pageTitle: 'قوانين المواطنين', pageDesc: 'الأنظمة والقوانين العامة للمدينة.', items: db.getContent().publicRules || [] }); });
app.get('/police-rules', (req, res) => { if (!req.session.user || !req.session.user.perms.isPolice) return res.redirect('/'); res.render('content', { user: req.session.user, section: 'policeRules', pageTitle: 'قوانين العسكر', pageDesc: 'أنظمة ولوائح القطاع العسكري الداخلي.', items: db.getContent().policeRules || [] }); });

app.get('/login', (req, res) => res.redirect(`https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}&response_type=code&scope=identify%20guilds`));
app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });
app.get('/callback', async (req, res) => {
    try {
        const response = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({ client_id: process.env.CLIENT_ID, client_secret: process.env.CLIENT_SECRET, code: req.query.code, grant_type: 'authorization_code', redirect_uri: process.env.REDIRECT_URI, scope: 'identify guilds' }));
        const userRes = await axios.get('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${response.data.access_token}` } });
        req.session.user = userRes.data; res.redirect('/');
    } catch (e) { res.send('خطأ.'); }
});

app.get('/jobs', (req, res) => { if (!req.session.user) return res.redirect('/login'); if (!req.session.user.perms.isActivated || req.session.user.perms.isPolice) return res.redirect('/'); const appsDB = db.getApps(); res.render('jobs', { user: req.session.user, status: appsDB[req.session.user.id] ? appsDB[req.session.user.id].status : 'open', appsOpen: db.getSettings().appsOpen, rules: db.getContent().publicRules || [], questions: db.getQuestions() }); });
app.post('/submit', async (req, res) => { if (!req.session.user || !req.session.user.perms.isActivated || !db.getSettings().appsOpen) return res.redirect('/'); const appsDB = db.getApps(); if (appsDB[req.session.user.id]) return res.send('لقد قدمت مسبقاً!'); appsDB[req.session.user.id] = { status: 'applied', date: new Date().toLocaleString('ar-SA'), username: req.session.user.username, answers: req.body }; db.saveApps(appsDB); const guild = client.guilds.cache.get(process.env.GUILD_ID); const member = guild.members.cache.get(req.session.user.id); if(member) await member.roles.add(process.env.APPLIED_ROLE_ID).catch(()=>{}); res.redirect('/jobs'); });

app.get('/admin', (req, res) => { if (!req.session.user || !(req.session.user.perms.isNCO || req.session.user.perms.isOfficer)) return res.redirect('/'); res.render('admin', { user: req.session.user, db: db.getApps(), questions: db.getQuestions() }); });
app.post('/admin/action', async (req, res) => {
    if (!req.session.user || !(req.session.user.perms.isNCO || req.session.user.perms.isOfficer)) return res.redirect('/');
    const { userId, action, reason } = req.body; const appsDB = db.getApps(); const archiveDB = db.getArchive();
    const guild = client.guilds.cache.get(process.env.GUILD_ID); const target = guild.members.cache.get(userId);
    if (action === 'accept') { if (target) { await target.roles.add(process.env.INITIAL_ACCEPT_ROLE_ID).catch(()=>{}); await target.roles.remove(process.env.APPLIED_ROLE_ID).catch(()=>{}); } appsDB[userId].status = 'accepted'; appsDB[userId].actionBy = req.session.user.username; db.addNotification(userId, '✅ تم قبولك مبدئياً.', 'success'); } 
    else if (action === 'reject') { if (target) { await target.roles.remove(process.env.APPLIED_ROLE_ID).catch(()=>{}); await target.roles.remove(process.env.INITIAL_ACCEPT_ROLE_ID).catch(()=>{}); } appsDB[userId].status = 'rejected'; safeArchivePush(archiveDB, userId, { username: appsDB[userId].username, type: 'reject', details: `رفض مبدئي. السبب: ${reason}`, answers: appsDB[userId].answers, actionBy: req.session.user.username }); db.saveArchive(archiveDB); db.addNotification(userId, '❌ تم رفض طلبك.', 'danger'); } 
    else if (action === 'fail_training') { if (target) { await target.roles.remove(process.env.INITIAL_ACCEPT_ROLE_ID).catch(()=>{}); } appsDB[userId].status = 'rejected'; safeArchivePush(archiveDB, userId, { username: appsDB[userId].username, type: 'fail_training', details: `عدم اجتياز. السبب: ${reason}`, answers: appsDB[userId].answers, actionBy: req.session.user.username }); db.saveArchive(archiveDB); db.addNotification(userId, '❌ لم تجتز الدورة.', 'danger'); }
    db.saveApps(appsDB); res.redirect('/admin');
});

app.post('/admin/enlist', async (req, res) => {
    if (!req.session.user || !req.session.user.perms.isOfficer) return res.redirect('/');
    const { userId } = req.body; const appsDB = db.getApps(); const personnelDB = db.getPersonnel(); const archiveDB = db.getArchive();
    const guild = client.guilds.cache.get(process.env.GUILD_ID); const target = guild.members.cache.get(userId);
    if (target) { await target.roles.add(process.env.ENLISTED_ROLE_ID).catch(()=>{}); await target.roles.remove([process.env.INITIAL_ACCEPT_ROLE_ID, process.env.APPLIED_ROLE_ID]).catch(()=>{}); }
    
    // تجنيد الفرد برتبة "مستجد" كبداية
    personnelDB[userId] = { rank: "مستجد", certs: [] }; db.savePersonnel(personnelDB);
    safeArchivePush(archiveDB, userId, { username: appsDB[userId].username, type: 'enlist', details: 'تجنيد نهائي (مستجد)', answers: appsDB[userId].answers, actionBy: req.session.user.username }); db.saveArchive(archiveDB);
    delete appsDB[userId]; db.saveApps(appsDB); db.addNotification(userId, '🎖️ تم تجنيدك برتبة مستجد.', 'success'); res.redirect('/admin');
});
app.post('/admin/toggle-apps', (req, res) => { if (!req.session.user || !req.session.user.perms.isOfficer) return res.redirect('/'); const settings = db.getSettings(); settings.appsOpen = !settings.appsOpen; db.saveSettings(settings); res.redirect('/system'); });

// ==========================================
// 📜 نظام الشهادات العسكرية
// ==========================================
app.get('/certificates', (req, res) => {
    if (!req.session.user || !req.session.user.perms.isPolice) return res.redirect('/');
    const certsDB = db.getCerts();
    const myRank = req.session.user.customRank;
    const rankIndex = RANKS_LADDER.indexOf(myRank);
    const personnelDB = db.getPersonnel();
    const myCerts = personnelDB[req.session.user.id]?.certs || [];
    const apps = certsDB.apps[req.session.user.id] || {};

    let availableCerts = {};
    for (let key in CERT_TYPES) {
        let cert = CERT_TYPES[key];
        let reqIndex = RANKS_LADDER.indexOf(cert.minRank);
        if (rankIndex >= reqIndex && ((cert.type === 'enlisted' && rankIndex <= 3) || (cert.type === 'nco' && rankIndex >= 4))) {
            availableCerts[key] = cert;
        }
    }
    res.render('certificates', { user: req.session.user, certTypes: CERT_TYPES, availableCerts, settings: certsDB.settings, myCerts, apps });
});

app.post('/certificates/apply', (req, res) => {
    if (!req.session.user || !req.session.user.perms.isPolice) return res.redirect('/');
    const { certId, answers } = req.body;
    const certsDB = db.getCerts();
    if (!certsDB.settings[certId] || !certsDB.settings[certId].open) return res.redirect('/certificates');
    if (!certsDB.apps[req.session.user.id]) certsDB.apps[req.session.user.id] = {};
    certsDB.apps[req.session.user.id][certId] = { status: 'pending', answers: JSON.parse(answers), date: new Date().toLocaleString('ar-SA'), username: req.session.user.username };
    db.saveCerts(certsDB);
    db.addNotification(req.session.user.id, `✅ تم تقديم طلبك للحصول على ${CERT_TYPES[certId].name}.`, 'success');
    res.redirect('/certificates');
});

app.get('/system/certificates', (req, res) => { if (!req.session.user || !req.session.user.perms.isOfficer) return res.redirect('/'); res.render('cert_admin', { user: req.session.user, certTypes: CERT_TYPES, certsDB: db.getCerts() }); });
app.post('/system/certificates/toggle', (req, res) => { if (!req.session.user || !req.session.user.perms.isOfficer) return res.redirect('/'); const certsDB = db.getCerts(); certsDB.settings[req.body.certId].open = !certsDB.settings[req.body.certId].open; db.saveCerts(certsDB); res.redirect('/system/certificates'); });
app.post('/system/certificates/questions/add', (req, res) => { if (!req.session.user || !req.session.user.perms.isOfficer) return res.redirect('/'); const certsDB = db.getCerts(); certsDB.settings[req.body.certId].questions.push({ label: req.body.questionLabel }); db.saveCerts(certsDB); res.redirect('/system/certificates'); });
app.post('/system/certificates/questions/delete', (req, res) => { if (!req.session.user || !req.session.user.perms.isOfficer) return res.redirect('/'); const certsDB = db.getCerts(); certsDB.settings[req.body.certId].questions.splice(req.body.index, 1); db.saveCerts(certsDB); res.redirect('/system/certificates'); });

app.post('/system/certificates/action', (req, res) => {
    if (!req.session.user || !req.session.user.perms.isOfficer) return res.redirect('/');
    const { userId, certId, action } = req.body; const certsDB = db.getCerts(); const personnelDB = db.getPersonnel(); const archiveDB = db.getArchive();
    if (action === 'accept') {
        if (!personnelDB[userId].certs) personnelDB[userId].certs = [];
        if (!personnelDB[userId].certs.includes(certId)) personnelDB[userId].certs.push(certId);
        db.savePersonnel(personnelDB);
        safeArchivePush(archiveDB, userId, { username: certsDB.apps[userId][certId].username, type: 'cert_granted', details: `منح ${CERT_TYPES[certId].name}`, actionBy: req.session.user.username }); db.saveArchive(archiveDB);
        db.addNotification(userId, `🎖️ مبروك! تم منحك ${CERT_TYPES[certId].name}.`, 'success'); delete certsDB.apps[userId][certId];
    } else if (action === 'reject') { certsDB.apps[userId][certId].status = 'rejected'; db.addNotification(userId, `❌ تم رفض طلبك للحصول على ${CERT_TYPES[certId].name}.`, 'danger'); } 
    db.saveCerts(certsDB); res.redirect('/system/certificates');
});

// ==========================================
// ⚙️ اللوحة المركزية (باقي مسارات الإدارة)
// ==========================================
app.get('/system', async (req, res) => {
    if (!req.session.user || !req.session.user.perms.isOfficer) return res.redirect('/');
    const guild = client.guilds.cache.get(process.env.GUILD_ID); const members = guild.members.cache;
    const counts = { officers: members.filter(m => process.env.OFFICERS_ROLE_ID && m.roles.cache.has(process.env.OFFICERS_ROLE_ID)).size, ncos: members.filter(m => process.env.NCO_ROLE_ID && m.roles.cache.has(process.env.NCO_ROLE_ID)).size, enlisted: members.filter(m => process.env.ENLISTED_ROLE_ID && m.roles.cache.has(process.env.ENLISTED_ROLE_ID)).size };
    let custody = db.getCustody(); if(!custody.vehicleTypes) custody.vehicleTypes = [];
    res.render('system', { user: req.session.user, counts, appsOpen: db.getSettings().appsOpen, custody });
});

app.post('/system/reset-rejected', (req, res) => { if (!req.session.user || !req.session.user.perms.isOfficer) return res.redirect('/'); const appsDB = db.getApps(); let count = 0; for (const userId in appsDB) { if (appsDB[userId].status === 'rejected') { delete appsDB[userId]; count++; } } db.saveApps(appsDB); db.addNotification(req.session.user.id, `✅ تم مسح الحظر عن ${count} متقدمين.`, 'success'); res.redirect('/system'); });
app.post('/system/weapon-types/add', (req, res) => { if (!req.session.user || !req.session.user.perms.isOfficer) return res.redirect('/system'); const custodyDB = db.getCustody(); custodyDB.weaponTypes.push(req.body.weaponName); db.saveCustody(custodyDB); res.redirect('/system'); });
app.post('/system/vehicle-types/add', (req, res) => { if (!req.session.user || !req.session.user.perms.isOfficer) return res.redirect('/system'); const custodyDB = db.getCustody(); if(!custodyDB.vehicleTypes) custodyDB.vehicleTypes = []; custodyDB.vehicleTypes.push(req.body.vehicleName); db.saveCustody(custodyDB); res.redirect('/system'); });
app.get('/system/questions', (req, res) => { if (!req.session.user || !req.session.user.perms.isOfficer) return res.redirect('/'); res.render('questions', { user: req.session.user, questions: db.getQuestions() }); });
app.post('/system/questions/add', (req, res) => { if (!req.session.user || !req.session.user.perms.isOfficer) return res.redirect('/'); const questions = db.getQuestions(); questions.push({ label: req.body.questionLabel }); db.saveQuestions(questions); res.redirect('/system/questions'); });
app.post('/system/questions/edit', (req, res) => { if (!req.session.user || !req.session.user.perms.isOfficer) return res.redirect('/'); const questions = db.getQuestions(); if (questions[req.body.index]) questions[req.body.index].label = req.body.newLabel; db.saveQuestions(questions); res.redirect('/system/questions'); });
app.post('/system/questions/delete', (req, res) => { if (!req.session.user || !req.session.user.perms.isOfficer) return res.redirect('/'); const questions = db.getQuestions(); questions.splice(req.body.index, 1); db.saveQuestions(questions); res.redirect('/system/questions'); });

app.get('/system/personnel', (req, res) => {
    if (!req.session.user || !req.session.user.perms.isOfficer) return res.redirect('/');
    const guild = client.guilds.cache.get(process.env.GUILD_ID); const members = guild.members.cache;
    const policeMembers = members.filter(m => m.roles.cache.has(process.env.ENLISTED_ROLE_ID) || m.roles.cache.has(process.env.NCO_ROLE_ID) || m.roles.cache.has(process.env.OFFICERS_ROLE_ID));
    const personnelDB = db.getPersonnel();
    const list = policeMembers.map(m => { let dRank = "أفراد"; if(m.roles.cache.has(process.env.OFFICERS_ROLE_ID)) dRank = "ضباط"; else if(m.roles.cache.has(process.env.NCO_ROLE_ID)) dRank = "ضباط صف"; return { id: m.id, username: m.user.username, discordRank: dRank, siteRank: personnelDB[m.id] ? personnelDB[m.id].rank : "مستجد", certs: personnelDB[m.id] ? (personnelDB[m.id].certs || []) : [] }; });
    let custody = db.getCustody(); if(!custody.vehicleTypes) custody.vehicleTypes = [];
    res.render('personnel', { user: req.session.user, list, RANKS_LADDER, custody, certTypes: CERT_TYPES });
});
app.post('/system/personnel/action', async (req, res) => {
    if (!req.session.user || !req.session.user.perms.isOfficer) return res.redirect('/');
    const { targetId, action, newDiscordRole, newSiteRank, reason } = req.body; const personnelDB = db.getPersonnel(); const archiveDB = db.getArchive();
    const guild = client.guilds.cache.get(process.env.GUILD_ID); const target = guild.members.cache.get(targetId); const targetName = target ? target.user.username : "عسكري";
    if (action === 'fire') { if (target) await target.roles.remove([process.env.ENLISTED_ROLE_ID, process.env.NCO_ROLE_ID, process.env.OFFICERS_ROLE_ID]).catch(()=>{}); delete personnelDB[targetId]; safeArchivePush(archiveDB, targetId, { username: targetName, type: 'fire', details: `فصل من الخدمة. السبب: ${reason}`, actionBy: req.session.user.username }); db.addNotification(targetId, `⚠️ تم فصلك.`, 'danger'); } 
    else if (action === 'update_discord') { if (target) { await target.roles.remove([process.env.NCO_ROLE_ID, process.env.OFFICERS_ROLE_ID]).catch(()=>{}); await target.roles.add(process.env.ENLISTED_ROLE_ID).catch(()=>{}); if (newDiscordRole === 'nco') await target.roles.add(process.env.NCO_ROLE_ID).catch(()=>{}); else if (newDiscordRole === 'officer') await target.roles.add(process.env.OFFICERS_ROLE_ID).catch(()=>{}); safeArchivePush(archiveDB, targetId, { username: targetName, type: 'discord', details: `تحديث الفئة إلى: ${newDiscordRole}`, actionBy: req.session.user.username }); db.addNotification(targetId, '🔄 تم تحديث ديسكورد.', 'info'); } }
    else if (action === 'update_site') { const oldRank = personnelDB[targetId] ? personnelDB[targetId].rank : "مستجد"; if (!personnelDB[targetId]) personnelDB[targetId] = { rank: "مستجد", certs:[] }; personnelDB[targetId].rank = newSiteRank; safeArchivePush(archiveDB, targetId, { username: targetName, type: 'promotion', details: `ترقية: ${oldRank} -> ${newSiteRank}`, actionBy: req.session.user.username }); db.addNotification(targetId, `🎖️ تم ترقيتك إلى: ${newSiteRank}`, 'success'); }
    db.savePersonnel(personnelDB); db.saveArchive(archiveDB); res.redirect('/system/personnel');
});

app.post('/system/personnel/revoke-cert', (req, res) => {
    if (!req.session.user || !req.session.user.perms.isOfficer) return res.redirect('/');
    const { targetId, certId } = req.body; const personnelDB = db.getPersonnel(); const archiveDB = db.getArchive();
    if (personnelDB[targetId] && personnelDB[targetId].certs) { personnelDB[targetId].certs = personnelDB[targetId].certs.filter(id => id !== certId); db.savePersonnel(personnelDB); const guild = client.guilds.cache.get(process.env.GUILD_ID); const target = guild.members.cache.get(targetId); const targetName = target ? target.user.username : "عسكري"; safeArchivePush(archiveDB, targetId, { username: targetName, type: 'cert_revoked', details: `سحب شهادة: ${CERT_TYPES[certId] ? CERT_TYPES[certId].name : certId}`, actionBy: req.session.user.username }); db.saveArchive(archiveDB); db.addNotification(targetId, `⚠️ تم سحب شهادة (${CERT_TYPES[certId] ? CERT_TYPES[certId].name : certId}) منك بقرار إداري.`, 'danger'); }
    res.redirect('/system/personnel');
});

app.post('/custody/weapons/issue', (req, res) => { if (!req.session.user || !(req.session.user.perms.isNCO || req.session.user.perms.isOfficer)) return res.redirect('/system/personnel'); const custodyDB = db.getCustody(); const log = { receiverDiscordId: req.body.discordId, receiverName: req.body.receiverName, nationalId: req.body.nationalId, weaponType: req.body.weaponType, serialNumber: req.body.serialNumber, issuerName: req.session.user.username, date: new Date().toLocaleString('ar-SA') }; custodyDB.weaponLogs.push(log); db.saveCustody(custodyDB); db.addNotification(req.session.user.id, '🔫 تم تسليم السلاح.', 'success'); try { const channel = client.channels.cache.get(process.env.LOG_CHANNEL_ID); if (channel) { const embed = new EmbedBuilder().setTitle("🔫 تسليم عهدة سلاح").setColor(0x3498DB).addFields({ name: "المستلم", value: `${log.receiverName} (${log.nationalId})`, inline: true }, { name: "الضابط", value: log.issuerName, inline: true }, { name: "التفاصيل", value: `نوع السلاح: ${log.weaponType}\nالسيريال: ${log.serialNumber}`, inline: false }).setTimestamp(); channel.send({ embeds: [embed] }).catch(()=>{}); } } catch(e) {} res.redirect('/system/personnel'); });
app.post('/custody/vehicles/issue', (req, res) => { if (!req.session.user || !(req.session.user.perms.isNCO || req.session.user.perms.isOfficer)) return res.redirect('/system/personnel'); const custodyDB = db.getCustody(); const log = { receiverDiscordId: req.body.discordId, receiverName: req.body.receiverName, nationalId: req.body.nationalId, vehicleType: req.body.vehicleType, plateNumber: req.body.plateNumber, issuerName: req.session.user.username, date: new Date().toLocaleString('ar-SA') }; if(!custodyDB.vehicleLogs) custodyDB.vehicleLogs = []; custodyDB.vehicleLogs.push(log); db.saveCustody(custodyDB); db.addNotification(req.session.user.id, '🚓 تم تسليم المركبة.', 'success'); try { const channel = client.channels.cache.get(process.env.LOG_CHANNEL_ID); if (channel) { const embed = new EmbedBuilder().setTitle("🚓 تسليم عهدة مركبة").setColor(0xF1C40F).addFields({ name: "المستلم", value: `${log.receiverName} (${log.nationalId})`, inline: true }, { name: "الضابط", value: log.issuerName, inline: true }, { name: "التفاصيل", value: `نوع المركبة: ${log.vehicleType}\nاللوحة: ${log.plateNumber}`, inline: false }).setTimestamp(); channel.send({ embeds: [embed] }).catch(()=>{}); } } catch(e) {} res.redirect('/system/personnel'); });
app.post('/system/custody/return', (req, res) => { if (!req.session.user || !(req.session.user.perms.isNCO || req.session.user.perms.isOfficer)) return res.redirect('/system/personnel'); const custodyDB = db.getCustody(); if (req.body.type === 'weapon') custodyDB.weaponLogs.splice(req.body.index, 1); else if (req.body.type === 'vehicle') custodyDB.vehicleLogs.splice(req.body.index, 1); db.saveCustody(custodyDB); db.addNotification(req.session.user.id, '✅ تم استرجاع العهدة.', 'success'); res.redirect('/system/personnel'); });
app.get('/system/archive', (req, res) => { if (!req.session.user || !req.session.user.perms.isOfficer) return res.redirect('/'); res.render('archive', { user: req.session.user, archive: db.getArchive(), questions: db.getQuestions() }); });
app.get('/armory', (req, res) => { if (!req.session.user || !req.session.user.perms.isPolice) return res.redirect('/'); const custody = db.getCustody(); const myWeapons = (custody.weaponLogs || []).map((log, index) => ({...log, originalIndex: index})).filter(l => l.receiverDiscordId === req.session.user.id); const myVehicles = (custody.vehicleLogs || []).map((log, index) => ({...log, originalIndex: index})).filter(l => l.receiverDiscordId === req.session.user.id); res.render('custody', { user: req.session.user, custody, myWeapons, myVehicles }); });
app.post('/custody/rules/update', (req, res) => { if (!req.session.user || !req.session.user.perms.isOfficer) return res.redirect('/armory'); const custodyDB = db.getCustody(); custodyDB.rules = req.body.rules; db.saveCustody(custodyDB); db.addNotification(req.session.user.id, '✅ تم تحديث قوانين العهدة.', 'success'); res.redirect('/armory'); });

app.listen(3000, () => console.log('🚀 شغال على: http://localhost:3000'));