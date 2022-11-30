import { createRequire } from "module";
const require = createRequire(import.meta.url);
require('dotenv').config();
global.require = require; //this will make require at the global scobe and treat it like the original require
//Require module
const express = require('express');
var bodyParser = require('body-parser');
// Express Initialize
const app = express();
const port = process.env.PORT;
const hport = process.env.HPORT;
const http = require('http');
const https = require('https');
//For parsing a page
const axios = require("axios");
const cheerio = require("cheerio");
const pretty = require("pretty");
//To add ipfs
import * as IPFS from 'ipfs-core'
// Imported from models/videometa.cjs
import videoandmeta from "./models/videometa.cjs";
const ipfs = await IPFS.create();
const BufferList = require('bl');
const CID = require('cids');
let multer = require('multer');
const upload = multer({ dest: "uploads/" });
const fs = require('fs');
//var mysql = require('mysql');
const { Sequelize} = require('sequelize');
const sequelize = require('./utils/database.cjs');
sequelize.authenticate().then(() => {
    console.log('Connection has been established successfully.');
 }).catch((error) => {
    console.error('Unable to connect to the database: ', JSON.stringify(error.original.sqlMessage));
 });
//To create the database.
//Uncomment this if you want to drop the entire db and reinitiate
//sequelize.sync({force:true})
sequelize.sync()
// parse application/json
app.use(bodyParser.json());                        
// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: true }));

app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

const privateKey = fs.readFileSync(process.env.PRIVATEKEY, 'utf8');
const certificate = fs.readFileSync(process.env.CERTIFICATE, 'utf8');
const ca = fs.readFileSync(process.env.CA, 'utf8');

const credentials = {
	key: privateKey,
	cert: certificate,
	ca: ca
};

//To get hello world page
app.get('/eladr', (req,res)=>{
    //Need to find out how to get ipfs stats
    let ipfsStatus = ipfs.stats;
    //console.log(ipfsStatus);
    let result = {"ipfsStatus":ipfsStatus,"eladrPrice":"","totalVolume":"","marketCap:":""}
    res.send(result);
})

//To check the address has eladr token.
app.get('/evaluvate/:address', (req,res)=>{
    // URL of the page we want to scrape (This has to be updated from the angular front end)
     const address = req.params['address'];
     const url = `https://cardanoscan.io/tokenHoldings/${address}`;
     async function scrapeData() {
        try {
            // Fetch HTML of the page we want to scrape
            const { data } = await axios.get(url);
            // Load HTML we fetched in the previous line
            const $ = cheerio.load(data);
            // Select all the list items in plainlist class
            const scrapedData = [];
            $("body > div > div > div > div").each((index, element) => {
                //console.log($(element).find('td'));
                const tds = $(element).find('td');
                let i;
                for(i=0;i<=$(element).find('td').length;i++){
                    const policy = $(tds[i]).text();
                    i++;
                    const name = $(tds[i]).text();
                    i++;
                    const fingerPrint = $(tds[i]).text();
                    i++;
                    const balance = $(tds[i]).text();
                    const tableRow = { policy, name, fingerPrint,balance };
                    scrapedData.push(tableRow);
                }
            });
            res.send(scrapedData);
          } catch (err) {
            console.error(err);
          }

    }
    scrapeData();
});

//To post the file.
let field = upload.single('file');
app.post('/file',field, async(req,res)=>{
    try {
        if (req.file == undefined) {
          return res.status(400).send({ message: "Upload a file please!" });
        }else{
                let file = req.file;
                let fileType = req.file.mimetype;
                let fileNameOg = req.file.originalname;
                let fileNameUploaded = req.file.filename;
                let filePath = req.file.path;
                let fileObj = {"file":file,"fileName":fileNameOg,"filePath":filePath,"fileNameUploaded":fileNameUploaded}
                console.log(fileObj)    
                if(fileObj){
                    const fileHash = await addFile(fileNameUploaded,filePath);
                    fs.unlink(filePath, (err) => {
                        if (err) {  
                            console.log("Error: Unable to delete file. ", err);
                        }
                    });
                    if(fileHash){
                        console.log("File Hash received __>", fileHash);
                        const response = {
                            fileHash: fileHash.toString(),
                            fileType: fileType
                        }
                        res.status(200).send(response);
                    }
                }else{
                    res.status(500).send({
                        message: "Unable to upload file to the directory" + req.file.originalname,
                    });
                }
        }
      } catch (err) {   
        // error handling
        res.status(500).send({
          message: `Unable to upload the file: ${req.file.originalname}. ${err}`,
        });
      }
});
//Function to pint the file
const addFile = async (fileName, filePath) => {
    const file = fs.readFileSync(filePath);
    const { cid } = await ipfs.add({ path: fileName, content: file }, {
    progress: (len) => console.log("Uploading file..." + len)
  });
    return cid;
};

