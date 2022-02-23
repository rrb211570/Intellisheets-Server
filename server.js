const express = require('express');
const app = express();
var cors = require('cors');
app.use(cors({
    origin: [
        'https://intellisheets.me'
    ],
    methods: ['GET', 'PUT', 'POST'],
    allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept'],
    credentials: true
}));
const bodyParser = require('body-parser')
app.use(bodyParser.urlencoded({
    extended: false
}));
app.use(bodyParser.json());
const cookieParser = require("cookie-parser");
app.use(cookieParser());
require('dotenv').config();
const port = process.env.PORT || 5000;

var bcrypt = require('bcryptjs');
var rand = require('csprng');
var jwt = require('jsonwebtoken');

const sgMail = require('@sendgrid/mail')
sgMail.setApiKey(process.env.SENDGRID_API_KEY)

var mongoose = require('mongoose');
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

app.get('/', (req, res) => {
    res.send('Hello Worlds!');
});

app.listen(port, () => console.log(`Listening at http://localhost:${port}`));

const { Schema } = mongoose;
let userSchema = new Schema({
    username: String,
    hash: String,
    signatureSecret: String,
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

app.get('/newUser/:username/:password', (req, res) => {
    const username = req.params.username;
    const password = req.params.password;
    User.find({ username: username }, (err, peopleFound) => {
        if (err) res.json({ status: 'fail', reason: err });
        else {
            if (peopleFound.length == 0) {
                let registrationCode = '';
                for (let i = 0; i < 8; ++i) registrationCode = registrationCode + Math.floor(Math.random() * 10) + '';
                var salt = bcrypt.genSaltSync(14);
                let user = User({
                    username: username,
                    hash: bcrypt.hashSync(password, salt),
                    signatureSecret: registrationCode, // store code here temporarily
                    sheets: []
                });
                user.save((err, newUser) => {
                    if (err) res.json({ status: 'fail', reason: err });
                    else {
                        User.findById(newUser._id, function (err, pers) {
                            if (err) res.json({ status: 'fail', reason: err });
                            else sendEmailCode(res, username, registrationCode);
                        });
                    }
                })
            } else res.json({ status: 'fail', reason: 'usernameAvailable: false' })
        }
    });
});

function sendEmailCode(res, username, registrationCode) {
    const msg = {
        to: `${username}`,
        from: 'credentials@intellisheets.me',
        subject: 'Intellisheets Registration',
        html: '<p>Here is your confirmation code for Intellisheets: ' + registrationCode + '<br> If you\'ve exited the code confirmation page, click <a href="intellisheets.me/confirmCode/' + username + '">here</a> to open it up again.</p>',
    }
    sgMail
        .send(msg)
        .then(blah => {
            res.json({ status: 'success', usernameAvailable: true});
        })
        .catch(err => {
            res.json({ status: 'fail', reason: err, usernameAvailable: true});
        })
}

app.get('/confirmCode/:username/:registrationCode', (req, res) => {
    const username = req.params.username;
    const registrationCode = req.params.registrationCode;
    User.find({ username: username }, (err, peopleFound) => {
        if (err) res.json({ status: 'fail', reason: err });
        else {
            if (peopleFound.length != 1) res.json({ status: 'fail', reason: 'user not found' });
            else {
                let user = peopleFound[0];
                if (user.signatureSecret == registrationCode) {
                    let secret = rand(128, 14);
                    const access_token = jwt.sign({ username: username }, secret);
                    User.updateOne({ _id: user._id }, { signatureSecret: secret }, (err, status) => {
                        if (err) res.json({ status: 'fail', reason: err })
                        else {
                            res.cookie('access_token', access_token, {
                                httpOnly: true,
                                secure: true,
                                sameSite: 'none'
                            });
                            res.json({ status: 'success', context: 'code confirmed' });
                        }
                    });
                }
                else res.json({ status: 'fail', reason: 'invalid code'});
            }
        }
    });
});

app.get('/login/:username/:password', (req, res) => {
    const username = req.params.username;
    const password = req.params.password;
    User.find({ username: username }, (err, peopleFound) => {
        if (err) res.json({ status: 'fail', reason: err });
        else {
            if (peopleFound.length != 1) res.json({ status: 'fail', reason: 'user not found' });
            else {
                let user = peopleFound[0];
                try{
                    bcrypt.compare(password, user.hash, function (err, res2) {
                        if (err) res.json({ status: 'fail', reason: err });
                        else {
                            let secret = rand(128, 14);
                            const access_token = jwt.sign({ username: username }, secret);
                            User.updateOne({ _id: user._id }, { signatureSecret: secret }, (err, status) => {
                                if (err) res.json({ status: 'fail', reason: err })
                                else {
                                    res.cookie('access_token', access_token, {
                                        httpOnly: true,
                                        secure: true,
                                        sameSite: 'none'
                                    });
                                    res.json({ status: 'success', context: 'logged in' });
                                }
                            });
                        }
                    });
                }catch(e){
                    res.json({status: 'fail', reason: e})
                }
            }
        }
    });
});

app.get('/logout', (req, res) => {
    const token = req.cookies.access_token;
    if (!token) res.json({ status: 'fail', reason: 'missing token' });
    const username = jwt.decode(token, { complete: true }).payload.username;
    try {
        User.find({ username: username }, (err, peopleFound) => {
            if (err) res.json({ status: 'fail', reason: err });
            else {
                if (peopleFound.length != 1) res.json({ status: 'fail', reason: 'user not found' });
                else {
                    let person = peopleFound[0];
                    jwt.verify(token, person.signatureSecret);
                    res.clearCookie('access_token');
                    res.json({ status: 'success', context: "logged out" });
                }
            }
        });
    } catch (e) {
        res.json({ status: 'fail', reason: e });
    }
});

app.get('/sheets', (req, res) => {
    const token = req.cookies.access_token;
    if (!token) res.json({ status: 'fail', reason: 'missing token'});
    const username = jwt.decode(token, { complete: true }).payload.username;
    try {
        User.find({ username: username }, (err, peopleFound) => {
            if (err) res.json({ status: 'fail', reason: err });
            else {
                if (peopleFound.length != 1) res.json({ status: 'fail', reason: 'user not found' });
                else {
                    let person = peopleFound[0];
                    jwt.verify(token, person.signatureSecret);
                    let sheetPreviews = [];
                    for (const sheet of person.sheets) sheetPreviews.push({ id: sheet.id, title: sheet.title });
                    res.json({ status: 'success', sheetPreviews: sheetPreviews });
                }
            }
        });
    } catch (e) {
        res.json({ status: 'fail', reason: e });
    }
});

app.get('/createSheet/:rows/:cols/', (req, res) => {
    const token = req.cookies.access_token;
    if (!token) res.json({ status: 'fail', reason: 'missing token' });
    let username = jwt.decode(token, { complete: true }).payload.username;
    let rows = req.params.rows;
    let cols = req.params.cols;
    try {
        User.find({ username: username }, (err, peopleFound) => {
            if (err) res.json({ status: 'fail', reason: err });
            else {
                if (peopleFound.length != 1) res.json({ status: 'fail', reason: 'user not found' });
                else {
                    let person = peopleFound[0];
                    jwt.verify(token, person.signatureSecret);
                    let newSheetID = person.sheets.length;
                    let newSheet = {
                        id: newSheetID,
                        title: 'Untitled',
                        rows: rows,
                        cols: cols,
                        dateCreated: getDate(),
                        dateModified: getDate(),
                        data: []
                    }
                    let modifiedSheets = [...person.sheets, newSheet];
                    User.updateOne({ username: username }, { sheets: modifiedSheets }, (err, status) => {
                        if (err) res.json({ status: 'fail', reason: err })
                        else res.json({ status: 'success', newSheetID: newSheetID });
                    });
                }
            }
        });
    } catch (e) {
        res.json({ status: 'fail', reason: e });
    }
});

app.get('/loadSheet/:sheetID', (req, res) => {
    const token = req.cookies.access_token;
    if (!token) res.json({ status: 'fail', reason: 'missing token' });
    let username = jwt.decode(token, { complete: true }).payload.username;
    let sheetID = req.params.sheetID;
    try {
        User.find({ username: username }, (err, peopleFound) => {
            if (err) res.json({ status: 'fail', reason: err });
            else {
                if (peopleFound.length != 1) res.json({ status: 'fail', reason: 'user not found' });
                else {
                    let person = peopleFound[0];
                    jwt.verify(token, person.signatureSecret);
                    let payload = {};
                    let dbEntrySheets = person.sheets;
                    for (let i = 0; i < dbEntrySheets.length; ++i) {
                        if (dbEntrySheets[i].id == sheetID) {
                            payload.title = dbEntrySheets[i].title;
                            payload.rows = dbEntrySheets[i].rows;
                            payload.cols = dbEntrySheets[i].cols;
                            payload.data = dbEntrySheets[i].data;
                            break;
                        }
                    }
                    if (!payload.hasOwnProperty('title')) res.json({ status: 'fail', reason: 'sheetID does not exist' });
                    else {
                        payload.status = 'success';
                        res.json(Object.assign({}, payload));
                    }
                }
            }
        });
    } catch (e) {
        res.json({ status: 'fail', reason: e });
    }
});

app.post('/saveSheet/:sheetID', (req, res) => {
    const token = req.cookies.access_token;
    if (!token) res.json({ status: 'fail', reason: 'missing token' });
    let username = jwt.decode(token, { complete: true }).payload.username;
    let sheetID = req.params.sheetID;
    let receivedData = req.body.exposedCollectedData;
    try {
        User.find({ username: username, }, (err, peopleFound) => {
            if (err) res.json({ status: 'fail', reason: err });
            else {
                if (peopleFound.length != 1) res.json({ status: 'fail', reason: 'user not found' });
                else {
                    let person = peopleFound[0];
                    jwt.verify(token, person.signatureSecret);
                    let modifiedSheets = updateSheets(person.sheets, receivedData, sheetID);
                    if (modifiedSheets == null) res.json({ status: 'fail', reason: 'API Error: ...saveSheet : sheetID not found' });
                    User.updateOne({ username: username }, { sheets: modifiedSheets }, (err, status) => {
                        if (err) res.json({ status: 'fail', reason: err })
                        else res.json({ status: 'success', dat: receivedData });
                    });
                }
            }
        });
    } catch (e) {
        res.json({ status: 'fail', reason: e });
    }
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
