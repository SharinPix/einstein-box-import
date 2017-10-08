const parseCsvImages = require('./parse-csv-images');
const _ = require('lodash');
const async = require('async');

module.exports = function(albumId, bufferStream, outputFilePath, sharinpixInstance){
    this.sharinpixInstance = sharinpixInstance;
    parseCsvImages(bufferStream, outputFilePath, function(imagesHash) {
        let imagesBoxHash = imagesHash;
        let images = _.map(imagesHash, function(image, externalId) {
            image['externalId'] = externalId;
            image = (({ url, name, externalId }) => ({ url, name, externalId }))(image);
            return image;
        });
        // console.log(imagesBoxHash);
        // return;
        var imagesBox = _.map(imagesBoxHash, function(image, externalId){
            externalId = externalId.toString();
            image = (({ width, height, otherAttributes }) => ({ width, height, externalId, otherAttributes }))(image);    
            return image;
        });
        // console.log(imagesBox)
        // return;
        var imagesBoxObject =  _.keyBy(imagesBox, 'externalId');
        let abilities = {};
        abilities[albumId] = { Access: { see: true, image_upload: true, einstein_box: true }  };
        let claims = { abilities: abilities };
        parallelTasks = [];
        _.each(images, function(image){
            let body = { album_id: albumId, filename: image.name, 
                url: image.url, import_type: 'url',
                metadatas: { externalId: image.externalId, filepath: outputFilePath }
            };    

            parallelTasks.push(
                function(callback) {
                    sharinpixInstance.post('/imports', body, claims).then (
                    function(res) {
                        callback(null, { id: res.id, external_id: image.externalId });
                    },
                    function(err) {
                        callback(body, null);
                    });
                }
            );
        })

        // _.each(images, function(image) {
        //     let body = {
        //         album_id: albumId,
        //         filename: image.name,
        //         url: image.url,
        //         import_type: 'url',
        //         metadatas: {
        //             externalId: image.externalId,
        //             filepath: outputFilePath
        //         }
        //     };
        //     parallelTasks.push(
        //         function(callback) {
        //             async.waterfall(
        //                 [
        //                     function(callback1){
        //                         sharinpixInstance.post('/imports', body, claims).then (
        //                         (res) => {
        //                             callback1(null, { id: res.id, external_id: image.externalId });
        //                         },
        //                         (err) => {
        //                             callback1(body, null);
        //                         });
        //                     },
        //                     function(result, callback2){
        //                         let interval = setInterval(function() {
        //                             sharinpixInstance.get(`/imports/${result.id}`, {admin: true}).then(
        //                                 (res) => {
        //                                     // _.each(einsteinBoxes, (item) => {
        //                                     //     sharinpixInstance.post(`/images/${imgId}/einstein_box`, item, {admin: true}).then(
        //                                     //         (res) => {
        //                                     //         },
        //                                     //         (err) => {
        //                                     //         }
        //                                     //     );
        //                                     // });
        //                                     if (res.image_id != null){
        //                                         let extId = result.external_id;
        //                                         let einsteinBoxes = refineStruct(imagesBoxObject[extId]);
        //                                         clearInterval(interval);
        //                                         result['image_id'] = res.image_id;
        //                                         callback2(null, result);
        //                                     }
        //                                 },
        //                                 (err) => {
        //                                     clearInterval(interval);
        //                                     callback2(result, null);
        //                                 }
        //                             )
        //                         }, 5000);
        //                     }
        //                 ], function(err, result){
        //                     console.log('waterfall completed ', err, result);
        //                     callback(err, result);
                            
        //                 }
        //             )
        //         }
        //     );
        // });
        parallelRequests(parallelTasks, 5, function(errors, results){
            if(results !== null && results.length > 0){
                console.log('result process: '+results.length)
                // console.log(results);
                checkImports(results);
            }
            if(errors !== null && errors.length > 0){
                console.log('err process: '+errors.length)         
                // console.log(errors)
            }
        })
        
        let importTasks = [];
        function checkImports(importResults) {
            _.each(importResults, function(imp){
                importTasks.push(
                    function(callback){
                        async.retry(
                            {
                                errorFilter: function(err) {
                                    return err.image_id == null;
                                },
                                interval: 3000
                            }, 
                            function(done){
                                // console.log('test', done, '@@@@@@@@@@@@@@', results)
                                sharinpixInstance.get(`/imports/${imp.id}`, {admin: true}).then(
                                    function(impResult){
                                        // console.log('### ', impResult, imp.id);
                                        if (impResult.image_id == null){
                                            done(impResult);
                                        }
                                        else {
                                            done(null, impResult);
                                        }
                                    },
                                    function(impError){
                                        done(null, {})
                                    }
                                )
                            }, 
                            function(err, result) {
                                // do something with the result
                                // console.log('###########', err, result);
                                callback(err, result);
                            }
                        );
                    }
                )
            })
            parallelRequests(importTasks, 5, function(errors, results){
                if(results !== null && results.length > 0){
                    console.log('result process: '+results.length)
                    // console.log(results);
                    createBox(results)
                }
                if(errors !== null && errors.length > 0){
                    console.log('err process: '+errors.length)         
                    // console.log(errors)
                }
            })
        }

        let boxTasks = [];
        function createBox(importRes){
            // console.log(imagesBoxObject)
            _.each(importRes, function(imp){
                
                let einsteinBoxes = refineStruct(imagesBoxObject[imp.params.metadatas.externalId]);
                // console.log(einsteinBoxes);
                
                _.each(einsteinBoxes, function(box){
                    box.image_id = imp.image_id;
                    boxTasks.push(
                        function(callback){
                            sharinpixInstance.post(`/images/${box.image_id}/einstein_box`, box, claims).then(
                                function(res){
                                    callback(null, res);
                                },
                                function(err){
                                    callback(err, null);
                                }
                            )
                        }
                    )
                })
                parallelRequests(boxTasks, 5, function(err, result){
                    console.log('###### COMPLETED ######')
                })
            })

        }

        function writeErrorLog(err){
        }
        function refineStruct(element){
            let imageWidth = element.width;
            let imageHeight = element.height;
            element2 = (({otherAttributes}) => ({otherAttributes}))(element);
            let imagesBoxFlat = _.values(_.values(element2));
            let einsteinBoxes = _.map(imagesBoxFlat, (item) => {
                item = _.values(item);
                return item; //.splice(2, item.length);
            });
            let x = _.flatten(einsteinBoxes);
            let onlyboxes = _.filter(x, function(box){
                return box != '';
            })
            let boxes = _.map(onlyboxes, function(box){
                let percentageWidth = (box.width / imageWidth) * 100;
                let percentageHeight = (box.height / imageHeight) * 100;
                let percentageX = (box.x / imageWidth) * 100;
                let percentageY = (box.y / imageHeight) * 100;
                return {label: box.label, width: percentageWidth, height: percentageHeight, left: percentageX, top: percentageY };
            })
            return boxes;
        }

        function parallelRequests(tasks, limit, callback){
            async.parallelLimit(tasks, limit, function(err, results){
                callback(err, results);
            });
        }
    });
}
