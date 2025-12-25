// ================ FITMIRROR — ФИНАЛЬНАЯ ВЕРСИЯ (ЮРИДИЧЕСКИ БЕЗОПАСНАЯ) ================
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const bodyParser = require('body-parser');

// Папки
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

// Файлы
const ITEMS_FILE = path.join(DATA_DIR, 'items.json');
const SELLERS_FILE = path.join(DATA_DIR, 'sellers.json');
const ANALYTICS_FILE = path.join(DATA_DIR, 'analytics.json');

let items = fs.existsSync(ITEMS_FILE) ? JSON.parse(fs.readFileSync(ITEMS_FILE, 'utf8') || '[]') : [];
let sellers = fs.existsSync(SELLERS_FILE) ? JSON.parse(fs.readFileSync(SELLERS_FILE, 'utf8') || '[]') : [];
let analytics = fs.existsSync(ANALYTICS_FILE) ? JSON.parse(fs.readFileSync(ANALYTICS_FILE, 'utf8') || '[]') : [];

function saveData() {
  fs.writeFileSync(ITEMS_FILE, JSON.stringify(items, null, 2));
  fs.writeFileSync(SELLERS_FILE, JSON.stringify(sellers, null, 2));
  fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(analytics, null, 2));
}

// Тарифы
const PLANS = {
  trial: { name: 'Пробный', max_items: 25, days: 7, price: 0 },
  basic: { name: 'Basic', max_items: 50, days: 30, price: 15000 },
  pro: { name: 'Pro', max_items: 150, days: 30, price: 30000 }
};

function getSellerStatus(email) {
  const seller = sellers.find(s => s.email === email);
  if (!seller) return { active: false };
  const now = new Date();
  const createdAt = new Date(seller.created_at);
  const trialEnd = new Date(createdAt);
  trialEnd.setDate(createdAt.getDate() + PLANS.trial.days);
  if (seller.current_plan && seller.current_plan !== 'trial') {
    const paidUntil = new Date(seller.paid_until || 0);
    if (paidUntil > now && seller.items_count <= PLANS[seller.current_plan].max_items) {
      return { active: true, plan: seller.current_plan };
    }
  }
  if (now <= trialEnd && seller.items_count <= PLANS.trial.max_items) {
    return { active: true, plan: 'trial' };
  }
  return { active: false };
}

// Express
const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, uuidv4() + ext);
  }
});
const upload = multer({ storage });

// Основные роуты
app.get('/seller', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'seller.html'));
});
app.get('/widget', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'widget.html'));
});
app.get('/public-offer', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'public-offer.html'));
});
app.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'privacy.html'));
});
app.get('/api/item/:id', (req, res) => {
  const item = items.find(i => i.id === req.params.id);
  if (!item) return res.status(404).send('Товар не найден');
  res.json(item);
});

// Загрузка товара
app.post('/api/items', upload.fields([
  { name: 'photo_front', maxCount: 1 },
  { name: 'photo_back', maxCount: 1 }
]), (req, res) => {
  const { seller_email, size_table } = req.body;
  const photoFront = req.files?.photo_front?.[0];
  const photoBack = req.files?.photo_back?.[0];

  if (!photoFront || !photoBack || !seller_email) {
    return res.status(400).send('Нужны email и два фото товара');
  }

  let seller = sellers.find(s => s.email === seller_email);
  if (!seller) {
    seller = {
      email: seller_email,
      created_at: new Date().toISOString(),
      items_count: 0,
      current_plan: 'trial',
      paid_until: null
    };
    sellers.push(seller);
  }

  const status = getSellerStatus(seller_email);
  if (!status.active) {
    return res.status(403).json({ error: 'Пробный период завершён' });
  }

  let parsedSizeTable = {};
  if (size_table) {
    try { parsedSizeTable = JSON.parse(size_table); }
    catch (e) { return res.status(400).json({ error: 'Неверный формат таблицы размеров' }); }
  }

  const newItem = {
    id: uuidv4(),
    seller_email,
    photo_front: `/uploads/${photoFront.filename}`,
    photo_back: `/uploads/${photoBack.filename}`,
    size_table: parsedSizeTable,
    created_at: new Date().toISOString()
  };

  items.push(newItem);
  seller.items_count += 1;
  saveData();

  const widgetUrl = `${req.protocol}://${req.get('host')}/widget?item=${newItem.id}`;
  res.json({ widget_url: widgetUrl });
});

// Аналитика
app.post('/api/analytics', (req, res) => {
  const { item_id, height, chest, waist, hips, weight, tried_on } = req.body;
  if (item_id && tried_on) {
    analytics.push({
      item_id,
      height,
      chest,
      waist,
      hips,
      weight,
      tried_on: !!tried_on,
      timestamp: new Date().toISOString()
    });
    fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(analytics, null, 2));
  }
  res.json({ ok: true });
});

// Админка (с заменой пароля!)
const ADMIN_PASSWORD = '08apahar9673_!';
const YOO_SHOP_ID = 'твой_shop_id_из_юкассы';
const YOO_SECRET_KEY = 'твой_секретный_ключ_из_юкассы';

app.get('/admin', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${ADMIN_PASSWORD}`) {
    return res.status(401).send(`
      <h2>🔐 FitMirror Admin</h2>
      <input type="password" id="pwd">
      <button onclick="login()">Войти</button>
      <script>
        function login() {
          fetch('/admin', { headers: { 'Authorization': 'Bearer ' + document.getElementById('pwd').value } })
            .then(r => r.ok ? window.location.reload() : alert('Неверный пароль'));
        }
      </script>
    `);
  }

  let html = `<html><head><meta charset="utf-8"><title>FitMirror Admin</title></head><body>`;
  html += `<h2>Панель управления</h2>`;
  html += `<table border="1"><tr><th>Email</th><th>Тариф</th><th>Действия</th></tr>`;

  sellers.forEach(s => {
    const plan = PLANS[s.current_plan]?.name || 'Завершён';
    html += `<tr><td>${s.email}</td><td>${plan}</td><td>
      <button onclick="pay('${s.email}', 'basic')">15 000 ₽</button>
      <button onclick="pay('${s.email}', 'pro')">30 000 ₽</button>
    </td></tr>`;
  });

  html += `</table><script>
    function pay(email, plan) {
      fetch('/api/create-payment', { method:'POST', body:JSON.stringify({email, plan}), headers:{'Content-Type':'application/json'} })
        .then(r => r.json()).then(d => { if (d.url) window.location.href = d.url; });
    }
  </script></body></html>`;
  res.send(html);
});

// ЮKassa (оставлен для будущего подключения)
app.post('/api/create-payment', (req, res) => {
  res.status(501).json({ error: 'Платежи временно недоступны' });
});
app.post('/api/yookassa-webhook', (req, res) => {
  res.status(200).end();
});

// Стилист (заглушка)
app.post('/api/stylist-advice', (req, res) => {
  const { photo