const express = require('express');
var cors = require('cors');
const app = express();
app.use(cors());

require('dotenv').config();
const cookieParser = require("cookie-parser");
var jwt = require('jsonwebtoken');

const bodyParser = require('body-parser')
app.use(bodyParser.urlencoded({
    extended: false
}));
app.use(bodyParser.json());
const fetch = require('node-fetch');

const port = process.env.PORT || 5000;
var mongoose = require('mongoose');
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

app.get('/', (req, res) => {
    res.send('Hello Worlds!');
});

app.listen(port, () => console.log(`Listening at http://localhost:${port}`));

const { Schema } = mongoose;
let userSchema = new Schema({
    username: String,
    password: String,
    salt: String,
    hashedPass: String,
    sessionID: String,
    sheets: [
        {
            id: String,
            title: String,
            rows: String,
            cols: String,
            dateCreated: String,
            dateModified: String,
            data: [{
                entryKey: String,
                col: String,
                row: String,
                val: String,
                styleMap: [{
                    property: String,
                    value: String
                }]
            }]
        }
    ]
});
let User = mongoose.model('User', userSchema);

app.get('/newuser/:username/:password', (req, res) => {
    let username = req.params.username;
    User.find({ username: username }, (err, peopleFound) => {
        if (err) {
            res.json({ error: err });
        } else {
            if (peopleFound.length == 0) {
                let registrationCode = '';
                for (let i = 0; i < 8; ++i) registrationCode = registrationCode + Math.floor(Math.random() * 10) + '';
                let user = User({
                    username: username,
                    password: req.params.password,
                    sessionID: registrationCode, // store code here temporarily
                    sheets: []
                });
                let url = 'https://api.elasticemail.com/v2/email/send?' +
                'apikey=' + 'A9489D65B4152D9C271941CD1DE5A009DD5A3ADC2B0DDE6A7624B296C93CD1166DC6A5EF0077D22A40572AA784C286A1' +
                '&subject=' + 'Confirm your registration for Intellisheets' +
                '&from=' + 'credentials@intellisheets.me' +
                '&fromName=' + 'Intellisheets Credentials' +
                `&to=${username}` +
                '&bodyHTML=' + `<h1>Here is your registration code: ${registrationCode}</h1>` +
                '&isTransactional=' + 'true';
                sendTokenEmail(url)
                    .then(blah => {
                        res.json({ usernameAvailable: true, blah: blah, url: url})
                    })
                    .catch(err => {
                        res.json({ error: err });
                    });
                /*user.save((err, newUser) => {
                    if (err) {
                        res.json({ error: err });
                    } else {
                        User.findById(newUser._id, function (err, pers) {
                            if (err) {
                                res.json({ error: err });
                            } else {
                                try{
                                    sendTokenEmail(req, res, username, registrationCode)
                                    .then(blah=>{
                                        res.json({ usernameAvailable: true, username: pers.username, _id: pers._id, sheets: pers.sheets, elasticRes: elasticRes, code: registrationCode })
                                    })
                                    .catch(err => {
                                        res.json(json.stringify({ error: err, user: username, code: registrationCode}));
                                        console.log('error: ');
                                        console.log(err);
                                        console.log('done');
                                    });
                                }catch(e){
                                    res.json({error: e});
                                }
                            }
                        });
                    }
                })*/
            } else res.json({ usernameAvailable: false })
        }
    });
});

sendTokenEmail = async (url) => {
    const response = await fetch(url);
    const body = await response.json();
    if (response.status !== 200) {
        throw Error(body.error)
    }
    return body;
}

app.get('tokenconfirm/:username/:registrationCode', (req, res) => {
    let username = req.params.username;
    let registrationCode = req.params.registrationCode;
    User.find({ username: username }, (err, peopleFound) => {
        if (err) {
            res.json({ error: err });
        } else {
            if (peopleFound.length != 1) {
                res.json({ error: 'tokenconfirm: peopleFound != 1' });
            } else {
                let user = peopleFound[0];
                if (user.sessionID == registrationCode) {
                    // hash (pass + salt) into hashedPass
                    res.json({ JWT: createJWT() }); // check
                } else res.json({ status: 'fail', reason: 'invalid token' });
            }
        }
    });
});

app.get('/login/:username/:password', (req, res) => {
    let username = req.params.username;
    let password = req.params.password;
    User.find({ username: username, password: password }, (err, peopleFound) => {
        if (err) {
            res.json({ error: err });
        } else {
            if (peopleFound.length == 0) res.json({ validCredentials: false });
            else res.json({ validCredentials: true, JWT: createJWT() }) // check
        }
    });
});

function createJWT() {
    // check
}

