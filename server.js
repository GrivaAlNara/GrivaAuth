const http = require('http');
const fs = require('fs');
const path = require('path');
const express = require('express');
const app = express();
const sqlite3 = require('sqlite3');
const crypto = require('crypto');
const DB_PATH = path.join(__dirname, '/resources/Data.db');
const exphbs = require('express-handlebars');
const hashes = require('@jthinking/hashes-node');
const db = new sqlite3.Database(DB_PATH);
const PORT = 3000;
const RESOURCES_DIR = path.join(__dirname, 'resources');

const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "INSERT YOUR AUTH USERNAME",
    pass: "INSERT YOUR AUTH APP PASSWORD",
  },
});

const session = require('express-session');
var SQLiteStore = require('connect-sqlite3')(session);

app.use(session({store: new SQLiteStore({dir: path.join(__dirname, 'resources'), db: "Data.db"}), dir: path.join(__dirname, 'resources'), secret: 'INSERT YOUR SECRET COOKIE KEY', resave: false, saveUninitialized: false, maxAge:1000 * 60 * 60 * 10}));

app.engine('hbs', exphbs.engine({
  extname: '.hbs', // Расширение файлов шаблонов
  defaultLayout: false,
}));
app.set('view engine', 'hbs'); // Указываем движок шаблонов

