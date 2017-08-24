let fastCsv = require('fast-csv');
let fs = require('fs');
let uuidV4 = require('uuid/v4');

module.exports = function(inputFile, outputFilePath, callback) {
    if (typeof outputFilePath === 'function') {
        callback = outputFilePath;
        outputFilePath = null;
    }
    let images = {};
    let nameColumnIndex = -1;
    let urlColumnIndex = -1;
    let externalIdColumnIndex = -1;
    let firstColumn = true;
    let csvRows = [];
    let stream = typeof inputFile === 'string' ? fs.createReadStream(inputFile) : inputFile;

    let csvStream = fastCsv({
        quote: '"'
    }).on('data', function(data) {
        if (firstColumn) {
            for (let i = 0; i < data.length; i++) {
                switch (data[i]) {
                    case 'image_url':
                        urlColumnIndex = i;
                        break;
                    case 'image_name':
                        nameColumnIndex = i;
                        break;
                    case 'external_id':
                        externalIdColumnIndex = i;
                        break;
                }
            }
            if (externalIdColumnIndex === -1) {
                csvRows.push(['external_id'].concat(data))
            } else {
                csvRows.push(data)
            }
            firstColumn = false;
        } else {
            if (!data[urlColumnIndex] || !data[nameColumnIndex]) {
                return;
            }
            let externalId = externalIdColumnIndex === -1 ? uuidV4().replace(/\-/, '').substr(0, 10) : data[externalIdColumnIndex];
            images[externalId] = {
                url: data[urlColumnIndex],
                name: data[nameColumnIndex]
            };
            images[externalId]['otherAttributes'] = {};
            let otherAttributes = images[externalId]['otherAttributes'];
            for (let i = 0; i < data.length; i++) {
                if (i === urlColumnIndex || i === nameColumnIndex || i === externalIdColumnIndex) {
                    continue;
                }
                let columnName = csvRows[0][i];
                if (!columnName || columnName === '') {
                    columnName = 'column_' + i;
                }
                let otherAttribute;
                try {
                    otherAttribute = JSON.parse(data[i]);
                } catch(e) {
                    otherAttribute = data[i];
                }
                otherAttributes[columnName] = otherAttribute;
            }
            if (externalIdColumnIndex === -1) {
                csvRows.push([externalId].concat(data));
            } else {
                csvRows.push(data)
            }
        }
    }).on('end', function() {
        if (outputFilePath && csvRows.length !== 0) {
            let writeStream = fs.createWriteStream(outputFilePath);
            fastCsv.write(csvRows).pipe(writeStream);
        }
        if (typeof callback === 'function') {
            callback(images);
        }
    });

    stream.pipe(csvStream);
}