app.get('/sheets/:username/:password', (req, res) => {
    let username = req.params.username;
    let password = req.params.password;
    User.find({ username: username, password: password }, (err, peopleFound) => {
        if (err || peopleFound.length != 1) {
            res.json({ error: err });
        } else {
            let person = peopleFound[0];
            let sheetPreviews = [];
            for (const sheet of person.sheets) sheetPreviews.push({ id: sheet.id, title: sheet.title });
            res.json({ username: person.username, _id: person._id, sheetPreviews: sheetPreviews });
        }
    });
});

app.get('/createSheet/:username/:password/:rows/:cols/', (req, res) => {
    let username = req.params.username;
    let password = req.params.password;
    let rows = req.params.rows;
    let cols = req.params.cols;
    User.find({ username: username, password: password }, (err, peopleFound) => {
        if (err || peopleFound.length != 1) {
            res.json({ error: err });
        } else {
            let newSheetID = peopleFound[0].sheets.length;
            let newSheet = {
                id: newSheetID,
                title: 'Untitled',
                rows: rows,
                cols: cols,
                dateCreated: getDate(),
                dateModified: getDate(),
                data: []
            }
            let modifiedSheets = [...peopleFound[0].sheets, newSheet];
            User.updateOne({ username: username, password: password }, { sheets: modifiedSheets }, (err, status) => {
                if (err) {
                    res.json({ error: err })
                } else {
                    res.json({
                        status: 'NEW_SHEET',
                        newSheetID: newSheetID
                    });
                }
            });
        }
    });
});

app.get('/loadSheet/:username/:password/:sheetID', (req, res) => {
    let username = req.params.username;
    let password = req.params.password;
    let sheetID = req.params.sheetID;
    User.find({ username: username, password: password }, (err, peopleFound) => {
        if (err || peopleFound.length != 1) {
            res.json({ error: err });
        } else {
            let payload = {};
            let dbEntrySheets = peopleFound[0].sheets;
            for (let i = 0; i < dbEntrySheets.length; ++i) {
                if (dbEntrySheets[i].id == sheetID) {
                    payload.title = dbEntrySheets[i].title;
                    payload.rows = dbEntrySheets[i].rows;
                    payload.cols = dbEntrySheets[i].cols;
                    payload.data = dbEntrySheets[i].data;
                    break;
                }
            }
            if (!payload.hasOwnProperty('title')) res.json({ error: 'loadSheet(): payload is empty' });
            else {
                payload.status = 'OPEN_SHEET';
                res.json(Object.assign({}, payload));
            }
        }
    });
});

app.post('/saveSheet/:username/:password/:sheetID', (req, res) => {
    let username = req.params.username;
    let password = req.params.password;
    let sheetID = req.params.sheetID;
    let receivedData = req.body.exposedCollectedData;
    User.find({ username: username, password: password }, (err, peopleFound) => {
        if (err || peopleFound.length != 1) {
            res.json({ error: err });
        } else {
            let modifiedSheets = updateSheets(peopleFound[0].sheets, receivedData, sheetID);
            if (modifiedSheets == null) res.json({ error: 'API Error: ...saveSheet : sheetID not found' });
            User.updateOne({ username: username, password: password }, { sheets: modifiedSheets }, (err, status) => {
                if (err) {
                    res.json({ error: err })
                } else {
                    res.json({
                        status: 'saved sheet',
                        dat: receivedData
                    });
                }
            });
        }
    });
});

function updateSheets(dbSheets, receivedData, sheetID) {
    let ret = dbSheets.map(sheet => {
        if (sheet.id == sheetID) {
            sheet.dateModified = getDate();
            let dbData = sheet.data;
            let newEntries = [];
            for (const receivedEntry of receivedData) {
                let found = false;
                for (let dbEntry of dbData) {
                    if (dbEntry.entryKey == receivedEntry.entryKey) {
                        found = true;
                        copyVal(dbEntry, receivedEntry);
                        copyStyleMap(dbEntry.styleMap, receivedEntry.styleMap);
                    }
                }
                if (!found) newEntries.push(receivedEntry)
            }
            sheet.data = [...dbData, ...newEntries];
        } else return null;
        return sheet;
    });
    return ret;
}

function getDate() {
    let today = new Date();
    let date = today.getFullYear() + '-' + (today.getMonth() + 1) + '-' + today.getDate();
    let time = today.getHours() + ":" + today.getMinutes() + ":" + today.getSeconds();
    return date + ' ' + time;
}

function copyVal(dbEntry, receivedEntry) {
    dbEntry.val = receivedEntry.val;
}

function copyStyleMap(dbEntryStyleMap, receivedEntryStyleMap) {
    for (const receivedEntryStylePair of receivedEntryStyleMap) {
        for (let dbEntryStylePair of dbEntryStyleMap) {
            if (dbEntryStylePair.property == receivedEntryStylePair.property) {
                dbEntryStylePair.value == receivedEntryStylePair.value;
            }
        }
    }
}