// Middleware для парсинга JSON и форм
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'css')));

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}}`);
});

function streebogHash(str){
  const buf = Buffer.from(str, 'UTF-8');
  return hashes.streebog256(buf);
}

const IsValidUser = async (email, password) => {
  var users;
  try {
  users = await new Promise((resolve, reject) => {
        db.all(`SELECT * FROM USERS WHERE Email = "${email}"`, (err, rows) => {

        if (err) reject(err);
        else resolve(rows);
      
      });
  });
  }
    catch (err) {
      log("Ошибка БД: " + err, "ERR")    
  }
  if(users.length == 1 && users[0].Hashkey == streebogHash(password)){
    return {id: users[0].ID, ban: users[0].BlockExpires > Date.now()}
  } else return false;
}

const checkAuth = (req, res, next) => {
  if (req.session.isLoggedIn) {
    next(); // Продолжаем обработку
  } else {
    res.redirect('/login');
  }
};

async function GetUser(req) {
  if(!req.session.isLoggedIn) return;
  var user;
  try {
      user = (await new Promise((resolve, reject) => {
        db.all(`SELECT * FROM USERS WHERE ID = "${req.session.user}"`, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);      
      
      });
  }))[0];
  }
    catch (err) {
      log("Ошибка БД: " + err, "ERR");    
  }

  return {id: user.ID, email: user.Email, workText: user.WorkText};
}

async function GetUserByOTT(OTToken) {
  var user;
  try {
      user = (await new Promise((resolve, reject) => {
        db.all(`SELECT ID, AuthCode, OTTExpires FROM USERS WHERE OTT = "${OTToken}"`, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);      
      });
  }))[0];
  }
    catch (err) {
      log("Ошибка БД: " + err, "ERR");    
  }

  if(user == undefined || user.OTTExpires <= Date.now()){
    return {exists: false, user: undefined, code: undefined};
  } else {
    return {exists: true, user: user.ID, code:user.AuthCode};
  }
}

async function generateUserOTT(UserId){
  var OTT = crypto.randomBytes(32).toString('hex');
  var code = Math.floor(Math.random() * (999999 - 100000)) + 100000;
  try{
  await new Promise((resolve, reject) => {
    db.run(`UPDATE USERS SET OTT = "${OTT}", OTTExpires = ${Date.now() + 1000 * 60 * 10}, AuthCode = "${code}", OTTAttempts = 0 WHERE ID = ${UserId}`, (err) => {
      if(err) reject(err)
      else resolve(true);
    });
  })
  } catch (err){
      log(err);
      return;
  }
  return {OTT: OTT, code: code};
}

async function eraseUserOTT(UserId){
  try{
  await new Promise((resolve, reject) => {
    db.run(`UPDATE USERS SET OTT = "", OTTExpires = 0, AuthCode = "", OTTAttempts = 0 WHERE ID = ${UserId}`, (err) => {
      if(err) reject(err)
      else resolve(true);
    });
  })
  } catch (err){
      log(err);
      return;
  }
}

async function increaseAttempts(UserId){
  try{
  await new Promise((resolve, reject) => {
    db.run(`UPDATE USERS SET OTTAttempts = OTTAttempts + 1 WHERE ID = ${UserId}`, (err) => {
      if(err) reject(err)
      else resolve(true);
    });
  })
  } catch (err){
      log(err);
      return;
  }

  var user;
  try {
      user = (await new Promise((resolve, reject) => {
        db.all(`SELECT ID, OTTAttempts FROM USERS WHERE ID = "${UserId}"`, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);      
      });
  }))[0];
  }
    catch (err) {
      log("Ошибка БД: " + err, "ERR");    
  }

  return user.OTTAttempts;
}

async function banUser(UserId){
  try{
  await new Promise((resolve, reject) => {

    db.run(`UPDATE USERS SET BlockExpires = ${Date.now() + 1000 * 90} WHERE ID = ${UserId}`, (err) => {
      if(err) reject(err)
      else resolve(true);
    });
    log("Пользователь с ID:" + UserId + " был отправлен в таймаут!", "WARN");
  })
  } catch (err){
      log(err);
      return;
  }
}


async function sendCode(email, code){
  try {
    const info = await transporter.sendMail({
      from: 'GrivaProject@gmail.com',
      to: email, // list of receivers
      subject: "Вход в систему GrivaProject", // Subject line
      text: `Добрый день. Ваш код доступа — ${code}. \n Если вы не запрашивали его, свяжитесь с вашим системынем администратором.`, // plain text body
    });

    log("Message sent: %s" + info.messageId);
  } catch (err) {
    log("Error while sending mail" + err, "ERR");
  }
}

app.get('/', (req, res) => {
  if(req.session.isLoggedIn){
    res.redirect("/account");
  } else {
    res.redirect("/login");
  }
});

// Роут для страницы входа
app.get('/login', (req, res) => {
  res.sendFile(RESOURCES_DIR + '/index.html');
});

// Обработка POST-запроса на вход
app.post('/login', async (req, res) => {
  var user = await IsValidUser(req.body.email, req.body.password);
  if(!user){
    res.status(401).send()
  } else if(user.ban){
    res.status(403).send()
  } else {
    var cred = await generateUserOTT(user.id);
    sendCode(req.body.email, cred.code);
    res.redirect(`/verify?token=${cred.OTT}`);
  } 
});

app.get('/verify', async (req, res) => {

  var token = req.query.token;
  var {exists} = await GetUserByOTT(token);


  if(exists){
    res.sendFile(RESOURCES_DIR + '/auth.html');
  } else {
    res.status(401).send("Недействительная ссылка :(");
  }
});

app.post('/verify', async (req, res) => {
  var token = req.query.token;
  var {exists, user, code} = await GetUserByOTT(token);
  if(exists){
    if(req.body.code == code){
      req.session.isLoggedIn = true; // Записываем флаг в сессию
      req.session.user = user;
      log("Произведён вход, ID=" + user);
      eraseUserOTT(user);
      res.redirect('/account');
    } else {
      if(await increaseAttempts(user) > 3){
        banUser(user);
        eraseUserOTT(user);
        res.status(403).redirect("/login");
      } else {
        res.status(401).send();
      }
    }
  } else {
    res.send("Недействительная ссылка :(");
  }
});

app.get('/account', checkAuth, async (req, res) => {
  const user = await GetUser(req);
  res.render(path.join(RESOURCES_DIR, '/MyAccount'), {
    Email: user.email,
    WorkText: user.workText,
    NumberOfTheDay: 321 * new Date().getHours()
  });
});

app.get('/logout', checkAuth, async (req, res) => {
  log("Произведён выход, ID=" + req.session.user);
  req.session.destroy();
  res.redirect("/login");
});


app.post('/save-text', checkAuth, async (req, res) => {
  try{
  await new Promise((resolve, reject) => {
    db.run(`UPDATE USERS SET WorkText = "${req.body.text}" WHERE ID = ${req.session.user}`, (err) => {
      if(err) reject(err)
      else resolve(true);
    });
  })
  } catch (err){
      log(err);
      res.status(500).send();
      return;
  }
  res.status(200).send();

});


function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${type.toUpperCase()}] ${message}\n`;

  // Вывод в консоль
  console.log(logMessage.trim());
}