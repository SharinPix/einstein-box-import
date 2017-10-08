const Sharinpix = require('sharinpix');
const express = require('express');
const app = express();

if (app.settings.env === 'development') {
    require('dotenv').config();
}
Sharinpix.configure(process.env.SHARINPIX_URL);
const sharinpixInstance = Sharinpix.get_instance();
const bodyParser = require('body-parser');
const parseCsv = require('./lib/csv-upload');
const fileUpload = require('express-fileupload');
const Stream = require('stream');
const unirest = require('unirest');
const jwt = require('jsonwebtoken');
const uuidV4 = require('uuid/v4');
const fs = require('fs');
const jsonfile = require('jsonfile');
const morgan = require('morgan');
const date = new Date();

app.set('json spaces', 2);

app.use(bodyParser.urlencoded({
    extended: false
}));

app.use(bodyParser.json());
app.use(fileUpload());
app.use(morgan(':remote-addr | :method :url :status :res[content-length] bytes - :response-time ms'));

app.get('/', function(req, res) {
    res.sendFile('views/index.html', {root: __dirname});
});

app.post('/upload-csv', function(req, res) {
    if (!req.files)
        return res.status(400).send('No files were uploaded.');
    let csvFile = req.files.csvFile;
    let albumId = req.body.albumId;
    let bufferStream = new Stream.PassThrough();
    bufferStream.end(csvFile.data);
    let utcdate = ("0" + date.getUTCDate()).slice(-2);
    let month =   ("0" + date.getMonth()).slice(-2);
    let csvJsonId = date.getFullYear()+'-'+month+'-'+utcdate+'-'+date.getHours()+date.getMinutes()+date.getSeconds();
    let outputFilePath = `${__dirname}/csv-jsons/${csvJsonId}.json`;
    if (!fs.existsSync(`${__dirname}/csv-jsons`)) {
        fs.mkdirSync(`${__dirname}/csv-jsons`);
    }
    parseCsv(albumId, bufferStream, outputFilePath, sharinpixInstance);
    res.redirect(`/`);
});

app.use(function(req, res) {
    res.status(404);
    res.send('404 - Not found');
});

app.listen(process.env.PORT || 3000, function () {
    console.log('listening on port '+ (process.env.PORT || 3000));    
});
