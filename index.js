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
app.use(session({ secret: 'police_erp_cloud_v1', resave: false, saveUninitialized: true }));

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
client.login(process.env.BOT_TOKEN);
client.once(Events.ClientReady, async c => {
    console.log(`✅ النظام العسكري المطور V2 مفعل ومتصل بالديسكورد: ${c.user.tag}`);
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

const PERMISSIONS_LIST = {
    "OPEN_CLOSE_COURSES": "فتح وإغلاق الدورات",
    "MANAGE_COURSE_QUESTIONS": "تعديل أسئلة الدورات",
    "MANAGE_APP_QUESTIONS": "تعديل أسئلة التقديم",
    "PRE_ACCEPTANCE": "القبول المبدئي (إدخال للأكاديمية)",
    "RECORD_GRADES": "تسجيل درجات دورة الكلية",
    "FINAL_ACCEPTANCE": "القبول النهائي (تجنيد فعلي)",
    "REJECTION_POWER": "صلاحية الرفض بجميع مراحله",
    "GIVE_CERTS": "منح الشهادات العسكرية",
    "MANAGE_ARMORY": "صرف واسترجاع العهدة"
};

// ==========================================
// 🛡️ السجل الشامل ونظام الصلاحيات
// ==========================================
async function globalLog(userId, logData) {
    const archiveDB = await db.get('archive', {});
    if (!archiveDB[userId]) archiveDB[userId] = [];
    
    logData.timestamp = Date.now(); 
    logData.formattedDate = new Date().toLocaleString('ar-SA');
    archiveDB[userId].push(logData);
    await db.save('archive', archiveDB);

    const ledger = await db.get('global_ledger', []);
    ledger.unshift({ ...logData, userId });
    if (ledger.length > 1000) ledger.pop(); 
    await db.save('global_ledger', ledger);
    
    try {
        const channel = client.channels.cache.get(process.env.LOG_CHANNEL_ID);
        if (channel) {
            let color = 0x808080; let title = "📄 سجل العمليات";
            if (logData.type === 'enlist' || logData.type === 'pre_accept') { color = 0x2ECC71; title = "✅ " + logData.title; }
            else if (logData.type === 'fail_training' || logData.type === 'reject' || logData.type === 'cert_revoked') { color = 0xE74C3C; title = "❌ " + logData.title; }
            else if (logData.type === 'fire') { color = 0x992D22; title = "⚠️ " + logData.title; }
            else if (logData.type === 'promotion') { color = 0xF1C40F; title = "📈 " + logData.title; }
            else if (logData.type === 'cert_granted') { color = 0x9B59B6; title = "📜 " + logData.title; }
            else if (logData.type === 'armory_issue') { color = 0x3498DB; title = "🔫 " + logData.title; }
            else if (logData.type === 'academy_grades') { color = 0xE67E22; title = "🎓 " + logData.title; }
            
            const embed = new EmbedBuilder().setTitle(title).setColor(color)
                .addFields(
                    { name: "العسكري / المتقدم", value: `${logData.username} (<@${userId}>)`, inline: true }, 
                    { name: "المسؤول", value: logData.actionBy, inline: true }, 
                    { name: "التفاصيل", value: logData.details, inline: false }
                )
                .setFooter({ text: `الرقم الوطني: ${logData.nationalId || 'غير مسجل'} | كود: ${logData.militaryCode || 'بدون'}` })
                .setTimestamp();
            channel.send({ embeds: [embed] }).catch(()=>{});
        }
    } catch (err) {}
}

async function hasPermission(user, permKey) {
    if (!user) return false;
    if (user.perms.isOfficer) return true;
    const personnelDB = await db.get('personnel', {});
    const userData = personnelDB[user.id];
    if (userData && userData.delegatedPerms && userData.delegatedPerms.includes(permKey)) return true;
    return false;
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
                    personnelDB[req.session.user.id] = { 
                        rank: "مستجد", certs: [], delegatedPerms: [], 
                        nationalId: "غير مسجل", realName: req.session.user.username,
                        militaryCode: "0000", joinDate: new Date().toLocaleString('ar-SA'), lastLogin: new Date().toLocaleString('ar-SA')
                    }; 
                } else {
                    personnelDB[req.session.user.id].lastLogin = new Date().toLocaleString('ar-SA');
                }
                await db.save('personnel', personnelDB); 
                req.session.user.customRank = personnelDB[req.session.user.id].rank;
                req.session.user.delegatedPerms = personnelDB[req.session.user.id].delegatedPerms || [];
            }
        } catch(e) {}
    } else { res.locals.notifications = []; }
    next();
});

