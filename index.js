require('dotenv').config();
const express = require('express');
const axios = require('axios');
const session = require('express-session');
const db = require('./database/db'); 
const { Client, GatewayIntentBits, EmbedBuilder, Events } = require('discord.js');

const PERMISSIONS_LIST = {
    "manage_questions": "تعديل أسئلة التقديم",
    "manage_certs": "فتح/إغلاق الدورات وتعديل أسئلتها",
    "initial_action": "القبول/الرفض المبدئي",
    "final_action": "التجنيد النهائي/الرفض النهائي",
    "grant_certs": "قبول/رفض طلبات الشهادات",
    "manage_custody": "صرف واسترجاع العهدة"
};

const app = express();
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'police_erp_cloud_v1', resave: false, saveUninitialized: true }));

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
client.login(process.env.BOT_TOKEN);
client.once(Events.ClientReady, async c => {
    console.log(`✅ النظام العسكري مفعل ومتصل بالديسكورد: ${c.user.tag}`);
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    if(guild) await guild.members.fetch().catch(console.error); 
});

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

const DEFAULT_CERTS = {
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
};

async function safeArchivePush(userId, logData) {
    const archiveDB = await db.get('archive', {});
    if (!archiveDB[userId]) archiveDB[userId] = [];
    else if (!Array.isArray(archiveDB[userId])) archiveDB[userId] = [archiveDB[userId]];
    
    logData.timestamp = Date.now(); 
    archiveDB[userId].push(logData);
    await db.save('archive', archiveDB);
    
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
            
            const embed = new EmbedBuilder().setTitle(title).setColor(color)
                .addFields(
                    { name: "العسكري / المتقدم", value: `${logData.username} (<@${userId}>)`, inline: true }, 
                    { name: "المسؤول", value: logData.actionBy, inline: true }, 
                    { name: "التفاصيل", value: logData.details, inline: false }
                ).setTimestamp();
            channel.send({ embeds: [embed] }).catch(()=>{});
        }
    } catch (err) {}
}

app.use(async (req, res, next) => {
    if (req.session.user) {
        const notifsDB = await db.get('notifications', {}); 
        res.locals.notifications = notifsDB[req.session.user.id] || [];
        if (res.locals.notifications.length > 0) {
            await db.clearNotifications(req.session.user.id);
        }
        
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
            if (req.session.user.perms.isPolice) {
                const personnelDB = await db.get('personnel', {});
                if (!personnelDB[req.session.user.id]) { 
                    personnelDB[req.session.user.id] = { rank: "مستجد", certs: [] }; 
                    await db.save('personnel', personnelDB); 
                }
                req.session.user.customRank = personnelDB[req.session.user.id].rank;
            }
        } catch(e) {}
    } else { res.locals.notifications = []; }
    next();
});

app.get('/', (req, res) => res.render('index', { user: req.session.user }));

app.get('/public-rules', async (req, res) => { 
    const content = await db.get('content', { publicRules: [] });
    res.render('content', { user: req.session.user, section: 'publicRules', pageTitle: 'قوانين المواطنين', pageDesc: 'الأنظمة والقوانين العامة للمدينة.', items: content.publicRules || [] }); 
});

app.get('/police-rules', async (req, res) => { 
    if (!req.session.user || !req.session.user.perms.isPolice) return res.redirect('/'); 
    const content = await db.get('content', { policeRules: [] });
    res.render('content', { user: req.session.user, section: 'policeRules', pageTitle: 'قوانين العسكر', pageDesc: 'أنظمة ولوائح القطاع العسكري الداخلي.', items: content.policeRules || [] }); 
});

app.get('/login', (req, res) => res.redirect(`https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}&response_type=code&scope=identify%20guilds`));
app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });

app.get('/callback', async (req, res) => {
    try {
        const response = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({ client_id: process.env.CLIENT_ID, client_secret: process.env.CLIENT_SECRET, code: req.query.code, grant_type: 'authorization_code', redirect_uri: process.env.REDIRECT_URI, scope: 'identify guilds' }));
        const userRes = await axios.get('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${response.data.access_token}` } });
        req.session.user = userRes.data; res.redirect('/');
    } catch (e) { res.send('خطأ.'); }
});

