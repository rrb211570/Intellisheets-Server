const express = require('express');
var cors = require('cors');
const app = express();
app.use(cors());

require('dotenv').config()

const bodyParser = require('body-parser')
app.use(bodyParser.urlencoded({
    extended: false
}));
app.use(bodyParser.json());

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
    sheets: [
        {
            id: String,
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
    ],
    latestSheetID: String
});
let User = mongoose.model('User', userSchema);

app.get('/newuser/:username/:password', (req, res) => {
    let username = req.params.username;
    User.find({ username: username }, (err, peopleFound) => {
        if (err) {
            res.json({ error: err });
        } else {
            if(peopleFound.length==0){
                let user = User({
                    username: username,
                    password: req.params.password,
                    sheets: []
                });
                user.save((err, newUser) => {
                    if (err) {
                        console.log('Error: newUser(): save(): ' + err);
                        res.json({ error: err });
                    } else {
                        User.findById(newUser._id, function (err, pers) {
                            if (err) {
                                console.log('Error: newUser(): findById(): ' + err);
                                res.json({ error: err });
                            } else res.json({ usernameAvailable: true, username: pers.username, _id: pers._id, sheets: pers.sheets });
                        });
                    }
                })
            } else res.json({usernameAvailable: false})
        }
    });
});

app.get('/login/:username/:password', (req, res) => {
    let username = req.params.username;
    let password = req.params.password;
    User.find({ username: username, password: password}, (err, peopleFound) => {
        if (err) {
            res.json({ error: err });
        } else {
            if(peopleFound.length==0) res.json({ validCredentials: false });
            else res.json({validCredentials: true})
        }
    });
});

app.get('/api/userSheets/', (req, res) => {
    res.send({ params: 'huh' });
    /*let user = User({
        username: req.params.user,
        sheets: []
    });
    
    user.save((err, newUser) => {
        if (err) {
            console.log('Error: newUser(): save(): ' + err);
            res.json({ error: err });
        } else {
            User.findById(newUser._id, function (err, pers) {
                if (err) {
                    console.log('Error: newUser(): findById(): ' + err);
                    res.json({ error: err });
                } else res.json({ username: pers.username, _id: pers._id, sheets: pers.sheets });
            });
        }
    });*/
    //res.json({ username: req.params.user, _id: 148, sheets: [] })
});

app.post('/api/users/:_username/sheetPreview', (req, res) => {
    let user = User({
        username: req.body.username,
        sheets: []
    });
    user.findOne({ sessionToken: req.body.sessionToken }, (err, newUser) => {
        if (err) {
            console.log('Error: sheetPreview(): findOne(): ' + err);
            res.json({ error: err });
        } else {
            User.findById(newUser._id, function (err, pers) {
                if (err) {
                    console.log('Error: sheetPreview(): findById(): ' + err);
                    res.json({ error: err });
                } else res.json({
                    username: pers.username, _id: pers._id, sheetPreviews: pers.sheets.map((sheet) => {
                        return {
                            title: sheet.title,
                            id: sheet.id
                        }
                    })
                });
            });
        }
    });
});

app.post('/users/:_username/:_sheetID', (req, res) => {
    let user = User({
        username: req.body.username,
        sheets: []
    });
    user.findOne({ sessionToken: req.body.sessionToken }, (err, newUser) => {
        if (err) {
            console.log('Error: sheetPreview(): findOne(): ' + err);
            res.json({ error: err });
        } else {
            User.findById(newUser._id, function (err, pers) {
                if (err) {
                    console.log('Error: sheetPreview(): findById(): ' + err);
                    res.json({ error: err });
                } else res.json({
                    username: pers.username, _id: pers._id, sheetPreviews: pers.sheets.map((sheet) => {
                        return {
                            title: sheet.title,
                            id: sheet.id
                        }
                    })
                });
            });
        }
    });
});