// ==========================================
// 🏠 الصفحات العامة والدخول
// ==========================================
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

// مسارات إدارة المحتوى (للقوانين)
app.post('/content/add', async (req, res) => {
    if (!req.session.user || !req.session.user.perms.isOfficer) return res.redirect('/');
    const content = await db.get('content', { publicRules: [], policeRules: [] });
    if(!content[req.body.section]) content[req.body.section] = [];
    content[req.body.section].push({ title: req.body.title, description: req.body.description });
    await db.save('content', content);
    res.redirect(`/${req.body.section === 'publicRules' ? 'public-rules' : 'police-rules'}`);
});
app.post('/content/delete', async (req, res) => {
    if (!req.session.user || !req.session.user.perms.isOfficer) return res.redirect('/');
    const content = await db.get('content', { publicRules: [], policeRules: [] });
    if(content[req.body.section]) content[req.body.section].splice(req.body.index, 1);
    await db.save('content', content);
    res.redirect(`/${req.body.section === 'publicRules' ? 'public-rules' : 'police-rules'}`);
});

// ==========================================
// 📝 نظام التقديم والأكاديمية
// ==========================================
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
    
    let answersData = {};
    for (let key in req.body) { if (key.startsWith('q_')) answersData[key] = req.body[key]; }

    appsDB[req.session.user.id] = { 
        status: 'applied', 
        date: new Date().toLocaleString('ar-SA'), 
        username: req.session.user.username,
        personalInfo: {
            realName: req.body.realName, 
            nationalId: req.body.nationalId, 
            dob: req.body.dob, 
            age: req.body.age, 
            nationality: req.body.nationality, 
            phone: req.body.phone, 
            imageUrl: req.body.imageUrl
        },
        answers: answersData,
        grades: null
    }; 
    await db.save('apps', appsDB); 
    
    await globalLog(req.session.user.id, { type: 'app_submit', title: 'تقديم جديد', username: req.session.user.username, nationalId: req.body.nationalId, actionBy: 'النظام', details: `تم استلام طلب تجنيد جديد` });

    const guild = client.guilds.cache.get(process.env.GUILD_ID); 
    const member = guild.members.cache.get(req.session.user.id); 
    if(member) await member.roles.add(process.env.APPLIED_ROLE_ID).catch(()=>{}); 
    res.redirect('/jobs'); 
});

app.get('/admin', async (req, res) => { 
    if (!req.session.user || !(req.session.user.perms.isNCO || req.session.user.perms.isOfficer)) return res.redirect('/'); 
    const appsDB = await db.get('apps', {});
    const questions = await db.get('questions', []);
    
    const canPreAccept = await hasPermission(req.session.user, 'PRE_ACCEPTANCE');
    const canFinalAccept = await hasPermission(req.session.user, 'FINAL_ACCEPTANCE');
    const canReject = await hasPermission(req.session.user, 'REJECTION_POWER');
    const canGrade = await hasPermission(req.session.user, 'RECORD_GRADES');

    res.render('admin', { user: req.session.user, db: appsDB, questions: questions, perms: { canPreAccept, canFinalAccept, canReject, canGrade } }); 
});

