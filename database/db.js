const mongoose = require('mongoose');

// 1. الاتصال بالقاعدة باستخدام الرابط المخفي في ملف .env
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ تم الاتصال بنجاح بسحابة MongoDB Atlas");
    } catch (err) {
        console.error("❌ فشل الاتصال بالسحابة:", err.message);
        process.exit(1);
    }
};
connectDB();

// 2. تعريف هيكلة البيانات (Schema)
// بدلاً من ملفات كثيرة، سنخزن كل "ملف سابق" كـ وثيقة (Document) داخل جدول واحد
const SystemDataSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true }, // اسم الملف القديم (مثل: apps)
    value: { type: mongoose.Schema.Types.Mixed, required: true } // البيانات اللي كانت داخله
});

const SystemData = mongoose.model('SystemData', SystemDataSchema);

// 3. الدوال المطورة (بناءً على نظامك القديم)
module.exports = {
    // دالة عامة لجلب البيانات (تحل محل كل دوال get القديمة)
    get: async (key, defaultValue) => {
        try {
            const data = await SystemData.findOne({ key });
            return data ? data.value : defaultValue;
        } catch (e) {
            return defaultValue;
        }
    },

    // دالة عامة لحفظ البيانات (تحل محل كل دوال save القديمة)
    save: async (key, value) => {
        try {
            await SystemData.findOneAndUpdate(
                { key }, 
                { value }, 
                { upsert: true, new: true }
            );
        } catch (e) {
            console.error(`خطأ في حفظ البيانات لـ ${key}:`, e);
        }
    },

    // دالة الإشعارات (محدثة لتعمل مع السحاب)
    addNotification: async function(userId, message, type = 'info') {
        const notifs = await this.get('notifications', {});
        if (!notifs[userId]) notifs[userId] = [];
        notifs[userId].push({ message, type });
        await this.save('notifications', notifs);
    },

    clearNotifications: async function(userId) {
        const notifs = await this.get('notifications', {});
        if (notifs[userId]) {
            delete notifs[userId];
            await this.save('notifications', notifs);
        }
    }
};