app.get('/jobs', async (req, res) => { 
    if (!req.session.user) return res.redirect('/login'); 
    if (!req.session.user.perms.isActivated || req.session.user.perms.isPolice) return res.redirect('/'); 
    
    const appsDB = await db.get('apps', {}); 
    const settings = await db.get('settings', { appsOpen: false });
    const content = await db.get('content', { publicRules: [] });
    const questions = await db.get('questions', []);
    
    res.render('jobs', { user: req.session.user, status: appsDB[req.session.user.id] ? appsDB[req.session.user.id].status : 'open', appsOpen: settings.appsOpen, rules: content.publicRules || [], questions: questions }); 
});

app.post('/submit', async (req, res) => { 
    if (!req.session.user || !req.session.user.perms.isActivated) return res.redirect('/');
    const settings = await db.get('settings', { appsOpen: false });
    if (!settings.appsOpen) return res.redirect('/');
    
    const appsDB = await db.get('apps', {}); 
    if (appsDB[req.session.user.id]) return res.send('لقد قدمت مسبقاً!'); 
    
    appsDB[req.session.user.id] = { status: 'applied', date: new Date().toLocaleString('ar-SA'), username: req.session.user.username, answers: req.body }; 
    await db.save('apps', appsDB); 
    
    const guild = client.guilds.cache.get(process.env.GUILD_ID); 
    const member = guild.members.cache.get(req.session.user.id); 
    if(member) await member.roles.add(process.env.APPLIED_ROLE_ID).catch(()=>{}); 
    res.redirect('/jobs'); 
});

app.get('/admin', async (req, res) => { 
    if (!req.session.user || !(req.session.user.perms.isNCO || req.session.user.perms.isOfficer)) return res.redirect('/'); 
    const appsDB = await db.get('apps', {});
    const questions = await db.get('questions', []);
    res.render('admin', { user: req.session.user, db: appsDB, questions: questions }); 
});

app.post('/admin/action', async (req, res) => {
    if (!req.session.user || !(req.session.user.perms.isNCO || req.session.user.perms.isOfficer)) return res.redirect('/');
    const { userId, action, reason } = req.body; 
    const appsDB = await db.get('apps', {}); 
    
    const guild = client.guilds.cache.get(process.env.GUILD_ID); 
    const target = guild.members.cache.get(userId);
    
    if (action === 'accept') { 
        if (target) { await target.roles.add(process.env.INITIAL_ACCEPT_ROLE_ID).catch(()=>{}); await target.roles.remove(process.env.APPLIED_ROLE_ID).catch(()=>{}); } 
        appsDB[userId].status = 'accepted'; appsDB[userId].actionBy = req.session.user.username; 
        await db.addNotification(userId, '✅ تم قبولك مبدئياً.', 'success'); 
    } 
    else if (action === 'reject') { 
        if (target) { await target.roles.remove(process.env.APPLIED_ROLE_ID).catch(()=>{}); await target.roles.remove(process.env.INITIAL_ACCEPT_ROLE_ID).catch(()=>{}); } 
        appsDB[userId].status = 'rejected'; 
        await safeArchivePush(userId, { username: appsDB[userId].username, type: 'reject', details: `رفض مبدئي. السبب: ${reason}`, answers: appsDB[userId].answers, actionBy: req.session.user.username }); 
        await db.addNotification(userId, '❌ تم رفض طلبك.', 'danger'); 
    } 
    else if (action === 'fail_training') { 
        if (target) { await target.roles.remove(process.env.INITIAL_ACCEPT_ROLE_ID).catch(()=>{}); } 
        appsDB[userId].status = 'rejected'; 
        await safeArchivePush(userId, { username: appsDB[userId].username, type: 'fail_training', details: `عدم اجتياز. السبب: ${reason}`, answers: appsDB[userId].answers, actionBy: req.session.user.username }); 
        await db.addNotification(userId, '❌ لم تجتز الدورة.', 'danger'); 
    }
    await db.save('apps', appsDB); 
    res.redirect('/admin');
});