app.post('/admin/action', async (req, res) => {
    const { userId, action, reason } = req.body; 
    const appsDB = await db.get('apps', {}); 
    const targetData = appsDB[userId];
    if(!targetData) return res.redirect('/admin');

    const guild = client.guilds.cache.get(process.env.GUILD_ID); 
    const target = guild.members.cache.get(userId);
    
    if (action === 'accept') { 
        if (!await hasPermission(req.session.user, 'PRE_ACCEPTANCE')) return res.redirect('/admin');
        if (target) { await target.roles.add(process.env.INITIAL_ACCEPT_ROLE_ID).catch(()=>{}); await target.roles.remove(process.env.APPLIED_ROLE_ID).catch(()=>{}); } 
        appsDB[userId].status = 'academy'; 
        appsDB[userId].actionBy = req.session.user.username; 
        await globalLog(userId, { type: 'pre_accept', title: 'دخول الأكاديمية', username: targetData.username, nationalId: targetData.personalInfo?.nationalId, actionBy: req.session.user.username, details: 'تم قبوله مبدئياً وتحويله للأكاديمية' });
        await db.addNotification(userId, '🎓 تم قبولك مبدئياً، مبروك دخولك الأكاديمية.', 'success'); 
    } 
    else if (action === 'reject' || action === 'fail_training') { 
        if (!await hasPermission(req.session.user, 'REJECTION_POWER')) return res.redirect('/admin');
        if (target) { await target.roles.remove([process.env.APPLIED_ROLE_ID, process.env.INITIAL_ACCEPT_ROLE_ID]).catch(()=>{}); } 
        appsDB[userId].status = 'rejected'; 
        let logType = action === 'reject' ? 'reject' : 'fail_training';
        let logTitle = action === 'reject' ? 'رفض تقديم' : 'رسوب في الأكاديمية';
        await globalLog(userId, { type: logType, title: logTitle, username: targetData.username, nationalId: targetData.personalInfo?.nationalId, actionBy: req.session.user.username, details: `السبب: ${reason}`, answers: targetData.answers }); 
        await db.addNotification(userId, '❌ تم رفض طلبك / عدم اجتيازك.', 'danger'); 
    }
    await db.save('apps', appsDB); 
    res.redirect('/admin');
});

app.post('/admin/grade', async (req, res) => {
    if (!await hasPermission(req.session.user, 'RECORD_GRADES')) return res.redirect('/admin');
    const { userId, stops, ops, neg, general, att1, att2 } = req.body; 
    const appsDB = await db.get('apps', {}); 
    const targetData = appsDB[userId];
    
    if(targetData && targetData.status === 'academy') {
        const total = Number(stops) + Number(ops) + Number(neg) + Number(general) + Number(att1) + Number(att2);
        targetData.grades = { stops, ops, neg, general, att1, att2, total, gradedBy: req.session.user.username, date: new Date().toLocaleString('ar-SA') };
        await db.save('apps', appsDB);
        await globalLog(userId, { type: 'academy_grades', title: 'رصد درجات الأكاديمية', username: targetData.username, nationalId: targetData.personalInfo?.nationalId, actionBy: req.session.user.username, details: `تم رصد درجة الدورة: ${total}/80` });
    }
    res.redirect('/admin');
});

