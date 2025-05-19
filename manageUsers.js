const path = require('path');
const sqlite3 = require('sqlite3');
const DB_PATH = path.join(__dirname, '/resources/Data.db');
const crypto = require('crypto');
const { gostEngine } = require('node-gost-crypto');
const db = new sqlite3.Database(DB_PATH);
const fs = require('fs');

const readline = require('readline');

/**
 * @param {string} question
 * @returns {Promise<string>}
 */

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});



async function ask(question) {
  return new Promise((resolve, reject) => {
    rl.question(question, (answer) => {
      if (answer === null || answer === undefined || !/\S/.test(answer)) {
        resolve("");
      }
      resolve(answer);
    });
  });
}

function streebogHash(str){
    const buffer = Buffer.from(str);
    const digest = gostEngine.getGostDigest({name: 'GOST R 34.11', length: 256, version: 1994});
    return (Buffer.from(digest.digest(buffer)).toString('hex'));
}


async function showusers(){
try {
        const users = await new Promise((resolve, reject) => {
        db.all('SELECT ID, Email FROM USERS', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
  });
  console.log(`\n`);
  users.forEach((row) => {
    console.log(`${row.ID}. ${row.Email}\n`);
  });
  console.log(`\n`);
  }
    catch (err) {
    console.log('Ошибка БД ' + err);
  }
}

async function addUser(){
    const  id = Math.floor(Math.random() * (999999 - 100000)) + 100000;
    
    var email;
    while (true) {
        email = await ask(`Введите адрес электронной почты:`);
        if(/[^@]+\@[^@]+/.test(email)){
            break;
        } else {
            console.log("Некорректная почта");
        }
    }
    
    var password;
    var salt = crypto.randomBytes(3).toString('hex');
    while (true) {
        password = (await ask(`Введите пароль, оставьте пустым для генерации:`));
        
        if(password == ""){
            password = crypto.randomBytes(3).toString('hex');
            break;
        } else if (password.length < 6){
            console.log("Короткий пароль");
        } else {
            break;
        }
    }
    
    try {
        const users = await new Promise((resolve, reject) => {
        db.run(`INSERT INTO USERS (ID, Email, Hashkey, salt) VALUES(${id}, "${email}", "${streebogHash(salt + password)}", "${salt}")`, (err, rows) => {
        if (err) reject(err);
        else {
            resolve(true);
            console.log(`${id}. ${email} — ${password}`);
        }
      });
  });
  }
    catch (err) {
    console.log('Ошибка БД ' + err);
  }
}

async function deleteUser(){

    await showusers();
    const email = await ask(`Введите email для удаления: `);
    const ver = await ask(`Точно удалить ${email}? Y/N: `);
    if(ver != "Y"){
        return;
    }

    try {
        const users = await new Promise((resolve, reject) => {
        db.run(`DELETE FROM USERS WHERE Email = "${email}"`, (err, rows) => {
        
        if (err) reject(err);
        else {
            resolve(true);
        }
        console.log(`УДАЛЕНО\n`);
    });
  });
  }
    catch (err) {
    console.log('Ошибка БД ' + err);
  }
}

async function editUser(){
    await showusers();
    const id = parseInt(await ask(`Введите id для изменения1: `));
    const mode = (await ask(`Выберете:\n1. изменить email\n2. изменить пароль\n3. изменить всё\n\n`))[0];
    var query;
    var salt = crypto.randomBytes(3).toString('hex');
    
    if(mode == "1" || mode == "3"){
        while (true) {
            email = await ask(`Введите адрес электронной почты:`);
            if(/[^@]+\@[^@]+/.test(email)){
                break;
            } else {
                console.log("Некорректная почта");
            }
        }
    }

    if(mode == "2" || mode == "3"){
        var password;
        while (true) {
            password = (await ask(`Введите пароль, оставьте пустым для генерации:`));
            if(password == ""){
                password = crypto.randomBytes(3).toString('hex');
                break;
            } else if (password.length < 6){
                console.log("Короткий пароль");
            } else {
                break;
            }
        }
    }

    switch(mode){
        case ("1"): query = `UPDATE USERS SET Email = "${email}" WHERE ID = ${id};`; break;
        case ("2"): query = `UPDATE USERS SET HashKey = "${streebogHash(salt + password)}", salt = "${salt}" WHERE ID = ${id};`; break;
        case ("3"): query = `UPDATE USERS SET Email = "${email}", HashKey = "${streebogHash(salt + password)}", salt = "${salt}" WHERE ID = ${id};`; break;
        default: console.log("неизвестная команда"); return; 
    }

    try {
        const users = await new Promise((resolve, reject) => {
        db.run(query, (err, rows) => {
        if (err) reject(err);
        else {
            resolve(true);
            console.log(`Изменения сохранены`);
        }
        });
    });
    }
        catch (err) {
        console.log('Ошибка БД ' + err);
    }
}




async function ManageUsers(){
    try {
        console.log("Введите команду (цифрой):\n"+
            "1. Вывести список пользователей\n"+
            "2. Добавить новго пользователя\n"+
            "3. Удалить пользователя\n"+
            "4. Редактировать данные пользователя\n" + 
            "5. Заблокировать пользователя\n" + 
            "6. Ввернуться в режим мониторинга логов\n" + 
            "7. Вывести полный лог сервера"
        );
        const str = (await ask(`Номер команды:`))[0];
        switch(str){
            case "1": await showusers();
                break;
            case "2": await addUser();
                break;
            case "3": await deleteUser();
                break;
            case "4": await editUser();
                break;
            case "5": throw new NotImplementedException();
                break;
            case "6": return false;
                break;
            case "7": 
            console.log("\n--------------------------------------------------------------------------------------------");
            console.log(fs.readFileSync('server.log', 'utf-8'));
            console.log("--------------------------------------------------------------------------------------------\n");
            break;
            default:
                console.log("Команда нераспознана");
                break;
            }
    } catch (err) {
        console.log("\nОШИБКА " + err + "\n");
    }
    return true;
}
module.exports = { ManageUsers, ask, rl}; 