//To get a single file
app.get('/file/:hash', async(req,res)=>{
    let hash = req.params['hash'];
    res.send(`https://gateway.ipfs.io/ipfs/${hash}`);   
}); 

//Post the video metadata to the ipfs
app.post('/meta', async(req,res)=>{
    const data = req.body;
    //console.log(data)
    const file = {path:'testFile',content:Buffer.from(`{"name":"${req.body.name}","description":"${req.body.description}","wallet":"${req.body.wallet}","fileHash":"${req.body.fileHash}","fileType":"${req.body.fileType}","thumbnailHash":"${req.body.thumbnailHash}"}`)}
    const { cid } = await ipfs.add(file);
    res.send(`https://gateway.ipfs.io/ipfs/${cid}`);
});

//To retrive file metadata
app.get('/meta/:hash', async(req,res)=>{
        let hash = req.params['hash'];
        //Converting cid v0 to v1
        let cid =new CID(hash).toV1().toString('base32');
        //Then retriving the data from the ipfs.
        for await (const file of ipfs.cat(cid)) {
            console.log(file);
            res.send(file);
        }
});
//To post to the db
app.post('/database', async(req,res)=>{
    //let id =0;
    let HashVideo = req.body.vidHash;
    let HashMeta  = req.body.metaHash;
    let Wallet = req.body.wallet;
    let Title = req.body.title;
    let Description = req.body.description;
    let HashThumbnail = req.body.hashThumbnail;

    return await videoandmeta.create({
        hashvideo: HashVideo,
        hashmeta: HashMeta,
        wallet: Wallet,
        title: Title,
        description: Description,
        hashthumbnail: HashThumbnail
    }).then(function (videometa) {
        if (videometa) {
            res.status(200).send(videometa);
        } else {
            res.status(400).send('Error in insert new record');
        }
    });
});

//To get a single db entry
app.get('/database/:id', async(req,res)=>{
    let id = req.params['id'];
     // return the promise itself
     return await videoandmeta.findOne({
        where: {
           id: id
        }
     }).then(function(videometa) {
        if (!videometa) {
            res.status(400).send('None found');
        }else{
            res.status(200).send(videometa);
        }
     });
});

//To get all the files 
app.get('/files/:page', async(req,res)=>{
        const page = parseInt(req.params['page']);
        console.log(page)
        return await videoandmeta.findAll(
            {where: 
                {}, order: [
                    ['updatedAt', 'DESC']
                  ],offset :((page - 1) * 10),limit:10

            }).then(function (videometa) {
        if(!videometa){
            res.status(400).send('None found');
        }else{
            res.status(200).send(videometa);
        }
    });
});

//To get all the files 
app.get('/myfiles/:address/:page', async(req,res)=>{
    const address = req.params['address'];
    const page = parseInt(req.params['page']);
    console.log(page,address);
    return await videoandmeta.findAll(
        {where: 
            {wallet:address}, order: [
                ['updatedAt', 'DESC']
              ],offset :((page - 1) * 10),limit:10
        }).then(function (videometa) {  
    if(!videometa){
        res.status(400).send('None found');
    }else{
        res.status(200).send(videometa);
    }
});
}); 

//To search in the db
app.post('/search/:searchTerm', async(req,res)=>{
    let searchTerm = req.params['searchTerm'];

    videoandmeta.sequelize.query(
        `SELECT * ,MATCH (hashvideo,hashmeta,wallet,title,description,hashthumbnail)AGAINST ('${searchTerm}') AS score FROM videoandmeta WHERE MATCH (hashvideo,hashmeta,wallet,title,description,hashthumbnail) AGAINST ('${searchTerm}')ORDER BY score DESC`
    ).then(function (videometa){
        if(!videometa){
            res.status(400).send('None found');
        }else{
            res.status(200).send(videometa[0]);
        }
    });
});

const httpServer = http.createServer(app);
const httpsServer = https.createServer(credentials, app);

httpServer.listen(port, () => {
	console.log('HTTP Server running on port',process.env.PORT);
});

httpsServer.listen(hport, () => {
	console.log('HTTPS Server running on port',process.env.HPORT);
});