app.post('/admin/enlist', async (req, res) => {
    if (!await hasPermission(req.session.user, 'FINAL_ACCEPTANCE')) return res.redirect('/admin');
    const { userId } = req.body; 
    const appsDB = await db.get('apps', {}); 
    const personnelDB = await db.get('personnel', {}); 
    const targetData = appsDB[userId];
    if(!targetData || targetData.status !== 'academy') return res.redirect('/admin');
    
    const guild = client.guilds.cache.get(process.env.GUILD_ID); 
    const target = guild.members.cache.get(userId);
    if (target) { await target.roles.add(process.env.ENLISTED_ROLE_ID).catch(()=>{}); await target.roles.remove([process.env.INITIAL_ACCEPT_ROLE_ID, process.env.APPLIED_ROLE_ID]).catch(()=>{}); }
    
    const generatedCode = Math.floor(1000 + Math.random() * 9000).toString();
    
    personnelDB[userId] = { 
        rank: "مستجد", certs: [], delegatedPerms: [], 
        nationalId: targetData.personalInfo?.nationalId || "0000", 
        realName: targetData.personalInfo?.realName || targetData.username,
        militaryCode: generatedCode, joinDate: new Date().toLocaleString('ar-SA'), lastLogin: "جديد",
        phone: targetData.personalInfo?.phone, dob: targetData.personalInfo?.dob, imageUrl: targetData.personalInfo?.imageUrl
    }; 
    await db.save('personnel', personnelDB);
    
    let gradeText = targetData.grades ? `(بدرجة ${targetData.grades.total}/80)` : '(بدون درجات)';
    await globalLog(userId, { type: 'enlist', title: 'تجنيد نهائي', username: targetData.username, nationalId: targetData.personalInfo?.nationalId, militaryCode: generatedCode, actionBy: req.session.user.username, details: `تجنيد بالكود العسكري ${generatedCode} ${gradeText}`, answers: targetData.answers }); 
    
    try {
        const channel = client.channels.cache.get(process.env.LOG_CHANNEL_ID);
        if (channel) {
            const embed = new EmbedBuilder().setTitle("🚨 انضمام فرد جديد للقطاع").setColor(0xF1C40F).addFields(
                { name: "الاسم", value: personnelDB[userId].realName, inline: true }, 
                { name: "الكود العسكري", value: generatedCode, inline: true }, 
                { name: "تم التجنيد بواسطة", value: req.session.user.username, inline: false }
            ).setThumbnail(personnelDB[userId].imageUrl || null).setTimestamp();
            channel.send({ content: `<@&${process.env.OFFICERS_ROLE_ID}>`, embeds: [embed] }).catch(()=>{});
        }
    } catch(e){}

    delete appsDB[userId]; 
    await db.save('apps', appsDB); 
    await db.addNotification(userId, `🎖️ تم تجنيدك برتبة مستجد. كودك العسكري هو: ${generatedCode}`, 'success'); 
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
    if (!req.session.user || !(req.session.user.perms.isOfficer || await hasPermission(req.session.user, 'GIVE_CERTS'))) return res.redirect('/'); 
    const certsDB = await db.get('certs', DEFAULT_CERTS);
    const canManageCourses = await hasPermission(req.session.user, 'OPEN_CLOSE_COURSES');
    const canManageQuestions = await hasPermission(req.session.user, 'MANAGE_COURSE_QUESTIONS');
    res.render('cert_admin', { user: req.session.user, certTypes: CERT_TYPES, certsDB: certsDB, perms: { canManageCourses, canManageQuestions } }); 
});

app.post('/system/certificates/toggle', async (req, res) => { 
    if (!await hasPermission(req.session.user, 'OPEN_CLOSE_COURSES')) return res.redirect('/system/certificates'); 
    const certsDB = await db.get('certs', DEFAULT_CERTS); 
    certsDB.settings[req.body.certId].open = !certsDB.settings[req.body.certId].open; 
    await db.save('certs', certsDB); 
    res.redirect('/system/certificates'); 
});

app.post('/system/certificates/questions/add', async (req, res) => { 
    if (!await hasPermission(req.session.user, 'MANAGE_COURSE_QUESTIONS')) return res.redirect('/system/certificates'); 
    const certsDB = await db.get('certs', DEFAULT_CERTS); 
    if(!certsDB.settings[req.body.certId].questions) certsDB.settings[req.body.certId].questions = [];
    certsDB.settings[req.body.certId].questions.push({ label: req.body.questionLabel }); 
    await db.save('certs', certsDB); 
    res.redirect('/system/certificates'); 
});

app.post('/system/certificates/questions/delete', async (req, res) => { 
    if (!await hasPermission(req.session.user, 'MANAGE_COURSE_QUESTIONS')) return res.redirect('/system/certificates'); 
    const certsDB = await db.get('certs', DEFAULT_CERTS); 
    certsDB.settings[req.body.certId].questions.splice(req.body.index, 1); 
    await db.save('certs', certsDB); 
    res.redirect('/system/certificates'); 
});

