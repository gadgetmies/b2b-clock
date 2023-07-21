const fs = require('fs')
const express = require("express");
const {ExpressPeerServer} = require("peer");
const https = require("https");
const app = express();


const key = fs.readFileSync("./key.pem");
const cert = fs.readFileSync("./cert.pem");

const server = https
  .createServer({key, cert}, app)
  .listen(9000, () => {
    console.log('server is running')
  });

const peerServer = ExpressPeerServer(server, {
  path: "/",
  ssl: {
    key,
    cert,
  },
});

app.use('/peer', peerServer)
app.use('/', express.static('../front/build'))