app.post('/admin/enlist', async (req, res) => {
    if (!req.session.user || !req.session.user.perms.isOfficer) return res.redirect('/');
    const { userId } = req.body; 
    const appsDB = await db.get('apps', {}); 
    const personnelDB = await db.get('personnel', {}); 
    
    const guild = client.guilds.cache.get(process.env.GUILD_ID); 
    const target = guild.members.cache.get(userId);
    if (target) { await target.roles.add(process.env.ENLISTED_ROLE_ID).catch(()=>{}); await target.roles.remove([process.env.INITIAL_ACCEPT_ROLE_ID, process.env.APPLIED_ROLE_ID]).catch(()=>{}); }
    
    personnelDB[userId] = { rank: "مستجد", certs: [] }; 
    await db.save('personnel', personnelDB);
    
    await safeArchivePush(userId, { username: appsDB[userId].username, type: 'enlist', details: 'تجنيد نهائي (مستجد)', answers: appsDB[userId].answers, actionBy: req.session.user.username }); 
    delete appsDB[userId]; 
    await db.save('apps', appsDB); 
    await db.addNotification(userId, '🎖️ تم تجنيدك برتبة مستجد.', 'success'); 
    res.redirect('/admin');
});

app.post('/admin/toggle-apps', async (req, res) => { 
    if (!req.session.user || !req.session.user.perms.isOfficer) return res.redirect('/'); 
    const settings = await db.get('settings', { appsOpen: false }); 
    settings.appsOpen = !settings.appsOpen; 
    await db.save('settings', settings); 
    res.redirect('/system'); 
});