app.post('/system/certificates/action', async (req, res) => {
    if (!await hasPermission(req.session.user, 'GIVE_CERTS')) return res.redirect('/system/certificates');
    const { userId, certId, action } = req.body; 
    const certsDB = await db.get('certs', DEFAULT_CERTS); 
    const personnelDB = await db.get('personnel', {}); 
    const targetData = personnelDB[userId] || {};
    
    if (action === 'accept') {
        if (!personnelDB[userId].certs) personnelDB[userId].certs = [];
        if (!personnelDB[userId].certs.includes(certId)) personnelDB[userId].certs.push(certId);
        await db.save('personnel', personnelDB);
        
        await globalLog(userId, { type: 'cert_granted', title: 'منح شهادة', username: certsDB.apps[userId][certId].username, nationalId: targetData.nationalId, actionBy: req.session.user.username, details: `حصل على ${CERT_TYPES[certId].name}` }); 
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
// ⚙️ اللوحة المركزية وباقي الإدارة
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
    if (!await hasPermission(req.session.user, 'MANAGE_APP_QUESTIONS')) return res.redirect('/'); 
    const questions = await db.get('questions', []);
    res.render('questions', { user: req.session.user, questions: questions }); 
});

app.post('/system/questions/add', async (req, res) => { 
    if (!await hasPermission(req.session.user, 'MANAGE_APP_QUESTIONS')) return res.redirect('/'); 
    const questions = await db.get('questions', []); 
    questions.push({ label: req.body.questionLabel }); 
    await db.save('questions', questions); 
    res.redirect('/system/questions'); 
});

app.post('/system/questions/edit', async (req, res) => { 
    if (!await hasPermission(req.session.user, 'MANAGE_APP_QUESTIONS')) return res.redirect('/'); 
    const questions = await db.get('questions', []); 
    if (questions[req.body.index]) questions[req.body.index].label = req.body.newLabel; 
    await db.save('questions', questions); 
    res.redirect('/system/questions'); 
});

app.post('/system/questions/delete', async (req, res) => { 
    if (!await hasPermission(req.session.user, 'MANAGE_APP_QUESTIONS')) return res.redirect('/'); 
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
        const dbData = personnelDB[m.id] || { rank: "مستجد", certs: [], delegatedPerms: [], nationalId: "غير مسجل", realName: m.user.username, militaryCode: "", joinDate: "", lastLogin: "" };
        return { id: m.id, username: m.user.username, discordRank: dRank, siteRank: dbData.rank, certs: dbData.certs || [], delegatedPerms: dbData.delegatedPerms || [], nationalId: dbData.nationalId, realName: dbData.realName, militaryCode: dbData.militaryCode, joinDate: dbData.joinDate, lastLogin: dbData.lastLogin }; 
    });
    
    res.render('personnel', { user: req.session.user, list, RANKS_LADDER, custody, certTypes: CERT_TYPES, PERMISSIONS_LIST });
});

