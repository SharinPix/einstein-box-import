const fs = require('fs');
const csv = require('fast-csv');
const uuidV4 = require('uuid/v4');
const jsonfile = require('jsonfile');

module.exports = function(inputFile, callback) {
    var stream = typeof inputFile === 'string' ? fs.createReadStream(inputFile) : inputFile;
    // var stream = fs.createReadStream(inputFile);
    var header = true;
    var output = {};

    var csvStream = csv({quote: '"'})
        .on("data", function(data){
            if (!header){
                var externalId = uuidV4();
                var image_name = data[0];
                var image_url = data[1];
                var image_width = data[2];
                var image_height = data[3];
                var boxes = [];
                for(var i = 4; i < data.length; i++){
                    console.log(typeof data[i]);
                    if (data[i] !== null && data[i] !== undefined && data[i] != ''){
                        boxes.push(
                            convertBox(JSON.parse(data[i]), image_width, image_height)
                        );
                    }
                    
                }

                output[externalId] = {
                    image_name: image_name,
                    image_url: image_url,
                    image_width: image_width,
                    image_height: image_height,
                    boxes: boxes
                }
            }
            header = false;
        })
        .on("end", function(){
            console.log("done");
            console.log(JSON.stringify(output));
            jsonfile.writeFileSync('./output.json', output);
            callback(output);
        });

    function convertBox(box, image_width, image_height) {
        let percentageWidth = (box.width / image_width) * 100;
        let percentageHeight = (box.height / image_height) * 100;
        let percentageX = (box.x / image_width) * 100;
        let percentageY = (box.y / image_height) * 100;
        return {label: box.label, width: percentageWidth, height: percentageHeight, left: percentageX, top: percentageY };
    }

    stream.pipe(csvStream);
};