// ==========================================
// 📜 نظام الشهادات العسكرية
// ==========================================
app.get('/certificates', async (req, res) => {
    if (!req.session.user || !req.session.user.perms.isPolice) return res.redirect('/');
    const certsDB = await db.get('certs', DEFAULT_CERTS);
    const myRank = req.session.user.customRank;
    const rankIndex = RANKS_LADDER.indexOf(myRank);
    const personnelDB = await db.get('personnel', {});
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

app.post('/certificates/apply', async (req, res) => {
    if (!req.session.user || !req.session.user.perms.isPolice) return res.redirect('/');
    const { certId, answers } = req.body;
    const certsDB = await db.get('certs', DEFAULT_CERTS);
    
    if (!certsDB.settings[certId] || !certsDB.settings[certId].open) return res.redirect('/certificates');
    if (!certsDB.apps[req.session.user.id]) certsDB.apps[req.session.user.id] = {};
    
    certsDB.apps[req.session.user.id][certId] = { status: 'pending', answers: JSON.parse(answers), date: new Date().toLocaleString('ar-SA'), username: req.session.user.username };
    await db.save('certs', certsDB);
    await db.addNotification(req.session.user.id, `✅ تم تقديم طلبك للحصول على ${CERT_TYPES[certId].name}.`, 'success');
    res.redirect('/certificates');
});

app.get('/system/certificates', async (req, res) => { 
    if (!req.session.user || !req.session.user.perms.isOfficer) return res.redirect('/'); 
    const certsDB = await db.get('certs', DEFAULT_CERTS);
    res.render('cert_admin', { user: req.session.user, certTypes: CERT_TYPES, certsDB: certsDB }); 
});

app.post('/system/certificates/toggle', async (req, res) => { 
    if (!req.session.user || !req.session.user.perms.isOfficer) return res.redirect('/'); 
    const certsDB = await db.get('certs', DEFAULT_CERTS); 
    certsDB.settings[req.body.certId].open = !certsDB.settings[req.body.certId].open; 
    await db.save('certs', certsDB); 
    res.redirect('/system/certificates'); 
});

app.post('/system/certificates/questions/add', async (req, res) => { 
    if (!req.session.user || !req.session.user.perms.isOfficer) return res.redirect('/'); 
    const certsDB = await db.get('certs', DEFAULT_CERTS); 
    if(!certsDB.settings[req.body.certId].questions) certsDB.settings[req.body.certId].questions = [];
    certsDB.settings[req.body.certId].questions.push({ label: req.body.questionLabel }); 
    await db.save('certs', certsDB); 
    res.redirect('/system/certificates'); 
});

app.post('/system/certificates/questions/delete', async (req, res) => { 
    if (!req.session.user || !req.session.user.perms.isOfficer) return res.redirect('/'); 
    const certsDB = await db.get('certs', DEFAULT_CERTS); 
    certsDB.settings[req.body.certId].questions.splice(req.body.index, 1); 
    await db.save('certs', certsDB); 
    res.redirect('/system/certificates'); 
});

app.post('/system/certificates/action', async (req, res) => {
    if (!req.session.user || !req.session.user.perms.isOfficer) return res.redirect('/');
    const { userId, certId, action } = req.body; 
    const certsDB = await db.get('certs', DEFAULT_CERTS); 
    const personnelDB = await db.get('personnel', {}); 
    
    if (action === 'accept') {
        if (!personnelDB[userId].certs) personnelDB[userId].certs = [];
        if (!personnelDB[userId].certs.includes(certId)) personnelDB[userId].certs.push(certId);
        await db.save('personnel', personnelDB);
        
        await safeArchivePush(userId, { username: certsDB.apps[userId][certId].username, type: 'cert_granted', details: `منح ${CERT_TYPES[certId].name}`, actionBy: req.session.user.username }); 
        await db.addNotification(userId, `🎖️ مبروك! تم منحك ${CERT_TYPES[certId].name}.`, 'success'); 
        delete certsDB.apps[userId][certId];
    } else if (action === 'reject') { 
        certsDB.apps[userId][certId].status = 'rejected'; 
        await db.addNotification(userId, `❌ تم رفض طلبك للحصول على ${CERT_TYPES[certId].name}.`, 'danger'); 
    } 
    await db.save('certs', certsDB); 
    res.redirect('/system/certificates');
});

// ==========================================
// ⚙️ اللوحة المركزية (باقي مسارات الإدارة)
// ==========================================
app.get('/system', async (req, res) => {
    if (!req.session.user || !req.session.user.perms.isOfficer) return res.redirect('/');
    const guild = client.guilds.cache.get(process.env.GUILD_ID); const members = guild.members.cache;
    const counts = { officers: members.filter(m => process.env.OFFICERS_ROLE_ID && m.roles.cache.has(process.env.OFFICERS_ROLE_ID)).size, ncos: members.filter(m => process.env.NCO_ROLE_ID && m.roles.cache.has(process.env.NCO_ROLE_ID)).size, enlisted: members.filter(m => process.env.ENLISTED_ROLE_ID && m.roles.cache.has(process.env.ENLISTED_ROLE_ID)).size };
    const settings = await db.get('settings', { appsOpen: false });
    const custody = await db.get('custody', { weaponTypes: [], vehicleTypes: [] }); 
    if(!custody.vehicleTypes) custody.vehicleTypes = [];
    res.render('system', { user: req.session.user, counts, appsOpen: settings.appsOpen, custody });
});

app.post('/system/reset-rejected', async (req, res) => { 
    if (!req.session.user || !req.session.user.perms.isOfficer) return res.redirect('/'); 
    const appsDB = await db.get('apps', {}); 
    let count = 0; 
    for (const userId in appsDB) { if (appsDB[userId].status === 'rejected') { delete appsDB[userId]; count++; } } 
    await db.save('apps', appsDB); 
    await db.addNotification(req.session.user.id, `✅ تم مسح الحظر عن ${count} متقدمين.`, 'success'); 
    res.redirect('/system'); 
});

app.post('/system/weapon-types/add', async (req, res) => { 
    if (!req.session.user || !req.session.user.perms.isOfficer) return res.redirect('/system'); 
    const custodyDB = await db.get('custody', { weaponTypes: [], vehicleTypes: [] }); 
    if(!custodyDB.weaponTypes) custodyDB.weaponTypes = [];
    custodyDB.weaponTypes.push(req.body.weaponName); 
    await db.save('custody', custodyDB); 
    res.redirect('/system'); 
});

app.post('/system/vehicle-types/add', async (req, res) => { 
    if (!req.session.user || !req.session.user.perms.isOfficer) return res.redirect('/system'); 
    const custodyDB = await db.get('custody', { weaponTypes: [], vehicleTypes: [] }); 
    if(!custodyDB.vehicleTypes) custodyDB.vehicleTypes = []; 
    custodyDB.vehicleTypes.push(req.body.vehicleName); 
    await db.save('custody', custodyDB); 
    res.redirect('/system'); 
});

app.get('/system/questions', async (req, res) => { 
    if (!req.session.user || !req.session.user.perms.isOfficer) return res.redirect('/'); 
    const questions = await db.get('questions', []);
    res.render('questions', { user: req.session.user, questions: questions }); 
});

app.post('/system/questions/add', async (req, res) => { 
    if (!req.session.user || !req.session.user.perms.isOfficer) return res.redirect('/'); 
    const questions = await db.get('questions', []); 
    questions.push({ label: req.body.questionLabel }); 
    await db.save('questions', questions); 
    res.redirect('/system/questions'); 
});

app.post('/system/questions/edit', async (req, res) => { 
    if (!req.session.user || !req.session.user.perms.isOfficer) return res.redirect('/'); 
    const questions = await db.get('questions', []); 
    if (questions[req.body.index]) questions[req.body.index].label = req.body.newLabel; 
    await db.save('questions', questions); 
    res.redirect('/system/questions'); 
});

app.post('/system/questions/delete', async (req, res) => { 
    if (!req.session.user || !req.session.user.perms.isOfficer) return res.redirect('/'); 
    const questions = await db.get('questions', []); 
    questions.splice(req.body.index, 1); 
    await db.save('questions', questions); 
    res.redirect('/system/questions'); 
});

app.get('/system/personnel', async (req, res) => {
    if (!req.session.user || !req.session.user.perms.isOfficer) return res.redirect('/');
    const guild = client.guilds.cache.get(process.env.GUILD_ID); const members = guild.members.cache;
    const policeMembers = members.filter(m => m.roles.cache.has(process.env.ENLISTED_ROLE_ID) || m.roles.cache.has(process.env.NCO_ROLE_ID) || m.roles.cache.has(process.env.OFFICERS_ROLE_ID));
    
    const personnelDB = await db.get('personnel', {});
    const custody = await db.get('custody', { weaponTypes: [], vehicleTypes: [] }); 
    if(!custody.vehicleTypes) custody.vehicleTypes = [];
    
    const list = policeMembers.map(m => { 
        let dRank = "أفراد"; 
        if(m.roles.cache.has(process.env.OFFICERS_ROLE_ID)) dRank = "ضباط"; 
        else if(m.roles.cache.has(process.env.NCO_ROLE_ID)) dRank = "ضباط صف"; 
        return { id: m.id, username: m.user.username, discordRank: dRank, siteRank: personnelDB[m.id] ? personnelDB[m.id].rank : "مستجد", certs: personnelDB[m.id] ? (personnelDB[m.id].certs || []) : [] }; 
    });
    
    res.render('personnel', { user: req.session.user, list, RANKS_LADDER, custody, certTypes: CERT_TYPES });
});

app.post('/system/personnel/action', async (req, res) => {
    if (!req.session.user || !req.session.user.perms.isOfficer) return res.redirect('/');
    const { targetId, action, newDiscordRole, newSiteRank, reason } = req.body; 
    const personnelDB = await db.get('personnel', {}); 
    
    const guild = client.guilds.cache.get(process.env.GUILD_ID); 
    const target = guild.members.cache.get(targetId); 
    const targetName = target ? target.user.username : "عسكري";
    
    if (action === 'fire') { 
        if (target) await target.roles.remove([process.env.ENLISTED_ROLE_ID, process.env.NCO_ROLE_ID, process.env.OFFICERS_ROLE_ID]).catch(()=>{}); 
        delete personnelDB[targetId]; 
        await safeArchivePush(targetId, { username: targetName, type: 'fire', details: `فصل من الخدمة. السبب: ${reason}`, actionBy: req.session.user.username }); 
        await db.addNotification(targetId, `⚠️ تم فصلك.`, 'danger'); 
    } 
    else if (action === 'update_discord') { 
        if (target) { 
            await target.roles.remove([process.env.NCO_ROLE_ID, process.env.OFFICERS_ROLE_ID]).catch(()=>{}); 
            await target.roles.add(process.env.ENLISTED_ROLE_ID).catch(()=>{}); 
            if (newDiscordRole === 'nco') await target.roles.add(process.env.NCO_ROLE_ID).catch(()=>{}); 
            else if (newDiscordRole === 'officer') await target.roles.add(process.env.OFFICERS_ROLE_ID).catch(()=>{}); 
            
            await safeArchivePush(targetId, { username: targetName, type: 'discord', details: `تحديث الفئة إلى: ${newDiscordRole}`, actionBy: req.session.user.username }); 
            await db.addNotification(targetId, '🔄 تم تحديث ديسكورد.', 'info'); 
        } 
    }
    else if (action === 'update_site') {
    const oldRank = personnelDB[targetId] ? personnelDB[targetId].rank : "مستجد";
    
    // التحقق إذا كانت الرتبة هي نفسها
    if (newSiteRank === oldRank) {
        await db.addNotification(req.session.user.id, `⚠️ العسكري ${targetName} يشغل بالفعل رتبة ${newSiteRank}`, 'info');
        return res.redirect('/system/personnel');
    }

    if (!personnelDB[targetId]) personnelDB[targetId] = { rank: "مستجد", certs:[] };
    personnelDB[targetId].rank = newSiteRank;
    
    await safeArchivePush(targetId, { 
        username: targetName, 
        type: 'promotion', 
        details: `ترقية/تعديل رتبة: من ${oldRank} إلى ${newSiteRank}`, 
        actionBy: req.session.user.username 
    });
    await db.addNotification(targetId, `🎖️ تم تحديث رتبتك إلى: ${newSiteRank}`, 'success');
    }
    await db.save('personnel', personnelDB); 
    res.redirect('/system/personnel');      
});

app.post('/system/personnel/update-info', async (req, res) => {
    if (!req.session.user || !req.session.user.perms.isOfficer) return res.redirect('/');
    const { targetId, fullName, nationalId } = req.body;
    const personnelDB = await db.get('personnel', {});
    
    if (!personnelDB[targetId]) personnelDB[targetId] = { rank: "مستجد", certs: [] };
    
    personnelDB[targetId].fullName = fullName;
    personnelDB[targetId].nationalId = nationalId;
    
    await db.save('personnel', personnelDB);
    await db.addNotification(req.session.user.id, '✅ تم تحديث بيانات العسكري بنجاح.', 'success');
    res.redirect('/system/personnel');
});
app.post('/custody/weapons/issue', async (req, res) => { 
    if (!req.session.user || !(req.session.user.perms.isNCO || req.session.user.perms.isOfficer)) return res.redirect('/system/personnel'); 
    const custodyDB = await db.get('custody', { weaponLogs: [], vehicleLogs: [] }); 
    if(!custodyDB.weaponLogs) custodyDB.weaponLogs = [];
    const log = { receiverDiscordId: req.body.discordId, receiverName: req.body.receiverName, nationalId: req.body.nationalId, weaponType: req.body.weaponType, serialNumber: req.body.serialNumber, issuerName: req.session.user.username, date: new Date().toLocaleString('ar-SA') }; 
    custodyDB.weaponLogs.push(log); 
    await db.save('custody', custodyDB); 
    await db.addNotification(req.session.user.id, '🔫 تم تسليم السلاح.', 'success'); 
    
    try { 
        const channel = client.channels.cache.get(process.env.LOG_CHANNEL_ID); 
        if (channel) { 
            const embed = new EmbedBuilder().setTitle("🔫 تسليم عهدة سلاح").setColor(0x3498DB).addFields({ name: "المستلم", value: `${log.receiverName} (${log.nationalId})`, inline: true }, { name: "الضابط", value: log.issuerName, inline: true }, { name: "التفاصيل", value: `نوع السلاح: ${log.weaponType}\nالسيريال: ${log.serialNumber}`, inline: false }).setTimestamp(); 
            channel.send({ embeds: [embed] }).catch(()=>{}); 
        } 
    } catch(e) {} 
    res.redirect('/system/personnel'); 
});

app.post('/custody/vehicles/issue', async (req, res) => { 
    if (!req.session.user || !(req.session.user.perms.isNCO || req.session.user.perms.isOfficer)) return res.redirect('/system/personnel'); 
    const custodyDB = await db.get('custody', { weaponLogs: [], vehicleLogs: [] }); 
    if(!custodyDB.vehicleLogs) custodyDB.vehicleLogs = [];
    const log = { receiverDiscordId: req.body.discordId, receiverName: req.body.receiverName, nationalId: req.body.nationalId, vehicleType: req.body.vehicleType, plateNumber: req.body.plateNumber, issuerName: req.session.user.username, date: new Date().toLocaleString('ar-SA') }; 
    custodyDB.vehicleLogs.push(log); 
    await db.save('custody', custodyDB); 
    await db.addNotification(req.session.user.id, '🚓 تم تسليم المركبة.', 'success'); 
    
    try { 
        const channel = client.channels.cache.get(process.env.LOG_CHANNEL_ID); 
        if (channel) { 
            const embed = new EmbedBuilder().setTitle("🚓 تسليم عهدة مركبة").setColor(0xF1C40F).addFields({ name: "المستلم", value: `${log.receiverName} (${log.nationalId})`, inline: true }, { name: "الضابط", value: log.issuerName, inline: true }, { name: "التفاصيل", value: `نوع المركبة: ${log.vehicleType}\nاللوحة: ${log.plateNumber}`, inline: false }).setTimestamp(); 
            channel.send({ embeds: [embed] }).catch(()=>{}); 
        } 
    } catch(e) {} 
    res.redirect('/system/personnel'); 
});

app.post('/system/custody/return', async (req, res) => { 
    if (!req.session.user || !(req.session.user.perms.isNCO || req.session.user.perms.isOfficer)) return res.redirect('/system/personnel'); 
    const custodyDB = await db.get('custody', { weaponLogs: [], vehicleLogs: [] }); 
    if (req.body.type === 'weapon' && custodyDB.weaponLogs) custodyDB.weaponLogs.splice(req.body.index, 1); 
    else if (req.body.type === 'vehicle' && custodyDB.vehicleLogs) custodyDB.vehicleLogs.splice(req.body.index, 1); 
    await db.save('custody', custodyDB); 
    await db.addNotification(req.session.user.id, '✅ تم استرجاع العهدة.', 'success'); 
    res.redirect('/system/personnel'); 
});

app.get('/system/archive', async (req, res) => { 
    if (!req.session.user || !req.session.user.perms.isOfficer) return res.redirect('/'); 
    const archive = await db.get('archive', {});
    const questions = await db.get('questions', []);
    res.render('archive', { user: req.session.user, archive: archive, questions: questions }); 
});

app.get('/armory', async (req, res) => { 
    if (!req.session.user || !req.session.user.perms.isPolice) return res.redirect('/'); 
    const custody = await db.get('custody', { weaponLogs: [], vehicleLogs: [], rules: "" }); 
    const myWeapons = (custody.weaponLogs || []).map((log, index) => ({...log, originalIndex: index})).filter(l => l.receiverDiscordId === req.session.user.id); 
    const myVehicles = (custody.vehicleLogs || []).map((log, index) => ({...log, originalIndex: index})).filter(l => l.receiverDiscordId === req.session.user.id); 
    res.render('custody', { user: req.session.user, custody, myWeapons, myVehicles }); 
});

app.post('/custody/rules/update', async (req, res) => { 
    if (!req.session.user || !req.session.user.perms.isOfficer) return res.redirect('/armory'); 
    const custodyDB = await db.get('custody', {}); 
    custodyDB.rules = req.body.rules; 
    await db.save('custody', custodyDB); 
    await db.addNotification(req.session.user.id, '✅ تم تحديث قوانين العهدة.', 'success'); 
    res.redirect('/armory'); 
});

// عرض صفحة الصلاحيات
app.get('/system/permissions', async (req, res) => {
    if (!req.session.user || !req.session.user.perms.isOfficer) return res.redirect('/');
    const permissionsDB = await db.get('permissions', {});
    const personnelDB = await db.get('personnel', {});
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    
    // جلب ضباط الصف فقط لإدارة صلاحياتهم
    const ncos = guild.members.cache.filter(m => m.roles.cache.has(process.env.NCO_ROLE_ID));
    const ncoList = ncos.map(m => ({
        id: m.id,
        username: m.user.username,
        currentPermissions: permissionsDB[m.id] || []
    }));

    res.render('permissions', { user: req.session.user, ncoList, PERMISSIONS_LIST });
});

// حفظ الصلاحيات
app.post('/system/permissions/update', async (req, res) => {
    if (!req.session.user || !req.session.user.perms.isOfficer) return res.redirect('/');
    const { targetId, perms } = req.body;
    const permissionsDB = await db.get('permissions', {});
    
    permissionsDB[targetId] = Array.isArray(perms) ? perms : [perms];
    await db.save('permissions', permissionsDB);
    
    await db.addNotification(targetId, '🔐 تم تحديث صلاحياتك الإدارية من قبل القيادة.', 'warning');
    res.redirect('/system/permissions');
});

app.listen(3000, () => console.log('🚀 شغال على السحابة (MongoDB) بكل قوة!'));