app.post('/system/personnel/action', async (req, res) => {
    if (!req.session.user || !req.session.user.perms.isOfficer) return res.redirect('/');
    const { targetId, action, newDiscordRole, newSiteRank, newRealName, newNationalId, delegatedPerms, reason } = req.body; 
    const personnelDB = await db.get('personnel', {}); 
    
    const guild = client.guilds.cache.get(process.env.GUILD_ID); 
    const target = guild.members.cache.get(targetId); 
    const targetData = personnelDB[targetId] || { rank: "مستجد", nationalId: "غير مسجل", realName: target ? target.user.username : "عسكري" };
    
    if (action === 'fire') { 
        if (target) await target.roles.remove([process.env.ENLISTED_ROLE_ID, process.env.NCO_ROLE_ID, process.env.OFFICERS_ROLE_ID]).catch(()=>{}); 
        delete personnelDB[targetId]; 
        await globalLog(targetId, { type: 'fire', title: 'فصل وطي قيد', username: targetData.realName, nationalId: targetData.nationalId, militaryCode: targetData.militaryCode, actionBy: req.session.user.username, details: `السبب: ${reason}` }); 
        await db.addNotification(targetId, `⚠️ تم فصلك.`, 'danger'); 
    } 
    else if (action === 'update_discord') { 
        if (target) { 
            await target.roles.remove([process.env.NCO_ROLE_ID, process.env.OFFICERS_ROLE_ID]).catch(()=>{}); 
            await target.roles.add(process.env.ENLISTED_ROLE_ID).catch(()=>{}); 
            if (newDiscordRole === 'nco') await target.roles.add(process.env.NCO_ROLE_ID).catch(()=>{}); 
            else if (newDiscordRole === 'officer') await target.roles.add(process.env.OFFICERS_ROLE_ID).catch(()=>{}); 
            
            await globalLog(targetId, { type: 'promotion', title: 'تحديث فئة ديسكورد', username: targetData.realName, nationalId: targetData.nationalId, militaryCode: targetData.militaryCode, actionBy: req.session.user.username, details: `تحديث الفئة إلى: ${newDiscordRole}` }); 
            await db.addNotification(targetId, '🔄 تم تحديث فئة الديسكورد.', 'info'); 
        } 
    }
    else if (action === 'update_site') { 
        if (!personnelDB[targetId]) personnelDB[targetId] = { rank: "مستجد", certs:[], delegatedPerms: [], nationalId: newNationalId, realName: newRealName }; 
        const oldRank = personnelDB[targetId].rank;
        
        if(oldRank === newSiteRank && personnelDB[targetId].nationalId === newNationalId && personnelDB[targetId].realName === newRealName) {
            personnelDB[targetId].delegatedPerms = Array.isArray(delegatedPerms) ? delegatedPerms : (delegatedPerms ? [delegatedPerms] : []);
            await db.save('personnel', personnelDB);
            return res.redirect('/system/personnel'); 
        }

        personnelDB[targetId].rank = newSiteRank; 
        personnelDB[targetId].realName = newRealName || personnelDB[targetId].realName;
        personnelDB[targetId].nationalId = newNationalId || personnelDB[targetId].nationalId;
        personnelDB[targetId].delegatedPerms = Array.isArray(delegatedPerms) ? delegatedPerms : (delegatedPerms ? [delegatedPerms] : []);
        
        await globalLog(targetId, { type: 'promotion', title: 'تحديث بيانات ورتبة', username: personnelDB[targetId].realName, nationalId: personnelDB[targetId].nationalId, militaryCode: personnelDB[targetId].militaryCode, actionBy: req.session.user.username, details: `تعديل الرتبة من ${oldRank} إلى ${newSiteRank}` }); 
        await db.addNotification(targetId, `🎖️ تم تحديث بياناتك ورتبتك إلى: ${newSiteRank}`, 'success'); 
    }
    await db.save('personnel', personnelDB); 
    res.redirect('/system/personnel');
});

app.post('/system/personnel/revoke-cert', async (req, res) => {
    if (!req.session.user || !req.session.user.perms.isOfficer) return res.redirect('/');
    const { targetId, certId } = req.body; 
    const personnelDB = await db.get('personnel', {}); 
    const targetData = personnelDB[targetId];
    
    if (targetData && targetData.certs) { 
        targetData.certs = targetData.certs.filter(id => id !== certId); 
        await db.save('personnel', personnelDB); 
        
        await globalLog(targetId, { type: 'cert_revoked', title: 'سحب شهادة', username: targetData.realName, nationalId: targetData.nationalId, militaryCode: targetData.militaryCode, actionBy: req.session.user.username, details: `تم سحب شهادة: ${CERT_TYPES[certId] ? CERT_TYPES[certId].name : certId}` }); 
        await db.addNotification(targetId, `⚠️ تم سحب شهادة (${CERT_TYPES[certId] ? CERT_TYPES[certId].name : certId}) منك بقرار إداري.`, 'danger'); 
    }
    res.redirect('/system/personnel');
});

app.post('/system/personnel/grant-cert-direct', async (req, res) => {
    if (!await hasPermission(req.session.user, 'GIVE_CERTS')) return res.redirect('/system/personnel');
    const { targetId, certId } = req.body; const personnelDB = await db.get('personnel', {});
    if (personnelDB[targetId]) {
        if (!personnelDB[targetId].certs) personnelDB[targetId].certs = [];
        if (!personnelDB[targetId].certs.includes(certId)) personnelDB[targetId].certs.push(certId);
        await db.save('personnel', personnelDB);
        await globalLog(targetId, { type: 'cert_granted', title: 'منح شهادة استثنائي', username: personnelDB[targetId].realName, nationalId: personnelDB[targetId].nationalId, militaryCode: personnelDB[targetId].militaryCode, actionBy: req.session.user.username, details: `منح ${CERT_TYPES[certId].name} مباشرة من الإدارة` });
        await db.addNotification(targetId, `🎖️ تم منحك ${CERT_TYPES[certId].name} بقرار إداري.`, 'success');
    }
    res.redirect('/system/personnel');
});

app.post('/custody/weapons/issue', async (req, res) => { 
    if (!await hasPermission(req.session.user, 'MANAGE_ARMORY')) return res.redirect('/system/personnel'); 
    const custodyDB = await db.get('custody', { weaponLogs: [], vehicleLogs: [] }); 
    if(!custodyDB.weaponLogs) custodyDB.weaponLogs = [];
    const log = { receiverDiscordId: req.body.discordId, receiverName: req.body.receiverName, nationalId: req.body.nationalId, weaponType: req.body.weaponType, serialNumber: req.body.serialNumber, issuerName: req.session.user.username, date: new Date().toLocaleString('ar-SA') }; 
    custodyDB.weaponLogs.push(log); 
    await db.save('custody', custodyDB); 
    await db.addNotification(req.session.user.id, '🔫 تم تسليم السلاح.', 'success'); 
    
    await globalLog(req.body.discordId, { type: 'armory_issue', title: 'صرف عهدة (سلاح)', username: req.body.receiverName, nationalId: req.body.nationalId, actionBy: req.session.user.username, details: `سلاح: ${req.body.weaponType} | S/N: ${req.body.serialNumber}` });
    res.redirect('/system/personnel'); 
});

app.post('/custody/vehicles/issue', async (req, res) => { 
    if (!await hasPermission(req.session.user, 'MANAGE_ARMORY')) return res.redirect('/system/personnel'); 
    const custodyDB = await db.get('custody', { weaponLogs: [], vehicleLogs: [] }); 
    if(!custodyDB.vehicleLogs) custodyDB.vehicleLogs = [];
    const log = { receiverDiscordId: req.body.discordId, receiverName: req.body.receiverName, nationalId: req.body.nationalId, vehicleType: req.body.vehicleType, plateNumber: req.body.plateNumber, issuerName: req.session.user.username, date: new Date().toLocaleString('ar-SA') }; 
    custodyDB.vehicleLogs.push(log); 
    await db.save('custody', custodyDB); 
    await db.addNotification(req.session.user.id, '🚓 تم تسليم المركبة.', 'success'); 
    
    await globalLog(req.body.discordId, { type: 'armory_issue', title: 'صرف عهدة (مركبة)', username: req.body.receiverName, nationalId: req.body.nationalId, actionBy: req.session.user.username, details: `مركبة: ${req.body.vehicleType} | لوحة: ${req.body.plateNumber}` });
    res.redirect('/system/personnel'); 
});

app.post('/system/custody/return', async (req, res) => { 
    if (!await hasPermission(req.session.user, 'MANAGE_ARMORY')) return res.redirect('/system/personnel'); 
    const custodyDB = await db.get('custody', { weaponLogs: [], vehicleLogs: [] }); 
    if (req.body.type === 'weapon' && custodyDB.weaponLogs) custodyDB.weaponLogs.splice(req.body.index, 1); 
    else if (req.body.type === 'vehicle' && custodyDB.vehicleLogs) custodyDB.vehicleLogs.splice(req.body.index, 1); 
    await db.save('custody', custodyDB); 
    await db.addNotification(req.session.user.id, '✅ تم استرجاع العهدة.', 'success'); 
    res.redirect('/system/personnel'); 
});

app.get('/system/ledger', async (req, res) => { 
    if (!req.session.user || !req.session.user.perms.isOfficer) return res.redirect('/'); 
    const ledger = await db.get('global_ledger', []);
    res.render('ledger', { user: req.session.user, ledger: ledger }); 
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

app.listen(3000, () => console.log('🚀 شغال على السحابة (MongoDB) بكل قوة!'));